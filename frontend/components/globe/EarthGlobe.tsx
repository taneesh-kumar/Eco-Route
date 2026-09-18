"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RegionResponse, CarbonObservationResponse } from "@/lib/types";
import { latLngToVector3, createGreatCircleArc } from "./geo-utils";
import { createPhotorealisticEarthTextures } from "./earth-texture";
import {
  RotateCw,
  Compass,
  ZoomIn,
  ZoomOut,
  Leaf,
  Pause,
  Play,
} from "lucide-react";

interface EarthGlobeProps {
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

interface ProjectedRegionTag {
  region: RegionResponse;
  obs?: CarbonObservationResponse;
  screenX: number;
  screenY: number;
  visible: boolean;
  intensity: number | null;
}

export function EarthGlobe({
  regions = [],
  carbonObservations = [],
  selectedRegionCode = null,
  activeRoute = null,
  onSelectRegion,
  className = "",
  height = "640px",
}: EarthGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [projectedTags, setProjectedTags] = useState<ProjectedRegionTag[]>([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // References for Three.js scene instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const arcsGroupRef = useRef<THREE.Group | null>(null);
  const particlesGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Target camera positions for smooth easing & physics inertia
  const targetRotationRef = useRef<{ x: number; y: number }>({ x: 0.25, y: -0.75 });
  const currentRotationRef = useRef<{ x: number; y: number }>({ x: 0.25, y: -0.75 });
  const targetDistanceRef = useRef(3.0);
  const currentDistanceRef = useRef(3.0);
  const isInteractingRef = useRef(false);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map of carbon observations by region code
  const carbonMap = useRef<Record<string, CarbonObservationResponse>>({});
  useEffect(() => {
    const map: Record<string, CarbonObservationResponse> = {};
    for (const c of carbonObservations) {
      map[c.region_code] = c;
    }
    carbonMap.current = map;
  }, [carbonObservations]);

  // Focus on selected region
  const focusOnRegion = useCallback((code: string) => {
    const r = regions.find((item) => item.code === code);
    if (!r) return;
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);

    const phi = (lat * Math.PI) / 180;
    const theta = ((lng + 90) * Math.PI) / 180;

    targetRotationRef.current = {
      x: -phi * 0.7,
      y: -theta,
    };
    targetDistanceRef.current = 2.6;
  }, [regions]);

  useEffect(() => {
    if (selectedRegionCode) {
      focusOnRegion(selectedRegionCode);
    }
  }, [selectedRegionCode, focusOnRegion]);

  // Initialize Three.js WebGL Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 900;
    const heightPx = container.clientHeight || 640;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 3.0);
    cameraRef.current = camera;

    // 2. Renderer with Filmic Tone Mapping
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. Globe Main Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    const arcsGroup = new THREE.Group();
    globeGroup.add(arcsGroup);
    arcsGroupRef.current = arcsGroup;

    const particlesGroup = new THREE.Group();
    globeGroup.add(particlesGroup);
    particlesGroupRef.current = particlesGroup;

    // 4. Photorealistic Earth Geometry & Multi-Texture Day/Night Shader
    const radius = 1.0;
    const sphereGeo = new THREE.SphereGeometry(radius, 96, 96);
    const { dayMap, nightMap, specularMap, cloudsMap, bumpMap } = createPhotorealisticEarthTextures();

    // Custom Photorealistic Day/Night & Sunset Terminator Shader
    const sunDirection = new THREE.Vector3(5, 2.5, 4.5).normalize();
    const earthCustomMat = new THREE.ShaderMaterial({
      uniforms: {
        uDayTexture: { value: dayMap },
        uNightTexture: { value: nightMap },
        uSpecTexture: { value: specularMap },
        uBumpTexture: { value: bumpMap },
        uSunDirection: { value: sunDirection },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDayTexture;
        uniform sampler2D uNightTexture;
        uniform sampler2D uSpecTexture;
        uniform sampler2D uBumpTexture;
        uniform vec3 uSunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec4 dayColor = texture2D(uDayTexture, vUv);
          vec4 nightColor = texture2D(uNightTexture, vUv);
          float specIntensity = texture2D(uSpecTexture, vUv).r;
          float bumpVal = texture2D(uBumpTexture, vUv).r;

          // Dot product between world surface normal and directional sunlight
          float sunDot = dot(vWorldNormal, uSunDirection);

          // Smooth Day to Night transition factor
          float dayFactor = smoothstep(-0.15, 0.2, sunDot);

          // Golden/Amber Sunset Terminator Glow
          float terminator = smoothstep(-0.1, 0.05, sunDot) * (1.0 - smoothstep(0.05, 0.2, sunDot));
          vec3 sunsetGlow = vec3(0.95, 0.45, 0.15) * terminator * 0.85;

          // Ocean Specular Reflection on day side
          vec3 viewDir = normalize(vec3(0.0, 0.0, 3.0) - vWorldPosition);
          vec3 halfVector = normalize(uSunDirection + viewDir);
          float specAngle = max(0.0, dot(vWorldNormal, halfVector));
          float specular = pow(specAngle, 32.0) * specIntensity * 0.75 * max(0.0, sunDot);

          // Rayleigh Atmospheric Scattering Limb Haze
          float rim = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
          vec3 atmosphereHaze = vec3(0.06, 0.55, 0.95) * pow(rim, 3.2) * (0.4 + 0.6 * dayFactor);

          // Final Composite
          vec3 dayFinal = dayColor.rgb + vec3(specular) + sunsetGlow;
          vec3 nightFinal = nightColor.rgb * 1.8;
          vec3 blended = mix(nightFinal, dayFinal, dayFactor) + atmosphereHaze;

          gl_FragColor = vec4(blended, 1.0);
        }
      `,
    });

    const earthMesh = new THREE.Mesh(sphereGeo, earthCustomMat);
    globeGroup.add(earthMesh);

    // 5. Cloud Layer Mesh (Translucent Atmospheric Swirl)
    const cloudsGeo = new THREE.SphereGeometry(radius * 1.008, 64, 64);
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: cloudsMap,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    globeGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // 6. Atmospheric Rayleigh Scattering Halo
    const atmosGeo = new THREE.SphereGeometry(radius * 1.15, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
          vec3 atmosphereColor = vec3(0.08, 0.68, 0.98);
          gl_FragColor = vec4(atmosphereColor, intensity * 0.9);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // 7. Background Space Starfield
    const starGeo = new THREE.BufferGeometry();
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 50;
      starPositions[i + 1] = (Math.random() - 0.5) * 50;
      starPositions[i + 2] = -12 + (Math.random() - 0.5) * 20;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.07,
      color: 0xd1d5db,
      transparent: true,
      opacity: 0.7,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 8. Cinematic Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
    sunLight.position.copy(sunDirection.clone().multiplyScalar(10));
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x0ea5e9, 1.4);
    rimLight.position.set(-6, -2, -3);
    scene.add(rimLight);

    // 9. Animation & Render Loop
    let lastTime = performance.now();
    const animate = (time: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Slow cinematic auto-rotation
      if (autoRotate && !isInteractingRef.current) {
        targetRotationRef.current.y += delta * 0.05;
      }

      // Smooth Easing Interpolation
      currentRotationRef.current.x +=
        (targetRotationRef.current.x - currentRotationRef.current.x) * 0.08;
      currentRotationRef.current.y +=
        (targetRotationRef.current.y - currentRotationRef.current.y) * 0.08;
      currentDistanceRef.current +=
        (targetDistanceRef.current - currentDistanceRef.current) * 0.08;

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += delta * 0.014;
      }

      if (cameraRef.current) {
        cameraRef.current.position.z = currentDistanceRef.current;
      }

      // Animate Markers Radar Pulse
      if (markersGroupRef.current) {
        markersGroupRef.current.children.forEach((child) => {
          if (child.userData?.pulseMesh) {
            const pulse = child.userData.pulseMesh as THREE.Mesh;
            const s = (Math.sin(time * 0.003 + (child.userData.phase || 0)) + 1) * 0.5;
            pulse.scale.set(1 + s * 1.8, 1 + s * 1.8, 1);
            (pulse.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - s * 0.75);
          }
        });
      }

      // Animate Arcs photon flow
      if (particlesGroupRef.current) {
        particlesGroupRef.current.children.forEach((child) => {
          if (child.userData?.curve && child.userData?.progress !== undefined) {
            child.userData.progress = (child.userData.progress + delta * 0.35) % 1.0;
            const pt = (child.userData.curve as THREE.QuadraticBezierCurve3).getPoint(
              child.userData.progress
            );
            child.position.copy(pt);
          }
        });
      }

      // 10. Update 2D Screen Positions for Floating Region Tags
      if (mountRef.current && cameraRef.current && globeGroupRef.current && regions.length > 0) {
        const rect = mountRef.current.getBoundingClientRect();
        const tags: ProjectedRegionTag[] = [];

        regions.forEach((reg) => {
          const lat = Number(reg.latitude);
          const lng = Number(reg.longitude);
          const localPos = latLngToVector3(lat, lng, 1.0);
          
          // Transform local point to world coordinates
          const worldPos = localPos.clone().applyMatrix4(globeGroupRef.current!.matrixWorld);
          
          // Check if region is on camera-facing hemisphere
          const dot = worldPos.clone().normalize().dot(cameraRef.current!.position.clone().normalize());
          const isFacingCamera = dot > 0.08;

          // Project to 2D NDC coordinates (-1 to 1)
          const ndc = worldPos.clone().project(cameraRef.current!);
          const screenX = ((ndc.x + 1) / 2) * rect.width;
          const screenY = ((-ndc.y + 1) / 2) * rect.height;

          const obs = carbonMap.current[reg.code];
          const intensity = obs?.carbon_intensity_gco2 != null ? Number(obs.carbon_intensity_gco2) : null;

          tags.push({
            region: reg,
            obs,
            screenX,
            screenY,
            visible: isFacingCamera,
            intensity,
          });
        });

        setProjectedTags(tags);
      }

      renderer.render(scene, camera);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
    };
  }, [regions]);

  // Update Region Markers on Globe
  useEffect(() => {
    if (!markersGroupRef.current) return;
    const group = markersGroupRef.current;
    group.clear();

    const radius = 1.0;

    regions.forEach((region, idx) => {
      const lat = Number(region.latitude);
      const lng = Number(region.longitude);
      const pos = latLngToVector3(lat, lng, radius);
      const normal = pos.clone().normalize();

      const isSelected = selectedRegionCode === region.code;
      const obs = carbonMap.current[region.code];
      const ci = obs?.carbon_intensity_gco2;

      let colorHex = "#22c55e"; // Clean emerald green
      if (ci === null || ci === undefined) {
        colorHex = "#94a3b8";
      } else if (ci > 400) {
        colorHex = "#f97316"; // Orange / High Carbon
      } else if (ci > 150) {
        colorHex = "#eab308"; // Yellow / Moderate
      }

      const markerColor = new THREE.Color(colorHex);

      const regionAnchor = new THREE.Group();
      regionAnchor.position.copy(pos);
      regionAnchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      regionAnchor.userData = {
        region,
        phase: idx * 0.8,
      };

      // 1. Center Core Sphere (Glowing Node Beacon)
      const coreGeo = new THREE.SphereGeometry(isSelected ? 0.024 : 0.016, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: markerColor });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      regionAnchor.add(coreMesh);

      // 2. Concentric Radar Pulse Ring
      const ringGeo = new THREE.RingGeometry(0.022, 0.036, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: markerColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      regionAnchor.add(ringMesh);
      regionAnchor.userData.pulseMesh = ringMesh;

      group.add(regionAnchor);
    });
  }, [regions, selectedRegionCode]);

  // Update Great Circle Routing Arcs
  useEffect(() => {
    if (!arcsGroupRef.current || !particlesGroupRef.current) return;
    const arcsGroup = arcsGroupRef.current;
    const particlesGroup = particlesGroupRef.current;
    arcsGroup.clear();
    particlesGroup.clear();

    if (regions.length >= 2) {
      const connections: [string, string][] = [
        ["US-East", "EU-West"],
        ["EU-West", "IN-WE"],
        ["IN-WE", "East-Asia"],
        ["US-West", "East-Asia"],
        ["US-West", "SA-East"],
        ["IN-WE", "AU-SE"],
        ["East-Asia", "AU-SE"],
      ];

      connections.forEach(([codeA, codeB]) => {
        const regA = regions.find((r) => r.code === codeA);
        const regB = regions.find((r) => r.code === codeB);
        if (!regA || !regB) return;

        const isWinningRoute =
          activeRoute?.targetCode === codeA || activeRoute?.targetCode === codeB;

        const { points, controlPoint } = createGreatCircleArc(
          Number(regA.latitude),
          Number(regA.longitude),
          Number(regB.latitude),
          Number(regB.longitude),
          1.0,
          0.2,
          48
        );

        const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
        const curveMat = new THREE.LineBasicMaterial({
          color: isWinningRoute ? 0x22c55e : 0x0ea5e9,
          transparent: true,
          opacity: isWinningRoute ? 0.85 : 0.25,
        });
        const arcLine = new THREE.Line(curveGeo, curveMat);
        arcsGroup.add(arcLine);

        if (isWinningRoute) {
          const v1 = latLngToVector3(Number(regA.latitude), Number(regA.longitude), 1.0);
          const v2 = latLngToVector3(Number(regB.latitude), Number(regB.longitude), 1.0);
          const curve = new THREE.QuadraticBezierCurve3(v1, controlPoint, v2);

          const photonGeo = new THREE.SphereGeometry(0.015, 12, 12);
          const photonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const photonMesh = new THREE.Mesh(photonGeo, photonMat);
          photonMesh.userData = { curve, progress: 0 };
          particlesGroup.add(photonMesh);
        }
      });
    }
  }, [activeRoute, regions]);

  // Pointer & Drag Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    isInteractingRef.current = true;
    setIsDragging(true);
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - pointerDownPosRef.current.x;
      const deltaY = e.clientY - pointerDownPosRef.current.y;
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

      targetRotationRef.current.y += deltaX * 0.005;
      targetRotationRef.current.x = Math.max(
        -Math.PI * 0.4,
        Math.min(Math.PI * 0.4, targetRotationRef.current.x + deltaY * 0.005)
      );
    }
  };

  const handlePointerUp = () => {
    isInteractingRef.current = false;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.002;
    targetDistanceRef.current = Math.max(2.0, Math.min(4.8, targetDistanceRef.current + zoomDelta));
  };

  const resetCamera = () => {
    targetRotationRef.current = { x: 0.25, y: -0.75 };
    targetDistanceRef.current = 3.0;
  };

  const zoomIn = () => {
    targetDistanceRef.current = Math.max(2.0, targetDistanceRef.current - 0.4);
  };

  const zoomOut = () => {
    targetDistanceRef.current = Math.min(4.8, targetDistanceRef.current + 0.4);
  };

  return (
    <div
      className={`relative rounded-3xl overflow-hidden select-none ${className}`}
      style={{ height }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Floating 3D Screen-Projected Region Tag Cards */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {projectedTags.map((tag) => {
          if (!tag.visible) return null;
          const isSelected = selectedRegionCode === tag.region.code;
          const ciText =
            tag.intensity != null ? `${tag.intensity.toFixed(0)} gCO₂/kWh` : "Verified Live";

          const isHighCarbon = tag.intensity != null && tag.intensity > 150;

          return (
            <div
              key={tag.region.code}
              style={{
                transform: `translate3d(${tag.screenX}px, ${tag.screenY}px, 0)`,
                position: "absolute",
                left: 0,
                top: 0,
              }}
              className="transition-transform duration-75 will-change-transform"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRegion?.(tag.region.code);
                  focusOnRegion(tag.region.code);
                }}
                className={`pointer-events-auto -translate-x-1/2 -translate-y-[125%] px-3.5 py-2 rounded-xl backdrop-blur-md transition-all cursor-pointer shadow-2xl border text-left ${
                  isSelected
                    ? "bg-[#091122]/95 border-[#22c55e] text-white shadow-[0_0_25px_rgba(34,197,94,0.45)] scale-105"
                    : isHighCarbon
                    ? "bg-[#0c1527]/85 border-amber-500/40 text-slate-100 hover:border-amber-400"
                    : "bg-[#091122]/85 border-[#22c55e]/35 text-slate-100 hover:border-[#22c55e]"
                }`}
              >
                <div className="font-bold text-xs font-sans tracking-tight text-white">
                  {tag.region.name.split(" ")[0] || tag.region.name}
                </div>
                <div
                  className={`text-[11px] font-mono font-bold ${
                    isHighCarbon ? "text-amber-400" : "text-[#22c55e]"
                  }`}
                >
                  {ciText}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Top Right: Live Carbon Intensity Global View Legend */}
      <div className="absolute top-4 right-4 z-30 p-3.5 rounded-2xl bg-[#091122]/85 border border-white/[0.08] backdrop-blur-md shadow-2xl min-w-[210px]">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-bold text-xs text-white font-sans">Live Carbon Intensity</span>
          <Leaf className="w-3.5 h-3.5 text-[#22c55e]" />
        </div>
        <div className="text-[10px] text-slate-400 font-mono mb-2">Global View</div>
        
        {/* Color Gradient Bar */}
        <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-[#22c55e] via-amber-400 to-rose-500 shadow-sm" />
        
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
          <span className="text-[#22c55e]">Low</span>
          <span className="text-rose-400">High</span>
        </div>
      </div>

      {/* Bottom Left: Simulation Play/Pause Toggle */}
      <div className="absolute bottom-4 left-4 z-30">
        <button
          onClick={() => setAutoRotate((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#091122]/85 hover:bg-[#0f1d38]/90 text-slate-200 text-xs font-mono font-medium border border-white/[0.08] backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          {autoRotate ? (
            <>
              <Pause className="w-3 h-3 text-[#22c55e] fill-current" />
              <span>Real-time simulation</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 text-[#22c55e] fill-current" />
              <span>Simulation paused</span>
            </>
          )}
        </button>
      </div>

      {/* Bottom Right: Quick Controls & Hint */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-30">
        <span className="hidden sm:inline text-[11px] font-mono text-slate-400 mr-1 opacity-70">
          Drag to rotate
        </span>

        <button
          onClick={zoomIn}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer backdrop-blur-md"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={zoomOut}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer backdrop-blur-md"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={resetCamera}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer backdrop-blur-md"
          title="Reset Camera Orientation"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
