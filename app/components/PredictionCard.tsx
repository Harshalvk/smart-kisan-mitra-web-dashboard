"use client";

import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";

interface PredictionCardProps {
  title: string;
  deviceId: string;
  type: "fertilizer" | "crop" | "soil" | "plant";
  apiGatewayUrl: string;
  latitude?: number;
  longitude?: number;
}

export default function PredictionCard({
  title,
  deviceId,
  type,
  apiGatewayUrl,
  latitude,
  longitude,
}: PredictionCardProps) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<any>(null);
  const [crop, setCrop] = useState("rice");
  const [growthStage, setGrowthStage] = useState("vegetative");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const getPrediction = async () => {
    setLoading(true);
    try {
      let response;

      switch (type) {
        case "fertilizer":
          response = await axios.post(`${apiGatewayUrl}/predict/fertilizer`, {
            device_id: deviceId,
            crop: crop,
            growth_stage: growthStage,
          });
          break;
        case "crop":
          response = await axios.post(`${apiGatewayUrl}/predict/crop`, {
            device_id: deviceId,
            latitude: latitude || 20.5937,
            longitude: longitude || 78.9629,
          });
          break;
        case "soil":
          response = await axios.post(`${apiGatewayUrl}/predict/soil-health`, {
            device_id: deviceId,
          });
          break;
        case "plant":
          if (!selectedFile) {
            toast.error("Please select an image");
            setLoading(false);
            return;
          }
          const formData = new FormData();
          formData.append("file", selectedFile);
          response = await axios.post(
            `${apiGatewayUrl}/predict/plant-disease`,
            formData,
            {
              headers: { "Content-Type": "multipart/form-data" },
            },
          );
          break;
      }

      setPrediction(response?.data);
      toast.success("Prediction completed successfully");
    } catch (error) {
      console.error("Prediction error:", error);
      toast.error("Failed to get prediction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <h3 className="text-xl font-semibold text-primary-dark mb-4">{title}</h3>

      {type !== "plant" && type !== "crop" && (
        <div className="space-y-3 mb-4">
          {type === "fertilizer" && (
            <>
              <div>
                <label className="block text-text-medium text-sm mb-1">
                  Crop Type
                </label>
                <select
                  value={crop}
                  onChange={(e) => setCrop(e.target.value)}
                  className="input-field"
                >
                  <option value="rice">Rice</option>
                  <option value="wheat">Wheat</option>
                  <option value="maize">Maize</option>
                  <option value="cotton">Cotton</option>
                </select>
              </div>
              <div>
                <label className="block text-text-medium text-sm mb-1">
                  Growth Stage
                </label>
                <select
                  value={growthStage}
                  onChange={(e) => setGrowthStage(e.target.value)}
                  className="input-field"
                >
                  <option value="vegetative">Vegetative</option>
                  <option value="flowering">Flowering</option>
                  <option value="fruiting">Fruiting</option>
                  <option value="maturity">Maturity</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {type === "plant" && (
        <div className="mb-4">
          <label className="block text-text-medium text-sm mb-1">
            Upload Plant Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="input-field"
          />
        </div>
      )}

      <button
        onClick={getPrediction}
        disabled={loading}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Analyzing..." : "Get Prediction"}
      </button>

      {prediction && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 p-4 bg-primary-soft rounded-lg"
        >
          <h4 className="font-semibold text-primary-dark mb-2">
            Prediction Result:
          </h4>
          <pre className="text-sm text-text-dark whitespace-pre-wrap">
            {JSON.stringify(prediction, null, 2)}
          </pre>
        </motion.div>
      )}
    </motion.div>
  );
}
