"use client";

import { useState } from "react";
import { format } from "date-fns";

interface HistoryTableProps {
  historyData: any[];
  fullPage?: boolean;
}

export default function HistoryTable({
  historyData,
  fullPage = false,
}: HistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredData = historyData.filter(
    (reading) =>
      reading.device_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      new Date(reading.timestamp).toLocaleDateString().includes(searchTerm),
  );

  return (
    <div className={`card ${fullPage ? "h-full" : ""}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-primary-dark">
          Sensor History
        </h3>
        {fullPage && (
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field w-64"
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-primary-soft">
            <tr>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                Device ID
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                Soil Moisture
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                Temperature
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                pH
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                EC
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                N
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                P
              </th>
              <th className="px-4 py-3 text-left text-text-dark font-semibold">
                K
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((reading, index) => (
              <tr
                key={index}
                className="border-b border-border-light hover:bg-primary-soft transition-colors"
              >
                <td className="px-4 py-3 text-text-dark">
                  {format(new Date(reading.timestamp), "MMM dd, yyyy HH:mm:ss")}
                </td>
                <td className="px-4 py-3 text-text-dark font-mono text-sm">
                  {reading.device_id}
                </td>
                <td className="px-4 py-3">
                  <span className="status-badge status-success">
                    {reading.sensor_data?.soil_moisture ||
                      reading.sensor_data?.moisture ||
                      "-"}
                    %
                  </span>
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.temperature || "-"}°C
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.ph || "-"}
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.ec || "-"} mS/cm
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.N || "-"} ppm
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.P || "-"} ppm
                </td>
                <td className="px-4 py-3 text-text-dark">
                  {reading.sensor_data?.K || "-"} ppm
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredData.length === 0 && (
          <div className="text-center py-8 text-text-medium">
            No sensor data available
          </div>
        )}
      </div>
    </div>
  );
}
