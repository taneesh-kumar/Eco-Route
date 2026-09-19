"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { RegionResponse, CarbonObservationResponse } from "@/lib/types";
import {
  Compass,
  ZoomIn,
  ZoomOut,
  Leaf,
  Pause,
  Play,
} from "lucide-react";

// Client-only dynamic import for react-globe.gl
const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[480px] flex items-center justify-center text-slate-400 font-mono text-xs">
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] animate-ping" />
        <span>Initializing 3D Geospatial Engine...</span>
      </div>
    </div>
  ),
});

export interface EarthGlobeProps {
  regions?: RegionResponse[];
  carbonObservations?: CarbonObservationResponse[];
  selectedRegionCode?: string | null;
  activeRoute?: {
    origin?: { lat: number; lng: number; label: string };
    targetCode?: string | null;
    candidateCodes?: string[];
  } | null;
  onSelectRegion?: (regionCode: string) => void;
  className?: string;
  height?: string | number;
}

interface GlobePoint extends RegionResponse {
  lat: number;
  lng: number;
  size: number;
  color: string;
  altitude: number;
  labelHtml: string;
  intensity: number | null;
}

interface GlobeMarkerData {
  region: RegionResponse;
  code: string;
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  color: string;
  intensity: number | null;
  isSelected: boolean;
  phase: number;
  frequency: number;
  labelHtml: string;
}

interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  altitude: number;
  stroke: number;
  dashLength: number;
  dashGap: number;
  dashAnimateTime: number;
  isWinning: boolean;
}

interface GlobeRing {
  lat: number;
  lng: number;
  maxR: number;
  propagationSpeed: number;
  repeatPeriod: number;
  color: string | ((t: number) => string);
}

export function ReactGlobeEngine({
  regions = [],
  carbonObservations = [],
  selectedRegionCode = null,
  activeRoute = null,
  onSelectRegion,
  className = "",
  height = "640px",
}: EarthGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 900,
    height: 640,
  });
  const [autoRotate, setAutoRotate] = useState(true);
  const [webGlSupported, setWebGlSupported] = useState(true);
  const [, setHoveredRegion] = useState<GlobePoint | null>(null);

  // Measure container dimensions for responsive canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || 900;
        const h = containerRef.current.clientHeight || 640;
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute horizontal offset so the globe sits in the right column on desktop
  const isDesktop = dimensions.width >= 1024;
  const globeOffset: [number, number] = useMemo(() => {
    if (isDesktop) {
      return [Math.round(dimensions.width * 0.22), 0];
    }
    return [0, 0];
  }, [isDesktop, dimensions.width]);

  // Map of carbon observations indexed by region code
  const carbonMap = useMemo(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const c of carbonObservations) {
      map[c.region_code] = c;
    }
    return map;
  }, [carbonObservations]);

  // Derive rich dynamic marker data with deterministic asynchronous twinkle phase offsets
  const markersData: GlobeMarkerData[] = useMemo(() => {
    return regions.map((region, idx) => {
      const lat = Number(region.latitude);
      const lng = Number(region.longitude);
      const obs = carbonMap[region.code];
      const intensity =
        obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : null;

      const isSelected = selectedRegionCode === region.code;

      // Carbon color system: <=150 emerald, 150-400 amber, >400 orange, null slate/gray
      let color = "#22c55e";
      if (intensity === null) {
        color = "#94a3b8"; // Slate / unverified
      } else if (intensity > 400) {
        color = "#f97316"; // Orange / High
      } else if (intensity > 150) {
        color = "#eab308"; // Amber / Moderate
      }

      const ciDisplay =
        intensity != null ? `${intensity.toFixed(0)} gCO₂/kWh` : "Unverified Telemetry";

      // Asynchronous twinkle parameters based on region code characters
      const charSum = region.code.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + idx * 17;
      const phase = (charSum % 628) / 100; // 0 to 6.28 rad
      const frequency = 1.3 + (charSum % 10) * 0.15; // 1.3 to 2.8 rad/s

      // Rich glassmorphic hover card HTML
      const labelHtml = `
        <div style="
          background: rgba(9, 17, 34, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid ${isSelected ? "rgba(34, 197, 94, 0.8)" : "rgba(255, 255, 255, 0.12)"};
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6)${isSelected ? ", 0 0 20px rgba(34, 197, 94, 0.35)" : ""};
          border-radius: 14px;
          padding: 10px 14px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
          min-width: 170px;
          pointer-events: none;
          transform: translate3d(0, -10px, 0);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 13px; letter-spacing: -0.01em; color: #ffffff;">
              ${region.name}
            </span>
            <span style="font-family: monospace; font-size: 10px; color: #94a3b8; background: rgba(255, 255, 255, 0.06); padding: 2px 6px; border-radius: 6px;">
              ${region.code}
            </span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <span style="color: #94a3b8;">Carbon Intensity:</span>
            <span style="font-family: monospace; font-weight: 700; color: ${color};">
              ${ciDisplay}
            </span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748b; font-family: monospace; margin-top: 4px;">
            <span>${region.provider} &bull; ${region.country}</span>
            <span>${Number(region.network_latency_ms).toFixed(0)}ms latency</span>
          </div>
        </div>
      `;

      return {
        region,
        code: region.code,
        name: region.name,
        lat,
        lng,
        altitude: isSelected ? 0.022 : 0.014,
        color,
        intensity,
        isSelected,
        phase,
        frequency,
        labelHtml,
      };
    });
  }, [regions, carbonMap, selectedRegionCode]);

  // Standard points data for direct layer compatibility
  const pointsData: GlobePoint[] = useMemo(() => {
    return markersData.map((m) => ({
      ...m.region,
      lat: m.lat,
      lng: m.lng,
      size: m.isSelected ? 0.38 : 0.24,
      color: m.color,
      altitude: m.altitude,
      labelHtml: m.labelHtml,
      intensity: m.intensity,
    }));
  }, [markersData]);

  // Subtle Asynchronous Concentric Radar Rings & Ripple Halos for all database regions
  const ringsData: GlobeRing[] = useMemo(() => {
    return regions.map((region, idx) => {
      const lat = Number(region.latitude);
      const lng = Number(region.longitude);
      const obs = carbonMap[region.code];
      const ci = obs?.carbon_intensity_gco2;
      const isSelected = region.code === selectedRegionCode || region.code === activeRoute?.targetCode;

      const ringColor =
        ci === null || ci === undefined
          ? "#94a3b8"
          : ci > 400
            ? "#f97316"
            : ci > 150
              ? "#eab308"
              : "#22c55e";

      const charSum = region.code.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + idx * 23;
      const speed = isSelected ? 2.4 : 0.9 + (charSum % 4) * 0.25;
      const period = isSelected ? 1300 : 2100 + (charSum % 5) * 400;
      const maxRadius = isSelected ? 5.2 : 2.8;

      return {
        lat,
        lng,
        maxR: maxRadius,
        propagationSpeed: speed,
        repeatPeriod: period,
        color: (t: number) => {
          const alpha = Math.max(0, 1 - t) * (isSelected ? 0.85 : 0.45);
          if (ringColor === "#22c55e") return `rgba(34, 197, 94, ${alpha})`;
          if (ringColor === "#f97316") return `rgba(249, 115, 22, ${alpha})`;
          if (ringColor === "#eab308") return `rgba(234, 179, 8, ${alpha})`;
          return `rgba(148, 163, 184, ${alpha * 0.75})`;
        },
      };
    });
  }, [regions, carbonMap, selectedRegionCode, activeRoute]);

  // Routing Arcs with Photon Flow Animation
  const arcsData: GlobeArc[] = useMemo(() => {
    if (regions.length < 2) return [];

    const targetCode = activeRoute?.targetCode || selectedRegionCode;
    const targetReg = targetCode ? regions.find((r) => r.code === targetCode) : null;

    const arcs: GlobeArc[] = [];

    if (targetReg) {
      const targetLat = Number(targetReg.latitude);
      const targetLng = Number(targetReg.longitude);

      // Ingress / Origin arc to target
      if (activeRoute?.origin) {
        arcs.push({
          startLat: activeRoute.origin.lat,
          startLng: activeRoute.origin.lng,
          endLat: targetLat,
          endLng: targetLng,
          color: ["rgba(34, 197, 94, 0.95)", "rgba(14, 165, 233, 0.95)"],
          altitude: 0.28,
          stroke: 0.75,
          dashLength: 0.35,
          dashGap: 0.15,
          dashAnimateTime: 1800,
          isWinning: true,
        });
      }

      // Candidate evaluated regions converging to target
      const candidatePool = activeRoute?.candidateCodes
        ? regions
          .filter((r) => r.code !== targetCode && activeRoute.candidateCodes?.includes(r.code))
          .slice(0, 5)
        : regions.filter((r) => r.code !== targetCode).slice(0, 4);

      for (const cand of candidatePool) {
        arcs.push({
          startLat: Number(cand.latitude),
          startLng: Number(cand.longitude),
          endLat: targetLat,
          endLng: targetLng,
          color: ["rgba(14, 165, 233, 0.7)", "rgba(34, 197, 94, 0.9)"],
          altitude: 0.22,
          stroke: 0.55,
          dashLength: 0.4,
          dashGap: 0.2,
          dashAnimateTime: 2200,
          isWinning: true,
        });
      }
    } else {
      // Ambient default network backbone connecting major global hubs
      const backbonePairs: [string, string][] = [
        ["us-east-1", "eu-west-2"],
        ["eu-central-1", "ap-south-1"],
        ["ap-south-1", "ap-southeast-1"],
        ["ap-southeast-1", "ap-northeast-1"],
        ["us-west-2", "ap-northeast-1"],
      ];

      for (const [codeA, codeB] of backbonePairs) {
        const rA = regions.find((r) => r.code === codeA);
        const rB = regions.find((r) => r.code === codeB);
        if (rA && rB) {
          arcs.push({
            startLat: Number(rA.latitude),
            startLng: Number(rB.longitude ? rA.longitude : 0),
            endLat: Number(rB.latitude),
            endLng: Number(rB.longitude),
            color: ["rgba(14, 165, 233, 0.35)", "rgba(6, 182, 212, 0.2)"],
            altitude: 0.18,
            stroke: 0.4,
            dashLength: 0.5,
            dashGap: 0.3,
            dashAnimateTime: 3500,
            isWinning: false,
          });
        }
      }
    }

    return arcs;
  }, [activeRoute, selectedRegionCode, regions]);

  // Smooth Camera Point of View when region is selected
  const focusOnRegion = useCallback((code: string) => {
    const target = regions.find((r) => r.code === code);
    if (!target || !globeRef.current) return;

    const lat = Number(target.latitude);
    const lng = Number(target.longitude);

    globeRef.current.pointOfView(
      {
        lat,
        lng,
        altitude: 1.85,
      },
      1000
    );
  }, [regions]);

  useEffect(() => {
    if (selectedRegionCode) {
      focusOnRegion(selectedRegionCode);
    }
  }, [selectedRegionCode, focusOnRegion]);

  // Three.js Custom 3D Object Generator for Twinkling Luminous Region Markers
  const createMarkerObject = useCallback((d: GlobeMarkerData) => {
    const isSelected = d.isSelected;
    const group = new THREE.Group();

    // 1. Solid Luminous Core (Unlit MeshBasicMaterial ensures high visibility on dark/night side)
    const coreGeo = new THREE.SphereGeometry(isSelected ? 0.75 : 0.55, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(d.color),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.name = "coreMesh";
    group.add(coreMesh);

    // 2. Luminous Halo Disc Sprite
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, d.color);
      grad.addColorStop(0.35, d.color);
      grad.addColorStop(0.7, "rgba(255, 255, 255, 0.25)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const spriteTex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: spriteTex,
      transparent: true,
      opacity: isSelected ? 0.85 : 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(spriteMat);
    const baseScale = isSelected ? 3.6 : 2.2;
    haloSprite.scale.set(baseScale, baseScale, 1);
    haloSprite.name = "haloSprite";
    group.add(haloSprite);

    // 3. Highlight Ring for Selected Region
    if (isSelected) {
      const ringGeo = new THREE.RingGeometry(1.2, 1.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(d.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.name = "beaconRing";
      group.add(ringMesh);
    }

    group.userData = {
      phase: d.phase,
      frequency: d.frequency,
      color: d.color,
      isSelected: d.isSelected,
    };

    return group;
  }, []);

  // Per-frame asynchronous twinkle updater for region markers
  const updateMarkerObject = useCallback((obj: THREE.Object3D, d: GlobeMarkerData) => {
    const time = performance.now() * 0.001;
    const phase = d.phase || 0;
    const freq = d.frequency || 1.8;

    // Asynchronous smooth sinusoidal twinkle
    const twinkle = Math.sin(time * freq + phase);
    const scaleFactor = 1 + twinkle * 0.18; // smooth 0.82 - 1.18 pulse

    const core = obj.getObjectByName("coreMesh") as THREE.Mesh;
    if (core) {
      core.scale.setScalar(scaleFactor);
      if (core.material instanceof THREE.MeshBasicMaterial) {
        core.material.opacity = 0.8 + twinkle * 0.18;
      }
    }

    const halo = obj.getObjectByName("haloSprite") as THREE.Sprite;
    if (halo) {
      const baseScale = (d.isSelected ? 3.6 : 2.2) * (1 + twinkle * 0.22);
      halo.scale.set(baseScale, baseScale, 1);
      if (halo.material instanceof THREE.SpriteMaterial) {
        halo.material.opacity = (d.isSelected ? 0.75 : 0.45) + twinkle * 0.2;
      }
    }

    const beacon = obj.getObjectByName("beaconRing") as THREE.Mesh;
    if (beacon) {
      const rippleT = (time * 1.6 + phase) % 1;
      const ringScale = 1 + rippleT * 1.6;
      beacon.scale.setScalar(ringScale);
      if (beacon.material instanceof THREE.MeshBasicMaterial) {
        beacon.material.opacity = Math.max(0, (1 - rippleT) * 0.8);
      }
    }
  }, []);

  // Configure Globe Scene, Atmosphere, Lighting, Controls & Translucent Cloud Layer
  useEffect(() => {
    if (!globeRef.current) return;

    try {
      const globe = globeRef.current;
      const scene = globe.scene();
      const controls = globe.controls();

      if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.55;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 140;
        controls.maxDistance = 500;
      }

      // Add high-resolution procedural clouds layer if not already added
      if (scene && !cloudsMeshRef.current) {
        const cloudTextureLoader = new THREE.TextureLoader();
        cloudTextureLoader.load(
          "//unpkg.com/three-globe/example/img/earth-clouds.png",
          (texture) => {
            const cloudsGeo = new THREE.SphereGeometry(100 * 1.006, 64, 64);
            const cloudsMat = new THREE.MeshStandardMaterial({
              map: texture,
              transparent: true,
              opacity: 0.35,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
            scene.add(cloudsMesh);
            cloudsMeshRef.current = cloudsMesh;
          },
          undefined,
          (err) => {
            console.debug("Cloud texture load fallback:", err);
          }
        );
      }

      // Cloud rotation animation loop
      let lastTime = performance.now();
      const rotateClouds = (time: number) => {
        animFrameIdRef.current = requestAnimationFrame(rotateClouds);
        const delta = (time - lastTime) / 1000;
        lastTime = time;

        if (cloudsMeshRef.current) {
          cloudsMeshRef.current.rotation.y += delta * 0.012;
        }
      };
      animFrameIdRef.current = requestAnimationFrame(rotateClouds);

      return () => {
        if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      };
    } catch (err) {
      console.warn("WebGL configuration error:", err);
      setWebGlSupported(false);
    }
  }, [autoRotate]);

  // Controls UI callbacks
  const zoomIn = () => {
    if (!globeRef.current) return;
    const currentPov = globeRef.current.pointOfView();
    globeRef.current.pointOfView(
      { ...currentPov, altitude: Math.max(1.2, (currentPov.altitude || 2.0) - 0.4) },
      400
    );
  };

  const zoomOut = () => {
    if (!globeRef.current) return;
    const currentPov = globeRef.current.pointOfView();
    globeRef.current.pointOfView(
      { ...currentPov, altitude: Math.min(4.5, (currentPov.altitude || 2.0) + 0.4) },
      400
    );
  };

  const resetCamera = () => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
  };

  // 2D WebGL Fallback View
  if (!webGlSupported) {
    return (
      <div
        className={`relative rounded-3xl overflow-hidden select-none bg-gradient-to-b from-[#091122] to-[#040813] border border-white/[0.08] p-6 flex flex-col justify-between ${className}`}
        style={{ height }}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[#22c55e]" />
              <span className="font-bold text-sm text-white font-sans">
                Global Carbon Grid View
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-white/[0.05] px-2.5 py-1 rounded-full border border-white/[0.05]">
              2D High-Performance Fallback
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-1">
            {regions.map((region) => {
              const obs = carbonMap[region.code];
              const intensity =
                obs && obs.carbon_intensity_gco2 != null
                  ? Number(obs.carbon_intensity_gco2)
                  : null;
              const isSelected = selectedRegionCode === region.code;
              const isHigh = intensity != null && intensity > 150;

              return (
                <button
                  key={region.code}
                  onClick={() => onSelectRegion?.(region.code)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer backdrop-blur-md ${isSelected
                      ? "bg-[#0c1833] border-[#22c55e] text-white shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                      : "bg-[#091122]/70 border-white/[0.08] hover:border-slate-500 text-slate-200"
                    }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-white truncate">{region.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {region.code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono mt-2">
                    <span className="text-slate-400 text-[10px]">Intensity:</span>
                    <span className={`font-bold ${isHigh ? "text-amber-400" : "text-[#22c55e]"}`}>
                      {intensity != null ? `${intensity.toFixed(0)} gCO₂` : "Verified"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] text-[11px] text-slate-400 font-mono">
          <span>Tip: Enable browser hardware acceleration to view interactive 3D Globe</span>
          <span className="text-[#22c55e]">{regions.length} Regions Active</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      style={{ height, width: "100%" }}
    >
      {/* 3D WebGL Globe Canvas floating seamlessly without bounding box */}
      <div className="w-full h-full cursor-grab active:cursor-grabbing">
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeOffset={globeOffset}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          showAtmosphere={true}
          atmosphereColor="#0ea5e9"
          atmosphereAltitude={0.16}
          // Points Layer (Active Cloud Regions with Rich Hover Tooltips)
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="size"
          pointAltitude="altitude"
          pointResolution={28}
          pointLabel="labelHtml"
          onPointClick={(point: any) => {
            if (point?.code && onSelectRegion) {
              onSelectRegion(point.code);
              focusOnRegion(point.code);
            }
          }}
          onPointHover={(point: any) => {
            setHoveredRegion(point || null);
          }}
          // Custom Layer: Asynchronous Twinkling Luminous Region Markers
          customLayerData={markersData}
          customThreeObject={createMarkerObject as any}
          customThreeObjectUpdate={updateMarkerObject as any}
          customLayerLabel="labelHtml"
          onCustomLayerClick={(d: any) => {
            if (d?.code && onSelectRegion) {
              onSelectRegion(d.code);
              focusOnRegion(d.code);
            }
          }}
          // Dynamic Concentric Radar Rings & Ripple Halos for all regions
          ringsData={ringsData}
          ringLat="lat"
          ringLng="lng"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
          ringColor="color"
          ringAltitude={0.02}
          ringResolution={36}
          // Routing Arcs Layer
          arcsData={arcsData}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcAltitude="altitude"
          arcStroke="stroke"
          arcDashLength="dashLength"
          arcDashGap="dashGap"
          arcDashAnimateTime="dashAnimateTime"
        />
      </div>

      {/* Top Right: Live Carbon Intensity Global View Legend */}
      <div className="absolute top-4 right-4 z-30 p-3.5 rounded-2xl bg-[#091122]/85 border border-white/[0.08] backdrop-blur-md shadow-2xl min-w-[210px] pointer-events-auto">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-bold text-xs text-white font-sans">Live Carbon Intensity</span>
          <Leaf className="w-3.5 h-3.5 text-[#22c55e]" />
        </div>
        <div className="text-[10px] text-slate-400 font-mono mb-2">
          Global Grid &bull; {regions.length} Active Nodes
        </div>

        {/* Color Gradient Bar */}
        <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-[#22c55e] via-amber-400 to-orange-500 shadow-sm" />

        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
          <span className="text-[#22c55e]">&le;150 gCO₂</span>
          <span className="text-amber-400">150-400</span>
          <span className="text-orange-400">&gt;400 gCO₂</span>
        </div>
      </div>

      {/* Bottom Right: Combined Simulation Toggle & Quick Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2.5 z-30 pointer-events-auto">
        <button
          onClick={() => setAutoRotate((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#091122]/90 hover:bg-[#0f1d38] text-slate-200 text-xs font-mono font-medium border border-white/[0.08] backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          {autoRotate ? (
            <>
              <Pause className="w-3 h-3 text-[#22c55e] fill-current" />
              <span>Simulation active</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 text-[#22c55e] fill-current" />
              <span>Simulation paused</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1 bg-[#091122]/90 p-1 rounded-xl border border-white/[0.08] backdrop-blur-md shadow-lg">
          <button
            onClick={zoomIn}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={zoomOut}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={resetCamera}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Reset Camera Orientation"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
