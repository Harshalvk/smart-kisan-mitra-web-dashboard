import React from "react";
import SensorCard from "./SensorCard";
import { useSensorSocket } from "../hooks/useSensorSocket";
import { Droplet, FlaskRound, Thermometer, Zap } from "lucide-react";

const SensorCardGrid = () => {
  const { latestData } = useSensorSocket();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <SensorCard
        title="Soil Moisture"
        value={Math.min(latestData?.sensor_data.soil_moisture || 65, 100)}
        unit="%"
        icon={Droplet}
        color="primary"
        target={80}
      />

      <SensorCard
        title="Temperature"
        value={latestData?.sensor_data.temperature || 28.4}
        unit="°C"
        icon={Thermometer}
        color="accent-blue"
        target={30}
      />

      <SensorCard
        title="pH Level"
        value={latestData?.sensor_data.ph || 6.8}
        unit="pH"
        icon={FlaskRound}
        color="accent-orange"
        target={7}
      />

      <SensorCard
        title="EC Value"
        value={latestData?.sensor_data.ec || 1.2}
        unit="mS/cm"
        icon={Zap}
        color="accent-blue"
        target={1.5}
      />
    </div>
  );
};

export default SensorCardGrid;
