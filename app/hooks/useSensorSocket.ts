"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";

export interface SensorData {
  device_id: string;
  sensor_data: {
    soil_moisture: number;
    temperature: number;
    ph: number;
    N?: number;
    P?: number;
    K?: number;
    ec?: number;
    moisture?: number;
    soil_temp_C?: number;
    [key: string]: any;
  };
  timestamp: string;
  latitude?: number;
  longitude?: number;
}

interface SocketState {
  latestData: SensorData | null;
  isConnected: boolean;
  error: string | null;
}

// Create context for shared socket state
const SensorSocketContext = createContext<SocketState>({
  latestData: null,
  isConnected: false,
  error: null,
});

export const SensorSocketProvider = SensorSocketContext.Provider;

// Hook to consume the shared state
export function useSensorSocket() {
  return useContext(SensorSocketContext);
}

// Hook to create the provider value (call once in parent)
export function useSensorSocketProvider(
  deviceId: string,
  gatewayUrl: string,
): SocketState {
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${gatewayUrl.replace(/^http/, "ws")}/ws/${deviceId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sensor_data || data.N !== undefined) {
          // Normalize both formats
          const normalized: SensorData = data.sensor_data
            ? data
            : {
                device_id: deviceId,
                sensor_data: data,
                timestamp: new Date().toISOString(),
              };
          setLatestData(normalized);
        }
      } catch (e) {
        console.log("Raw message:", event.data);
      }
    };

    ws.onerror = () => {
      setError("Connection error");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    wsRef.current = ws;
  }, [deviceId, gatewayUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { latestData, isConnected, error };
}
