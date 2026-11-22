/**
 * 1-Bit Munich Airport (EDDM / MUC) Live Radar & Pokémon-Style Aircraft Card
 * High-Detail Ground Layout, 1s Live Polling + 60FPS Dead-Reckoning & Route Lookup
 */
(() => {
  // Center: EDDM (Munich Airport Tower / MAC Core)
  const EDDM_LAT = 48.3538;
  const EDDM_LON = 11.7861;

  // Zoom levels: km per half-screen
  const ZOOM_PRESETS = [
    { level: 0, label: "0x ULTRA NAH (GATES)", kmSpan: 1.25 },
    { level: 1, label: "1x VORFELD/BAHNEN", kmSpan: 4.5 },
    { level: 2, label: "2x ANFLUG/ABFLUG", kmSpan: 14.0 },
    { level: 3, label: "3x UMLAND", kmSpan: 32.0 },
    { level: 4, label: "4x REGION (OBERBAYERN)", kmSpan: 90.0 }
  ];

  let currentKmSpan = ZOOM_PRESETS[0].kmSpan; // Default: 0x ULTRA NAH
  let panOffsetX = 0; // in km
  let panOffsetY = 0; // in km
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let hasDragged = false;

  let aircraftList = [];
  let fetchTimer = null;
  let isFetching = false;
  let selectedAircraft = null;
  let animFrameId = null;

  // Route cache (Callsign -> "ORIGIN ✈ DESTINATION")
  const routeCache = new Map();

  // Elements
  const canvas = document.getElementById("radar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const container = document.getElementById("radar-container");
  const overlayMsg = document.getElementById("radar-overlay-msg");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const overlayRetryBtn = document.getElementById("overlay-retry-btn");
  const liveCountElem = document.getElementById("radar-live-count");
  const lastUpdateElem = document.getElementById("radar-last-update");
  const zoomBtn0 = document.getElementById("zoom-btn-0");
  const zoomBtn1 = document.getElementById("zoom-btn-1");
  const zoomBtn2 = document.getElementById("zoom-btn-2");
  const zoomBtn3 = document.getElementById("zoom-btn-3");
  const zoomBtn4 = document.getElementById("zoom-btn-4");
  const resetPanBtn = document.getElementById("radar-reset-pan");
  const pokeModal = document.getElementById("poke-modal");
  const pokeCloseBtn = document.getElementById("poke-close-btn");

  // ==========================================
  // DETAILED AIRPORT GEOMETRY (EDDM / MUC)
  // ==========================================
  const RUNWAYS = [
    {
      name: "08L/26R",
      lat1: 48.3621, lon1: 11.7418,
      lat2: 48.3663, lon2: 11.7955,
      label1: "08L", label2: "26R",
      heading: 82.5
    },
    {
      name: "08R/26L",
      lat1: 48.3413, lon1: 11.7662,
      lat2: 48.3455, lon2: 11.8199,
      label1: "08R", label2: "26L",
      heading: 82.5
    }
  ];

  const RAPID_EXITS = [
    [[48.3634, 11.7580], [48.3608, 11.7610]],
    [[48.3642, 11.7680], [48.3616, 11.7710]],
    [[48.3649, 11.7770], [48.3623, 11.7745]],
    [[48.3656, 11.7860], [48.3630, 11.7835]],
    [[48.3426, 11.7820], [48.3452, 11.7850]],
    [[48.3434, 11.7920], [48.3460, 11.7950]],
    [[48.3441, 11.8010], [48.3415, 11.7985]],
    [[48.3448, 11.8100], [48.3422, 11.8075]]
  ];

  const TAXIWAYS = [
    [[48.3600, 11.7418], [48.3642, 11.7955]],
    [[48.3582, 11.7450], [48.3624, 11.7920]],
    [[48.3438, 11.7662], [48.3480, 11.8199]],
    [[48.3456, 11.7690], [48.3498, 11.8170]],
    [[48.3600, 11.7680], [48.3565, 11.7690]],
    [[48.3565, 11.7690], [48.3475, 11.7715]],
    [[48.3475, 11.7715], [48.3438, 11.7730]],
    [[48.3625, 11.7940], [48.3565, 11.7960]],
    [[48.3565, 11.7960], [48.3480, 11.7980]],
    [[48.3480, 11.7980], [48.3445, 11.8000]],
    [[48.3565, 11.7630], [48.3575, 11.8220]],
    [[48.3490, 11.7630], [48.3500, 11.8220]]
  ];

  const TAXIWAY_BRIDGES = [
    { name: "BRÜCKE WEST", lat: 48.3550, lon: 11.7720, w: 0.0035, h: 0.0022 },
    { name: "BRÜCKE OST", lat: 48.3555, lon: 11.7985, w: 0.0035, h: 0.0022 }
  ];

  const APRONS = [
    [[48.3500, 11.7620], [48.3575, 11.7635], [48.3570, 11.7790], [48.3495, 11.7775]],
    [[48.3488, 11.7880], [48.3570, 11.7900], [48.3565, 11.8235], [48.3482, 11.8215]],
    [[48.3435, 11.7580], [48.3475, 11.7590], [48.3470, 11.7700], [48.3430, 11.7690]],
    [[48.3440, 11.8050], [48.3485, 11.8060], [48.3480, 11.8230], [48.3435, 11.8220]]
  ];

  // ==========================================
  // REGION OBERBAYERN
  // ==========================================
  const ISAR_PATH = [
    [47.760, 11.560],
    [47.910, 11.430],
    [48.050, 11.530],
    [48.137, 11.585],
    [48.190, 11.630],
    [48.320, 11.710],
    [48.395, 11.735],
    [48.470, 11.930],
    [48.540, 12.140]
  ];

  const REGION_LAKES = [
    {
      name: "STARNBERGER SEE",
      poly: [
        [48.005, 11.340], [47.980, 11.355], [47.900, 11.330],
        [47.800, 11.300], [47.785, 11.280], [47.810, 11.265],
        [47.910, 11.295], [47.990, 11.325]
      ],
      labelPos: [47.900, 11.330]
    },
    {
      name: "AMMERSEE",
      poly: [
        [48.070, 11.120], [48.040, 11.140], [47.960, 11.130],
        [47.920, 11.100], [47.930, 11.080], [48.020, 11.095]
      ],
      labelPos: [48.000, 11.120]
    }
  ];

  const REGION_CITIES = [
    { name: "MÜNCHEN", lat: 48.137, lon: 11.576, isMajor: true },
    { name: "FREISING", lat: 48.403, lon: 11.749, isMajor: false },
    { name: "ERDING", lat: 48.306, lon: 11.906, isMajor: false },
    { name: "AUGSBURG", lat: 48.371, lon: 10.898, isMajor: true },
    { name: "INGOLSTADT", lat: 48.766, lon: 11.425, isMajor: true },
    { name: "LANDSHUT", lat: 48.537, lon: 12.152, isMajor: true },
    { name: "ROSENHEIM", lat: 47.856, lon: 12.128, isMajor: true }
  ];

  const REGION_AIRPORTS = [
    { name: "EDMO // OBERPFAFFENHOFEN", lat: 48.081, lon: 11.283 },
    { name: "ETSI // INGOLSTADT-MANCHING", lat: 48.715, lon: 11.534 }
  ];

  const BUILDINGS = [
    {
      name: "TERMINAL 1 (MOD. A-E)",
      poly: [[48.3518, 11.7675], [48.3585, 11.7688], [48.3582, 11.7718], [48.3515, 11.7705]],
      label: "T1 [MOD. A-E]"
    },
    {
      name: "T1 MODUL A",
      poly: [[48.3575, 11.7640], [48.3582, 11.7642], [48.3580, 11.7676], [48.3573, 11.7674]],
      label: "MOD A"
    },
    {
      name: "T1 MODUL B",
      poly: [[48.3560, 11.7640], [48.3567, 11.7642], [48.3565, 11.7676], [48.3558, 11.7674]],
      label: "MOD B"
    },
    {
      name: "T1 MODUL C",
      poly: [[48.3545, 11.7640], [48.3552, 11.7642], [48.3550, 11.7676], [48.3543, 11.7674]],
      label: "MOD C"
    },
    {
      name: "T1 MODUL D",
      poly: [[48.3530, 11.7640], [48.3537, 11.7642], [48.3535, 11.7676], [48.3528, 11.7674]],
      label: "MOD D"
    },
    {
      name: "T1 MODUL E",
      poly: [[48.3515, 11.7640], [48.3522, 11.7642], [48.3520, 11.7676], [48.3513, 11.7674]],
      label: "MOD E"
    },
    {
      name: "MAC / ZENTRALBEREICH",
      poly: [[48.3526, 11.7810], [48.3562, 11.7816], [48.3560, 11.7865], [48.3540, 11.7872], [48.3524, 11.7860]],
      label: "MAC FORUM"
    },
    {
      name: "EDDM TOWER",
      poly: [[48.3535, 11.7865], [48.3546, 11.7867], [48.3544, 11.7885], [48.3533, 11.7883]],
      label: "EDDM // TOWER"
    },
    {
      name: "TERMINAL 2",
      poly: [[48.3508, 11.7925], [48.3578, 11.7938], [48.3574, 11.8005], [48.3504, 11.7992]],
      label: "TERMINAL 2 (GATES G/H)"
    },
    {
      name: "T2 SATELLIT",
      poly: [[48.3510, 11.8095], [48.3576, 11.8108], [48.3572, 11.8158], [48.3506, 11.8145]],
      label: "T2 SATELLIT (GATES K/L)"
    },
    {
      name: "CARGO COMPLEX",
      poly: [[48.3438, 11.7590], [48.3468, 11.7596], [48.3464, 11.7685], [48.3434, 11.7679]],
      label: "CARGO / FRACHT"
    },
    {
      name: "MAINTENANCE HANGARS",
      poly: [[48.3442, 11.8060], [48.3478, 11.8068], [48.3474, 11.8210], [48.3438, 11.8202]],
      label: "HANGAR / LH TECHNIK"
    }
  ];

  // Setup HiDPI Canvas
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    drawRadar();
  }
  window.addEventListener("resize", resizeCanvas);

  // Coordinate Projection
  function geoToCanvas(lat, lon) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const pixelsPerKm = (Math.min(w, h) / 2) / currentKmSpan;

    const dyKm = (lat - EDDM_LAT) * 111.13 + panOffsetY;
    const dxKm = (lon - EDDM_LON) * (111.13 * Math.cos(EDDM_LAT * Math.PI / 180)) + panOffsetX;

    const x = (w / 2) + dxKm * pixelsPerKm;
    const y = (h / 2) - dyKm * pixelsPerKm;

    return { x: x * dpr, y: y * dpr, rawX: x, rawY: y };
  }

  // ==========================================
  // 60-FPS DEAD-RECKONING INTERPOLATION
  // ==========================================
  function getInterpolatedCoords(ac, nowTs) {
    if (ac.lat == null || ac.lon == null) return { lat: ac.lat, lon: ac.lon };

    // Base dead-reckoning from last API fix
    let predLat = ac.lat;
    let predLon = ac.lon;

    if (ac.velocity > 1 && ac.heading != null && ac.lastUpdateTs) {
      const dtSec = Math.min(Math.max((nowTs - ac.lastUpdateTs) / 1000, 0), 2.5);
      const speedMs = ac.velocity * 0.514444; // knots -> m/s
      const distMeters = speedMs * dtSec;
      const rad = (ac.heading * Math.PI) / 180;

      const dNorthMeters = distMeters * Math.cos(rad);
      const dEastMeters = distMeters * Math.sin(rad);

      predLat += dNorthMeters / 111130;
      predLon += dEastMeters / (111130 * Math.cos((ac.lat * Math.PI) / 180));
    }

    // Smooth blend from previous rendered position over 250ms after an API update
    if (ac._blendStartTs && ac._blendFromLat != null && ac._blendFromLon != null) {
      const blendElapsed = nowTs - ac._blendStartTs;
      if (blendElapsed < 250) {
        const t = blendElapsed / 250;
        const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
        predLat = ac._blendFromLat + (predLat - ac._blendFromLat) * ease;
        predLon = ac._blendFromLon + (predLon - ac._blendFromLon) * ease;
      } else {
        ac._blendStartTs = null;
      }
    }

    ac._renderLat = predLat;
    ac._renderLon = predLon;
    return { lat: predLat, lon: predLon };
  }

  // Draw 1-Bit Dither Patterns
  function createDitherPattern(mode) {
    const pCanvas = document.createElement("canvas");
    pCanvas.width = 4;
    pCanvas.height = 4;
    const pCtx = pCanvas.getContext("2d");
    pCtx.fillStyle = "#ffffff";
    pCtx.fillRect(0, 0, 4, 4);
    pCtx.fillStyle = "#000000";

    if (mode === "building") {
      pCtx.fillRect(0, 0, 1, 1);
      pCtx.fillRect(2, 0, 1, 1);
      pCtx.fillRect(1, 1, 1, 1);
      pCtx.fillRect(3, 1, 1, 1);
      pCtx.fillRect(0, 2, 1, 1);
      pCtx.fillRect(2, 2, 1, 1);
      pCtx.fillRect(1, 3, 1, 1);
      pCtx.fillRect(3, 3, 1, 1);
    } else {
      pCtx.fillRect(0, 0, 1, 1);
      pCtx.fillRect(2, 2, 1, 1);
    }
    return ctx.createPattern(pCanvas, "repeat");
  }

  function drawRunwayDetailed(rwy, dpr, pixelsPerKm) {
    const p1 = geoToCanvas(rwy.lat1, rwy.lon1);
    const p2 = geoToCanvas(rwy.lat2, rwy.lon2);
    const rwyWidthPx = Math.max(8 * dpr, 0.060 * pixelsPerKm * dpr);

    ctx.save();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = rwyWidthPx;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5 * dpr, rwyWidthPx * 0.08);
    const dashLen = Math.max(4 * dpr, 0.030 * pixelsPerKm * dpr);
    ctx.setLineDash([dashLen, dashLen * 0.7]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (currentKmSpan < 3.0) {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = angle + Math.PI / 2;

      for (let side of [1, -1]) {
        const base = side === 1 ? p1 : p2;
        const dir = side === 1 ? 1 : -1;
        const numBars = 8;
        const barSpan = rwyWidthPx * 0.75;
        const barWidth = barSpan / (numBars * 2);
        const barLen = Math.max(6 * dpr, 0.025 * pixelsPerKm * dpr);

        for (let i = 0; i < numBars; i++) {
          const offset = -barSpan / 2 + i * barWidth * 2;
          const startX = base.x + Math.cos(angle) * (dir * 4 * dpr) + Math.cos(perpAngle) * offset;
          const startY = base.y + Math.sin(angle) * (dir * 4 * dpr) + Math.sin(perpAngle) * offset;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(startX + Math.cos(angle) * (dir * barLen), startY + Math.sin(angle) * (dir * barLen));
          ctx.lineWidth = barWidth;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        }

        const tdzDistances = [barLen * 2.2, barLen * 3.6, barLen * 5.0];
        tdzDistances.forEach(dist => {
          [-rwyWidthPx * 0.25, rwyWidthPx * 0.25].forEach(sideOffset => {
            const tx = base.x + Math.cos(angle) * (dir * dist) + Math.cos(perpAngle) * sideOffset;
            const ty = base.y + Math.sin(angle) * (dir * dist) + Math.sin(perpAngle) * sideOffset;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(angle) * (dir * barLen * 0.9), ty + Math.sin(angle) * (dir * barLen * 0.9));
            ctx.lineWidth = barWidth * 1.5;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          });
        });
      }
    }

    ctx.fillStyle = "#000000";
    ctx.font = `${Math.round(10 * dpr)}px 'Silkscreen', monospace`;
    ctx.fillText(rwy.label1, p1.x - 30 * dpr, p1.y + 4 * dpr);
    ctx.fillText(rwy.label2, p2.x + 10 * dpr, p2.y + 4 * dpr);
    ctx.restore();
  }

  function drawRegionGeography(dpr, pixelsPerKm) {
    ctx.save();

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(1.8 * dpr, 0.040 * pixelsPerKm * dpr);
    ctx.setLineDash([4 * dpr, 2 * dpr]);
    ctx.beginPath();
    ISAR_PATH.forEach((pt, idx) => {
      const p = geoToCanvas(pt[0], pt[1]);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    if (currentKmSpan >= 20.0) {
      const pIsar = geoToCanvas(48.250, 11.660);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(pIsar.x - 2 * dpr, pIsar.y - 10 * dpr, 28 * dpr, 11 * dpr);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(pIsar.x - 2 * dpr, pIsar.y - 10 * dpr, 28 * dpr, 11 * dpr);
      ctx.fillStyle = "#000000";
      ctx.font = `${Math.round(7.5 * dpr)}px 'Silkscreen', monospace`;
      ctx.fillText("ISAR", pIsar.x + 2 * dpr, pIsar.y - 2 * dpr);
    }

    const lakeDither = createDitherPattern("apron");
    REGION_LAKES.forEach(lake => {
      ctx.beginPath();
      lake.poly.forEach((pt, idx) => {
        const p = geoToCanvas(pt[0], pt[1]);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = lakeDither;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      if (currentKmSpan >= 25.0) {
        const pLabel = geoToCanvas(lake.labelPos[0], lake.labelPos[1]);
        ctx.fillStyle = "#ffffff";
        const fSize = Math.round(7.5 * dpr);
        ctx.font = `${fSize}px 'Silkscreen', monospace`;
        const tLen = ctx.measureText(lake.name).width;
        ctx.fillRect(pLabel.x - 2 * dpr, pLabel.y - fSize - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(pLabel.x - 2 * dpr, pLabel.y - fSize - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
        ctx.fillStyle = "#000000";
        ctx.fillText(lake.name, pLabel.x, pLabel.y - 1 * dpr);
      }
    });

    REGION_AIRPORTS.forEach(ap => {
      const p = geoToCanvas(ap.lat, ap.lon);
      const arm = 5 * dpr;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(p.x - arm, p.y);
      ctx.lineTo(p.x + arm, p.y);
      ctx.moveTo(p.x, p.y - arm);
      ctx.lineTo(p.x, p.y + arm);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      const fSize = Math.round(7.5 * dpr);
      ctx.font = `${fSize}px 'Silkscreen', monospace`;
      const tLen = ctx.measureText(ap.name).width;
      ctx.fillRect(p.x + 8 * dpr, p.y - 8 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(p.x + 8 * dpr, p.y - 8 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
      ctx.fillStyle = "#000000";
      ctx.fillText(ap.name, p.x + 10 * dpr, p.y + 1 * dpr);
    });

    REGION_CITIES.forEach(city => {
      if (currentKmSpan < 25.0 && !city.isMajor && city.name !== "FREISING" && city.name !== "ERDING") {
        return;
      }

      const p = geoToCanvas(city.lat, city.lon);
      const boxSize = city.isMajor ? 7 * dpr : 5 * dpr;

      ctx.fillStyle = "#000000";
      ctx.fillRect(p.x - boxSize / 2, p.y - boxSize / 2, boxSize, boxSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x - (boxSize - 4 * dpr) / 2, p.y - (boxSize - 4 * dpr) / 2, boxSize - 4 * dpr, boxSize - 4 * dpr);

      ctx.fillStyle = "#ffffff";
      const fSize = Math.round((city.isMajor ? 8.5 : 7.5) * dpr);
      ctx.font = `${fSize}px 'Silkscreen', monospace`;
      const tLen = ctx.measureText(city.name).width;
      ctx.fillRect(p.x + 6 * dpr, p.y - fSize / 2 - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(p.x + 6 * dpr, p.y - fSize / 2 - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
      ctx.fillStyle = "#000000";
      ctx.fillText(city.name, p.x + 8 * dpr, p.y + fSize / 2 - 2 * dpr);
    });

    ctx.restore();
  }

  // Main Radar Canvas Rendering
  function drawRadar() {
    const nowTs = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const centerPos = geoToCanvas(EDDM_LAT, EDDM_LON);
    const pixelsPerKm = ((Math.min(w, h) / dpr) / 2 / currentKmSpan) * dpr;

    // 1. Radar Distance Rings & Grid
    let rings = [2, 5, 10, 20];
    if (currentKmSpan <= 2) {
      rings = [0.5, 1, 2];
    } else if (currentKmSpan >= 45) {
      rings = [20, 40, 60, 80];
    }
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([2 * dpr, 4 * dpr]);

    rings.forEach(radiusKm => {
      const radiusPx = radiusKm * pixelsPerKm;
      if (radiusPx < Math.max(w, h)) {
        ctx.beginPath();
        ctx.arc(centerPos.x, centerPos.y, radiusPx, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = `${Math.round(8 * dpr)}px 'Silkscreen', monospace`;
        const label = radiusKm < 1 ? `${radiusKm * 1000}M` : `${radiusKm}KM`;
        ctx.fillText(label, centerPos.x + 4 * dpr, centerPos.y - radiusPx + 10 * dpr);
      }
    });

    ctx.beginPath();
    ctx.moveTo(centerPos.x, 0);
    ctx.lineTo(centerPos.x, h);
    ctx.moveTo(0, centerPos.y);
    ctx.lineTo(w, centerPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (currentKmSpan >= 10.0) {
      drawRegionGeography(dpr, pixelsPerKm);
    }

    // 2. Aprons
    const apronDither = createDitherPattern("apron");
    APRONS.forEach(apron => {
      ctx.beginPath();
      apron.forEach((pt, idx) => {
        const p = geoToCanvas(pt[0], pt[1]);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = apronDither;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
    });

    if (currentKmSpan < 2.5) {
      ctx.save();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      for (let stLat = 48.3515; stLat <= 48.3575; stLat += 0.0012) {
        const pStand1 = geoToCanvas(stLat, 11.7645);
        const pStand2 = geoToCanvas(stLat, 11.7675);
        ctx.beginPath();
        ctx.moveTo(pStand1.x, pStand1.y);
        ctx.lineTo(pStand2.x, pStand2.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 3. Rapid Exit Taxiways
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2 * dpr, 0.024 * pixelsPerKm * dpr);
    RAPID_EXITS.forEach(re => {
      const p1 = geoToCanvas(re[0][0], re[0][1]);
      const p2 = geoToCanvas(re[1][0], re[1][1]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // 4. Main Taxiway Network
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2 * dpr, 0.024 * pixelsPerKm * dpr);
    TAXIWAYS.forEach(way => {
      ctx.beginPath();
      way.forEach((pt, idx) => {
        const p = geoToCanvas(pt[0], pt[1]);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    // 5. Taxiway Bridges
    TAXIWAY_BRIDGES.forEach(bridge => {
      const p = geoToCanvas(bridge.lat, bridge.lon);
      const bw = bridge.w * pixelsPerKm * dpr;
      const bh = bridge.h * pixelsPerKm * dpr;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);

      ctx.beginPath();
      ctx.moveTo(p.x - bw / 2, p.y - bh / 2);
      ctx.lineTo(p.x + bw / 2, p.y - bh / 2);
      ctx.moveTo(p.x - bw / 2, p.y + bh / 2);
      ctx.lineTo(p.x + bw / 2, p.y + bh / 2);
      ctx.stroke();

      if (currentKmSpan < 4.0) {
        ctx.fillStyle = "#000000";
        ctx.font = `${Math.round(7.5 * dpr)}px 'Silkscreen', monospace`;
        ctx.fillText(bridge.name, p.x - 28 * dpr, p.y - bh / 2 - 4 * dpr);
      }
    });

    // 6. Runways
    RUNWAYS.forEach(rwy => drawRunwayDetailed(rwy, dpr, pixelsPerKm));

    // 7. Buildings
    const bldgDither = createDitherPattern("building");
    BUILDINGS.forEach(bldg => {
      ctx.beginPath();
      bldg.poly.forEach((pt, idx) => {
        const p = geoToCanvas(pt[0], pt[1]);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = bldgDither;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();

      if (currentKmSpan < 5.0 && bldg.label) {
        const pFirst = geoToCanvas(bldg.poly[0][0], bldg.poly[0][1]);
        ctx.fillStyle = "#ffffff";
        const fSize = Math.round(7.5 * dpr);
        ctx.font = `${fSize}px 'Silkscreen', monospace`;
        const tLen = ctx.measureText(bldg.label).width;
        ctx.fillRect(pFirst.x - 2 * dpr, pFirst.y - fSize - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(pFirst.x - 2 * dpr, pFirst.y - fSize - 2 * dpr, tLen + 4 * dpr, fSize + 4 * dpr);
        ctx.fillStyle = "#000000";
        ctx.fillText(bldg.label, pFirst.x, pFirst.y - 1 * dpr);
      }
    });

    // 8. Tower Icon & Marker
    const twrPos = geoToCanvas(EDDM_LAT, 11.7870);
    ctx.fillStyle = "#000000";
    ctx.fillRect(twrPos.x - 5 * dpr, twrPos.y - 5 * dpr, 10 * dpr, 10 * dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(twrPos.x - 2.5 * dpr, twrPos.y - 2.5 * dpr, 5 * dpr, 5 * dpr);
    ctx.fillStyle = "#000000";
    ctx.font = `${Math.round(8.5 * dpr)}px 'Silkscreen', monospace`;
    ctx.fillText("TOWER", twrPos.x + 8 * dpr, twrPos.y + 3 * dpr);

    // 9. Aircraft Rendering (Interpolated 60 FPS positions)
    const isThemeDark = document.body.classList.contains("theme-dark");

    aircraftList.forEach(ac => {
      if (ac.lat == null || ac.lon == null) return;
      const interp = getInterpolatedCoords(ac, nowTs);
      const pos = geoToCanvas(interp.lat, interp.lon);

      ac._screenX = pos.rawX;
      ac._screenY = pos.rawY;

      const isSelected = selectedAircraft && selectedAircraft.icao24 === ac.icao24;

      // Dashed Heading / Track Vector for Selected Aircraft
      if (isSelected && ac.heading != null) {
        const headingRad = (ac.heading * Math.PI) / 180;
        const vecLen = Math.min(Math.max(w, h) * 0.45, 220 * dpr);
        ctx.save();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(
          pos.x + Math.sin(headingRad) * vecLen,
          pos.y - Math.cos(headingRad) * vecLen
        );
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(pos.x, pos.y);

      const headingRad = ((ac.heading != null ? ac.heading : 0) * Math.PI) / 180;
      ctx.rotate(headingRad);

      const planeColor = ac.onGround
        ? (isThemeDark ? "#74ffff" : "#8B0000")
        : "#000000";

      ctx.fillStyle = planeColor;

      // Top-Down Aircraft Silhouette
      ctx.fillRect(-1.5 * dpr, -9 * dpr, 3 * dpr, 18 * dpr);
      ctx.fillRect(-8 * dpr, -2 * dpr, 16 * dpr, 3 * dpr);
      ctx.fillRect(-6 * dpr, -3 * dpr, 12 * dpr, 1 * dpr);
      ctx.fillRect(-4 * dpr, 6 * dpr, 8 * dpr, 2 * dpr);
      ctx.fillRect(-0.75 * dpr, 4 * dpr, 1.5 * dpr, 4 * dpr);
      ctx.fillRect(-0.75 * dpr, -10 * dpr, 1.5 * dpr, 1.5 * dpr);

      if (ac.onGround) {
        ctx.fillStyle = isThemeDark ? "#000000" : "#ffffff";
        ctx.fillRect(-1 * dpr, -1 * dpr, 2 * dpr, 2 * dpr);
      }

      ctx.restore();

      // Callsign ONLY beside aircraft
      const callsignText = ac.callsign || "N/A";
      ctx.font = `${Math.round(8.5 * dpr)}px 'Silkscreen', monospace`;
      const textWidth = ctx.measureText(callsignText).width;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(pos.x + 8 * dpr, pos.y - 10 * dpr, textWidth + 4 * dpr, 12 * dpr);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(pos.x + 8 * dpr, pos.y - 10 * dpr, textWidth + 4 * dpr, 12 * dpr);

      ctx.fillStyle = "#000000";
      ctx.fillText(callsignText, pos.x + 10 * dpr, pos.y - 1 * dpr);

      if (isSelected) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([2 * dpr, 2 * dpr]);
        ctx.strokeRect(pos.x - 12 * dpr, pos.y - 12 * dpr, 24 * dpr, 24 * dpr);
        ctx.setLineDash([]);
      }
    });

    // 10. Dynamic Scale Bar (Bottom Right)
    drawScaleBar(dpr, w, h, pixelsPerKm);
  }

  // 60 FPS Render Loop
  function startRenderLoop() {
    if (animFrameId) return;
    const step = () => {
      drawRadar();
      animFrameId = requestAnimationFrame(step);
    };
    animFrameId = requestAnimationFrame(step);
  }

  function drawScaleBar(dpr, w, h, pixelsPerKm) {
    let scaleKm = 0.5;
    let label = "500 M";

    if (currentKmSpan <= 1.5) {
      scaleKm = 0.25;
      label = "250 M";
    } else if (currentKmSpan <= 3.5) {
      scaleKm = 0.5;
      label = "500 M";
    } else if (currentKmSpan <= 10) {
      scaleKm = 2.0;
      label = "2 KM";
    } else {
      scaleKm = 5.0;
      label = "5 KM";
    }

    const scaleLenPx = scaleKm * pixelsPerKm;
    const barX = w - scaleLenPx - 20 * dpr;
    const barY = h - 22 * dpr;

    ctx.save();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(barX, barY - 4 * dpr);
    ctx.lineTo(barX, barY);
    ctx.lineTo(barX + scaleLenPx, barY);
    ctx.lineTo(barX + scaleLenPx, barY - 4 * dpr);
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.font = `${Math.round(8 * dpr)}px 'Silkscreen', monospace`;
    ctx.textAlign = "center";
    ctx.fillText(label, barX + scaleLenPx / 2, barY - 6 * dpr);
    ctx.restore();
  }

  function showOverlay(title, text) {
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.textContent = text;
    if (overlayMsg) overlayMsg.hidden = false;
  }

  function hideOverlay() {
    if (overlayMsg) overlayMsg.hidden = true;
  }

  // ==========================================
  // LIVE API (Dedicated Cloudflare Worker - 1s Active / 15s Background)
  // ==========================================
  const RADAR_API_URL = "https://radar.fwolfph.workers.dev/";

  const ICAO_NAMES = {
    "A359": "AIRBUS A350-900",
    "A35K": "AIRBUS A350-1000",
    "B788": "BOEING 787-8 DREAMLINER",
    "B789": "BOEING 787-9 DREAMLINER",
    "B78X": "BOEING 787-10 DREAMLINER",
    "B77W": "BOEING 777-300ER",
    "B77L": "BOEING 777-200LR / FREIGHTER",
    "A332": "AIRBUS A330-200",
    "A333": "AIRBUS A330-300",
    "A339": "AIRBUS A330-900NEO",
    "A388": "AIRBUS A380-800",
    "B744": "BOEING 747-400",
    "B748": "BOEING 747-8I",
    "A319": "AIRBUS A319",
    "A320": "AIRBUS A320",
    "A20N": "AIRBUS A320NEO",
    "A321": "AIRBUS A321",
    "A21N": "AIRBUS A321NEO",
    "B738": "BOEING 737-800",
    "B38M": "BOEING 737 MAX 8",
    "B39M": "BOEING 737 MAX 9",
    "BCS1": "AIRBUS A220-100",
    "BCS3": "AIRBUS A220-300",
    "CRJ9": "BOMBARDIER CRJ-900",
    "E190": "EMBRAER E190",
    "E195": "EMBRAER E195",
    "E295": "EMBRAER E195-E2",
    "AT76": "ATR 72-600",
    "DH8D": "DE HAVILLAND DASH 8-400"
  };

  async function fetchLiveAircraft() {
    if (isFetching) return;
    isFetching = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(RADAR_API_URL, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText || ""}`.trim());
      }

      const data = await resp.json();
      const acArray = data && (Array.isArray(data.ac) ? data.ac : (Array.isArray(data.aircraft) ? data.aircraft : null));
      if (!Array.isArray(acArray)) {
        throw new Error("Kein gültiges 'ac'-Array in Worker-Antwort");
      }

      const prevMap = new Map(aircraftList.map(a => [a.icao24, a]));
      const nowTs = performance.now();

      const filteredAc = acArray.filter(ac => {
        if (!ac) return false;
        if (ac.category === "C0") return false;
        if (ac.type === "adsb_icao_nt") return false;
        const r = (ac.r || "").toUpperCase();
        const cs = (ac.flight || "").toUpperCase();
        if (r === "TWR" || cs.startsWith("TXLU")) return false;
        return true;
      });

      const rawAircraft = filteredAc.map(ac => {
        const icao24 = String(ac.hex || "").trim().toLowerCase();
        const onGround = ac.alt_baro === "ground" || Number(ac.gs || 0) < 35;
        const altitude = ac.alt_baro === "ground" ? 0 : Math.round(Number(ac.alt_baro || ac.alt_geom || 0));
        const typeCode = (ac.t || "").toUpperCase();
        const derivedDesc = ac.desc || ICAO_NAMES[typeCode] || (typeCode ? `TYP ${typeCode}` : "UNBEKANNTER TYP");
        const newLat = Number(ac.lat);
        const newLon = Number(ac.lon);

        const prev = prevMap.get(icao24);
        let blendFromLat = null;
        let blendFromLon = null;
        let blendStartTs = null;

        if (prev && prev._renderLat != null && prev._renderLon != null) {
          blendFromLat = prev._renderLat;
          blendFromLon = prev._renderLon;
          blendStartTs = nowTs;
        }

        return {
          icao24: icao24,
          callsign: (ac.flight || ac.r || ac.hex || "N/A").trim(),
          lat: newLat,
          lon: newLon,
          lastUpdateTs: nowTs,
          _renderLat: blendFromLat != null ? blendFromLat : newLat,
          _renderLon: blendFromLon != null ? blendFromLon : newLon,
          _blendFromLat: blendFromLat,
          _blendFromLon: blendFromLon,
          _blendStartTs: blendStartTs,
          _hexData: prev ? prev._hexData : null,
          altitude: altitude,
          baroAltitude: altitude / 3.28084,
          onGround: onGround,
          velocity: Math.round(Number(ac.gs || 0)),
          heading: Math.round(Number(ac.track || ac.true_heading || 0)),
          verticalRate: Math.round(Number(ac.baro_rate || ac.geom_rate || 0)),
          squawk: ac.squawk || "----",
          aircraftTypeCode: typeCode,
          aircraftDesc: derivedDesc,
          registration: ac.r || "----",
          operator: ac.ownOp || "UNBEKANNT",
          country: ac.ownOp || "UNBEKANNT"
        };
      }).filter(a => !isNaN(a.lat) && !isNaN(a.lon));

      if (rawAircraft.length === 0) {
        aircraftList = [];
        if (liveCountElem) liveCountElem.textContent = "0 FLIEGER";
        showOverlay(
          "INFO // AKTUELL KEINE FLUGZEUGE IM RADARBEREICH",
          "Im Moment senden keine echten Flugzeuge im Umkreis von EDDM / München ADS-B Signale."
        );
        return;
      }

      hideOverlay();
      aircraftList = rawAircraft;

      if (liveCountElem) liveCountElem.textContent = `${aircraftList.length} FLIEGER`;
      if (lastUpdateElem) {
        const d = new Date();
        lastUpdateElem.textContent = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }

      if (selectedAircraft) {
        const updated = aircraftList.find(a => a.icao24 === selectedAircraft.icao24);
        if (updated) {
          selectedAircraft = { ...selectedAircraft, ...updated };
          updateCardContent(selectedAircraft);
        }
      }
    } catch (err) {
      console.warn("[MUC-RADAR] Fehler beim Laden der Live-Daten:", err);
      if (aircraftList.length === 0) {
        if (liveCountElem) liveCountElem.textContent = "OFFLINE";
        showOverlay(
          "ERR // API-VERBINDUNG FEHLGESCHLAGEN – KEINE LIVE-DATEN VERFÜGBAR",
          `Worker-Abfrage fehlgeschlagen (${err.message}). Prüfe F12 Konsole auf Netzwerkfehler.`
        );
      }
    } finally {
      isFetching = false;
    }
  }

  // Dynamic Polling Timer (1000ms active tab -> max 86,400 req/day < 100k limit; 15000ms hidden tab)
  function restartPolling() {
    if (fetchTimer) {
      clearInterval(fetchTimer);
      fetchTimer = null;
    }
    const intervalMs = document.hidden ? 15000 : 1000;
    fetchTimer = setInterval(fetchLiveAircraft, intervalMs);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      fetchLiveAircraft();
    }
    restartPolling();
  });

  // ==========================================
  // PANNING & ZOOMING INTERACTION
  // ==========================================
  container.addEventListener("mousedown", (e) => {
    isDragging = true;
    hasDragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panOffsetX;
    dragStartPanY = panOffsetY;
    container.classList.add("panning");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dxPx = e.clientX - dragStartX;
    const dyPx = e.clientY - dragStartY;

    if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
      hasDragged = true;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const pixelsPerKm = (Math.min(w, h) / 2) / currentKmSpan;

    panOffsetX = dragStartPanX + dxPx / pixelsPerKm;
    panOffsetY = dragStartPanY - dyPx / pixelsPerKm;
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      container.classList.remove("panning");
    }
  });

  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.25 : 0.8;
    currentKmSpan = Math.max(0.5, Math.min(100.0, currentKmSpan * zoomFactor));
    updateZoomButtons();
  }, { passive: false });

  let touchStartDist = 0;
  let touchStartSpan = 0;

  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      hasDragged = false;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragStartPanX = panOffsetX;
      dragStartPanY = panOffsetY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.sqrt(dx * dx + dy * dy);
      touchStartSpan = currentKmSpan;
    }
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && isDragging) {
      const dxPx = e.touches[0].clientX - dragStartX;
      const dyPx = e.touches[0].clientY - dragStartY;
      if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) hasDragged = true;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const pixelsPerKm = (Math.min(w, h) / 2) / currentKmSpan;

      panOffsetX = dragStartPanX + dxPx / pixelsPerKm;
      panOffsetY = dragStartPanY - dyPx / pixelsPerKm;
    } else if (e.touches.length === 2 && touchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = touchStartDist / dist;
      currentKmSpan = Math.max(0.5, Math.min(100.0, touchStartSpan * factor));
      updateZoomButtons();
    }
  }, { passive: true });

  container.addEventListener("touchend", () => {
    isDragging = false;
    touchStartDist = 0;
  });

  canvas.addEventListener("click", (e) => {
    if (hasDragged) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let hit = null;
    let minD = 24;

    aircraftList.forEach(ac => {
      if (ac._screenX == null || ac._screenY == null) return;
      const dx = ac._screenX - clickX;
      const dy = ac._screenY - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minD) {
        minD = dist;
        hit = ac;
      }
    });

    if (hit) {
      openPokemonCard(hit);
    } else {
      selectedAircraft = null;
    }
  });

  function updateZoomButtons() {
    [zoomBtn0, zoomBtn1, zoomBtn2, zoomBtn3, zoomBtn4].forEach((btn, i) => {
      if (!btn) return;
      const preset = ZOOM_PRESETS[i];
      const match = Math.abs(currentKmSpan - preset.kmSpan) < 0.3;
      btn.classList.toggle("active", match);
    });
  }

  function setPresetZoom(idx) {
    currentKmSpan = ZOOM_PRESETS[idx].kmSpan;
    panOffsetX = 0;
    panOffsetY = 0;
    updateZoomButtons();
  }

  if (zoomBtn0) zoomBtn0.addEventListener("click", () => setPresetZoom(0));
  if (zoomBtn1) zoomBtn1.addEventListener("click", () => setPresetZoom(1));
  if (zoomBtn2) zoomBtn2.addEventListener("click", () => setPresetZoom(2));
  if (zoomBtn3) zoomBtn3.addEventListener("click", () => setPresetZoom(3));
  if (zoomBtn4) zoomBtn4.addEventListener("click", () => setPresetZoom(4));

  if (resetPanBtn) {
    resetPanBtn.addEventListener("click", () => {
      panOffsetX = 0;
      panOffsetY = 0;
      setPresetZoom(0);
    });
  }

  if (overlayRetryBtn) overlayRetryBtn.addEventListener("click", () => fetchLiveAircraft());

  // ==========================================
  // POKÉMON CARD, ROUTES & SPRITES
  // ==========================================
  const ICAO_TO_IATA = {
    "EDDM": "MUC", "EDDF": "FRA", "EDDB": "BER", "EDDH": "HAM", "EDDL": "DUS",
    "EDDK": "CGN", "EDDS": "STR", "EDDN": "NUE", "EDDW": "BRE", "EDDV": "HAJ",
    "EDDP": "LEJ", "EDDC": "DRS", "LOWW": "VIE", "LOWI": "INN", "LOWS": "SZG",
    "LSZH": "ZRH", "LSGG": "GVA", "EGLL": "LHR", "EGKK": "LGW", "EGSS": "STN",
    "EGCC": "MAN", "EIDW": "DUB", "LFPG": "CDG", "LFPO": "ORY", "LFMN": "NCE",
    "LFLL": "LYS", "EHAM": "AMS", "EBBR": "BRU", "ELLX": "LUX", "LEMD": "MAD",
    "LEBL": "BCN", "LEPA": "PMI", "LEMG": "AGP", "LPPT": "LIS", "LPPR": "OPO",
    "LIRF": "FCO", "LIMC": "MXP", "LIML": "LIN", "LIPZ": "VCE", "LIRN": "NAP",
    "LGAV": "ATH", "LGTS": "SKG", "LTFM": "IST", "LTFJ": "SAW", "LTAI": "AYT",
    "EKCH": "CPH", "ESSA": "ARN", "ENGM": "OSL", "EFHK": "HEL", "EPWA": "WAW",
    "LKPR": "PRG", "LHBP": "BUD", "LROP": "OTP", "LBSF": "SOF", "LDZA": "ZAG",
    "OTHH": "DOH", "OMDB": "DXB", "OMAA": "AUH", "OEJN": "JED", "OERK": "RUH",
    "LLBG": "TLV", "HECA": "CAI", "GMMN": "CMN", "KJFK": "JFK", "KEWR": "EWR",
    "KBOS": "BOS", "KIAD": "IAD", "KORD": "ORD", "KATL": "ATL", "KIAH": "IAH",
    "KDEN": "DEN", "KLAX": "LAX", "KSFO": "SFO", "KSEA": "SEA", "KMIA": "MIA",
    "KCLT": "CLT", "CYYZ": "YYZ", "CYUL": "YUL", "CYVR": "YVR", "SBGR": "GRU",
    "FAOR": "JNB", "FACT": "CPT", "RJTT": "HND", "RJAA": "NRT", "RKSI": "ICN",
    "ZSPD": "PVG", "ZBAA": "PEK", "VHHH": "HKG", "WSSS": "SIN", "VTBS": "BKK",
    "VIDP": "DEL", "VABB": "BOM"
  };

  function formatAirportCode(code) {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) return "";
    if (clean.length === 4 && ICAO_TO_IATA[clean]) {
      return `${ICAO_TO_IATA[clean]} (${clean})`;
    }
    return clean;
  }

  function categorizeAircraft(typeCode, typeDesc, callsign) {
    const code = (typeCode || "").toUpperCase();
    const desc = (typeDesc || "").toUpperCase();
    const cs = (callsign || "").toUpperCase();

    if (code.startsWith("EC") || code.startsWith("H1") || code.startsWith("A139") || desc.includes("HELICOPTER") || cs.startsWith("CHX") || cs.startsWith("SAR")) {
      return { category: 6, label: "HELIKOPTER", name: typeDesc || "HELIKOPTER" };
    }

    const quadCodes = ["A388", "B744", "B748", "A343", "A346", "A380", "B747"];
    if (quadCodes.includes(code) || code.startsWith("A38") || code.startsWith("B74") || desc.includes("A380") || desc.includes("747")) {
      return { category: 1, label: "QUAD-JET WIDEBODY", name: typeDesc || "AIRBUS A380 / BOEING 747" };
    }

    const widebodyCodes = ["A359", "A35K", "B788", "B789", "B78X", "B77W", "B77L", "A332", "A333", "A339", "B772", "B773", "B763", "B764"];
    if (widebodyCodes.includes(code) || code.startsWith("A35") || code.startsWith("A33") || code.startsWith("B77") || code.startsWith("B78") || desc.includes("A350") || desc.includes("A330") || desc.includes("777") || desc.includes("787")) {
      return { category: 2, label: "TWIN-JET WIDEBODY", name: typeDesc || "LANGSTRECKEN-JET" };
    }

    const regionalCodes = ["CRJ9", "CRJ7", "CRJ1", "CRJ2", "E190", "E195", "E295", "E170", "E175", "E75L", "C560", "C680", "CL35", "CL60"];
    if (regionalCodes.includes(code) || code.startsWith("CRJ") || code.startsWith("E1") || code.startsWith("E2") || desc.includes("EMBRAER") || desc.includes("BOMBARDIER") || desc.includes("CRJ")) {
      return { category: 4, label: "REGIONAL-JET", name: typeDesc || "REGIONALJET" };
    }

    const turbopropCodes = ["AT76", "AT72", "AT45", "AT46", "DH8D", "DH8C", "C172", "C182", "BE20", "PC12"];
    if (turbopropCodes.includes(code) || code.startsWith("AT7") || code.startsWith("AT4") || code.startsWith("DH8") || desc.includes("PROP") || desc.includes("TURBOPROP")) {
      return { category: 5, label: "TURBOPROP / PROPELLER", name: typeDesc || "TURBOPROP-FLUGZEUG" };
    }

    return { category: 3, label: "STANDARD NARROWBODY", name: typeDesc || "AIRBUS A320 / BOEING 737" };
  }

  const SPECIAL_LIVERIES = {
    "D-AIDV": "RETRO LIVERY (LUFTHANSA)",
    "D-ABYT": "RETRO LIVERY (LUFTHANSA)",
    "D-AIKQ": "FANHANSA",
    "D-AIUA": "STAR ALLIANCE",
    "D-AIZM": "STAR ALLIANCE",
    "D-AIBM": "STAR ALLIANCE",
    "D-AIMC": "STAR ALLIANCE",
    "D-AIEQ": "LOVEHANSA",
    "A7-BAA": "ONEWORLD / FIFA",
    "JA381A": "FLYING HONU (BLUE)",
    "JA382A": "FLYING HONU (EMERALD)",
    "JA383A": "FLYING HONU (ORANGE)",
    "A6-EEU": "EMIRATES EXPO",
    "A6-EOT": "EMIRATES SPECIAL",
    "A6-EOA": "EMIRATES SPECIAL",
    "TC-LNA": "TURKISH UEFA CHAMPIONS LEAGUE",
    "TC-JRG": "TURKISH RETRO"
  };

  function detectKnownSpecialLivery(reg) {
    if (!reg || reg === "----") return null;
    const cleanReg = reg.toUpperCase().trim();
    if (SPECIAL_LIVERIES[cleanReg]) return SPECIAL_LIVERIES[cleanReg];
    const noDash = cleanReg.replace(/-/g, "");
    if (SPECIAL_LIVERIES[noDash]) return SPECIAL_LIVERIES[noDash];

    if (cleanReg.startsWith("D-ANR") || (noDash.length === 5 && noDash.startsWith("DANR"))) {
      return "CONDOR BEACH-STRIPES";
    }
    return null;
  }

  function getPixelArtSvg(catId) {
    switch (catId) {
      case 1:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M14 44l30-40h14l-20 40h-24z"/>
          <path fill="currentColor" d="M12 40h10v4h-10z"/>
          <path fill="currentColor" d="M30 40h104l14 4 8 10-6 4H26l-8-6 12-12z"/>
          <path fill="currentColor" d="M136 44h14l4 4-2 2h-16z"/>
          <path fill="#ffffff" d="M42 42h88v2H42zm0 6h88v2H42z"/>
          <path fill="currentColor" d="M42 42h88v2H42zm0 6h88v2H42z"/>
          <path fill="currentColor" d="M54 58h56l-10 5H46l8-5zm54-4h4v6h-4z"/>
          <path fill="currentColor" d="M58 56h12v10H58zm18 0h12v10H76zm20 0h12v10H96zm18 0h10v9h-10z"/>
          <rect x="28" y="56" width="102" height="2" fill="currentColor"/>
          <rect x="34" y="58" width="88" height="1" fill="currentColor"/>
        </svg>`;

      case 2:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M18 44l26-36h14l-18 36h-22z"/>
          <path fill="currentColor" d="M14 42h8v2h-8z"/>
          <path fill="currentColor" d="M34 42h102l14 3 8 9-6 4H30l-8-6 12-10z"/>
          <path fill="currentColor" d="M138 43h12l4 4-2 2h-14z"/>
          <path fill="currentColor" d="M40 46h94v2H40z"/>
          <path fill="currentColor" d="M60 56h54l-12 5H52l8-5zm52-6h3v8h-3z"/>
          <path fill="currentColor" d="M68 54h18v12H68zm26 0h18v12H94z"/>
          <rect x="34" y="56" width="98" height="2" fill="currentColor"/>
          <rect x="42" y="58" width="80" height="1" fill="currentColor"/>
        </svg>`;

      case 4:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M20 44l22-34h12l-14 34h-20z"/>
          <path fill="currentColor" d="M30 10h28v4H30z"/>
          <path fill="currentColor" d="M32 44h106l12 3 6 7-5 4H28l-6-5 10-9z"/>
          <path fill="currentColor" d="M138 45h10l3 3-2 2h-11z"/>
          <path fill="currentColor" d="M44 48h88v2H44z"/>
          <path fill="currentColor" d="M36 40h16v8H36zm0 10h16v6H36z"/>
          <path fill="currentColor" d="M68 56h44l-8 4H62l6-4zm42-5h3v6h-3z"/>
          <rect x="32" y="56" width="98" height="2" fill="currentColor"/>
        </svg>`;

      case 5:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M22 44l24-34h12l-14 34h-22z"/>
          <path fill="currentColor" d="M34 10h24v4H34z"/>
          <path fill="currentColor" d="M36 42h100l12 4 8 8-6 4H32l-8-6 12-10z"/>
          <path fill="currentColor" d="M136 44h12l4 4-2 2h-14z"/>
          <path fill="currentColor" d="M44 46h86v2H44z"/>
          <path fill="currentColor" d="M58 38h64v5H58z"/>
          <path fill="currentColor" d="M72 36h14v16H72zm30 0h14v16h-14z"/>
          <path fill="currentColor" d="M78 26h2v34h-2zm30 0h2v34h-2z"/>
          <rect x="34" y="56" width="96" height="2" fill="currentColor"/>
        </svg>`;

      case 6:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M18 16h124v3H18zm58 3h8v10h-8z"/>
          <path fill="currentColor" d="M62 29h62l14 6 6 12-8 7H60l-8-8 10-17z"/>
          <path fill="currentColor" d="M118 31h18l4 6-2 6h-20z"/>
          <path fill="currentColor" d="M72 36h40v4H72zm0 6h40v4H72z"/>
          <path fill="currentColor" d="M22 36h40v7H22zm-8-12h8v24h-8z"/>
          <path fill="currentColor" d="M10 20h4v28h-4z"/>
          <path fill="currentColor" d="M56 61h72v4H56zm16-7h4v7h-4zm36 0h4v7h-4z"/>
        </svg>`;

      case 3:
      default:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <path fill="currentColor" d="M20 44l24-34h14l-16 34h-22z"/>
          <path fill="currentColor" d="M16 42h8v2h-8z"/>
          <path fill="currentColor" d="M34 43h102l12 3 8 8-6 4H30l-8-5 12-10z"/>
          <path fill="currentColor" d="M136 44h12l4 4-2 2h-14z"/>
          <path fill="currentColor" d="M42 47h88v2H42z"/>
          <path fill="currentColor" d="M62 56h48l-10 5H56l6-5zm46-6h3v8h-3z"/>
          <path fill="currentColor" d="M70 54h14v11H70zm22 0h14v11H92z"/>
          <rect x="34" y="56" width="96" height="2" fill="currentColor"/>
          <rect x="42" y="58" width="76" height="1" fill="currentColor"/>
        </svg>`;
    }
  }

  let currentRouteCallsign = null;

  // Two-stage route lookup: 1) Cloudflare Worker /route (adsb.lol) -> 2) hexdb.io fallback
  async function fetchFlightRoute(aircraft) {
    const routeTextEl = document.getElementById("poke-route-text");
    if (!routeTextEl) return;

    const cleanCallsign = (aircraft.callsign || "").trim().toUpperCase();
    const regClean = (aircraft.registration || "").trim().toUpperCase();

    if (!cleanCallsign || cleanCallsign === "N/A" || cleanCallsign === regClean || cleanCallsign.startsWith("HEX ")) {
      routeTextEl.textContent = "ROUTE NICHT VERFÜGBAR";
      return;
    }

    if (routeCache.has(cleanCallsign)) {
      routeTextEl.textContent = routeCache.get(cleanCallsign);
      return;
    }

    currentRouteCallsign = cleanCallsign;
    routeTextEl.textContent = "ROUTE WIRD ERMITTELT...";

    let resolvedRoute = "";

    // Stage 1: Cloudflare Worker /route (adsb.lol routeset)
    try {
      const resp = await fetch("https://radar.fwolfph.workers.dev/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planes: [
            {
              callsign: cleanCallsign,
              lat: aircraft.lat || EDDM_LAT,
              lng: aircraft.lon || EDDM_LON
            }
          ]
        })
      });

      if (resp.ok) {
        const text = await resp.text();
        let parsed = null;
        if (text && text.trim().length > 0) {
          try {
            parsed = JSON.parse(text);
          } catch (_) {}
        }

        const item = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : (parsed && typeof parsed === "object" ? parsed : null);
        if (item) {
          if (Array.isArray(item._airports) && item._airports.length >= 2) {
            const orig = item._airports[0].iata || item._airports[0].icao || "";
            const dest = item._airports[item._airports.length - 1].iata || item._airports[item._airports.length - 1].icao || "";
            if (orig && dest) resolvedRoute = `${formatAirportCode(orig)} ✈ ${formatAirportCode(dest)}`;
          } else if (Array.isArray(item.airport_route) && item.airport_route.length >= 2) {
            resolvedRoute = `${formatAirportCode(item.airport_route[0])} ✈ ${formatAirportCode(item.airport_route[item.airport_route.length - 1])}`;
          } else if (item.origin && item.destination) {
            resolvedRoute = `${formatAirportCode(item.origin)} ✈ ${formatAirportCode(item.destination)}`;
          } else if (item.from && item.to) {
            resolvedRoute = `${formatAirportCode(item.from)} ✈ ${formatAirportCode(item.to)}`;
          } else if (typeof item.route === "string" && item.route.includes("-")) {
            const parts = item.route.split("-").map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              resolvedRoute = `${formatAirportCode(parts[0])} ✈ ${formatAirportCode(parts[parts.length - 1])}`;
            }
          }
        }
      }
    } catch (_) {}

    // Stage 2: Fallback via free hexdb.io ICAO route API
    if (!resolvedRoute) {
      try {
        const hexResp = await fetch(`https://hexdb.io/api/v1/route/icao/${encodeURIComponent(cleanCallsign)}`);
        if (hexResp.ok) {
          const hexData = await hexResp.json();
          if (hexData && typeof hexData.route === "string" && hexData.route.includes("-")) {
            const parts = hexData.route.split("-").map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              resolvedRoute = `${formatAirportCode(parts[0])} ✈ ${formatAirportCode(parts[parts.length - 1])}`;
            }
          }
        }
      } catch (_) {}
    }

    if (currentRouteCallsign !== cleanCallsign) return;

    if (resolvedRoute) {
      routeCache.set(cleanCallsign, resolvedRoute);
      routeTextEl.textContent = resolvedRoute;
    } else {
      routeTextEl.textContent = "ROUTE NICHT VERFÜGBAR";
    }
  }

  async function checkSpecialLivery(ac, cardEl, liveryBadgeEl, liveryTextEl) {
    const reg = (ac.registration || "").toUpperCase().trim();
    let liveryName = detectKnownSpecialLivery(reg);

    if (liveryName) {
      applyLivery(liveryName);
      return;
    }

    cardEl.classList.remove("special-livery");
    liveryBadgeEl.hidden = true;

    if (reg && reg !== "----") {
      try {
        const cleanReg = reg.replace(/-/g, "");
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch(`https://api.planespotters.net/pub/photos/reg/${cleanReg}`, {
          signal: controller.signal
        });
        clearTimeout(tid);

        if (resp.ok) {
          const pData = await resp.json();
          if (pData && Array.isArray(pData.photos) && pData.photos.length > 0) {
            const link = (pData.photos[0].link || "").toLowerCase();
            if (link.includes("retro") || link.includes("special") || link.includes("livery") || link.includes("fanhansa") || link.includes("alliance")) {
              applyLivery("SPECIAL LIVERY");
            }
          }
        }
      } catch (_) {}
    }

    function applyLivery(name) {
      if (!cardEl || !liveryBadgeEl || !liveryTextEl) return;
      cardEl.classList.add("special-livery");
      liveryTextEl.textContent = name;
      liveryBadgeEl.hidden = false;
    }
  }

  async function openPokemonCard(ac) {
    selectedAircraft = ac;

    if (!pokeModal) return;
    pokeModal.hidden = false;

    updateCardContent(ac);
    fetchFlightRoute(ac);

    const cardEl = pokeModal.querySelector(".poke-card");
    const liveryBadgeEl = document.getElementById("poke-livery-badge");
    const liveryTextEl = document.getElementById("poke-livery-text");
    if (cardEl && liveryBadgeEl && liveryTextEl) {
      checkSpecialLivery(ac, cardEl, liveryBadgeEl, liveryTextEl);
    }

    if (!ac._hexData && !ac.aircraftTypeCode) {
      try {
        const resp = await fetch(`https://hexdb.io/api/v1/aircraft/${ac.icao24}`);
        if (resp.ok) {
          ac._hexData = await resp.json();
          updateCardContent(ac);
        }
      } catch (_) {}
    }
  }

  function updateCardContent(ac) {
    const hex = ac._hexData || {};
    const typeCode = (ac.aircraftTypeCode || hex.ICAOTypeCode || "").toUpperCase();
    const fullType = ac.aircraftDesc && ac.aircraftDesc !== "UNBEKANNTER TYP"
      ? ac.aircraftDesc
      : (ICAO_NAMES[typeCode] || (hex.Type ? `${hex.Manufacturer || ""} ${hex.Type}`.trim() : (typeCode ? `TYP ${typeCode}` : "UNBEKANNTER TYP")));
    const reg = ac.registration && ac.registration !== "----" ? ac.registration : (hex.Registration || "");
    const operator = ac.operator && ac.operator !== "UNBEKANNT" ? ac.operator : (hex.RegisteredOwners || ac.country || "Unbekannt");

    const cat = categorizeAircraft(typeCode, fullType, ac.callsign);

    const nameEl = document.getElementById("poke-name");
    const hpEl = document.getElementById("poke-hp");
    const typeBadge = document.getElementById("poke-type-badge");
    const artFrame = document.getElementById("poke-art-container");
    const typeNameEl = document.getElementById("poke-type-name");
    const subinfoEl = document.getElementById("poke-subinfo-text");

    if (nameEl) nameEl.textContent = ac.callsign !== "N/A" ? ac.callsign : (reg || `HEX ${ac.icao24.toUpperCase()}`);

    if (ac.onGround) {
      if (hpEl) hpEl.textContent = "ALT GROUND";
      if (typeBadge) typeBadge.textContent = "GND";
    } else {
      const altFeet = Math.round((ac.baroAltitude || 0) * 3.28084);
      if (hpEl) hpEl.textContent = `ALT ${altFeet.toLocaleString("de-DE")} FT`;
      if (typeBadge) typeBadge.textContent = "AIR";
    }

    if (artFrame) {
      artFrame.innerHTML = `
        <div class="poke-art-bg-dither" aria-hidden="true"></div>
        ${getPixelArtSvg(cat.category)}
      `;
    }

    if (typeNameEl) {
      const displayType = typeCode && !cat.name.includes(typeCode) ? `${cat.name} (${typeCode})` : cat.name;
      typeNameEl.textContent = displayType.toUpperCase();
    }

    if (subinfoEl) {
      const regDisplay = reg ? `REG: ${reg}` : `HEX: ${ac.icao24.toUpperCase()}`;
      subinfoEl.textContent = `${regDisplay} // ${operator.toUpperCase()}`;
    }

    const speedEl = document.getElementById("poke-val-speed");
    if (speedEl) {
      if (ac.velocity != null) {
        const knots = Math.round(Number(ac.velocity));
        const kmh = Math.round(knots * 1.852);
        speedEl.textContent = `${knots} KT (${kmh} KM/H)`;
      } else {
        speedEl.textContent = "N/A";
      }
    }

    const courseEl = document.getElementById("poke-val-course");
    if (courseEl) {
      const hdg = ac.heading != null ? `HDG ${Math.round(ac.heading)}°` : "HDG ---°";
      let vsStr = "V/S 0 FT/MIN";
      if (ac.verticalRate != null) {
        const vsFeet = Math.round(Number(ac.verticalRate));
        vsStr = `V/S ${vsFeet >= 0 ? "+" : ""}${vsFeet.toLocaleString("de-DE")} FT/MIN`;
      }
      courseEl.textContent = `${hdg} // ${vsStr}`;
    }

    const statusEl = document.getElementById("poke-val-status");
    if (statusEl) {
      let phase = "REISEFLUG";
      if (ac.onGround) phase = "AM BODEN / ROLLEN";
      else if (ac.verticalRate && ac.verticalRate < -150) phase = "ANFLUG / SINKFLUG";
      else if (ac.verticalRate && ac.verticalRate > 150) phase = "STEIGFLUG";

      const squawk = ac.squawk ? `SQUAWK ${ac.squawk}` : "SQUAWK ----";
      statusEl.textContent = `${phase} [${squawk}]`;
    }
  }

  function closePokemonCard() {
    if (pokeModal) pokeModal.hidden = true;
    selectedAircraft = null;
  }

  if (pokeCloseBtn) pokeCloseBtn.addEventListener("click", closePokemonCard);
  if (pokeModal) {
    pokeModal.addEventListener("click", (e) => {
      if (e.target === pokeModal) closePokemonCard();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pokeModal && !pokeModal.hidden) {
      closePokemonCard();
    }
  });

  // Initial startup
  resizeCanvas();
  updateZoomButtons();
  startRenderLoop();
  fetchLiveAircraft();
  restartPolling();
})();
