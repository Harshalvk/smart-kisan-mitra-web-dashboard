"use client";

import { motion } from "framer-motion";
import React from "react";
import { LucideProps } from "lucide-react";
import { useSensorSocket } from "../hooks/useSensorSocket";

interface SensorCardProps {
  title: string;
  value: number;
  unit: string;
  icon: React.ComponentType<LucideProps>;
  color: string;
  target: number;
}

export default function SensorCard({
  title,
  value,
  unit,
  icon: Icon,
  color,
  target,
}: SensorCardProps) {
  const percentage = (value / target) * 100;
  const isOptimal = percentage <= 100;
  const { latestData } = useSensorSocket();

  const getColorClass = () => {
    switch (color) {
      case "primary":
        return "text-primary-dark";
      case "accent-blue":
        return "text-accent-blue";
      case "accent-orange":
        return "text-accent-orange";
      default:
        return "text-primary-dark";
    }
  };

  return (
    <motion.div className="border p-5 rounded-2xl shadow-inner">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center justify-center text-gray-500 font-medium">
          <Icon className="mr-1" />
          <h3 className="">{title}</h3>
        </div>
        <span
          className={`status-badge ${isOptimal ? "status-success" : "status-warning"}`}
        >
          {isOptimal ? "Optimal" : "High"}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className={`text-2xl font-bold ${getColorClass()}`}>{value}</span>
        <span className="text-text-medium text-sm">{unit}</span>
      </div>

      <div className="mt-2">
        <div className="flex justify-between text-xs text-text-medium mb-1">
          <span>Current</span>
          <span>
            Target: {target}
            {unit}
          </span>
        </div>
        <div className="bg-gray-200 rounded-full h-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percentage, 100)}%` }}
            transition={{ duration: 1 }}
            className={`rounded-full h-2 ${
              color === "primary"
                ? "bg-primary-light"
                : color === "accent-blue"
                  ? "bg-accent-blue"
                  : "bg-accent-orange"
            }`}
          />
        </div>
      </div>
    </motion.div>
  );
}
