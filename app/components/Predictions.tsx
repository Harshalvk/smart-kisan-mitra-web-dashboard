"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  LucideProps,
  Sprout,
  TestTubeDiagonal,
  Tractor,
  TreeDeciduous,
} from "lucide-react";

const GATEWAY = process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:8000";

interface PredictionsTabProps {
  deviceId: string;
}

type Status = "idle" | "loading" | "success" | "error";

function StatusBadge({ status }: { status: Status }) {
  if (status === "idle") return null;
  const map = {
    loading: {
      color: "bg-blue-50 text-blue-600 border-blue-200",
      label: "Analysing…",
    },
    success: {
      color: "bg-green-50 text-green-700 border-green-200",
      label: "Done",
    },
    error: { color: "bg-red-50 text-red-600 border-red-200", label: "Failed" },
  } as const;
  const { color, label } = map[status];
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8z"
      />
    </svg>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2">
      <span>⚠️</span>
      <span>{message}</span>
    </div>
  );
}

function ResultBox({ data }: { data: unknown }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm"
    >
      <ResultRenderer data={data} />
    </motion.div>
  );
}

/** Renders the response intelligently: handles string, object, or nested result keys */
function ResultRenderer({ data }: { data: unknown }) {
  if (typeof data === "string") return <p className="text-gray-700">{data}</p>;

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    // Common patterns from ML services
    const mainResult =
      obj.recommendation ??
      obj.prediction ??
      obj.result ??
      obj.crop ??
      obj.disease ??
      obj.health_score ??
      null;

    const confidence = obj.confidence ?? obj.probability ?? obj.score ?? null;

    const details =
      obj.details ??
      obj.explanation ??
      obj.advice ??
      obj.nutrients ??
      obj.symptoms ??
      null;

    if (mainResult !== null) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-base capitalize">
              {String(mainResult)}
            </span>
            {confidence !== null && (
              <span className="text-xs text-gray-500">
                {typeof confidence === "number"
                  ? `${(confidence * 100).toFixed(1)}% confidence`
                  : String(confidence)}
              </span>
            )}
          </div>
          {details !== null && (
            <p className="text-gray-600 text-xs leading-relaxed">
              {typeof details === "object"
                ? JSON.stringify(details, null, 2)
                : String(details)}
            </p>
          )}
        </div>
      );
    }

    // Fallback: pretty-print the whole object
    return (
      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  return <p className="text-gray-500 text-xs">No result</p>;
}

function Card({
  emoji: Icon,
  title,
  status,
  children,
}: {
  emoji: React.ComponentType<LucideProps>;
  title: string;
  status: Status;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border shadow-inner p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Icon />
          {title}
        </h3>
        <StatusBadge status={status} />
      </div>
      {children}
    </div>
  );
}

function SubmitButton({ status, label }: { status: Status; label: string }) {
  return (
    <button
      type="submit"
      disabled={status === "loading"}
      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl font-medium text-sm transition-colors"
    >
      {status === "loading" && <Spinner />}
      {status === "loading" ? "Working…" : label}
    </button>
  );
}

// ─── 1. Fertilizer ────────────────────────────────────────────────────────────

const CROPS = ["rice", "wheat", "maize", "cotton", "sugarcane", "soybean"];
const GROWTH_STAGES = ["vegetative", "flowering", "fruiting", "maturity"];

function FertilizerCard({ deviceId }: { deviceId: string }) {
  const [crop, setCrop] = useState("rice");
  const [growthStage, setGrowthStage] = useState("vegetative");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${GATEWAY}/predict/fertilizer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          crop,
          growth_stage: growthStage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message ?? "Request failed");
      setStatus("error");
    }
  };

  return (
    <Card emoji={Sprout} title="Fertilizer Recommendation" status={status}>
      <form onSubmit={handle} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Crop type
          </label>
          <select
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white capitalize text-gray-700"
          >
            {CROPS.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Growth stage
          </label>
          <select
            value={growthStage}
            onChange={(e) => setGrowthStage(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-700"
          >
            {GROWTH_STAGES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton status={status} label="Get Recommendation" />
      </form>

      {status === "error" && <ErrorBox message={error} />}
      {status === "success" && <ResultBox data={result} />}
    </Card>
  );
}

// ─── 2. Crop recommendation ───────────────────────────────────────────────────

function CropCard({ deviceId }: { deviceId: string }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  // Try to prefill from browser geolocation
  const geoFill = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    });
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lat || !lng) {
      setError("Please enter latitude and longitude");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${GATEWAY}/predict/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message ?? "Request failed");
      setStatus("error");
    }
  };

  return (
    <Card emoji={Tractor} title="Crop Recommendation" status={status}>
      <form onSubmit={handle} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              placeholder="20.5937"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              placeholder="78.9629"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={geoFill}
          className="text-xs text-green-600 hover:text-green-700 underline underline-offset-2"
        >
          📍 Use my current location
        </button>
        <SubmitButton status={status} label="Get Crop Recommendation" />
      </form>

      {status === "error" && <ErrorBox message={error} />}
      {status === "success" && <ResultBox data={result} />}
    </Card>
  );
}

// ─── 3. Soil health ───────────────────────────────────────────────────────────

function SoilHealthCard({ deviceId }: { deviceId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  const handle = async () => {
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${GATEWAY}/predict/soil-health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message ?? "Request failed");
      setStatus("error");
    }
  };

  // Pull score out for the visual meter
  const score: number | null = (() => {
    if (!result || typeof result !== "object") return null;
    const r = result as Record<string, unknown>;
    const v = r.health_score ?? r.score ?? r.result ?? null;
    return typeof v === "number" ? v : null;
  })();

  return (
    <Card emoji={TestTubeDiagonal} title="Soil Health Analysis" status={status}>
      <button
        onClick={handle}
        disabled={status === "loading"}
        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 rounded-xl font-medium text-sm transition-colors"
      >
        {status === "loading" && <Spinner />}
        {status === "loading" ? "Analysing…" : "Analyse Soil Health"}
      </button>

      {status === "error" && <ErrorBox message={error} />}

      {status === "success" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {score !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Health score</span>
                <span className="font-semibold text-gray-800">{score}/100</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    score >= 70
                      ? "bg-green-500"
                      : score >= 40
                        ? "bg-yellow-400"
                        : "bg-red-400"
                  }`}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {score >= 70
                  ? "🟢 Good"
                  : score >= 40
                    ? "🟡 Moderate"
                    : "🔴 Poor"}
              </p>
            </div>
          )}
          <ResultBox data={result} />
        </motion.div>
      )}
    </Card>
  );
}

// ─── 4. Plant disease ─────────────────────────────────────────────────────────

function PlantDiseaseCard() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setResult(null);
    setStatus("idle");
    setError("");
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select an image first");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${GATEWAY}/predict/plant-disease`, {
        method: "POST",
        body: form,
        // No Content-Type header — browser sets multipart boundary automatically
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setResult(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message ?? "Request failed");
      setStatus("error");
    }
  };

  return (
    <Card emoji={TreeDeciduous} title="Plant Disease Detection" status={status}>
      <form onSubmit={handle} className="space-y-3">
        <label className="block cursor-pointer">
          <div
            className={`relative rounded-xl border-2 border-dashed transition-colors overflow-hidden
              ${preview ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-green-400 bg-gray-50"}`}
          >
            {preview ? (
              <img
                src={preview}
                alt="Plant preview"
                className="w-full h-40 object-cover"
              />
            ) : (
              <div className="h-32 flex flex-col items-center justify-center gap-1">
                <span className="text-2xl">📷</span>
                <span className="text-xs text-gray-500">
                  Click to upload plant image
                </span>
                <span className="text-xs text-gray-400">JPG, PNG, WEBP</span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </label>

        {preview && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setResult(null);
              setStatus("idle");
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            ✕ Remove image
          </button>
        )}

        <SubmitButton status={status} label="Detect Disease" />
      </form>

      {status === "error" && <ErrorBox message={error} />}
      {status === "success" && <ResultBox data={result} />}
    </Card>
  );
}

export default function PredictionsTab({ deviceId }: PredictionsTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FertilizerCard deviceId={deviceId} />
        <CropCard deviceId={deviceId} />
        <SoilHealthCard deviceId={deviceId} />
        <PlantDiseaseCard />
      </div>
    </motion.div>
  );
}
