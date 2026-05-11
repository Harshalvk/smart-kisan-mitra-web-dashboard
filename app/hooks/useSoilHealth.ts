import { useState, useCallback, useRef } from "react";

interface SoilHealthResponse {
  health_score: number;
  status: string;
  nutrients: {
    N: number;
    P: number;
    K: number;
  };
  ph: number;
  moisture: number;
  ec: number;
  recommendations?: string[];
}

interface SensorData {
  N: number;
  P: number;
  K: number;
  ph: number;
  moisture: number;
  temperature: number;
  ec: number;
}

export function useSoilHealth(gatewayUrl: string, deviceId: string) {
  const [soilHealth, setSoilHealth] = useState<SoilHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const pendingFetchRef = useRef<Promise<void> | null>(null);

  const fetchSoilHealth = useCallback(
    async (sensorData: SensorData) => {
      // Debounce: minimum 5 seconds between calls to protect the AI model
      const now = Date.now();
      if (now - lastFetchRef.current < 5000) {
        return;
      }

      // Prevent duplicate concurrent requests
      if (pendingFetchRef.current) {
        await pendingFetchRef.current;
        return;
      }

      const fetchPromise = (async () => {
        try {
          setLoading(true);
          setError(null);
          lastFetchRef.current = Date.now();

          const response = await fetch(`${gatewayUrl}/predict/soil-health`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data: SoilHealthResponse = await response.json();
          setSoilHealth(data);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to analyze soil",
          );
          console.error("Soil health fetch error:", err);
        } finally {
          setLoading(false);
          pendingFetchRef.current = null;
        }
      })();

      pendingFetchRef.current = fetchPromise;
      await fetchPromise;
    },
    [gatewayUrl, deviceId],
  );

  return { soilHealth, loading, error, fetchSoilHealth };
}
