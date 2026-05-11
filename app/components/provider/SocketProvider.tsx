"use client";

import { ReactNode } from "react";
import {
  SensorSocketProvider,
  useSensorSocketProvider,
} from "@/app/hooks/useSensorSocket";

interface Props {
  deviceId: string;
  gatewayUrl: string;
  children: ReactNode;
}

export default function SocketProvider({
  deviceId,
  gatewayUrl,
  children,
}: Props) {
  const socketState = useSensorSocketProvider(deviceId, gatewayUrl);

  return (
    <SensorSocketProvider value={socketState}>{children}</SensorSocketProvider>
  );
}
