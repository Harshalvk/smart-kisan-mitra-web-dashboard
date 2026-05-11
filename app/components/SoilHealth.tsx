"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSensorSocket } from "@/app/hooks/useSensorSocket";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ValueType,
  NameType,
} from "recharts/types/component/DefaultTooltipContent";

interface SoilHealthProps {
  deviceId: string;
  gatewayUrl?: string;
  pollInterval?: number;
}

interface SoilHealthResponse {
  health_score?: number;
  status?: string;
  nutrients?: { N: number; P: number; K: number };
  ph?: number;
  moisture?: number;
  ec?: number;
  recommendations?: string[];
}

export default function SoilHealth({
  deviceId,
  gatewayUrl = "http://localhost:8000",
  pollInterval = 30000,
}: SoilHealthProps) {
  const { latestData } = useSensorSocket(); // Shared hook - no more prop needed
  const [aiData, setAiData] = useState<SoilHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTime = useRef<number>(0);

  // Derive radar data DIRECTLY from shared latestData (real-time)
  const radarData = React.useMemo(() => {
    if (!latestData?.sensor_data) return [];

    const s = latestData.sensor_data;
    const N = s.N ?? 0;
    const P = s.P ?? 0;
    const K = s.K ?? 0;
    const ph = s.ph ?? 0;
    const moisture = s.soil_moisture ?? s.moisture ?? 0;
    const ec = s.ec ?? 0;

    return [
      {
        subject: "Nitrogen (N)",
        value: Math.min(N, 100),
        fullMark: 100,
        raw: N,
      },
      {
        subject: "Phosphorus (P)",
        value: Math.min(P, 100),
        fullMark: 100,
        raw: P,
      },
      {
        subject: "Potassium (K)",
        value: Math.min(K, 100),
        fullMark: 100,
        raw: K,
      },
      {
        subject: "pH Balance",
        value: Math.min((ph / 14) * 100, 100),
        fullMark: 100,
        raw: ph,
      },
      {
        subject: "Moisture",
        value: Math.min(moisture, 100),
        fullMark: 100,
        raw: moisture,
      },
      {
        subject: "EC Level",
        value: Math.min(ec * 50, 100),
        fullMark: 100,
        raw: ec,
      },
    ];
  }, [latestData]);

  // Calculate a local health score from sensor data for display until AI responds
  const localHealthScore = React.useMemo(() => {
    if (!latestData?.sensor_data) return null;
    const s = latestData.sensor_data;
    const N = s.N ?? 0;
    const P = s.P ?? 0;
    const K = s.K ?? 0;
    const ph = s.ph ?? 0;
    const moisture = s.soil_moisture ?? s.moisture ?? 0;
    const score = Math.round(
      N * 0.25 +
        P * 0.25 +
        K * 0.25 +
        (moisture / 2) * 0.15 +
        (ph / 14) * 100 * 0.1,
    );
    return Math.min(score, 100);
  }, [latestData]);

  const fetchSoilHealth = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    lastFetchTime.current = Date.now();

    try {
      const response = await fetch(`${gatewayUrl}/predict/soil-health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: SoilHealthResponse = await response.json();
      setAiData(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
      console.error("Soil health API error:", err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, gatewayUrl]);

  // POLLING fallback
  useEffect(() => {
    fetchSoilHealth();
    intervalRef.current = setInterval(fetchSoilHealth, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchSoilHealth, pollInterval]);

  // REAL-TIME trigger when shared latestData changes
  useEffect(() => {
    if (!latestData) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastFetchTime.current < 10000) return;
      fetchSoilHealth();
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [latestData, fetchSoilHealth]);

  const healthScore = aiData?.health_score ?? localHealthScore ?? 0;

  const getHealthColor = (score: number) => {
    if (score >= 80)
      return { bg: "bg-green-100", text: "text-green-700", badge: "Excellent" };
    if (score >= 60)
      return { bg: "bg-emerald-100", text: "text-emerald-700", badge: "Good" };
    if (score >= 40)
      return { bg: "bg-yellow-100", text: "text-yellow-700", badge: "Fair" };
    return { bg: "bg-red-100", text: "text-red-700", badge: "Poor" };
  };

  const colors = getHealthColor(healthScore);

  // Use sensor_data from shared hook for stats display
  const sensorData = latestData?.sensor_data;

  if (!latestData && !aiData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          Soil Health Analysis
        </h3>
        <div className="text-center py-12 text-gray-500">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              Analyzing soil data...
            </div>
          ) : (
            "Waiting for sensor data..."
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">
          Soil Health Analysis
        </h3>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          )}
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button
            onClick={fetchSoilHealth}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Score Display */}
      <div className="text-center mb-4">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 ${colors.bg} ${colors.text} rounded-full`}
        >
          <span className="text-sm font-semibold">Overall Soil Health</span>
          <span className="text-lg font-bold">{colors.badge}</span>
        </div>
        <div className="text-3xl font-bold text-gray-900 mt-2">
          {healthScore} / 100
        </div>
        {aiData?.health_score && (
          <div className="text-xs text-green-600 mt-1">AI Verified</div>
        )}
        {!aiData?.health_score && localHealthScore && (
          <div className="text-xs text-gray-400 mt-1">
            Estimated (AI pending)
          </div>
        )}
      </div>

      {/* Radar Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "#6b7280", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: "#6b7280", fontSize: 10 }}
            />
            <Radar
              name="Soil Health"
              dataKey="value"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.3}
            />
            <Tooltip
              // @ts-expect-error
              formatter={(value: ValueType, name: NameType, props: any) => {
                const raw = props?.payload?.raw;
                const label = props?.payload?.subject;
                return [
                  `${raw ?? value}${
                    String(label ?? name).includes("pH")
                      ? ""
                      : String(label ?? name).includes("EC")
                        ? " mS/cm"
                        : "%"
                  }`,
                  label ?? name,
                ] as [string, string];
              }}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "12px",
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Stats - from shared hook */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <div className="text-xs text-gray-400">Nitrogen (N)</div>
          <div className="text-lg font-semibold text-gray-900">
            {sensorData?.N ?? "--"}
          </div>
          <div className="text-xs text-gray-500">ppm</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Phosphorus (P)</div>
          <div className="text-lg font-semibold text-gray-900">
            {sensorData?.P ?? "--"}
          </div>
          <div className="text-xs text-gray-500">ppm</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Potassium (K)</div>
          <div className="text-lg font-semibold text-gray-900">
            {sensorData?.K ?? "--"}
          </div>
          <div className="text-xs text-gray-500">ppm</div>
        </div>
      </div>

      {/* AI Recommendations */}
      {aiData?.recommendations && aiData.recommendations.length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">
            AI Recommendations
          </h4>
          <ul className="space-y-1">
            {aiData.recommendations.map((rec, i) => (
              <li
                key={i}
                className="text-sm text-blue-700 flex items-start gap-2"
              >
                <span className="mt-1">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
