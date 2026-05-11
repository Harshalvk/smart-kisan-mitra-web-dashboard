"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSensorSocket } from "@/app/hooks/useSensorSocket";

interface LatLng {
  lat: number;
  lng: number;
}

interface FarmBoundary {
  id: string;
  name: string;
  points: LatLng[];
  area: number;
  createdAt: string;
  color: string;
}

interface Insight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  severity: "good" | "warn" | "critical" | "info";
  action: string;
}

interface NDVIPixel {
  lat: number;
  lng: number;
  ndvi: number;
}

type HeatmapMetric = "soil_moisture" | "temperature" | "ph" | "ec";
type ActiveLayer = "none" | "heatmap" | "ndvi";


const GATEWAY = process.env.NEXT_PUBLIC_API_GATEWAY ?? "http://localhost:8000";
const FARM_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const HEATMAP_CFG: Record<
  HeatmapMetric,
  { label: string; unit: string; min: number; max: number }
> = {
  soil_moisture: { label: "Soil Moisture", unit: "%", min: 0, max: 100 },
  temperature: { label: "Temperature", unit: "°C", min: 10, max: 45 },
  ph: { label: "pH", unit: "", min: 4, max: 9 },
  ec: { label: "EC", unit: " mS/cm", min: 0, max: 4 },
};


let mapsLoaded = false;
let mapsLoading = false;
const mapsCallbacks: (() => void)[] = [];

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (mapsLoaded) {
      resolve();
      return;
    }
    mapsCallbacks.push(resolve);
    if (mapsLoading) return;
    mapsLoading = true;
    (window as any).__gmapsReady = () => {
      mapsLoaded = true;
      mapsCallbacks.forEach((cb) => cb());
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry,visualization&callback=__gmapsReady`;
    s.async = true;
    document.head.appendChild(s);
  });
}


function formatArea(m2: number) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2)} m²`;
}

function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat,
      yi = poly[i].lng,
      xj = poly[j].lat,
      yj = poly[j].lng;
    if (
      yi > pt.lng !== yj > pt.lng &&
      pt.lat < ((xj - xi) * (pt.lng - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

function gridInsideBoundary(points: LatLng[], steps = 10): LatLng[] {
  if (points.length < 3) return [];
  const lats = points.map((p) => p.lat),
    lngs = points.map((p) => p.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const dLat = (maxLat - minLat) / steps,
    dLng = (maxLng - minLng) / steps;
  const result: LatLng[] = [];
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps; j++) {
      const pt = { lat: minLat + i * dLat, lng: minLng + j * dLng };
      if (pointInPolygon(pt, points)) result.push(pt);
    }
  return result;
}


function ndviToColor(ndvi: number): string {
  const t = Math.max(0, Math.min(1, (ndvi + 1) / 2));
  if (t < 0.33) return `rgba(255,${Math.round(t * 3 * 180)},0,0.72)`;
  if (t < 0.66)
    return `rgba(${Math.round(255 - (t - 0.33) * 3 * 200)},180,0,0.72)`;
  return `rgba(30,${Math.round(150 + (t - 0.66) * 3 * 105)},30,0.72)`;
}

function simulateNDVI(
  grid: LatLng[],
  sensors: Record<string, any>,
  cLat: number,
  cLng: number,
): NDVIPixel[] {
  const moisture = (sensors.soil_moisture ?? 50) / 100;
  const tempScore = Math.max(
    0,
    1 - Math.abs((sensors.temperature ?? 27) - 27) / 20,
  );
  const phScore = Math.max(0, 1 - Math.abs((sensors.ph ?? 6.5) - 6.5) / 3);
  const base = moisture * 0.5 + tempScore * 0.3 + phScore * 0.2;
  return grid.map((pt) => {
    const dist = Math.sqrt((pt.lat - cLat) ** 2 + (pt.lng - cLng) ** 2) * 1000;
    const noise = Math.sin(pt.lat * 1e5) * Math.cos(pt.lng * 1e5) * 0.15;
    const ndvi = Math.max(
      -0.2,
      Math.min(0.95, (base * 2 - 1) * Math.max(0, 1 - dist * 0.3) + noise),
    );
    return { ...pt, ndvi };
  });
}


function generateInsights(
  sensors: Record<string, any> | null,
  area: number,
): Insight[] {
  if (!sensors) return [];
  const out: Insight[] = [];
  const ha = area / 10000;
  const { soil_moisture: sm, temperature: t, ph, ec, N, P, K } = sensors as any;

  if (sm != null && area > 0) {
    if (sm < 30)
      out.push({
        id: "irr",
        icon: "💧",
        title: "Irrigation Needed Urgently",
        severity: "critical",
        detail: `Soil moisture critically low at ${sm}%. ~${Math.round(ha * 5000).toLocaleString()} L needed for ${formatArea(area)}.`,
        action: "Start irrigation now. Target 60–70%.",
      });
    else if (sm < 50)
      out.push({
        id: "irr",
        icon: "💧",
        title: "Plan Irrigation Soon",
        severity: "warn",
        detail: `Soil moisture at ${sm}% is below optimal range.`,
        action: "Schedule within 48 hours.",
      });
    else
      out.push({
        id: "irr",
        icon: "💧",
        title: "Soil Moisture Optimal",
        severity: "good",
        detail: `${sm}% is in the ideal 50–80% range.`,
        action: "Monitor daily.",
      });
  }
  if (ph != null) {
    if (ph < 5.5)
      out.push({
        id: "ph",
        icon: "🧪",
        title: "Soil Too Acidic",
        severity: "critical",
        detail: `pH ${ph} blocks P, Ca, Mg absorption.`,
        action: `Apply lime ~${(ha * 3).toFixed(1)} t.`,
      });
    else if (ph > 7.5)
      out.push({
        id: "ph",
        icon: "🧪",
        title: "Soil Alkaline",
        severity: "warn",
        detail: `pH ${ph} reduces Fe, Mn, Zn availability.`,
        action: "Apply sulphur or gypsum.",
      });
    else
      out.push({
        id: "ph",
        icon: "🧪",
        title: `pH ${ph} — Ideal`,
        severity: "good",
        detail: "All nutrients fully available in 5.5–7.5 range.",
        action: "Re-test every season.",
      });
  }
  if (N != null && P != null && K != null && area > 0) {
    const [nL, pL, kL] = [N < 50, P < 25, K < 40];
    if (nL || pL || kL)
      out.push({
        id: "npk",
        icon: "🌿",
        title: "Nutrient Deficiency",
        severity: "warn",
        detail: `Low: ${[nL && `N(${N})`, pL && `P(${P})`, kL && `K(${K})`].filter(Boolean).join(", ")}`,
        action: [
          nL && `Urea: ${Math.round(ha * 50)} kg`,
          pL && `DAP: ${Math.round(ha * 40)} kg`,
          kL && `MOP: ${Math.round(ha * 35)} kg`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    else
      out.push({
        id: "npk",
        icon: "🌿",
        title: "NPK Levels Healthy",
        severity: "good",
        detail: `N:${N} P:${P} K:${K} all optimal.`,
        action: "Re-test in 30 days.",
      });
  }
  if (t != null && t > 38)
    out.push({
      id: "temp",
      icon: "🌡️",
      title: "Heat Stress Alert",
      severity: "critical",
      detail: `${t}°C exceeds safe threshold. Photosynthesis impaired above 35°C.`,
      action: "Add shade nets. Irrigate at dawn/dusk.",
    });
  if (ec != null && ec > 2.5)
    out.push({
      id: "ec",
      icon: "⚡",
      title: "High Salinity",
      severity: "critical",
      detail: `EC ${ec} mS/cm causes salt stress.`,
      action: "Flush with 3× normal irrigation. Stop fertilizing 2 weeks.",
    });
  if (area > 0)
    out.push({
      id: "area",
      icon: "📐",
      title: `Field: ${formatArea(area)}`,
      severity: "info",
      detail: `${ha.toFixed(2)} ha · est. ${Math.max(1, Math.round(ha / 0.5))} workers for manual ops.`,
      action: "Tap any boundary to rename or delete.",
    });
  return out;
}

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const border = {
    good: "border-green-200 bg-green-50",
    warn: "border-amber-200 bg-amber-50",
    critical: "border-red-200 bg-red-50",
    info: "border-blue-200 bg-blue-50",
  }[insight.severity];
  const badge = {
    good: "bg-green-100 text-green-700",
    warn: "bg-amber-100 text-amber-700",
    critical: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  }[insight.severity];
  const label = {
    good: "Good",
    warn: "Warning",
    critical: "Critical",
    info: "Info",
  }[insight.severity];
  return (
    <motion.div
      layout
      className={`border rounded-xl overflow-hidden cursor-pointer ${border}`}
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center gap-3 p-3">
        <span className="text-xl">{insight.icon}</span>
        <p className="flex-1 text-sm font-medium text-gray-900 leading-snug">
          {insight.title}
        </p>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge}`}
        >
          {label}
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pb-3 space-y-2"
          >
            <p className="text-xs text-gray-600 leading-relaxed">
              {insight.detail}
            </p>
            <div className="flex gap-2 bg-white/70 rounded-lg p-2">
              <span className="text-xs font-semibold text-gray-500 shrink-0">
                ACTION
              </span>
              <p className="text-xs text-gray-700">{insight.action}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LayerToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition-colors
        ${active ? "bg-green-600 text-white border-green-700" : "bg-white text-gray-700 border-gray-200 hover:border-green-400"}`}
    >
      {children}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FarmMap({
  deviceId = "farm_010",
}: {
  deviceId?: string;
}) {
  const { latestData } = useSensorSocket();
  const sensors = latestData?.sensor_data ?? null;

  const mapRef = useRef<HTMLDivElement>(null);
  const gMap = useRef<google.maps.Map | null>(null);
  const drawMgr = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polyRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const markerRef = useRef<google.maps.Marker | null>(null);
  const heatRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const ndviRects = useRef<google.maps.Rectangle[]>([]);

  const [mapsReady, setMapsReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [boundaries, setBoundaries] = useState<FarmBoundary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devicePos, setDevicePos] = useState<LatLng | null>(null);
  const [panel, setPanel] = useState<"insights" | "layers" | "fields">(
    "insights",
  );
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [mapType, setMapType] = useState<"satellite" | "roadmap">("satellite");
  const [layer, setLayer] = useState<ActiveLayer>("none");
  const [metric, setMetric] = useState<HeatmapMetric>("soil_moisture");
  const [ndviData, setNdviData] = useState<NDVIPixel[]>([]);
  const [dbStatus, setDbStatus] = useState<"idle" | "saving" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const totalArea = boundaries.reduce((s, b) => s + b.area, 0);
  const activeBound =
    boundaries.find((b) => b.id === selectedId) ?? boundaries[0] ?? null;
  const insights = generateInsights(sensors, activeBound?.area ?? totalArea);

  // ── Load boundaries from API ─────────────────────────────────────────────────
  useEffect(() => {
    const loadBoundaries = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${GATEWAY}/boundaries/${deviceId}`);
        if (!res.ok) {
          if (res.status === 404) {
            // No boundaries yet, that's fine
            setBoundaries([]);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const saved = data.boundaries;
        if (Array.isArray(saved) && saved.length) {
          setBoundaries(
            saved.map((b: any) => ({
              id: b.id ?? String(Date.now() + Math.random()),
              name: b.name,
              color: b.color,
              points: b.points,
              area: b.area,
              createdAt: b.created_at ?? new Date().toISOString(),
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load boundaries:", err);
        setDbStatus("error");
      } finally {
        setIsLoading(false);
      }
    };

    loadBoundaries();
  }, [deviceId]);

  // ── GPS from socket ────────────────────────────────────────────────────────
  useEffect(() => {
    const lat = (latestData as any)?.latitude;
    const lng = (latestData as any)?.longitude;
    if (lat && lng && lat !== 0 && lng !== 0) setDevicePos({ lat, lng });
  }, [latestData]);

  // ── Init Google Maps ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    loadGoogleMaps(apiKey).then(() => setMapsReady(true));
  }, [apiKey]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const center = devicePos ?? { lat: 16.7, lng: 74.24 };
    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 17,
      mapTypeId: mapType,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
    });
    gMap.current = map;

    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: { fillOpacity: 0.2, strokeWeight: 2, editable: true },
    });
    dm.setMap(map);
    drawMgr.current = dm;

    google.maps.event.addListener(
      dm,
      "polygoncomplete",
      async (polygon: google.maps.Polygon) => {
        dm.setDrawingMode(null);
        setDrawing(false);
        const path = polygon.getPath().getArray();
        const points = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
        const area = google.maps.geometry.spherical.computeArea(path);
        const color =
          FARM_COLORS[Math.floor(Math.random() * FARM_COLORS.length)];
        polygon.setOptions({ strokeColor: color, fillColor: color });
        const id = `farm_${Date.now()}`;
        const b: FarmBoundary = {
          id,
          name: `Field ${Math.floor(Math.random() * 900) + 100}`,
          points,
          area,
          createdAt: new Date().toISOString(),
          color,
        };
        polygon.addListener("click", () => setSelectedId(id));
        polyRefs.current.set(id, polygon);
        setBoundaries((prev) => [...prev, b]);
        setSelectedId(id);

        // Save to API
        setDbStatus("saving");
        try {
          const res = await fetch(`${GATEWAY}/boundaries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              device_id: deviceId,
              name: b.name,
              color,
              points,
              area,
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setDbStatus("idle");
        } catch (err) {
          console.error("Failed to save boundary:", err);
          setDbStatus("error");
        }
      },
    );
  }, [mapsReady]); // eslint-disable-line

  // ── Restore saved polygons on map ───────────────────────────────────────────
  useEffect(() => {
    if (!gMap.current) return;
    boundaries.forEach((b) => {
      if (polyRefs.current.has(b.id)) return;
      const p = new google.maps.Polygon({
        paths: b.points,
        strokeColor: b.color,
        fillColor: b.color,
        fillOpacity: 0.2,
        strokeWeight: 2,
        map: gMap.current!,
      });
      p.addListener("click", () => setSelectedId(b.id));
      polyRefs.current.set(b.id, p);
    });
  }, [mapsReady, boundaries.length]); // eslint-disable-line

  // ── Device marker ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gMap.current || !devicePos) return;
    if (markerRef.current) markerRef.current.setPosition(devicePos);
    else
      markerRef.current = new google.maps.Marker({
        position: devicePos,
        map: gMap.current,
        title: deviceId,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      });
  }, [devicePos, mapsReady]);

  useEffect(() => {
    gMap.current?.setMapTypeId(mapType);
  }, [mapType]);

  useEffect(() => {
    polyRefs.current.forEach((p, id) =>
      p.setOptions({
        strokeWeight: id === selectedId ? 4 : 2,
        fillOpacity: id === selectedId ? 0.35 : 0.2,
      }),
    );
  }, [selectedId]);

  // ── Heatmap layer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !gMap.current) return;
    heatRef.current?.setMap(null);
    heatRef.current = null;
    if (layer !== "heatmap" || !sensors || !activeBound) return;

    const cfg = HEATMAP_CFG[metric];
    const value = (sensors as any)[metric] ?? (cfg.min + cfg.max) / 2;
    const norm = Math.max(
      0,
      Math.min(1, (value - cfg.min) / (cfg.max - cfg.min)),
    );
    const grid = gridInsideBoundary(activeBound.points, 12);

    const pts =
      grid.length > 0
        ? grid.map((pt) => ({
            location: new google.maps.LatLng(pt.lat, pt.lng),
            weight: Math.max(
              0.01,
              Math.min(
                1,
                norm + Math.sin(pt.lat * 1e5) * Math.cos(pt.lng * 1e5) * 0.15,
              ),
            ),
          }))
        : devicePos
          ? Array.from({ length: 80 }, (_, i) => {
              const r = (Math.floor(i / 10) / 8) * 0.001;
              const a = ((i % 10) / 10) * Math.PI * 2;
              return {
                location: new google.maps.LatLng(
                  devicePos.lat + r * Math.cos(a),
                  devicePos.lng + r * Math.sin(a),
                ),
                weight: norm * Math.exp(-r * 3000),
              };
            })
          : [];

    if (!pts.length) return;
    heatRef.current = new google.maps.visualization.HeatmapLayer({
      data: pts,
      map: gMap.current,
      radius: 28,
      opacity: 0.78,
      gradient: [
        "rgba(59,130,246,0)",
        "rgba(34,197,94,1)",
        "rgba(234,179,8,1)",
        "rgba(239,68,68,1)",
      ],
    });
  }, [layer, metric, mapsReady, activeBound, sensors]); // eslint-disable-line

  // ── NDVI overlay ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !gMap.current) return;
    ndviRects.current.forEach((r) => r.setMap(null));
    ndviRects.current = [];
    if (layer !== "ndvi" || !activeBound || !sensors) return;

    const grid = gridInsideBoundary(activeBound.points, 14);
    if (!grid.length) return;

    const lats = activeBound.points.map((p) => p.lat);
    const lngs = activeBound.points.map((p) => p.lng);
    const cLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const cLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    const dLat = (Math.max(...lats) - Math.min(...lats)) / 14;
    const dLng = (Math.max(...lngs) - Math.min(...lngs)) / 14;

    const pixels = simulateNDVI(grid, sensors, cLat, cLng);
    pixels.forEach((px) => {
      const rect = new google.maps.Rectangle({
        bounds: {
          north: px.lat + dLat / 2,
          south: px.lat - dLat / 2,
          east: px.lng + dLng / 2,
          west: px.lng - dLng / 2,
        },
        map: gMap.current!,
        fillColor: ndviToColor(px.ndvi),
        fillOpacity: 0.72,
        strokeWeight: 0,
        clickable: false,
      });
      ndviRects.current.push(rect);
    });
    setNdviData(pixels);
  }, [layer, mapsReady, activeBound, sensors]); // eslint-disable-line

  // ── Actions ────────────────────────────────────────────────────────────────
  const startDrawing = useCallback(() => {
    drawMgr.current?.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    setDrawing(true);
  }, []);
  const cancelDrawing = useCallback(() => {
    drawMgr.current?.setDrawingMode(null);
    setDrawing(false);
  }, []);

  const deleteBoundary = useCallback(
    async (id: string) => {
      const boundary = boundaries.find((b) => b.id === id);
      if (!boundary) return;

      polyRefs.current.get(id)?.setMap(null);
      polyRefs.current.delete(id);
      setBoundaries((p) => p.filter((b) => b.id !== id));
      setSelectedId((s) => (s === id ? null : s));

      // Delete from API
      try {
        const res = await fetch(
          `${GATEWAY}/boundaries/${deviceId}/${boundary.name}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("Failed to delete boundary:", err);
        setDbStatus("error");
      }
    },
    [deviceId, boundaries],
  );

  const centerOnBoundary = useCallback((b: FarmBoundary) => {
    if (!gMap.current) return;
    const bounds = new google.maps.LatLngBounds();
    b.points.forEach((p) => bounds.extend(p));
    gMap.current.fitBounds(bounds, 60);
    setSelectedId(b.id);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renameId || !renameVal.trim()) {
      setRenameId(null);
      return;
    }
    const oldName = boundaries.find((b) => b.id === renameId)?.name;
    setBoundaries((p) =>
      p.map((b) => (b.id === renameId ? { ...b, name: renameVal.trim() } : b)),
    );

    // Update via API
    try {
      const res = await fetch(`${GATEWAY}/boundaries/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameVal.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Failed to rename boundary:", err);
      setDbStatus("error");
    }
    setRenameId(null);
  }, [renameId, renameVal, boundaries]);

  const toggleLayer = (l: ActiveLayer) =>
    setLayer((cur) => (cur === l ? "none" : l));

  const ndviSummary =
    ndviData.length > 0
      ? {
          avg: (
            ndviData.reduce((s, p) => s + p.ndvi, 0) / ndviData.length
          ).toFixed(2),
          healthy: Math.round(
            (ndviData.filter((p) => p.ndvi > 0.4).length / ndviData.length) *
              100,
          ),
          stressed: Math.round(
            (ndviData.filter((p) => p.ndvi < 0.1).length / ndviData.length) *
              100,
          ),
        }
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex rounded-2xl overflow-hidden border border-gray-100 shadow-sm h-full">
      {/* MAP */}
      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        {!mapsReady && (
          <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading map…</p>
            {!apiKey && (
              <p className="text-xs text-red-400 max-w-xs text-center">
                Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env.local
              </p>
            )}
          </div>
        )}

        {/* Loading boundaries */}
        {isLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow px-3 py-2 rounded-xl text-sm text-gray-600 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            Loading fields…
          </div>
        )}

        {/* Controls — top left */}
        {mapsReady && (
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {drawing ? (
              <button
                onClick={cancelDrawing}
                className="flex items-center gap-2 bg-red-50 border border-red-300 shadow px-3 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                ✕ Cancel
              </button>
            ) : (
              <button
                onClick={startDrawing}
                className="flex items-center gap-2 bg-white border border-gray-200 shadow px-3 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
              >
                ✏️ Draw boundary
              </button>
            )}
            <button
              onClick={() =>
                setMapType((t) => (t === "satellite" ? "roadmap" : "satellite"))
              }
              className="bg-white border border-gray-200 shadow px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {mapType === "satellite" ? "🗺️ Map" : "🛰️ Satellite"}
            </button>
            {devicePos && (
              <button
                onClick={() => {
                  gMap.current?.panTo(devicePos);
                  gMap.current?.setZoom(18);
                }}
                className="bg-white border border-gray-200 shadow px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-green-50 transition-colors"
              >
                📍 Find device
              </button>
            )}
          </div>
        )}

        {/* Layer toggles — top right */}
        {mapsReady && activeBound && (
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <LayerToggle
              active={layer === "heatmap"}
              onClick={() => toggleLayer("heatmap")}
            >
              🌡️ Heatmap
            </LayerToggle>
            <LayerToggle
              active={layer === "ndvi"}
              onClick={() => toggleLayer("ndvi")}
            >
              🛰️ NDVI
            </LayerToggle>
          </div>
        )}

        {/* Hints */}
        <AnimatePresence>
          {drawing && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none"
            >
              Click to add points · Double-click to finish
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {dbStatus === "saving" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-14 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-2 pointer-events-none"
            >
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{" "}
              Saving to database…
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {dbStatus === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-14 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-2 pointer-events-none"
            >
              ⚠️ Sync failed — will retry
            </motion.div>
          )}
        </AnimatePresence>

        {/* NDVI legend */}
        {layer === "ndvi" && (
          <div className="absolute bottom-10 left-3 bg-white/95 border border-gray-100 shadow-lg rounded-xl p-3 backdrop-blur-sm">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              🛰️ NDVI — Vegetation Health
            </p>
            {[
              [-0.2, "Bare/Dead"],
              [0.1, "Sparse"],
              [0.4, "Moderate"],
              [0.8, "Healthy"],
            ].map(([ndvi, label]) => (
              <div key={String(label)} className="flex items-center gap-2 mb-1">
                <span
                  className="w-4 h-3 rounded-sm"
                  style={{ background: ndviToColor(Number(ndvi)) }}
                />
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-1 italic">
              Estimated from sensor data
            </p>
          </div>
        )}

        {/* Heatmap legend */}
        {layer === "heatmap" && (
          <div className="absolute bottom-10 left-3 bg-white/95 border border-gray-100 shadow-lg rounded-xl p-3 backdrop-blur-sm">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              🌡️ {HEATMAP_CFG[metric].label}
            </p>
            <div
              className="w-28 h-3 rounded-full mb-1"
              style={{
                background: "linear-gradient(to right,#3b82f6,#22c55e,#ef4444)",
              }}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                Low {HEATMAP_CFG[metric].min}
                {HEATMAP_CFG[metric].unit}
              </span>
              <span>
                High {HEATMAP_CFG[metric].max}
                {HEATMAP_CFG[metric].unit}
              </span>
            </div>
          </div>
        )}

        {/* Device dot */}
        {devicePos && mapsReady && (
          <div className="absolute bottom-3 left-3 bg-white border border-gray-100 shadow px-3 py-2 rounded-xl flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
            <span className="text-xs text-gray-600">{deviceId}</span>
          </div>
        )}
        {!devicePos && mapsReady && (
          <div className="absolute bottom-3 left-3 bg-amber-50 border border-amber-300 text-amber-700 text-xs px-3 py-2 rounded-xl shadow">
            📡 GPS fix pending
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="w-80 flex flex-col bg-white border-l border-gray-100">
        <div className="flex border-b border-gray-100">
          {(["insights", "layers", "fields"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPanel(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${panel === t ? "text-green-700 border-b-2 border-green-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              {t === "insights"
                ? "🔍 Insights"
                : t === "layers"
                  ? "🎨 Layers"
                  : "🗂️ Fields"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* INSIGHTS */}
          {panel === "insights" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Fields", String(boundaries.length)],
                  ["Area", formatArea(totalArea)],
                  ["Device", devicePos ? "Online" : "No GPS"],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="bg-gray-50 rounded-xl p-2 text-center"
                  >
                    <p className="text-xs text-gray-400">{l}</p>
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
              {sensors && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-xs font-medium text-green-700 mb-2">
                    📡 Live — {deviceId}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {(
                      [
                        ["Temp", `${(sensors as any).temperature}°C`],
                        ["Humidity", `${(sensors as any).moisture}%`],
                        ["Soil moist", `${(sensors as any).soil_moisture}%`],
                        ["pH", (sensors as any).ph],
                        ["EC", `${(sensors as any).ec} mS`],
                        ["Soil temp", `${(sensors as any).soil_temp_C}°C`],
                      ] as [string, any][]
                    ).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-xs text-gray-500">{k}</span>
                        <span className="text-xs font-medium text-gray-800">
                          {v ?? "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {insights.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">🗺️</p>
                  <p className="text-sm">Draw a field to see insights.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(["critical", "warn", "good", "info"] as const).flatMap(
                    (s) =>
                      insights
                        .filter((i) => i.severity === s)
                        .map((i) => <InsightCard key={i.id} insight={i} />),
                  )}
                </div>
              )}
            </>
          )}

          {/* LAYERS */}
          {panel === "layers" && (
            <div className="space-y-4">
              {!activeBound && (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-2xl mb-1">✏️</p>
                  <p className="text-sm">Draw a field boundary first.</p>
                </div>
              )}
              {activeBound && (
                <>
                  {/* Heatmap card */}
                  <div
                    className={`border rounded-xl p-4 transition-colors ${layer === "heatmap" ? "border-green-400 bg-green-50" : "border-gray-100"}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          🌡️ Sensor Heatmap
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Intensity map across field area
                        </p>
                      </div>
                      <button
                        onClick={() => toggleLayer("heatmap")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${layer === "heatmap" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-green-50"}`}
                      >
                        {layer === "heatmap" ? "ON" : "OFF"}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2 font-medium">
                      Metric
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(HEATMAP_CFG) as HeatmapMetric[]).map(
                        (m) => (
                          <button
                            key={m}
                            onClick={() => {
                              setMetric(m);
                              setLayer("heatmap");
                            }}
                            className={`text-xs py-1.5 px-2 rounded-lg font-medium transition-colors ${metric === m && layer === "heatmap" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-green-50"}`}
                          >
                            {HEATMAP_CFG[m].label}
                          </button>
                        ),
                      )}
                    </div>
                    {layer === "heatmap" && sensors && (
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs text-green-700 font-medium">
                          {HEATMAP_CFG[metric].label}:{" "}
                          {(sensors as any)[metric] ?? "—"}
                          {HEATMAP_CFG[metric].unit}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Spatial variation modelled from live reading
                        </p>
                      </div>
                    )}
                  </div>

                  {/* NDVI card */}
                  <div
                    className={`border rounded-xl p-4 transition-colors ${layer === "ndvi" ? "border-green-400 bg-green-50" : "border-gray-100"}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          🛰️ NDVI Vegetation Index
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Crop health across field zones
                        </p>
                      </div>
                      <button
                        onClick={() => toggleLayer("ndvi")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${layer === "ndvi" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-green-50"}`}
                      >
                        {layer === "ndvi" ? "ON" : "OFF"}
                      </button>
                    </div>

                    {layer === "ndvi" && ndviSummary ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            ["Avg NDVI", ndviSummary.avg, "text-green-700"],
                            [
                              `Healthy`,
                              `${ndviSummary.healthy}%`,
                              "text-green-600",
                            ],
                            [
                              `Stressed`,
                              `${ndviSummary.stressed}%`,
                              "text-red-500",
                            ],
                          ].map(([l, v, c]) => (
                            <div
                              key={String(l)}
                              className="bg-white rounded-lg p-2 text-center border border-gray-100"
                            >
                              <p className={`text-sm font-bold ${c}`}>{v}</p>
                              <p className="text-xs text-gray-400">{l}</p>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Stressed</span>
                            <span>Healthy</span>
                          </div>
                          <div
                            className="relative h-2 rounded-full overflow-hidden"
                            style={{
                              background:
                                "linear-gradient(to right,#ef4444,#eab308,#22c55e)",
                            }}
                          >
                            <div
                              className="absolute top-0 h-full w-1 bg-white shadow rounded-full"
                              style={{
                                left: `calc(${((parseFloat(ndviSummary.avg) + 1) / 2) * 100}% - 2px)`,
                              }}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 italic">
                          Estimated from sensor data. Connect Copernicus API for
                          real satellite NDVI.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 mt-1">
                        {[
                          ["🔴", "Bare/dead soil (NDVI < 0.1)"],
                          ["🟡", "Sparse vegetation (0.1–0.4)"],
                          ["🟢", "Healthy crop (> 0.4)"],
                        ].map(([e, l]) => (
                          <p key={String(l)} className="text-xs text-gray-500">
                            {e} {l}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  
                </>
              )}
            </div>
          )}

          {/* FIELDS */}
          {panel === "fields" && (
            <>
              {boundaries.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">✏️</p>
                  <p className="text-sm">No fields yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {boundaries.map((b) => (
                    <motion.div
                      key={b.id}
                      layout
                      className={`border rounded-xl p-3 cursor-pointer transition-colors ${selectedId === b.id ? "border-green-400 bg-green-50" : "border-gray-100 hover:border-gray-200"}`}
                      onClick={() => centerOnBoundary(b)}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: b.color }}
                        />
                        {renameId === b.id ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) =>
                              e.key === "Enter" && commitRename()
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 text-sm border-b border-green-400 outline-none bg-transparent"
                          />
                        ) : (
                          <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                            {b.name}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameId(b.id);
                            setRenameVal(b.name);
                          }}
                          className="text-gray-300 hover:text-gray-600 px-1"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBoundary(b.id);
                          }}
                          className="text-gray-300 hover:text-red-500 px-1"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="mt-1.5 flex gap-3 text-xs text-gray-400 pl-5">
                        <span>{formatArea(b.area)}</span>
                        <span>{b.points.length} pts</span>
                        <span>
                          {new Date(b.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              {boundaries.length > 1 && (
                <div className="pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                  <span>{boundaries.length} fields</span>
                  <span className="font-medium text-gray-700">
                    {formatArea(totalArea)} total
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
