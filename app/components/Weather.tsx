"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ComposedChart,
} from "recharts";
import { useSensorSocket } from "@/app/hooks/useSensorSocket";
import { debounce } from "lodash";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HourlyPoint {
  time: string;
  date: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  rain: number;
  windSpeed: number;
  uvIndex: number;
  soilMoist: number;
  cloudCover: number;
}

interface DailyPoint {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  rain: number;
  windMax: number;
  uvMax: number;
  sunrise: string;
  sunset: string;
  weatherCode: number;
}

interface PastPoint {
  date: string;
  tempMax: number;
  tempMin: number;
  rain: number;
  humidity: number;
}

interface FarmInsight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  severity: "good" | "warn" | "critical" | "info";
  timing: string;
}

// ─── WMO weather code → label + emoji ────────────────────────────────────────

function weatherLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear sky", emoji: "☀️" };
  if (code <= 2) return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 49) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 67) return { label: "Rain", emoji: "🌧️" };
  if (code <= 77) return { label: "Snow", emoji: "❄️" };
  if (code <= 82) return { label: "Rain showers", emoji: "🌧️" };
  if (code <= 86) return { label: "Snow showers", emoji: "🌨️" };
  if (code <= 99) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Unknown", emoji: "🌡️" };
}

// ─── Open-Meteo fetcher ───────────────────────────────────────────────────────

async function fetchWeather(lat: number, lng: number) {
  const base = "https://api.open-meteo.com/v1";

  const forecastUrl =
    `${base}/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,soil_moisture_0_to_1cm,cloud_cover` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset,weather_code` +
    `&timezone=auto&forecast_days=7`;

  const today = new Date();
  const past30 = new Date(today);
  past30.setDate(today.getDate() - 30);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const pastUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean` +
    `&start_date=${fmt(past30)}&end_date=${fmt(yesterday)}&timezone=auto`;

  const [forecastRes, pastRes] = await Promise.all([
    fetch(forecastUrl),
    fetch(pastUrl),
  ]);
  const [forecast, past] = await Promise.all([
    forecastRes.json(),
    pastRes.json(),
  ]);
  return { forecast, past };
}

// ─── Data transformers ────────────────────────────────────────────────────────

function transformHourly(forecast: any): HourlyPoint[] {
  const h = forecast.hourly;
  const now = new Date();
  return h.time
    .map((t: string, i: number) => {
      const d = new Date(t);
      return {
        time: d.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        date: d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
        }),
        fullDate: d,
        temp: Math.round(h.temperature_2m[i]),
        feelsLike: Math.round(h.apparent_temperature[i]),
        humidity: h.relative_humidity_2m[i],
        rain: h.precipitation[i],
        windSpeed: Math.round(h.wind_speed_10m[i]),
        uvIndex: h.uv_index[i] ?? 0,
        soilMoist: Math.round((h.soil_moisture_0_to_1cm[i] ?? 0) * 100),
        cloudCover: h.cloud_cover[i] ?? 0,
      };
    })
    .filter((p: any) => p.fullDate >= now)
    .slice(0, 48);
}

function transformDaily(forecast: any): DailyPoint[] {
  const d = forecast.daily;
  return d.time.map((t: string, i: number) => {
    const date = new Date(t);
    return {
      date: t,
      dayLabel:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : date.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
              }),
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      rain: +(d.precipitation_sum[i] ?? 0).toFixed(1),
      windMax: Math.round(d.wind_speed_10m_max[i] ?? 0),
      uvMax: Math.round(d.uv_index_max[i] ?? 0),
      sunrise: d.sunrise[i]?.split("T")[1] ?? "—",
      sunset: d.sunset[i]?.split("T")[1] ?? "—",
      weatherCode: d.weather_code[i] ?? 0,
    };
  });
}

function transformPast(past: any): PastPoint[] {
  const d = past.daily;
  return d.time.map((t: string, i: number) => ({
    date: new Date(t).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    tempMax: Math.round(d.temperature_2m_max[i]),
    tempMin: Math.round(d.temperature_2m_min[i]),
    rain: +(d.precipitation_sum[i] ?? 0).toFixed(1),
    humidity: Math.round(d.relative_humidity_2m_mean[i] ?? 0),
  }));
}

// ─── Farm insight engine ──────────────────────────────────────────────────────

function generateFarmInsights(
  daily: DailyPoint[],
  hourly: HourlyPoint[],
  sensorTemp?: number,
): FarmInsight[] {
  const insights: FarmInsight[] = [];
  const today = daily[0];
  const tomorrow = daily[1];
  if (!today) return insights;

  const rainDays = daily.filter((d) => d.rain > 5);
  if (today.rain > 10) {
    insights.push({
      id: "rain_today",
      icon: "🌧️",
      title: "Heavy Rain Today",
      severity: "critical",
      detail: `${today.rain} mm expected. Avoid field operations, pesticide/fertilizer application. Risk of waterlogging in low-lying areas.`,
      timing: "Today",
    });
  } else if (rainDays.length > 0 && rainDays[0].date !== today.date) {
    insights.push({
      id: "rain_coming",
      icon: "🌧️",
      title: `Rain in ${rainDays[0].dayLabel}`,
      severity: "warn",
      detail: `${rainDays[0].rain} mm forecast. Complete any fertilizer or pesticide applications before then for best absorption.`,
      timing: rainDays[0].dayLabel,
    });
  } else if (daily.slice(0, 7).every((d) => d.rain < 2)) {
    insights.push({
      id: "dry_spell",
      icon: "☀️",
      title: "Dry Week Ahead",
      severity: "warn",
      detail:
        "No significant rainfall forecast for 7 days. Plan irrigation accordingly. Monitor soil moisture daily.",
      timing: "This week",
    });
  }

  const goodSprayHours = hourly.filter(
    (h) =>
      h.windSpeed < 15 &&
      h.humidity > 40 &&
      h.humidity < 85 &&
      h.rain === 0 &&
      h.cloudCover < 70,
  );
  if (goodSprayHours.length > 0) {
    const best = goodSprayHours[0];
    insights.push({
      id: "spray",
      icon: "💊",
      title: "Optimal Spray Window",
      severity: "good",
      detail: `Best conditions at ${best.time} on ${best.date}. Wind ${best.windSpeed} km/h, humidity ${best.humidity}%. Low drift risk, good absorption.`,
      timing: `${best.date} ${best.time}`,
    });
  } else {
    insights.push({
      id: "spray",
      icon: "💊",
      title: "Poor Spray Conditions",
      severity: "warn",
      detail:
        "High wind or humidity makes pesticide/fungicide application ineffective or drifting. Wait for a calmer window.",
      timing: "Check again tomorrow",
    });
  }

  if (today.tempMax > 38) {
    insights.push({
      id: "heat",
      icon: "🌡️",
      title: "Extreme Heat Stress",
      severity: "critical",
      detail: `${today.tempMax}°C today — photosynthesis stalls above 35°C. Irrigate at dawn and dusk. Avoid field work 11am–4pm.`,
      timing: "Today",
    });
  } else if (today.tempMax > 33) {
    insights.push({
      id: "heat",
      icon: "🌡️",
      title: "Elevated Temperature",
      severity: "warn",
      detail: `${today.tempMax}°C expected. Sensitive crops (tomato, bean) may show heat stress. Mulch to retain soil moisture.`,
      timing: "Today",
    });
  }

  if (today.tempMin < 5) {
    insights.push({
      id: "frost",
      icon: "❄️",
      title: "Frost Risk Tonight",
      severity: "critical",
      detail: `Temperature dropping to ${today.tempMin}°C. Cover sensitive seedlings. Irrigate lightly before sunset to raise soil temperature.`,
      timing: "Tonight",
    });
  }

  if (today.uvMax >= 8) {
    insights.push({
      id: "uv",
      icon: "🕶️",
      title: "Very High UV Index",
      severity: "warn",
      detail: `UV index ${today.uvMax} — severe sunburn risk within 25 min. Field workers should wear hats, long sleeves, and apply sunscreen. Limit outdoor exposure 10am–3pm.`,
      timing: "Today 10am–3pm",
    });
  }

  if (today.windMax > 40) {
    insights.push({
      id: "wind",
      icon: "💨",
      title: "Strong Wind Alert",
      severity: "critical",
      detail: `${today.windMax} km/h winds forecast. Avoid spraying. Stake tall crops. Risk of lodging in standing grain.`,
      timing: "Today",
    });
  } else if (today.windMax > 20 && today.windMax <= 40) {
    insights.push({
      id: "wind_moderate",
      icon: "💨",
      title: "Moderate Wind — Good for Pollination",
      severity: "good",
      detail: `${today.windMax} km/h wind aids cross-pollination in flowering crops. Avoid pesticide spray during peak wind hours.`,
      timing: "Today",
    });
  }

  const next3Rain = daily.slice(0, 3).reduce((s, d) => s + d.rain, 0);
  if (next3Rain > 20) {
    insights.push({
      id: "irr_skip",
      icon: "💧",
      title: "Skip Irrigation — Rain Coming",
      severity: "info",
      detail: `${next3Rain.toFixed(0)} mm forecast over next 3 days. Save water and hold off irrigation. Excess watering before rain risks waterlogging.`,
      timing: "Next 3 days",
    });
  } else if (next3Rain < 5 && today.tempMax > 32) {
    insights.push({
      id: "irr_now",
      icon: "💧",
      title: "Irrigate Today",
      severity: "warn",
      detail: `Hot & dry conditions with only ${next3Rain.toFixed(0)} mm forecast this week. Irrigate before 8am or after 6pm to minimise evaporation losses.`,
      timing: "Today, early morning",
    });
  }

  if (sensorTemp != null && Math.abs(sensorTemp - today.tempMax) > 8) {
    insights.push({
      id: "sensor_check",
      icon: "📡",
      title: "Sensor Reading vs Forecast Mismatch",
      severity: "info",
      detail: `Your ESP32 reads ${sensorTemp}°C but forecast max is ${today.tempMax}°C (${Math.abs(sensorTemp - today.tempMax)}°C gap). Check sensor placement — direct sun exposure causes inflated readings.`,
      timing: "Now",
    });
  }

  return insights;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-gray-500 font-medium mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-gray-600">{p.name}:</span>
          <span className="text-gray-900 font-semibold">
            {p.value}
            {p.unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCard({ i }: { i: FarmInsight }) {
  const [open, setOpen] = useState(false);
  const colors = {
    good: "border-green-200 bg-green-50",
    warn: "border-amber-200 bg-amber-50",
    critical: "border-red-200 bg-red-50",
    info: "border-blue-200 bg-blue-50",
  };
  const badge = {
    good: "bg-green-100 text-green-700",
    warn: "bg-amber-100 text-amber-700",
    critical: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <motion.div
      layout
      className={`border rounded-xl overflow-hidden cursor-pointer ${colors[i.severity]}`}
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl shrink-0">{i.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
            {i.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{i.timing}</p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge[i.severity]}`}
        >
          {
            {
              good: "Good",
              warn: "Warning",
              critical: "Critical",
              info: "Info",
            }[i.severity]
          }
        </span>
        <span className="text-gray-400 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4"
          >
            <p className="text-sm text-gray-700 leading-relaxed">{i.detail}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  unit,
  color = "text-gray-900",
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold leading-none ${color}`}>
        {value}
        <span className="text-sm font-normal text-gray-400 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WeatherDashboardProps {
  defaultLat?: number;
  defaultLng?: number;
}

type Tab = "forecast" | "hourly" | "history" | "insights";

export default function WeatherDashboard({
  defaultLat = 16.7,
  defaultLng = 74.24,
}: WeatherDashboardProps) {
  const { latestData } = useSensorSocket();
  const sensorTemp = latestData?.sensor_data?.temperature;

  const gpsLat = latestData?.latitude;
  const gpsLng = latestData?.longitude;
  const lat = gpsLat && gpsLat !== 0 ? gpsLat : defaultLat;
  const lng = gpsLng && gpsLng !== 0 ? gpsLng : defaultLng;

  const [tab, setTab] = useState<Tab>("forecast");
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [past, setPast] = useState<PastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { forecast, past: pastData } = await fetchWeather(lat, lng);
      setHourly(transformHourly(forecast));
      setDaily(transformDaily(forecast));
      setPast(transformPast(pastData));
      setLastFetch(new Date());
    } catch (e) {
      setError("Failed to fetch weather data. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => {
    const debouncedFetch = debounce(() => {
      load();
    }, 500);

    debouncedFetch();

    return () => {
      debouncedFetch.cancel();
    };
  }, [load]);

  const insights = generateFarmInsights(daily, hourly, sensorTemp);
  const today = daily[0];
  const todayW = today ? weatherLabel(today.weatherCode) : null;

  const criticalCount = insights.filter(
    (i) => i.severity === "critical",
  ).length;
  const warnCount = insights.filter((i) => i.severity === "warn").length;

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 bg-white rounded-2xl border border-gray-200">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">
          Fetching weather from Open-Meteo…
        </p>
      </div>
    );

  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl border border-gray-200">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );

  return (
    <div
      className="bg-white text-gray-900 rounded-2xl overflow-hidden "
      style={{ fontFamily: "'DM Sans', 'Outfit', sans-serif" }}
    >
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-6 pt-6 pb-5">
        {/* Decorative circles */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-20" />

        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-4xl">{todayW?.emoji ?? "🌡️"}</span>
              <div>
                <p className="text-5xl font-bold leading-none text-gray-900">
                  {today?.tempMax ?? "—"}°
                </p>
                <p className="text-gray-600 text-sm mt-0.5">{todayW?.label}</p>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              📍 {lat.toFixed(4)}, {lng.toFixed(4)}
              {gpsLat ? " · ESP32 GPS" : " · Default location"}
            </p>
          </div>

          <div className="text-right">
            <p className="text-gray-700 text-sm font-medium">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {lastFetch
                ? `Updated ${lastFetch.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
            <button
              onClick={load}
              className="mt-2 text-xs text-green-600 hover:text-green-700 transition-colors border border-green-200 px-2 py-1 rounded-lg bg-white"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Today quick stats */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {[
            {
              label: "Feels like",
              value: `${today?.tempMin ?? "—"}–${today?.tempMax ?? "—"}`,
              unit: "°C",
            },
            { label: "Rain", value: today?.rain ?? "—", unit: "mm" },
            { label: "Wind", value: today?.windMax ?? "—", unit: "km/h" },
            { label: "UV Index", value: today?.uvMax ?? "—", unit: "" },
            { label: "Sunrise", value: today?.sunrise ?? "—", unit: "" },
          ].map(({ label, value, unit }) => (
            <div
              key={label}
              className="bg-white/80 rounded-xl px-2 py-2.5 text-center backdrop-blur-sm border border-green-100"
            >
              <p className="text-gray-500 text-xs mb-1">{label}</p>
              <p className="text-gray-900 font-bold text-sm">
                {value}
                <span className="text-gray-400 text-xs ml-0.5">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Alert bar */}
        {(criticalCount > 0 || warnCount > 0) && (
          <div className="mt-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <span>⚠️</span>
            <p className="text-sm text-red-700 font-medium">
              {criticalCount > 0 &&
                `${criticalCount} critical alert${criticalCount > 1 ? "s" : ""}`}
              {criticalCount > 0 && warnCount > 0 && " · "}
              {warnCount > 0 &&
                `${warnCount} warning${warnCount > 1 ? "s" : ""}`}
              {" — check Insights tab"}
            </p>
          </div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 px-4 bg-white">
        {(
          [
            { id: "forecast", label: "7-Day Forecast" },
            { id: "hourly", label: "48h Hourly" },
            { id: "history", label: "Past 30 Days" },
            {
              id: "insights",
              label: `Farm Insights ${criticalCount > 0 ? `🔴${criticalCount}` : ""}`,
            },
          ] as { id: Tab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px
              ${tab === id ? "text-green-700 border-green-500" : "text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="p-5 space-y-6 bg-white">
        {/* FORECAST TAB */}
        {tab === "forecast" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* 7-day cards */}
            <div>
              <SectionTitle>7-Day Overview</SectionTitle>
              <div className="grid grid-cols-7 gap-2">
                {daily.map((d, i) => {
                  const w = weatherLabel(d.weatherCode);
                  return (
                    <div
                      key={d.date}
                      className={`rounded-xl p-2.5 text-center border transition-colors ${i === 0 ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}
                    >
                      <p className="text-xs text-gray-500 font-medium truncate">
                        {d.dayLabel}
                      </p>
                      <p className="text-2xl my-1.5">{w.emoji}</p>
                      <p className="text-sm font-bold text-gray-900">
                        {d.tempMax}°
                      </p>
                      <p className="text-xs text-gray-500">{d.tempMin}°</p>
                      {d.rain > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          💧{d.rain}mm
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Temperature range chart */}
            <div>
              <SectionTitle>Temperature Range — 7 Days</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={daily}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="°"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tempMax"
                    name="Max temp"
                    fill="#dcfce7"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fillOpacity={0.6}
                    unit="°C"
                  />
                  <Area
                    type="monotone"
                    dataKey="tempMin"
                    name="Min temp"
                    fill="#dbeafe"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={0.6}
                    unit="°C"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Rainfall chart */}
            <div>
              <SectionTitle>Rainfall Forecast — 7 Days</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={daily}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="mm"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={10}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: "Heavy", fill: "#f59e0b", fontSize: 10 }}
                  />
                  <Bar
                    dataKey="rain"
                    name="Rainfall"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    unit="mm"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* UV + wind */}
            <div>
              <SectionTitle>UV Index & Wind Speed</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={daily}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="uv"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="wind"
                    orientation="right"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit=" km/h"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", color: "#6b7280" }}
                  />
                  <ReferenceLine
                    yAxisId="uv"
                    y={8}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />
                  <Line
                    yAxisId="uv"
                    type="monotone"
                    dataKey="uvMax"
                    name="UV Index"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: "#f59e0b", r: 3 }}
                  />
                  <Line
                    yAxisId="wind"
                    type="monotone"
                    dataKey="windMax"
                    name="Max Wind km/h"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: "#8b5cf6", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* HOURLY TAB */}
        {tab === "hourly" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Current hour stats */}
            {hourly[0] && (
              <div className="grid grid-cols-4 gap-3">
                <StatPill
                  label="Temperature"
                  value={hourly[0].temp}
                  unit="°C"
                  color="text-amber-600"
                />
                <StatPill
                  label="Humidity"
                  value={hourly[0].humidity}
                  unit="%"
                  color="text-blue-600"
                />
                <StatPill
                  label="Wind"
                  value={hourly[0].windSpeed}
                  unit=" km/h"
                  color="text-purple-600"
                />
                <StatPill
                  label="Rain (1h)"
                  value={hourly[0].rain}
                  unit=" mm"
                  color="text-sky-600"
                />
              </div>
            )}

            {/* 48h temp + feels like */}
            <div>
              <SectionTitle>Temperature — Next 48 Hours</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={hourly}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="°"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="temp"
                    name="Temperature"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#tempGrad)"
                    unit="°C"
                  />
                  <Line
                    type="monotone"
                    dataKey="feelsLike"
                    name="Feels like"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                    unit="°C"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Humidity + rain */}
            <div>
              <SectionTitle>Humidity & Rainfall — 48 Hours</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={hourly}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    yAxisId="hum"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="rain"
                    orientation="right"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="mm"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    yAxisId="hum"
                    type="monotone"
                    dataKey="humidity"
                    name="Humidity"
                    stroke="#3b82f6"
                    fill="#dbeafe"
                    fillOpacity={0.5}
                    strokeWidth={2}
                    unit="%"
                  />
                  <Bar
                    yAxisId="rain"
                    dataKey="rain"
                    name="Rain (1h)"
                    fill="#3b82f6"
                    opacity={0.7}
                    radius={[3, 3, 0, 0]}
                    unit="mm"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Soil moisture + cloud cover */}
            <div>
              <SectionTitle>Soil Moisture & Cloud Cover</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={hourly}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="soilMoist"
                    name="Soil Moisture"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    unit="%"
                  />
                  <Line
                    type="monotone"
                    dataKey="cloudCover"
                    name="Cloud Cover"
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                    unit="%"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* UV hourly */}
            <div>
              <SectionTitle>UV Index — 48 Hours</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart
                  data={hourly}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="uvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={8}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{
                      value: "Danger",
                      fill: "#ef4444",
                      fontSize: 10,
                      position: "right",
                    }}
                  />
                  <ReferenceLine
                    y={3}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: "Moderate",
                      fill: "#f59e0b",
                      fontSize: 10,
                      position: "right",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="uvIndex"
                    name="UV Index"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#uvGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Summary stats */}
            {past.length > 0 &&
              (() => {
                const avgMax = Math.round(
                  past.reduce((s, p) => s + p.tempMax, 0) / past.length,
                );
                const totalR = past.reduce((s, p) => s + p.rain, 0).toFixed(0);
                const avgHum = Math.round(
                  past.reduce((s, p) => s + p.humidity, 0) / past.length,
                );
                const maxRain = Math.max(...past.map((p) => p.rain));
                return (
                  <div className="grid grid-cols-4 gap-3">
                    <StatPill
                      label="Avg Max Temp"
                      value={avgMax}
                      unit="°C"
                      color="text-amber-600"
                    />
                    <StatPill
                      label="Total Rainfall"
                      value={totalR}
                      unit=" mm"
                      color="text-blue-600"
                    />
                    <StatPill
                      label="Avg Humidity"
                      value={avgHum}
                      unit="%"
                      color="text-sky-600"
                    />
                    <StatPill
                      label="Peak Rain Day"
                      value={maxRain.toFixed(1)}
                      unit=" mm"
                      color="text-indigo-600"
                    />
                  </div>
                );
              })()}

            {/* Temperature trend */}
            <div>
              <SectionTitle>Temperature Trend — Past 30 Days</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={past}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient
                      id="histTempGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="°"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tempMax"
                    name="Max temp"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#histTempGrad)"
                    unit="°C"
                  />
                  <Line
                    type="monotone"
                    dataKey="tempMin"
                    name="Min temp"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                    unit="°C"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Historical rainfall */}
            <div>
              <SectionTitle>Daily Rainfall — Past 30 Days</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={past}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="mm"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="rain"
                    name="Rainfall"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    unit="mm"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Humidity trend */}
            <div>
              <SectionTitle>Humidity Trend — Past 30 Days</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart
                  data={past}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                    domain={[0, 100]}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={60}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    label={{ value: "Optimal", fill: "#22c55e", fontSize: 10 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="humidity"
                    name="Humidity"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#humGrad)"
                    unit="%"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* INSIGHTS TAB */}
        {tab === "insights" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <SectionTitle>Farm Action Insights</SectionTitle>
                <p className="text-xs text-gray-400 -mt-2">
                  Based on 7-day forecast + your ESP32 sensor data
                </p>
              </div>
              <div className="flex gap-2">
                {criticalCount > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    {criticalCount} critical
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                    {warnCount} warnings
                  </span>
                )}
              </div>
            </div>

            {insights.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-2">✅</p>
                <p>All conditions look good for your farm today.</p>
              </div>
            ) : (
              (["critical", "warn", "good", "info"] as const).flatMap((sev) =>
                insights
                  .filter((i) => i.severity === sev)
                  .map((i) => <InsightCard key={i.id} i={i} />),
              )
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
