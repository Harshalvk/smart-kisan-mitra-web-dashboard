"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import axios from "axios";
import toast from "react-hot-toast";

interface HeaderProps {
  selectedDevice: string;
  setSelectedDevice: (device: string) => void;
}

interface Device {
  device_id: string;
  last_updated?: string;
  status?: string;
}

export default function Header({
  selectedDevice,
  setSelectedDevice,
}: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const API_GATEWAY_URL =
    process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:8000";

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_GATEWAY_URL}/devices`);

        if (response.data && response.data.devices) {
          setDevices(response.data.devices);

          const farm010Exists = response.data.devices.some(
            (device: Device) => device.device_id === "farm_010",
          );

          if (farm010Exists && !selectedDevice) {
            setSelectedDevice("farm_010");
          } else if (response.data.devices.length > 0 && !selectedDevice) {
            setSelectedDevice(response.data.devices[0].device_id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch devices:", error);
        toast.error("Could not fetch devices from database");

        setDevices([
          { device_id: "farm_010", status: "active" },
          { device_id: "device_002", status: "unknown" },
          { device_id: "device_003", status: "unknown" },
        ]);

        if (!selectedDevice) {
          setSelectedDevice("farm_010");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();

    const interval = setInterval(fetchDevices, 60000);
    return () => clearInterval(interval);
  }, [API_GATEWAY_URL, selectedDevice, setSelectedDevice]);

  const getDeviceStatus = (deviceId: string) => {
    if (deviceId === "farm_010") {
      return "bg-green-500 animate-pulse";
    }
    return "bg-gray-400";
  };

  return (
    <header className="">
      <div className="">
        <div className="flex justify-between items-center border-b border-border p-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">
              Real-time monitoring and AI predictions
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-700 min-w-[200px]"
                disabled={loading}
              >
                {loading ? (
                  <option>Loading devices...</option>
                ) : (
                  devices.map((device) => (
                    <option key={device.device_id} value={device.device_id}>
                      {device.device_id}
                      {device.device_id === "farm_010" &&
                        " 🔴 (Active - sends data every 30s)"}
                      {device.status === "active" && " 🟢"}
                    </option>
                  ))
                )}
              </select>
              {selectedDevice === "farm_010" && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600">Live</span>
                  </div>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-gray-900 font-medium">
                {format(currentTime, "hh:mm:ss a")}
              </div>
              <div className="text-gray-400 text-xs">
                {format(currentTime, "MMM dd, yyyy")}
              </div>
            </div>
          </div>
        </div>
        {/* Active device info banner */}
      </div>
      {selectedDevice === "farm_010" && (
        <div className="py-3 px-6">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 font-medium">
              farm_010 is active
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500">Sending data every 30 seconds</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500">
              Last update: {format(currentTime, "hh:mm:ss a")}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
