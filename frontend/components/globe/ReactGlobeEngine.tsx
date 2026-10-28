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
  globeOffset?: [number, number];
  hideLegend?: boolean;
}

const DEFAULT_GLOBAL_REGIONS = [
  { id: "r1", code: "eu-central-1", name: "Frankfurt", provider: "AWS", country: "Germany", latitude: 50.1109, longitude: 8.6821, network_latency_ms: 18, is_active: true, current_utilization: 0.62 },
  { id: "r2", code: "af-south-1", name: "Cape Town", provider: "AWS", country: "South Africa", latitude: -33.9249, longitude: 18.4241, network_latency_ms: 84, is_active: true, current_utilization: 0.38 },
  { id: "r3", code: "eu-west-2", name: "London", provider: "AWS", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278, network_latency_ms: 12, is_active: true, current_utilization: 0.71 },
  { id: "r4", code: "eu-west-1", name: "Dublin", provider: "AWS", country: "Ireland", latitude: 53.3498, longitude: -6.2603, network_latency_ms: 22, is_active: true, current_utilization: 0.55 },
  { id: "r5", code: "eu-north-1", name: "Stockholm", provider: "AWS", country: "Sweden", latitude: 59.3293, longitude: 18.0686, network_latency_ms: 28, is_active: true, current_utilization: 0.32 },
  { id: "r6", code: "me-central-1", name: "Dubai", provider: "AWS", country: "UAE", latitude: 25.2048, longitude: 55.2708, network_latency_ms: 65, is_active: true, current_utilization: 0.44 },
  { id: "r7", code: "ap-south-1", name: "Mumbai", provider: "AWS", country: "India", latitude: 19.076, longitude: 72.8777, network_latency_ms: 58, is_active: true, current_utilization: 0.49 },
  { id: "r8", code: "ap-southeast-1", name: "Singapore", provider: "AWS", country: "Singapore", latitude: 1.3521, longitude: 103.8198, network_latency_ms: 72, is_active: true, current_utilization: 0.65 },
  { id: "r9", code: "ap-northeast-1", name: "Tokyo", provider: "AWS", country: "Japan", latitude: 35.6762, longitude: 139.6503, network_latency_ms: 95, is_active: true, current_utilization: 0.58 },
  { id: "r10", code: "ap-southeast-2", name: "Sydney", provider: "AWS", country: "Australia", latitude: -33.8688, longitude: 151.2093, network_latency_ms: 110, is_active: true, current_utilization: 0.42 },
  { id: "r11", code: "us-east-1", name: "N. Virginia", provider: "AWS", country: "United States", latitude: 38.13, longitude: -78.45, network_latency_ms: 45, is_active: true, current_utilization: 0.81 },
  { id: "r12", code: "us-west-1", name: "N. California", provider: "AWS", country: "United States", latitude: 37.7749, longitude: -122.4194, network_latency_ms: 78, is_active: true, current_utilization: 0.67 },
  { id: "r13", code: "sa-east-1", name: "São Paulo", provider: "AWS", country: "Brazil", latitude: -23.5505, longitude: -46.6333, network_latency_ms: 125, is_active: true, current_utilization: 0.39 },
];

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
  globeOffset: propOffset,
  hideLegend = false,
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
  const [countryPaths, setCountryPaths] = useState<Array<{ coords: [number, number][]; color: string; stroke: number }>>([]);

  // Load sovereign international country boundaries GeoJSON for crisp gold outline rendering
  useEffect(() => {
    let isMounted = true;
    fetch("/ne_110m_admin_0_countries.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load country boundaries GeoJSON");
        return res.json();
      })
      .then((geojson) => {
        if (!isMounted || !geojson?.features) return;
        const items: Array<{ coords: [number, number][]; color: string; stroke: number }> = [];

        // Major sovereign global regions receive crisp #E6C36A, secondary boundaries receive #C9A45A
        const majorSovereignCodes = new Set([
          "US", "CA", "MX", "BR", "AR", "GB", "FR", "DE", "IT", "ES", "SE", "NO", "RU", "CN", "IN", "JP", "AU", "ZA", "EG", "SA", "AE", "IE", "SG"
        ]);

        for (const feature of geojson.features) {
          const geom = feature.geometry;
          if (!geom) continue;
          const iso = feature.properties?.ISO_A2 || feature.properties?.ADM0_A3 || "";
          if (iso === "AQ") continue; // Exclude Antarctica for visual balance

          const isMajor = majorSovereignCodes.has(iso);
          // Opacity 0.92 with refined gold (#E6C36A) for major sovereign nations; #C9A45A at 0.82 for others
          const color = isMajor ? "rgba(230, 195, 106, 0.92)" : "rgba(201, 164, 90, 0.82)";
          const stroke = isMajor ? 0.65 : 0.48;

          if (geom.type === "Polygon") {
            for (const ring of geom.coordinates) {
              items.push({ coords: ring, color, stroke });
            }
          } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates) {
              for (const ring of poly) {
                items.push({ coords: ring, color, stroke });
              }
            }
          }
        }
        setCountryPaths(items);
      })
      .catch((err) => {
        console.debug("Country borders GeoJSON load fallback:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);


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

  // Compute horizontal offset
  const isDesktop = dimensions.width >= 1024;
  const globeOffset: [number, number] = useMemo(() => {
    if (propOffset !== undefined) {
      return propOffset;
    }
    if (isDesktop) {
      return [Math.round(dimensions.width * 0.22), 0];
    }
    return [0, 0];
  }, [propOffset, isDesktop, dimensions.width]);

  // Map of carbon observations indexed by region code
  const carbonMap = useMemo(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const c of carbonObservations) {
      map[c.region_code] = c;
    }
    return map;
  }, [carbonObservations]);

  // Keep the globe legible by showing a small, data-driven set of regions.
  // Priority is given to the selected/assigned route and its candidates; the
  // remaining slots use the cleanest currently observed regions.
  const visibleRegions = useMemo(() => {
    const pool = (regions.length > 0 ? regions : DEFAULT_GLOBAL_REGIONS) as unknown as RegionResponse[];
    const preferredCodes = new Set([
      selectedRegionCode,
      activeRoute?.targetCode,
      ...(activeRoute?.candidateCodes || []),
    ].filter(Boolean));

    const preferred = pool.filter((region) => preferredCodes.has(region.code));
    const remaining = pool.filter((region) => !preferredCodes.has(region.code));

    return [...preferred, ...remaining].slice(0, 16);
  }, [regions, selectedRegionCode, activeRoute]);

  // Derive restrained marker data with deterministic, slow brightness changes.
  const markersData: GlobeMarkerData[] = useMemo(() => {
    return visibleRegions.map((region, idx) => {
      const lat = Number(region.latitude);
      const lng = Number(region.longitude);
      const obs = carbonMap[region.code];
      const intensity =
        obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : null;

      const isSelected = selectedRegionCode === region.code;

      // Carbon colour system: emerald for clean, gold for elevated, sage when unknown.
      let color = "#0B6B50";
      if (intensity === null) {
        color = "#8BAE9A";
      } else if (intensity > 400) {
        color = "#D6A84F";
      } else if (intensity > 150) {
        color = "#C28B3C";
      }

      const ciDisplay =
        intensity != null ? `${intensity.toFixed(0)} gCO₂/kWh` : "Unverified Telemetry";

      // Slow, deterministic brightness parameters based on region code characters.
      const charSum = region.code.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + idx * 17;
      const phase = (charSum % 628) / 100; // 0 to 6.28 rad
      const frequency = 0.12 + (charSum % 5) * 0.025;

      // Rich glassmorphic hover card HTML
      const labelHtml = `
        <div style="
          background: #FFF7E8;
          border: 1px solid ${isSelected ? "#064E3B" : "#D8C9AA"};
          box-shadow: 0 4px 14px rgba(6, 78, 59, 0.12);
          border-radius: 6px;
          padding: 10px 14px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #123B32;
          min-width: 170px;
          pointer-events: none;
          transform: translate3d(0, -10px, 0);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 13px; letter-spacing: -0.01em; color: #064e3b;">
              ${region.name}
            </span>
            <span style="font-family: monospace; font-size: 10px; color: #42665a; background: rgba(248, 231, 201, 0.8); padding: 2px 6px; border-radius: 6px;">
              ${region.code}
            </span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <span style="color: #42665a;">Carbon intensity:</span>
            <span style="font-family: monospace; font-weight: 700; color: ${color};">
              ${ciDisplay}
            </span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #42665a; font-family: monospace; margin-top: 4px;">
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
  }, [visibleRegions, carbonMap, selectedRegionCode]);

  // Standard points data for direct layer compatibility
  const pointsData: GlobePoint[] = useMemo(() => {
    return markersData.map((m) => ({
      ...m.region,
      lat: m.lat,
      lng: m.lng,
      size: m.isSelected ? 0.22 : 0.14,
      color: m.color,
      altitude: m.altitude,
      labelHtml: m.labelHtml,
      intensity: m.intensity,
    }));
  }, [markersData]);

  // Luminous radar ripples at global regional nodes
  const ringsData: GlobeRing[] = useMemo(() => {
    const keyHubs = new Set([
      selectedRegionCode,
      activeRoute?.targetCode,
      "af-south-1",
      "eu-central-1",
      "ap-south-1",
      "ap-northeast-1",
      "us-east-1",
      "ap-southeast-1",
      "ap-southeast-2",
    ].filter(Boolean));

    return visibleRegions
      .filter((region) => keyHubs.has(region.code) || region.code === selectedRegionCode)
      .slice(0, 8)
      .map((region, idx) => {
        const lat = Number(region.latitude);
        const lng = Number(region.longitude);
        const isSelected = region.code === selectedRegionCode || region.code === activeRoute?.targetCode;

        return {
          lat,
          lng,
          maxR: isSelected ? 3.8 : 2.6,
          propagationSpeed: isSelected ? 0.8 : 0.5,
          repeatPeriod: isSelected ? 2400 : 3600 + (idx % 3) * 500,
          color: (t: number) => {
            const alpha = Math.max(0, 1 - t) * (isSelected ? 0.9 : 0.55);
            if (isSelected) return `rgba(245, 199, 93, ${alpha})`;
            return `rgba(16, 185, 129, ${alpha})`;
          },
        };
      });
  }, [visibleRegions, selectedRegionCode, activeRoute]);

  // Active Worldwide Routing & Telemetry Arcs with Continuous Photon Pulse Flow
  const arcsData: GlobeArc[] = useMemo(() => {
    if (visibleRegions.length < 2) return [];

    const arcs: GlobeArc[] = [];
    const regionMap = new Map(visibleRegions.map((r) => [r.code, r]));

    // Global transcontinental backbone connection pairs
    const globalConnections: [string, string][] = [
      ["eu-central-1", "af-south-1"],   // Frankfurt <-> Cape Town
      ["eu-west-2", "eu-central-1"],    // London <-> Frankfurt
      ["eu-west-1", "eu-west-2"],       // Dublin <-> London
      ["eu-central-1", "eu-north-1"],   // Frankfurt <-> Stockholm
      ["eu-central-1", "me-central-1"], // Frankfurt <-> Dubai
      ["me-central-1", "ap-south-1"],   // Dubai <-> Mumbai
      ["ap-south-1", "ap-southeast-1"], // Mumbai <-> Singapore
      ["ap-southeast-1", "ap-northeast-1"], // Singapore <-> Tokyo
      ["ap-northeast-1", "ap-southeast-2"], // Tokyo <-> Sydney
      ["ap-southeast-1", "ap-southeast-2"], // Singapore <-> Sydney
      ["af-south-1", "ap-south-1"],     // Cape Town <-> Mumbai
      ["eu-central-1", "us-east-1"],    // Frankfurt <-> N. Virginia
      ["eu-west-2", "us-east-1"],       // London <-> N. Virginia
      ["us-east-1", "sa-east-1"],       // N. Virginia <-> São Paulo
      ["us-east-1", "us-west-1"],       // N. Virginia <-> California
      ["us-west-1", "ap-northeast-1"],  // California <-> Tokyo
    ];

    let arcIdx = 0;
    for (const [codeA, codeB] of globalConnections) {
      const rA = regionMap.get(codeA);
      const rB = regionMap.get(codeB);
      if (rA && rB) {
        arcs.push({
          startLat: Number(rA.latitude),
          startLng: Number(rA.longitude),
          endLat: Number(rB.latitude),
          endLng: Number(rB.longitude),
          // High-contrast refined mint palette (#55F2B0 -> #A0F5D0) with radiant photon visibility
          color: arcIdx % 2 === 0
            ? ["#55F2B0", "#A0F5D0"]
            : ["#A0F5D0", "#55F2B0"],
          altitude: 0.16 + (arcIdx % 5) * 0.032,
          stroke: 0.72,
          dashLength: 0.45,
          dashGap: 0.18,
          dashAnimateTime: 2600 + (arcIdx % 4) * 450,
          isWinning: false,
        });
        arcIdx += 1;
      }
    }

    // Dynamic Route Overlay when Workload or Region is Selected
    const targetCode = activeRoute?.targetCode || selectedRegionCode;
    const targetReg = targetCode ? visibleRegions.find((r) => r.code === targetCode) : null;

    if (targetReg) {
      const targetLat = Number(targetReg.latitude);
      const targetLng = Number(targetReg.longitude);

      if (activeRoute?.origin) {
        arcs.push({
          startLat: activeRoute.origin.lat,
          startLng: activeRoute.origin.lng,
          endLat: targetLat,
          endLng: targetLng,
          // Highlighted winning route: Radiant Amber/Gold (#FFD783) -> Vivid Mint (#55F2B0)
          color: ["#FFD783", "#55F2B0"],
          altitude: 0.25,
          stroke: 1.05,
          dashLength: 0.52,
          dashGap: 0.14,
          dashAnimateTime: 1800,
          isWinning: true,
        });
      }

      const candidates = activeRoute?.candidateCodes
        ? visibleRegions.filter((r) => r.code !== targetCode && activeRoute.candidateCodes?.includes(r.code)).slice(0, 3)
        : visibleRegions.filter((r) => r.code !== targetCode).slice(0, 2);

      for (const cand of candidates) {
        arcs.push({
          startLat: Number(cand.latitude),
          startLng: Number(cand.longitude),
          endLat: targetLat,
          endLng: targetLng,
          color: ["#FFD783", "#A0F5D0"],
          altitude: 0.20,
          stroke: 0.78,
          dashLength: 0.48,
          dashGap: 0.20,
          dashAnimateTime: 2400,
          isWinning: true,
        });
      }
    }

    return arcs;
  }, [activeRoute, selectedRegionCode, visibleRegions]);

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
    const coreGeo = new THREE.SphereGeometry(isSelected ? 0.48 : 0.32, 16, 16);
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
      grad.addColorStop(0.7, "rgba(255, 247, 232, 0.18)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const spriteTex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: spriteTex,
      transparent: true,
      opacity: isSelected ? 0.85 : 0.55,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(spriteMat);
    const baseScale = isSelected ? 2.4 : 1.45;
    haloSprite.scale.set(baseScale, baseScale, 1);
    haloSprite.name = "haloSprite";
    group.add(haloSprite);

    // 3. Highlight Ring for Selected Region
    if (isSelected) {
      const ringGeo = new THREE.RingGeometry(0.8, 1.05, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(d.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.NormalBlending,
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

    // Gentle brightness variation keeps nodes legible without a neon pulse.
    const twinkle = Math.sin(time * freq + phase);
    const scaleFactor = 1 + twinkle * 0.06;

    const core = obj.getObjectByName("coreMesh") as THREE.Mesh;
    if (core) {
      core.scale.setScalar(scaleFactor);
      if (core.material instanceof THREE.MeshBasicMaterial) {
        core.material.opacity = 0.82 + twinkle * 0.08;
      }
    }

    const halo = obj.getObjectByName("haloSprite") as THREE.Sprite;
    if (halo) {
      const baseScale = (d.isSelected ? 2.4 : 1.45) * (1 + twinkle * 0.08);
      halo.scale.set(baseScale, baseScale, 1);
      if (halo.material instanceof THREE.SpriteMaterial) {
        halo.material.opacity = (d.isSelected ? 0.65 : 0.32) + twinkle * 0.08;
      }
    }

    const beacon = obj.getObjectByName("beaconRing") as THREE.Mesh;
    if (beacon) {
      const rippleT = (time * 0.32 + phase) % 1;
      const ringScale = 1 + rippleT * 0.8;
      beacon.scale.setScalar(ringScale);
      if (beacon.material instanceof THREE.MeshBasicMaterial) {
        beacon.material.opacity = Math.max(0, (1 - rippleT) * 0.55);
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
      const globeMaterial = globe.globeMaterial?.();

      if (globeMaterial) {
        globeMaterial.color?.set(0xffffff);
        globeMaterial.shininess = 16;
        if ("specular" in globeMaterial) {
          globeMaterial.specular?.set("#0B7657");
        }
      }

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
          "/textures/clouds.png",
          (texture) => {
            const cloudsGeo = new THREE.SphereGeometry(100 * 1.004, 64, 64);
            const cloudsMat = new THREE.MeshStandardMaterial({
              map: texture,
              transparent: true,
              opacity: 0.18,
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
        className={`relative rounded-3xl overflow-hidden select-none bg-[#FFF8EB] border border-[#DCCFB5] p-6 flex flex-col justify-between ${className}`}
        style={{ height }}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[#22c55e]" />
              <span className="font-bold text-sm text-[#183B32] font-sans">
                Global Carbon Grid View
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-[#F4E4C4] px-2.5 py-1 rounded-full border border-[#DCCFB5] text-[#63786C]">
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
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    isSelected
                      ? "bg-[#FFFDF8] border-[#075442] text-[#183B32] shadow-xs"
                      : "bg-[#FFF8EB] border-[#DCCFB5] hover:border-[#075442] text-[#486256]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-[#183B32] truncate">{region.name}</span>
                    <span className="text-[10px] font-mono text-[#63786C] uppercase">
                      {region.code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono mt-2">
                    <span className="text-[#63786C] text-[10px]">Intensity:</span>
                    <span className={`font-bold ${isHigh ? "text-[#8C6212]" : "text-[#075442]"}`}>
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
          globeImageUrl="/textures/earth-emerald-night.jpg"
          bumpImageUrl="/textures/earth-topology.png"
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={true}
          atmosphereColor="#10B981"
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
          // Sovereign Country Boundaries Layer: Refined Gold International Outlines (#E6C36A / #C9A45A)
          pathsData={countryPaths}
          pathPoints={(d: any) => d.coords}
          pathPointLat={(p: any) => p[1]}
          pathPointLng={(p: any) => p[0]}
          pathPointAlt={0.005}
          pathColor={(d: any) => d.color}
          pathStroke={(d: any) => d.stroke}
          pathResolution={3}
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
      {!hideLegend && (
        <div className="absolute top-4 right-4 z-30 p-3.5 rounded-2xl bg-[#FFF8EB]/95 border border-[#DCCFB5] backdrop-blur-md shadow-md min-w-[210px] pointer-events-auto">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-bold text-xs text-[#183B32] font-sans">Live Carbon Intensity</span>
          <Leaf className="w-3.5 h-3.5 text-[#22c55e]" />
        </div>
        <div className="text-[10px] text-[#63786C] font-mono mb-2">
          Global Grid &bull; {regions.length} Active Nodes
        </div>

        {/* Color Gradient Bar */}
        <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-[#075442] via-[#C99B43] to-rose-600 shadow-sm" />

        <div className="flex justify-between text-[10px] font-mono text-[#63786C] mt-1">
          <span className="text-[#22c55e]">&le;150 gCO₂</span>
          <span className="text-amber-400">150-400</span>
          <span className="text-orange-400">&gt;400 gCO₂</span>
        </div>
      </div>
      )}

      {/* Bottom Right: Combined Simulation Toggle & Quick Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2.5 z-30 pointer-events-auto">
        <button
          onClick={() => setAutoRotate((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FFF8EB] hover:bg-[#FFFDF8] text-[#183B32] text-xs font-mono font-medium border border-[#DCCFB5] shadow-sm transition cursor-pointer"
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

        <div className="flex items-center gap-1 bg-[#FFF8EB] p-1 rounded-xl border border-[#DCCFB5] shadow-sm">
          <button
            onClick={zoomIn}
            className="p-1.5 rounded-lg hover:bg-[#F4E4C4] text-[#63786C] hover:text-[#075442] transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={zoomOut}
            className="p-1.5 rounded-lg hover:bg-[#F4E4C4] text-[#63786C] hover:text-[#075442] transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={resetCamera}
            className="p-1.5 rounded-lg hover:bg-[#F4E4C4] text-[#63786C] hover:text-[#075442] transition cursor-pointer"
            title="Reset Camera Orientation"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
