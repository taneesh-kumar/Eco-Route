"use client";

import dynamic from "next/dynamic";
import { EarthGlobeProps } from "./ReactGlobeEngine";
import { Leaf } from "lucide-react";

// Client-only dynamic wrapper ensuring WebGL and browser APIs never execute during SSR
const DynamicGlobeEngine = dynamic(
  () => import("./ReactGlobeEngine").then((mod) => mod.ReactGlobeEngine),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[480px] flex flex-col items-center justify-center text-slate-400 font-mono text-xs p-6 relative">
        <div className="flex flex-col items-center gap-3 relative z-10">
          <div className="relative flex h-8 w-8 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-40" />
            <Leaf className="w-5 h-5 text-[#22c55e] animate-pulse" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight font-sans">
            Loading Geospatial Topology...
          </span>
          <span className="text-[11px] text-slate-400">
            Initializing 3D photorealistic Earth &amp; carbon telemetry
          </span>
        </div>
      </div>
    ),
  }
);

export function EarthGlobe(props: EarthGlobeProps) {
  return <DynamicGlobeEngine {...props} />;
}
