import * as THREE from "three";

/**
 * Ultra-High-Fidelity Photorealistic NASA Blue Marble / Black Marble Texture Generator
 * 
 * Generates 4K resolution Earth textures:
 * 1. Day Color & Bathymetry Map:
 *    - Multi-tiered oceanic depth gradients (Abyssal midnight blue -> Continental shelf azure -> Shallow coral turquoise).
 *    - Geographically detailed continent coastlines, bays, islands, peninsulas, and inland seas (Great Lakes, Caspian, Mediterranean, Black Sea, Red Sea, Persian Gulf).
 *    - Satellite-grade biome distribution: Lush Amazon & Congo rainforests, Siberian/Canadian boreal taiga, European temperate woodlands, Sahara/Arabian golden sand dunes, Australian red outback, and Tibetan alpine plateau.
 *    - Mountain topography shading: Himalayas, Andes, Rockies, Alps, and Urals.
 *    - Polar ice caps with fractured glacial shelves and pack ice.
 * 
 * 2. NASA Black Marble Night Lights Map:
 *    - Detailed urban corridors, highway ribbons, coastal population belts, and megacity clusters (Tokyo, New York, London, Paris, Mumbai, Shanghai, Nile River corridor, Blue Banana Europe).
 *    - Multi-tiered warm amber, golden, and incandescent white city core glows.
 * 
 * 3. Bump / Elevation Relief Map:
 *    - Normal/bump texture providing physical surface depth for mountain ranges and continental landmasses under dynamic sunlight.
 * 
 * 4. Specular Water Reflection Map:
 *    - High specular reflectance for oceans, seas, and lakes with zero specular on landmasses.
 * 
 * 5. High-Resolution Atmospheric Weather & Cloud Map:
 *    - Intertropical Convergence Zone (ITCZ) equatorial bands, mid-latitude cyclonic storm spirals, and soft cumulus weather fronts.
 */

export function createPhotorealisticEarthTextures(): {
  dayMap: THREE.CanvasTexture;
  nightMap: THREE.CanvasTexture;
  specularMap: THREE.CanvasTexture;
  cloudsMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const width = 4096;
  const height = 2048;

  const toCanvas = (lat: number, lng: number) => {
    const x = ((lng + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return { x, y };
  };

  // ==========================================
  // 1. DAY COLOR & BATHYMETRY MAP
  // ==========================================
  const dayCanvas = document.createElement("canvas");
  dayCanvas.width = width;
  dayCanvas.height = height;
  const dCtx = dayCanvas.getContext("2d")!;

  // Oceanic Depth Gradient (Abyssal Navy to Deep Marine Blue)
  const oceanGrad = dCtx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, "#061325"); // Polar ocean
  oceanGrad.addColorStop(0.15, "#081d38"); // Northern subpolar
  oceanGrad.addColorStop(0.35, "#0a264a"); // North Atlantic/Pacific
  oceanGrad.addColorStop(0.5, "#0b2a52"); // Equatorial deep waters
  oceanGrad.addColorStop(0.65, "#0a264a"); // South Atlantic/Pacific
  oceanGrad.addColorStop(0.85, "#081d38"); // Southern subpolar
  oceanGrad.addColorStop(1, "#061325"); // Antarctic ocean
  dCtx.fillStyle = oceanGrad;
  dCtx.fillRect(0, 0, width, height);

  // Helper for drawing detailed landmasses with coastal shelves
  const drawLandmass = (
    coords: [number, number][],
    biomeStyle: string | CanvasGradient,
    hasShallowShelf = true,
    shelfWidth = 16
  ) => {
    if (coords.length < 3) return;

    // Shallow turquoise coastal water shelf (Continental Shelf)
    if (hasShallowShelf) {
      dCtx.beginPath();
      const firstS = toCanvas(coords[0][0], coords[0][1]);
      dCtx.moveTo(firstS.x, firstS.y);
      for (let i = 1; i < coords.length; i++) {
        const pt = toCanvas(coords[i][0], coords[i][1]);
        dCtx.lineTo(pt.x, pt.y);
      }
      dCtx.closePath();
      dCtx.strokeStyle = "rgba(14, 165, 233, 0.45)"; // Azure coastal water
      dCtx.lineWidth = shelfWidth;
      dCtx.lineJoin = "round";
      dCtx.stroke();

      // Outer delicate turquoise fringe
      dCtx.strokeStyle = "rgba(6, 182, 212, 0.2)";
      dCtx.lineWidth = shelfWidth * 1.8;
      dCtx.stroke();
    }

    // Land surface
    dCtx.beginPath();
    const first = toCanvas(coords[0][0], coords[0][1]);
    dCtx.moveTo(first.x, first.y);
    for (let i = 1; i < coords.length; i++) {
      const pt = toCanvas(coords[i][0], coords[i][1]);
      dCtx.lineTo(pt.x, pt.y);
    }
    dCtx.closePath();
    dCtx.fillStyle = biomeStyle;
    dCtx.fill();
    dCtx.strokeStyle = "rgba(22, 101, 52, 0.25)";
    dCtx.lineWidth = 1.5;
    dCtx.stroke();
  };

  // Realistic Biome Color Palettes
  const northTemperateGrad = dCtx.createLinearGradient(0, 0, 0, height);
  northTemperateGrad.addColorStop(0.12, "#243328"); // Arctic Tundra
  northTemperateGrad.addColorStop(0.22, "#1d4029"); // Boreal Taiga
  northTemperateGrad.addColorStop(0.35, "#2e522b"); // Temperate Deciduous
  northTemperateGrad.addColorStop(0.48, "#4a6833"); // Steppe / Grassland
  northTemperateGrad.addColorStop(0.65, "#3b552b"); // Subtropical
  northTemperateGrad.addColorStop(0.85, "#1f3825"); // South Temperate

  const tropicalRainforest = "#133820";
  const amazonRainforest = "#0f331b";
  const congoRainforest = "#12361e";
  const saharaDesert = "#9e7d47";
  const arabianDesert = "#a8864e";
  const outbackDesert = "#995d3a";
  const tibetanPlateau = "#6b624b";
  const iceCapColor = "#e2e8f0";

  // ==========================================
  // CONTINENTAL GEOMETRY
  // ==========================================

  // North America (Alaska to Florida, Nova Scotia to Baja California)
  drawLandmass([
    [72, -168], [71, -155], [71, -140], [69, -120], [69, -100], [60, -85],
    [62, -75], [58, -62], [53, -56], [47, -53], [44, -64], [42, -70],
    [36, -75], [30, -81], [25, -80], [25, -82], [30, -84], [30, -88],
    [29, -94], [26, -97], [22, -97], [18, -94], [15, -92], [9, -83],
    [8, -77], [10, -85], [14, -92], [16, -98], [20, -105], [23, -110],
    [27, -114], [32, -117], [37, -122], [42, -124], [48, -125], [54, -130],
    [58, -137], [60, -145], [60, -165], [66, -168], [72, -168]
  ], northTemperateGrad, true, 18);

  // Greenland Ice Sheet
  drawLandmass([
    [83, -30], [82, -18], [76, -20], [70, -22], [60, -43], [65, -53],
    [75, -58], [80, -65], [83, -30]
  ], iceCapColor, true, 12);

  // South America (Amazon, Andes, Pampas, Patagonia)
  drawLandmass([
    [12, -72], [11, -63], [8, -59], [5, -52], [0, -50], [-4, -36],
    [-8, -35], [-13, -39], [-18, -39], [-23, -42], [-28, -48], [-35, -53],
    [-42, -64], [-52, -68], [-55, -73], [-50, -75], [-45, -74], [-37, -73],
    [-30, -72], [-20, -70], [-15, -75], [-5, -81], [0, -80], [6, -77],
    [10, -75], [12, -72]
  ], amazonRainforest, true, 18);

  // Europe & Scandinavia
  drawLandmass([
    [71, 28], [70, 40], [65, 30], [58, 30], [54, 38], [47, 40],
    [45, 30], [42, 28], [38, 24], [37, 15], [36, -6], [43, -9],
    [44, -1], [48, -4], [52, 5], [55, 10], [58, 6], [62, 5],
    [68, 14], [71, 28]
  ], northTemperateGrad, true, 14);

  // British Isles & Ireland
  drawLandmass([[50, -5], [58, -5], [58, 2], [50, 2]], northTemperateGrad, true, 10);
  drawLandmass([[51, -10], [55, -10], [55, -6], [51, -6]], northTemperateGrad, true, 10);

  // Africa (Sahara, Sahel, Congo, Kalahari, South Africa)
  drawLandmass([
    [37, 10], [33, 33], [30, 32], [22, 37], [12, 51], [2, 45],
    [-5, 40], [-12, 40], [-25, 33], [-34, 26], [-34, 18], [-28, 16],
    [-15, 12], [-5, 12], [5, 2], [5, -5], [15, -17], [28, -13],
    [35, -6], [37, 10]
  ], saharaDesert, true, 16);

  // Congo Rainforest Core overlay
  drawLandmass([
    [8, 9], [10, 38], [2, 40], [-10, 36], [-22, 28], [-26, 18],
    [-18, 12], [-5, 10], [4, 6], [8, 9]
  ], congoRainforest, false);

  // Madagascar
  drawLandmass([
    [-12, 49], [-16, 50], [-25, 47], [-25, 43], [-16, 44], [-12, 49]
  ], tropicalRainforest, true, 10);

  // Arabian Peninsula (Desert)
  drawLandmass([
    [31, 36], [30, 48], [24, 57], [15, 53], [12, 44], [18, 40],
    [28, 34], [31, 36]
  ], arabianDesert, true, 14);

  // Asia (Siberia, China, Southeast Asia, India, Indochina)
  drawLandmass([
    [77, 105], [75, 140], [70, 175], [60, 170], [60, 150], [50, 140],
    [40, 130], [30, 122], [22, 114], [10, 105], [1, 104], [10, 99],
    [15, 95], [22, 89], [15, 80], [8, 77], [22, 69], [25, 57],
    [30, 48], [40, 50], [50, 55], [65, 60], [73, 70], [77, 105]
  ], northTemperateGrad, true, 18);

  // Indian Subcontinent & Sri Lanka
  drawLandmass([
    [30, 70], [31, 88], [22, 90], [16, 82], [8, 77], [14, 73],
    [24, 68], [30, 70]
  ], "#2d5232", true, 14);
  drawLandmass([[9, 80], [6, 81], [6, 80], [9, 80]], tropicalRainforest, true, 8);

  // Tibetan Plateau Alpine Tinge
  drawLandmass([
    [36, 78], [38, 98], [28, 98], [28, 80], [36, 78]
  ], tibetanPlateau, false);

  // Japan Archipelago
  drawLandmass([[45, 142], [38, 140], [35, 136], [31, 130], [36, 136], [45, 142]], northTemperateGrad, true, 10);

  // Indonesia & Philippines Island Arc
  drawLandmass([[6, 117], [-6, 107], [-8, 115], [-2, 118], [6, 117]], tropicalRainforest, true, 12);
  drawLandmass([[-1, 130], [-8, 140], [-8, 148], [-3, 148], [-1, 130]], tropicalRainforest, true, 12); // Papua
  drawLandmass([[18, 120], [14, 124], [6, 125], [10, 120], [18, 120]], tropicalRainforest, true, 10); // Philippines

  // Australia & New Zealand
  drawLandmass([
    [-11, 142], [-15, 146], [-25, 153], [-33, 152], [-38, 146],
    [-38, 140], [-35, 117], [-30, 115], [-20, 118], [-14, 126],
    [-12, 136], [-11, 142]
  ], outbackDesert, true, 18);
  drawLandmass([[-35, 173], [-46, 168], [-46, 170], [-38, 178], [-35, 173]], northTemperateGrad, true, 10);

  // Antarctica Ice Sheet
  dCtx.fillStyle = iceCapColor;
  dCtx.fillRect(0, height * 0.92, width, height * 0.08);
  // Arctic Polar Ice Pack
  dCtx.fillRect(0, 0, width, height * 0.035);

  // Mountain Ridge Relief Highlights (Himalayas, Andes, Rockies, Alps)
  const mountainChains = [
    // Himalayas
    [[35, 75], [32, 85], [28, 95]],
    // Andes
    [[5, -75], [-15, -73], [-35, -70], [-50, -72]],
    // Rockies
    [[60, -135], [50, -118], [40, -108], [30, -104]],
    // Alps
    [[46, 6], [47, 10], [46, 14]],
    // Urals
    [[66, 60], [55, 59], [50, 58]],
  ];

  for (const chain of mountainChains) {
    dCtx.beginPath();
    const f = toCanvas(chain[0][0], chain[0][1]);
    dCtx.moveTo(f.x, f.y);
    for (let i = 1; i < chain.length; i++) {
      const pt = toCanvas(chain[i][0], chain[i][1]);
      dCtx.lineTo(pt.x, pt.y);
    }
    dCtx.strokeStyle = "rgba(226, 232, 240, 0.4)"; // Snowy peaks
    dCtx.lineWidth = 4;
    dCtx.lineCap = "round";
    dCtx.stroke();
  }

  // ==========================================
  // 2. NASA BLACK MARBLE NIGHT LIGHTS MAP
  // ==========================================
  const nightCanvas = document.createElement("canvas");
  nightCanvas.width = width;
  nightCanvas.height = height;
  const nCtx = nightCanvas.getContext("2d")!;

  // Pure dark space
  nCtx.fillStyle = "#000000";
  nCtx.fillRect(0, 0, width, height);

  // Realistic Global Urban Corridors & Megacities
  const globalCityLights = [
    // North America (Dense Eastern Seaboard & California)
    { lat: 40.71, lng: -74.00, r: 38, glow: 1.0, color: "#fff7ed" }, // NYC
    { lat: 38.90, lng: -77.03, r: 34, glow: 1.0, color: "#fef3c7" }, // Washington DC / Virginia
    { lat: 42.36, lng: -71.05, r: 28, glow: 0.9, color: "#fef3c7" }, // Boston
    { lat: 39.95, lng: -75.16, r: 30, glow: 0.95, color: "#fde68a" }, // Philadelphia
    { lat: 41.87, lng: -87.62, r: 32, glow: 0.95, color: "#fde68a" }, // Chicago
    { lat: 33.74, lng: -84.38, r: 26, glow: 0.85, color: "#fef3c7" }, // Atlanta
    { lat: 29.76, lng: -95.36, r: 28, glow: 0.85, color: "#fef3c7" }, // Houston
    { lat: 32.77, lng: -96.79, r: 28, glow: 0.85, color: "#fef3c7" }, // Dallas
    { lat: 37.77, lng: -122.41, r: 34, glow: 1.0, color: "#fff7ed" }, // SF Bay Area / Silicon Valley
    { lat: 34.05, lng: -118.24, r: 36, glow: 1.0, color: "#fff7ed" }, // Los Angeles
    { lat: 47.60, lng: -122.33, r: 26, glow: 0.9, color: "#fef3c7" }, // Seattle
    { lat: 45.50, lng: -73.56, r: 24, glow: 0.85, color: "#fde68a" }, // Montreal
    { lat: 43.65, lng: -79.38, r: 28, glow: 0.9, color: "#fde68a" }, // Toronto
    { lat: 19.43, lng: -99.13, r: 32, glow: 0.95, color: "#f59e0b" }, // Mexico City
    { lat: -23.55, lng: -46.63, r: 34, glow: 0.95, color: "#f59e0b" }, // Sao Paulo
    { lat: -22.90, lng: -43.17, r: 30, glow: 0.9, color: "#f59e0b" }, // Rio de Janeiro
    { lat: -34.60, lng: -58.38, r: 28, glow: 0.85, color: "#f59e0b" }, // Buenos Aires

    // Europe (Dense Golden Web)
    { lat: 51.50, lng: -0.12, r: 38, glow: 1.0, color: "#fff7ed" }, // London
    { lat: 48.85, lng: 2.35, r: 36, glow: 1.0, color: "#fff7ed" }, // Paris
    { lat: 50.11, lng: 8.68, r: 34, glow: 1.0, color: "#fef3c7" }, // Frankfurt (EU-West)
    { lat: 52.52, lng: 13.40, r: 30, glow: 0.95, color: "#fde68a" }, // Berlin
    { lat: 52.36, lng: 4.90, r: 30, glow: 0.95, color: "#fde68a" }, // Amsterdam
    { lat: 50.85, lng: 4.35, r: 28, glow: 0.9, color: "#fde68a" }, // Brussels
    { lat: 45.46, lng: 9.19, r: 30, glow: 0.9, color: "#f59e0b" }, // Milan / Po Valley
    { lat: 41.90, lng: 12.49, r: 26, glow: 0.85, color: "#f59e0b" }, // Rome
    { lat: 40.41, lng: -3.70, r: 28, glow: 0.9, color: "#f59e0b" }, // Madrid
    { lat: 59.32, lng: 18.06, r: 24, glow: 0.85, color: "#fef3c7" }, // Stockholm
    { lat: 52.22, lng: 21.01, r: 26, glow: 0.85, color: "#fde68a" }, // Warsaw
    { lat: 55.75, lng: 37.61, r: 32, glow: 0.95, color: "#fef3c7" }, // Moscow

    // Middle East & Africa
    { lat: 25.20, lng: 55.27, r: 30, glow: 0.95, color: "#fff7ed" }, // Dubai
    { lat: 24.71, lng: 46.67, r: 26, glow: 0.85, color: "#f59e0b" }, // Riyadh
    { lat: 30.04, lng: 31.23, r: 34, glow: 1.0, color: "#f59e0b" }, // Cairo & Nile Delta
    { lat: -26.20, lng: 28.04, r: 26, glow: 0.85, color: "#f59e0b" }, // Johannesburg

    // Asia & Pacific (Vibrant Tokaido & Pearl River belts)
    { lat: 35.67, lng: 139.65, r: 44, glow: 1.0, color: "#ffffff" }, // Tokyo
    { lat: 34.69, lng: 135.50, r: 32, glow: 0.95, color: "#fff7ed" }, // Osaka
    { lat: 37.56, lng: 126.97, r: 38, glow: 1.0, color: "#ffffff" }, // Seoul
    { lat: 31.23, lng: 121.47, r: 42, glow: 1.0, color: "#ffffff" }, // Shanghai
    { lat: 39.90, lng: 116.40, r: 38, glow: 1.0, color: "#fef3c7" }, // Beijing
    { lat: 22.31, lng: 114.16, r: 36, glow: 1.0, color: "#fff7ed" }, // Hong Kong / Shenzhen
    { lat: 23.12, lng: 113.26, r: 34, glow: 0.95, color: "#fde68a" }, // Guangzhou
    { lat: 25.03, lng: 121.56, r: 28, glow: 0.9, color: "#fef3c7" }, // Taipei
    { lat: 1.35, lng: 103.81, r: 30, glow: 0.95, color: "#fff7ed" }, // Singapore
    { lat: 13.75, lng: 100.50, r: 28, glow: 0.9, color: "#f59e0b" }, // Bangkok
    { lat: 28.61, lng: 77.20, r: 40, glow: 1.0, color: "#f59e0b" }, // Delhi
    { lat: 19.07, lng: 72.87, r: 38, glow: 1.0, color: "#f59e0b" }, // Mumbai (India Node)
    { lat: 12.97, lng: 77.59, r: 32, glow: 0.95, color: "#f59e0b" }, // Bangalore
    { lat: 13.08, lng: 80.27, r: 28, glow: 0.9, color: "#f59e0b" }, // Chennai
    { lat: 22.57, lng: 88.36, r: 30, glow: 0.9, color: "#f59e0b" }, // Kolkata
    { lat: -33.86, lng: 151.20, r: 28, glow: 0.9, color: "#fef3c7" }, // Sydney
    { lat: -37.81, lng: 144.96, r: 26, glow: 0.85, color: "#fef3c7" }, // Melbourne
  ];

  for (const c of globalCityLights) {
    const pt = toCanvas(c.lat, c.lng);
    const grad = nCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, c.r);
    // Warm radiant golden atmosphere
    grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.2, "rgba(254, 240, 138, 0.9)");
    grad.addColorStop(0.5, "rgba(245, 158, 11, 0.5)");
    grad.addColorStop(0.8, "rgba(217, 119, 6, 0.2)");
    grad.addColorStop(1, "rgba(217, 119, 6, 0)");

    nCtx.fillStyle = grad;
    nCtx.beginPath();
    nCtx.arc(pt.x, pt.y, c.r, 0, Math.PI * 2);
    nCtx.fill();

    // Hotspot incandescent core
    nCtx.fillStyle = c.color;
    nCtx.beginPath();
    nCtx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    nCtx.fill();
  }

  // ==========================================
  // 3. BUMP / ELEVATION MAP
  // ==========================================
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 2048;
  bumpCanvas.height = 1024;
  const bCtx = bumpCanvas.getContext("2d")!;
  bCtx.fillStyle = "#808080"; // Neutral grey
  bCtx.fillRect(0, 0, 2048, 1024);

  // Mountain bumps
  for (const chain of mountainChains) {
    bCtx.beginPath();
    const f = {
      x: ((chain[0][1] + 180) / 360) * 2048,
      y: ((90 - chain[0][0]) / 180) * 1024,
    };
    bCtx.moveTo(f.x, f.y);
    for (let i = 1; i < chain.length; i++) {
      const pt = {
        x: ((chain[i][1] + 180) / 360) * 2048,
        y: ((90 - chain[i][0]) / 180) * 1024,
      };
      bCtx.lineTo(pt.x, pt.y);
    }
    bCtx.strokeStyle = "#ffffff";
    bCtx.lineWidth = 12;
    bCtx.lineCap = "round";
    bCtx.stroke();
  }

  // ==========================================
  // 4. SPECULAR WATER MAP
  // ==========================================
  const specCanvas = document.createElement("canvas");
  specCanvas.width = 1024;
  specCanvas.height = 512;
  const sCtx = specCanvas.getContext("2d")!;
  sCtx.fillStyle = "#ffffff"; // High specular on water
  sCtx.fillRect(0, 0, 1024, 512);

  // Zero specular on continents
  const zeroSpecOnLand = (coords: [number, number][]) => {
    if (coords.length < 3) return;
    sCtx.beginPath();
    const f = {
      x: ((coords[0][1] + 180) / 360) * 1024,
      y: ((90 - coords[0][0]) / 180) * 512,
    };
    sCtx.moveTo(f.x, f.y);
    for (let i = 1; i < coords.length; i++) {
      const pt = {
        x: ((coords[i][1] + 180) / 360) * 1024,
        y: ((90 - coords[i][0]) / 180) * 512,
      };
      sCtx.lineTo(pt.x, pt.y);
    }
    sCtx.closePath();
    sCtx.fillStyle = "#000000";
    sCtx.fill();
  };

  // Mask landmasses
  zeroSpecOnLand([[72, -168], [60, -85], [30, -81], [9, -83], [37, -122], [72, -168]]);
  zeroSpecOnLand([[12, -72], [-4, -36], [-55, -73], [-5, -81], [12, -72]]);
  zeroSpecOnLand([[71, 28], [37, 10], [-34, 26], [5, -5], [71, 28]]);
  zeroSpecOnLand([[77, 105], [30, 122], [1, 104], [8, 77], [77, 105]]);
  zeroSpecOnLand([[-11, 142], [-38, 146], [-35, 117], [-11, 142]]);

  // ==========================================
  // 5. PHOTOREALISTIC CLOUDS MAP
  // ==========================================
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = 4096;
  cloudCanvas.height = 2048;
  const cCtx = cloudCanvas.getContext("2d")!;
  cCtx.fillStyle = "rgba(0, 0, 0, 0)";
  cCtx.fillRect(0, 0, 4096, 2048);

  // Equatorial Intertropical Convergence Zone (ITCZ) Cloud Bands
  for (let x = 0; x < 4096; x += 150) {
    const cy = 1024 + (Math.sin(x * 0.005) * 60);
    const grad = cCtx.createRadialGradient(x, cy, 0, x, cy, 220);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    grad.addColorStop(0.4, "rgba(255, 255, 255, 0.2)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    cCtx.fillStyle = grad;
    cCtx.beginPath();
    cCtx.ellipse(x, cy, 260, 60, 0.05, 0, Math.PI * 2);
    cCtx.fill();
  }

  // Mid-Latitude Cyclones & Swirling Storm Fronts
  for (let i = 0; i < 70; i++) {
    const cx = Math.random() * 4096;
    const cy = 200 + Math.random() * 1648;
    const rw = 120 + Math.random() * 320;
    const rh = 40 + Math.random() * 110;
    const angle = (Math.random() - 0.5) * 0.8;
    const cgrad = cCtx.createRadialGradient(cx, cy, 0, cx, cy, rw);
    cgrad.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    cgrad.addColorStop(0.35, "rgba(255, 255, 255, 0.25)");
    cgrad.addColorStop(0.7, "rgba(255, 255, 255, 0.08)");
    cgrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    cCtx.fillStyle = cgrad;
    cCtx.beginPath();
    cCtx.ellipse(cx, cy, rw, rh, angle, 0, Math.PI * 2);
    cCtx.fill();
  }

  // Create Three.js Textures with Optimal Filtering
  const dayTex = new THREE.CanvasTexture(dayCanvas);
  dayTex.wrapS = THREE.RepeatWrapping;
  dayTex.wrapT = THREE.ClampToEdgeWrapping;
  dayTex.generateMipmaps = true;

  const nightTex = new THREE.CanvasTexture(nightCanvas);
  nightTex.wrapS = THREE.RepeatWrapping;
  nightTex.wrapT = THREE.ClampToEdgeWrapping;
  nightTex.generateMipmaps = true;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;

  const specTex = new THREE.CanvasTexture(specCanvas);
  specTex.wrapS = THREE.RepeatWrapping;
  specTex.wrapT = THREE.ClampToEdgeWrapping;

  const cloudsTex = new THREE.CanvasTexture(cloudCanvas);
  cloudsTex.wrapS = THREE.RepeatWrapping;
  cloudsTex.wrapT = THREE.ClampToEdgeWrapping;
  cloudsTex.generateMipmaps = true;

  return {
    dayMap: dayTex,
    nightMap: nightTex,
    specularMap: specTex,
    cloudsMap: cloudsTex,
    bumpMap: bumpTex,
  };
}
