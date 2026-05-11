"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SensorData, useSensorSocket } from "@/app/hooks/useSensorSocket"; // ← import shared type

interface ChartPoint {
  time: string;
  fullTime: string;
  soil_moisture: number;
  moisture: number;
  temperature: number;
  ph: number;
  ec: number;
  N: number;
  P: number;
  K: number;
  soil_temp_C: number;
}

interface RealTimeMonitorProps {
  deviceId: string;
  gatewayUrl?: string;
  // latestData?: SensorData | null; // ← now accepts the hook's SensorData directly
  // isConnected?: boolean;
}

export default function RealTimeMonitor({
  deviceId,
  gatewayUrl = "http://localhost:8000",
  // latestData,
  // isConnected = false,
}: RealTimeMonitorProps) {
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const { latestData, isConnected } = useSensorSocket();

  const createChartPoint = (
    sd: SensorData["sensor_data"],
    timestamp: string,
  ): ChartPoint => ({
    time: new Date(timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    fullTime: timestamp,
    soil_moisture: sd.soil_moisture ?? 0,
    moisture: sd.moisture ?? sd.soil_moisture ?? 0,
    temperature: sd.temperature ?? 0,
    ph: sd.ph ?? 0,
    ec: sd.ec ?? 0,
    N: sd.N ?? 0,
    P: sd.P ?? 0,
    K: sd.K ?? 0,
    soil_temp_C: sd.soil_temp_C ?? 0,
  });

  // Append new point whenever latestData changes
  useEffect(() => {
    if (!latestData) return;
    const point = createChartPoint(
      latestData.sensor_data,
      latestData.timestamp,
    );
    setHistory((prev) => {
      const merged = [...prev, point];
      const unique = merged.filter(
        (item, i, self) =>
          i === self.findIndex((t) => t.fullTime === item.fullTime),
      );
      return unique.slice(-20);
    });
  }, [latestData]);

  // Fetch initial history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${gatewayUrl}/history/${deviceId}?limit=20`);
        const data = await res.json();
        if (data.readings) {
          setHistory(
            data.readings
              .map((r: any) => createChartPoint(r.sensor_data, r.timestamp))
              .reverse(),
          );
        }
      } catch (err) {
        console.error("Failed to fetch history:", err);
      }
    };
    fetchHistory();
  }, [deviceId, gatewayUrl]);

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
          />
          <span
            className={
              isConnected ? "text-green-600 font-medium" : "text-red-600"
            }
          >
            {isConnected ? "Live" : "Disconnected"}
          </span>
        </div>
        {latestData && (
          <span className="text-xs text-gray-500">
            Last update: {new Date(latestData.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Sensor cards — unchanged from your original */}
      {/* {latestData?.sensor_data && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-xs text-green-600 font-medium">
              Soil Moisture
            </div>
            <div className="text-xl font-bold text-green-700">
              {latestData.sensor_data.soil_moisture ??
                latestData.sensor_data.moisture}
              %
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-600 font-medium">Temperature</div>
            <div className="text-xl font-bold text-blue-700">
              {latestData.sensor_data.temperature}°C
            </div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <div className="text-xs text-orange-600 font-medium">pH Level</div>
            <div className="text-xl font-bold text-orange-700">
              {latestData.sensor_data.ph}
            </div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-xs text-purple-600 font-medium">EC</div>
            <div className="text-xl font-bold text-purple-700">
              {latestData.sensor_data.ec ?? "--"}
            </div>
          </div>
          <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
            <div className="text-xs text-cyan-600 font-medium">Soil Temp</div>
            <div className="text-xl font-bold text-cyan-700">
              {latestData.sensor_data.soil_temp_C ?? "--"}°C
            </div>
          </div>
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-xs text-red-600 font-medium">Nitrogen (N)</div>
            <div className="text-xl font-bold text-red-700">
              {latestData.sensor_data.N ?? "--"}{" "}
              <span className="text-sm font-normal">ppm</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <div className="text-xs text-indigo-600 font-medium">
              Phosphorus (P)
            </div>
            <div className="text-xl font-bold text-indigo-700">
              {latestData.sensor_data.P ?? "--"}{" "}
              <span className="text-sm font-normal">ppm</span>
            </div>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-xs text-yellow-600 font-medium">
              Potassium (K)
            </div>
            <div className="text-xl font-bold text-yellow-700">
              {latestData.sensor_data.K ?? "--"}{" "}
              <span className="text-sm font-normal">ppm</span>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 font-medium">
              Raw Moisture
            </div>
            <div className="text-xl font-bold text-gray-700">
              {latestData.sensor_data.moisture ?? "--"}%
            </div>
          </div>
        </div>
      )} */}

      {/* Chart — unchanged */}
      <div className="h-96 border rounded-lg p-4 bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history}
            margin={{ top: 5, right: 60, left: 60, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              yAxisId="percent"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              label={{
                value: "% / ppm",
                angle: -90,
                position: "insideLeft",
                fontSize: 10,
              }}
            />
            <YAxis
              yAxisId="temp"
              orientation="right"
              domain={[0, 60]}
              tick={{ fontSize: 10 }}
              label={{
                value: "°C",
                angle: 90,
                position: "insideRight",
                fontSize: 10,
              }}
            />
            <YAxis
              yAxisId="ph"
              orientation="right"
              domain={[0, 14]}
              tick={{ fontSize: 10 }}
              label={{
                value: "pH",
                angle: 90,
                position: "insideRight",
                offset: 40,
                fontSize: 10,
              }}
            />
            <YAxis
              yAxisId="ec"
              orientation="right"
              domain={[0, 5]}
              tick={{ fontSize: 10 }}
              label={{
                value: "EC",
                angle: 90,
                position: "insideRight",
                offset: 80,
                fontSize: 10,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "#374151", fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="soil_moisture"
              stroke="#22c55e"
              name="Soil Moisture (%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="N"
              stroke="#ef4444"
              name="Nitrogen (ppm)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="P"
              stroke="#6366f1"
              name="Phosphorus (ppm)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="K"
              stroke="#eab308"
              name="Potassium (ppm)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temperature"
              stroke="#3b82f6"
              name="Temperature (°C)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="ph"
              type="monotone"
              dataKey="ph"
              stroke="#f97316"
              name="pH Level"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              yAxisId="ec"
              type="monotone"
              dataKey="ec"
              stroke="#a855f7"
              name="EC (mS/cm)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-gray-400 text-right">
        {history.length} data points
      </div>
    </div>
  );
}
