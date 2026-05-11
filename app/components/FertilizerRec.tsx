"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSensorSocket } from "@/app/hooks/useSensorSocket";
import {
  Sprout,
  AlertCircle,
  CheckCircle,
  Clock,
  Leaf,
  Droplets,
} from "lucide-react";
import { debounce } from "lodash";

interface FertilizerProps {
  deviceId: string;
  gatewayUrl?: string;
  defaultCrop?: string;
  defaultGrowthStage?: string;
}

interface FertilizerResponse {
  recommended_fertilizer?: string;
  confidence?: number;
  dosage?: string;
  schedule?: string;
  warnings?: string[];
  nutrients_needed?: {
    N: number;
    P: number;
    K: number;
  };
  reasoning?: string;
}

interface FertilizerPayload {
  device_id: string;
  crop: string;
  growth_stage: string;
}

const CROPS = [
  { label: "Soybean", value: "soybean" },
  { label: "Sugarcane", value: "sugarcane" },
  { label: "Groundnut", value: "groundnut" },
  { label: "Wheat", value: "wheat" },
  { label: "Rice", value: "rice" },
  { label: "Maize", value: "maize" },
];

const GROWTH_STAGES = [
  { label: "Vegetative", value: "vegetative" },
  { label: "Flowering", value: "flowering" },
  { label: "Maturity", value: "maturity" },
];

export default function FertilizerRecommendation({
  deviceId,
  gatewayUrl = "http://localhost:8000",
  defaultCrop = "rice",
  defaultGrowthStage = "vegetative",
}: FertilizerProps) {
  const { latestData, isConnected } = useSensorSocket();
  const [crop, setCrop] = useState(defaultCrop);
  const [growthStage, setGrowthStage] = useState(defaultGrowthStage);
  const [recommendation, setRecommendation] =
    useState<FertilizerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTime = useRef<number>(0);

  const fetchRecommendation = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    lastFetchTime.current = Date.now();

    try {
      const payload: FertilizerPayload = {
        device_id: deviceId,
        crop,
        growth_stage: growthStage,
      };

      const response = await fetch(`${gatewayUrl}/predict/fertilizer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: FertilizerResponse = await response.json();
      setRecommendation(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to get recommendation",
      );
      console.error("Fertilizer API error:", err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, crop, growthStage, gatewayUrl]);

  // Auto-fetch when crop/growth stage changes
  useEffect(() => {
    const debouncedFetch = debounce(() => {
      fetchRecommendation();
    }, 500);

    debouncedFetch();

    return () => {
      debouncedFetch.cancel();
    };
  }, [crop, growthStage, fetchRecommendation]);

  // Real-time: Auto-fetch when sensor data updates (with debounce)
  useEffect(() => {
    if (!latestData) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastFetchTime.current < 15000) return; // Min 15s between calls
      fetchRecommendation();
    }, 3000); // 3s debounce after sensor update

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [latestData, fetchRecommendation]);

  const sensorData = latestData?.sensor_data;

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "text-gray-500";
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Sprout className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              Fertilizer Recommendation
            </h3>
            <p className="text-sm text-gray-500">
              AI-powered based on real-time soil data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Crop & Stage Selection */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Crop Type
          </label>
          <select
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {CROPS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Growth Stage
          </label>
          <select
            value={growthStage}
            onChange={(e) => setGrowthStage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {GROWTH_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Current Sensor Context */}
      {sensorData && (
        <div className="grid grid-cols-4 gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <Leaf className="w-3 h-3" /> N
            </div>
            <div className="text-lg font-bold text-gray-900">
              {sensorData.N ?? "--"}
            </div>
            <div className="text-xs text-gray-500">ppm</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <Leaf className="w-3 h-3" /> P
            </div>
            <div className="text-lg font-bold text-gray-900">
              {sensorData.P ?? "--"}
            </div>
            <div className="text-xs text-gray-500">ppm</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <Leaf className="w-3 h-3" /> K
            </div>
            <div className="text-lg font-bold text-gray-900">
              {sensorData.K ?? "--"}
            </div>
            <div className="text-xs text-gray-500">ppm</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <Droplets className="w-3 h-3" /> pH
            </div>
            <div className="text-lg font-bold text-gray-900">
              {sensorData.ph ?? "--"}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !recommendation && (
        <div className="text-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Analyzing soil conditions...</p>
            <p className="text-sm text-gray-400">
              AI is calculating optimal fertilizer
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Analysis Failed
              </p>
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={fetchRecommendation}
                className="mt-2 text-sm text-red-700 underline hover:no-underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recommendation Result */}
      <AnimatePresence>
        {recommendation && !loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            {/* Main Recommendation */}
            <div className="p-6 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      Recommended Fertilizer
                    </span>
                  </div>
                  <h4 className="text-2xl font-bold text-green-800">
                    {recommendation.recommended_fertilizer || "Urea"}
                  </h4>
                  {recommendation.confidence && (
                    <p
                      className={`text-sm mt-1 ${getConfidenceColor(recommendation.confidence)}`}
                    >
                      Confidence: {Math.round(recommendation.confidence * 100)}%
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {recommendation.dosage && (
                    <div className="text-lg font-semibold text-green-700">
                      {recommendation.dosage}
                    </div>
                  )}
                  {recommendation.schedule && (
                    <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                      <Clock className="w-4 h-4" />
                      {recommendation.schedule}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Nutrient Breakdown */}
            {recommendation.nutrients_needed && (
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                  <div className="text-sm text-red-600 font-medium">
                    Nitrogen (N)
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {recommendation.nutrients_needed.N} kg/ha
                  </div>
                  <div className="text-xs text-red-500 mt-1">Needed</div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-sm text-blue-600 font-medium">
                    Phosphorus (P)
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {recommendation.nutrients_needed.P} kg/ha
                  </div>
                  <div className="text-xs text-blue-500 mt-1">Needed</div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                  <div className="text-sm text-yellow-600 font-medium">
                    Potassium (K)
                  </div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {recommendation.nutrients_needed.K} kg/ha
                  </div>
                  <div className="text-xs text-yellow-500 mt-1">Needed</div>
                </div>
              </div>
            )}

            {/* Warnings */}
            {recommendation.warnings && recommendation.warnings.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Warnings
                    </p>
                    <ul className="mt-1 space-y-1">
                      {recommendation.warnings.map((warning, i) => (
                        <li key={i} className="text-sm text-yellow-700">
                          • {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Reasoning */}
            {recommendation.reasoning && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-700">
                    AI Reasoning:{" "}
                  </span>
                  {recommendation.reasoning}
                </p>
              </div>
            )}

            {/* Toggle Details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showDetails ? "Hide" : "Show"} Detailed Analysis
            </button>

            <AnimatePresence>
              {showDetails && sensorData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-gray-50 rounded-lg space-y-2"
                >
                  <h5 className="text-sm font-medium text-gray-700">
                    Current Soil Analysis
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Soil Moisture:</span>
                      <span className="font-medium">
                        {sensorData.soil_moisture ?? sensorData.moisture}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Temperature:</span>
                      <span className="font-medium">
                        {sensorData.temperature}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">EC:</span>
                      <span className="font-medium">{sensorData.ec} mS/cm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Soil Temp:</span>
                      <span className="font-medium">
                        {sensorData.soil_temp_C}°C
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
