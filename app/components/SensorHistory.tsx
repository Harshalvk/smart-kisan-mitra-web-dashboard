"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useSensorSocket } from "@/app/hooks/useSensorSocket";

interface Reading {
  device_id: string;
  timestamp: string;
  sensor_data: {
    soil_moisture?: number;
    moisture?: number;
    temperature?: number;
    ph?: number;
    ec?: number;
    N?: number;
    P?: number;
    K?: number;
    [key: string]: any;
  };
}

interface SensorHistoryProps {
  deviceId: string;
  gatewayUrl?: string;
}

export default function SensorHistory({
  deviceId,
  gatewayUrl = "http://localhost:8000",
}: SensorHistoryProps) {
  const { latestData } = useSensorSocket();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch historical data
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${gatewayUrl}/history/${deviceId}?limit=50`);
      const data = await res.json();
      if (data.readings) {
        // Sort newest first
        const sorted = data.readings.sort(
          (a: Reading, b: Reading) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setReadings(sorted);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, gatewayUrl]);

  // Initial fetch
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Real-time update when new data arrives via WebSocket
  useEffect(() => {
    if (!latestData) return;

    const newReading: Reading = {
      device_id: latestData.device_id,
      timestamp: latestData.timestamp,
      sensor_data: latestData.sensor_data,
    };

    setReadings((prev) => {
      // Prevent duplicates
      const exists = prev.some((r) => r.timestamp === newReading.timestamp);
      if (exists) return prev;

      const updated = [newReading, ...prev];
      return updated.slice(0, 50); // Keep last 50
    });
  }, [latestData]);

  // Filter readings based on search
  const filteredReadings = readings.filter((reading) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      reading.device_id.toLowerCase().includes(query) ||
      new Date(reading.timestamp).toLocaleString().toLowerCase().includes(query)
    );
  });

  const exportData = () => {
    const csv = [
      [
        "Timestamp",
        "Device ID",
        "Soil Moisture",
        "Temperature",
        "pH",
        "EC",
        "N",
        "P",
        "K",
      ].join(","),
      ...readings.map((r) =>
        [
          new Date(r.timestamp).toISOString(),
          r.device_id,
          r.sensor_data.soil_moisture ?? r.sensor_data.moisture ?? "",
          r.sensor_data.temperature ?? "",
          r.sensor_data.ph ?? "",
          r.sensor_data.ec ?? "",
          r.sensor_data.N ?? "",
          r.sensor_data.P ?? "",
          r.sensor_data.K ?? "",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sensor-history-${deviceId}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Sensor History
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Device: <span className="font-mono">{deviceId}</span> •{" "}
              {readings.length} records
              {latestData && (
                <span className="ml-2 text-green-600 flex items-center gap-1 inline-flex">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Live updates
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by device or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={exportData}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Export Data
            </button>
            <button
              onClick={fetchHistory}
              className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  Device ID
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  Soil Moisture
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  Temperature
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  pH
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  EC
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  N (ppm)
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  P (ppm)
                </th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold text-sm">
                  K (ppm)
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && readings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Loading history...
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReadings.map((reading, index) => {
                  const isNew =
                    index === 0 && latestData?.timestamp === reading.timestamp;
                  return (
                    <tr
                      key={`${reading.device_id}-${reading.timestamp}`}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        isNew ? "bg-green-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        <div className="flex items-center gap-2">
                          {new Date(reading.timestamp).toLocaleString()}
                          {isNew && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm font-mono">
                        {reading.device_id}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {reading.sensor_data?.soil_moisture ??
                            reading.sensor_data?.moisture ??
                            "-"}
                          %
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        {reading.sensor_data?.temperature ?? "-"}°C
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            (reading.sensor_data?.ph ?? 7) >= 6 &&
                            (reading.sensor_data?.ph ?? 7) <= 7.5
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {reading.sensor_data?.ph ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        {reading.sensor_data?.ec ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        {reading.sensor_data?.N ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        {reading.sensor_data?.P ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">
                        {reading.sensor_data?.K ?? "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredReadings.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            {searchQuery
              ? "No matching records found"
              : "No sensor data available"}
          </div>
        )}
      </div>
    </motion.div>
  );
}
