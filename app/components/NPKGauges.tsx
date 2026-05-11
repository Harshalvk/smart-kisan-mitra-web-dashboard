"use client";

import React, { useEffect, useRef } from "react";
import { useSensorSocket } from "../hooks/useSensorSocket";

interface SensorData {
  N?: number;
  P?: number;
  K?: number;
  ph?: number;
  moisture?: number;
  temperature?: number;
  ec?: number;
  soil_temp_C?: number;
  soil_moisture?: number;
}

interface NPKGaugesProps {
  latestData?: SensorData | null;
}

const R = 46,
  CX = 60,
  CY = 60;
const ARC_DEG = 240;
const CIRC = 2 * Math.PI * R;
const ARC_LEN = (ARC_DEG / 360) * CIRC;

const GAUGES = [
  {
    key: "N" as const,
    label: "Nitrogen",
    unit: "ppm",
    max: 140,
    color: "#22c55e",
    bg: "#dcfce7",
    tc: "#15803d",
  },
  {
    key: "P" as const,
    label: "Phosphorus",
    unit: "ppm",
    max: 100,
    color: "#3b82f6",
    bg: "#dbeafe",
    tc: "#1d4ed8",
  },
  {
    key: "K" as const,
    label: "Potassium",
    unit: "ppm",
    max: 100,
    color: "#eab308",
    bg: "#fef9c3",
    tc: "#854d0e",
  },
];

const METRICS = [
  { key: "temperature" as const, label: "Air temp", unit: "°C", decimals: 1 },
  { key: "moisture" as const, label: "Humidity", unit: "%", decimals: 1 },
  { key: "ph" as const, label: "pH", unit: "", decimals: 1 },
  { key: "soil_temp_C" as const, label: "Soil temp", unit: "°C", decimals: 0 },
  {
    key: "soil_moisture" as const,
    label: "Soil moisture",
    unit: "%",
    decimals: 0,
  },
  { key: "ec" as const, label: "EC", unit: "mS/cm", decimals: 1 },
];

function getStatus(pct: number): { label: string; bg: string; tc: string } {
  if (pct < 0.3) return { label: "Low", bg: "#fee2e2", tc: "#991b1b" };
  if (pct < 0.6) return { label: "Moderate", bg: "#fef9c3", tc: "#854d0e" };
  return { label: "Optimal", bg: "#dcfce7", tc: "#15803d" };
}

function Gauge({
  config,
  value,
}: {
  config: (typeof GAUGES)[number];
  value: number;
}) {
  const arcRef = useRef<SVGCircleElement>(null);
  const valRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!arcRef.current || !valRef.current || !badgeRef.current) return;
    const pct = Math.min(value / config.max, 1);
    arcRef.current.style.strokeDashoffset = String(ARC_LEN - pct * ARC_LEN);
    valRef.current.textContent = String(Math.round(value));
    const s = getStatus(pct);
    badgeRef.current.textContent = s.label;
    badgeRef.current.style.background = s.bg;
    badgeRef.current.style.color = s.tc;
  }, [value, config.max]);

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-inner">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className=" text-gray-500 font-medium">{config.label}</p>
          <p className=" text-gray-400">
            max {config.max} {config.unit}
          </p>
        </div>
        <span
          ref={badgeRef}
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: "#f3f4f6", color: "#6b7280" }}
        >
          —
        </span>
      </div>

      <div className="relative mx-auto" style={{ width: 120, height: 120 }}>
        <svg
          viewBox="0 0 120 120"
          width="120"
          height="120"
          style={{ overflow: "visible", display: "block" }}
        >
          {/* Track */}
          <circle
            className="fill-none"
            cx={CX}
            cy={CY}
            r={R}
            stroke="#f3f4f6"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${CIRC}`}
            transform={`rotate(120 ${CX} ${CY})`}
          />
          {/* Animated fill arc */}
          <circle
            ref={arcRef}
            className="fill-none"
            cx={CX}
            cy={CY}
            r={R}
            stroke={config.color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${CIRC}`}
            strokeDashoffset={ARC_LEN}
            transform={`rotate(120 ${CX} ${CY})`}
            style={{
              transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            ref={valRef}
            className="text-2xl font-semibold leading-none"
            style={{ color: config.color }}
          >
            {Math.round(value)}
          </span>
          <span className="text-xs text-gray-400 mt-1">{config.unit}</span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  config,
  value,
}: {
  config: (typeof METRICS)[number];
  value: number | undefined;
}) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{config.label}</p>
      <p className="text-xl font-medium text-gray-800 leading-none">
        {value != null ? value.toFixed(config.decimals) : "—"}
        <span className="text-xs text-gray-400 ml-1">{config.unit}</span>
      </p>
    </div>
  );
}

export default function SensorDashboard() {
  const { latestData } = useSensorSocket();
  return (
    <div className="space-y-5">
      {/* NPK Gauges */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          NPK nutrients
        </p>
        <div className="grid grid-cols-3 gap-4">
          {GAUGES.map((config) => (
            <Gauge
              key={config.key}
              config={config}
              value={latestData?.sensor_data[config.key] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
