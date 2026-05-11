"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import Header from "@/app/components/Header";
import { motion } from "framer-motion";
import RealTimeMonitor from "./components/RealTimeMonitor";
import SoilHealth from "./components/SoilHealth";
import NPKGauges from "./components/NPKGauges";
import SocketProvider from "./components/provider/SocketProvider";
import SensorCardGrid from "./components/SensorCardGrid";
import SensorHistory from "./components/SensorHistory";
import FertilizerRecommendation from "./components/FertilizerRec";
import PredictionsTab from "./components/Predictions";
import FarmMap from "./components/FarmMap";
import WeatherDashboard from "./components/Weather";

const API_GATEWAY_URL =
  process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:8000";

export default function Dashboard() {
  const [selectedDevice, setSelectedDevice] = useState("farm_010");
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <SocketProvider deviceId={selectedDevice} gatewayUrl={API_GATEWAY_URL}>
      <div className="flex h-screen bg-white">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-1 overflow-auto">
          <Header
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
          />

          <main className="p-6">
            <div className={activeTab === "overview" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <RealTimeMonitor
                  deviceId="farm_010"
                  gatewayUrl={
                    process.env.NEXT_PUBLIC_GATEWAY_URL ||
                    "http://localhost:8000"
                  }
                />
                <SensorCardGrid />
                <NPKGauges />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <FertilizerRecommendation
                    deviceId={selectedDevice}
                    defaultCrop="rice"
                    defaultGrowthStage="vegetative"
                    gatewayUrl={API_GATEWAY_URL}
                  />
                  <SoilHealth
                    deviceId={selectedDevice}
                    gatewayUrl={API_GATEWAY_URL}
                    pollInterval={60000}
                  />
                </div>
              </motion.div>
            </div>

            <div className={activeTab === "predictions" ? "block" : "hidden"}>
              <PredictionsTab deviceId={selectedDevice} />
            </div>

            <div className={activeTab === "history" ? "block" : "hidden"}>
              <SensorHistory deviceId={selectedDevice} />
            </div>
            <div className={activeTab === "alerts" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    System Alerts & Notifications
                  </h2>

                  {/* Active Alerts */}
                  <div className="space-y-3 mb-6">
                    <h3 className="text-lg font-medium text-gray-800">
                      🔴 Active Alerts
                    </h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-red-500 rounded-full mt-2" />
                        <div>
                          <div className="font-semibold text-red-800">
                            Low Nitrogen Level
                          </div>
                          <div className="text-sm text-red-600 mt-1">
                            Nitrogen level is at 45 ppm (optimal range: 80-120
                            ppm). Consider applying nitrogen-rich fertilizer.
                          </div>
                          <div className="text-xs text-red-500 mt-2">
                            Detected: 2 hours ago
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2" />
                        <div>
                          <div className="font-semibold text-yellow-800">
                            Low Potassium Level
                          </div>
                          <div className="text-sm text-yellow-600 mt-1">
                            Potassium level is at 20 ppm (optimal range: 50-80
                            ppm). Potassium deficiency detected.
                          </div>
                          <div className="text-xs text-yellow-500 mt-2">
                            Detected: 4 hours ago
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-4">
                      ⚙️ Alert Threshold Configuration
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: "Soil Moisture Warning (%)", step: "1" },
                        { label: "Temperature Warning (°C)", step: "1" },
                        { label: "pH Warning Range", step: "0.1" },
                        { label: "EC Warning (mS/cm)", step: "0.1" },
                      ].map(({ label, step }) => (
                        <div key={label}>
                          <label className="block text-gray-700 text-sm mb-1">
                            {label}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step={step}
                              placeholder="Min"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                            />
                            <input
                              type="number"
                              step={step}
                              placeholder="Max"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      Save Alert Settings
                    </button>
                  </div>

                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-4">
                      🔔 Notification Preferences
                    </h3>
                    <div className="space-y-3">
                      {[
                        "Email notifications for critical alerts",
                        "Push notifications on dashboard",
                        "SMS alerts for urgent issues",
                      ].map((label) => (
                        <label key={label} className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-green-600"
                          />
                          <span className="text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
            <div className={activeTab === "farmmap" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Farm Map
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Draw your field boundaries and get sensor-driven insights
                    for each zone.
                  </p>
                </div>

                <div style={{ height: "calc(100vh - 180px)" }}>
                  <FarmMap deviceId={selectedDevice} />
                </div>
              </motion.div>
            </div>
            <div className={activeTab === "weather" ? "block" : "hidden"}>
              <WeatherDashboard />
            </div>
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}
