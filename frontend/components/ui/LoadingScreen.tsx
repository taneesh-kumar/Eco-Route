"use client";

import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
  submessage?: string;
  showProgress?: boolean;
  minDurationMs?: number;
}

export function LoadingScreen({
  message = "Initializing EcoRoute Engine...",
  submessage = "Connecting to real-time grid sensors and workload dispatcher",
  showProgress = true,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    if (!showProgress) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const inc = Math.floor(Math.random() * 10) + 4;
        return Math.min(95, prev + inc);
      });
    }, 220);
    return () => clearInterval(interval);
  }, [showProgress]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[48vh] p-8 text-center select-none font-sans relative">
      {/* Warm ambient underglow */}
      <div className="absolute w-72 h-72 bg-[#F4E4C4]/60 rounded-full blur-3xl pointer-events-none" />

      {/* Circular Ring and Emblem */}
      <div className="relative w-24 h-24 flex items-center justify-center mb-5">
        {/* Outer dashed ring */}
        <div className="absolute inset-0 rounded-full border border-dashed border-[#A5BDAA] animate-[spin_12s_linear_infinite]" />

        {/* Dynamic Dual Glowing Rings */}
        <svg className="w-full h-full -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="40"
            className="stroke-[#EADBCE]"
            strokeWidth="3.5"
            fill="transparent"
          />
          <circle
            cx="48"
            cy="48"
            r="40"
            className="stroke-[#075442] transition-all duration-300"
            strokeWidth="3.5"
            strokeDasharray={251.3}
            strokeDashoffset={251.3 - (251.3 * (progress / 100))}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        {/* Inner Glass Emblem with EcoRoute Leaf Logo */}
        <div className="absolute w-14 h-14 rounded-2xl bg-[#FFF8EB] border border-[#DCCFB5] flex items-center justify-center text-[#075442] shadow-md shadow-[#075442]/10">
          <Leaf className="w-6 h-6 text-[#075442] animate-pulse" />
          {/* Orbiting Satellite Dot */}
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#C99B43] shadow-sm animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#C99B43]" />
        </div>
      </div>

      {/* Message & Status */}
      <div className="space-y-1 relative z-10 max-w-md">
        <h3 className="text-base sm:text-lg font-bold text-[#075442] tracking-tight">
          {message}
        </h3>
        <p className="text-xs text-[#63786C] font-mono leading-relaxed">{submessage}</p>
      </div>

      {/* Progress Bar & Percentage */}
      {showProgress && (
        <div className="w-60 sm:w-64 mt-5 space-y-1.5 relative z-10">
          <div className="h-1.5 w-full bg-[#EADBCE] rounded-full overflow-hidden p-[0.5px]">
            <div
              className="h-full bg-gradient-to-r from-[#075442] via-[#0B7657] to-[#C99B43] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[#63786C]">
            <span>Preparing telemetry</span>
            <span className="text-[#075442] font-bold">{progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
