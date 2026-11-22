/**
 * 1-Bit Munich Airport (EDDM / MUC) Live Radar & Pokémon-Style Aircraft Card
 * High-Detail Ground Layout & Live API (airplanes.live + OpenSky fallback)
 */
(() => {
  // Center: EDDM (Munich Airport Tower / MAC Core)
  const EDDM_LAT = 48.3538;
  const EDDM_LON = 11.7861;

  // Zoom levels: km per half-screen
  // 0x ULTRA NAH (GATES): ~1.25 km span (detail layout of gates, piers, taxiway bridges, aprons)
  // 1x VORFELD/BAHNEN: ~4.5 km span
  // 2x ANFLUG/ABFLUG: ~14.0 km span
  // 3x UMLAND: ~32.0 km span
  // 4x REGION (OBERBAYERN): ~90.0 km span (Großraum München, Isar, Seen, Städte & Flugplätze)
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
  let hoveredAircraftIcao = null;

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

  // Runways (4000m x 60m each, true heading 082.5° / 262.5°)
  // Nordbahn 08L/26R (further west): 48.3621, 11.7418 to 48.3663, 11.7955
  // Südbahn 08R/26L (shifted ~1500m east): 48.3413, 11.7662 to 48.3455, 11.8199
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

  // Rapid Exit Taxiways (High-speed turnoffs from runways at realistic angles)
  const RAPID_EXITS = [
    // North Runway turnoffs (A3, A4, A5, A6 exiting south towards Apron)
    [[48.3634, 11.7580], [48.3608, 11.7610]],
    [[48.3642, 11.7680], [48.3616, 11.7710]],
    [[48.3649, 11.7770], [48.3623, 11.7745]],
    [[48.3656, 11.7860], [48.3630, 11.7835]],
    // South Runway turnoffs (B3, B4, B5, B6 exiting north towards Apron)
    [[48.3426, 11.7820], [48.3452, 11.7850]],
    [[48.3434, 11.7920], [48.3460, 11.7950]],
    [[48.3441, 11.8010], [48.3415, 11.7985]],
    [[48.3448, 11.8100], [48.3422, 11.8075]]
  ];

  // Parallel Taxiways (A1/A2 North, B1/B2 South), Spines & Apron Taxiways
  const TAXIWAYS = [
    // North Parallel Taxiways (A1 & A2)
    [[48.3600, 11.7418], [48.3642, 11.7955]],
    [[48.3582, 11.7450], [48.3624, 11.7920]],
    // South Parallel Taxiways (B1 & B2)
    [[48.3438, 11.7662], [48.3480, 11.8199]],
    [[48.3456, 11.7690], [48.3498, 11.8170]],
    // North Taxiway Bridge link (West connecting North to T1 Vorfeld West)
    [[48.3600, 11.7680], [48.3565, 11.7690]],
    [[48.3565, 11.7690], [48.3475, 11.7715]],
    [[48.3475, 11.7715], [48.3438, 11.7730]],
    // East Taxiway Bridge link (East connecting North to T2 / Satellite)
    [[48.3625, 11.7940], [48.3565, 11.7960]],
    [[48.3565, 11.7960], [48.3480, 11.7980]],
    [[48.3480, 11.7980], [48.3445, 11.8000]],
    // Apron Central taxi lanes
    [[48.3565, 11.7630], [48.3575, 11.8220]],
    [[48.3490, 11.7630], [48.3500, 11.8220]]
  ];

  // Taxiway Bridges (Die zwei markanten Flugzeugbrücken über die Zentralallee)
  const TAXIWAY_BRIDGES = [
    { name: "BRÜCKE WEST", lat: 48.3550, lon: 11.7720, w: 0.0035, h: 0.0022 },
    { name: "BRÜCKE OST", lat: 48.3555, lon: 11.7985, w: 0.0035, h: 0.0022 }
  ];

  // Aprons & Parking Stands (Dithered polygonal ground areas)
  const APRONS = [
    // Apron West (T1 Forecourt)
    [[48.3500, 11.7620], [48.3575, 11.7635], [48.3570, 11.7790], [48.3495, 11.7775]],
    // Apron East (T2 Forecourt & Satellite)
    [[48.3488, 11.7880], [48.3570, 11.7900], [48.3565, 11.8235], [48.3482, 11.8215]],
    // Cargo Apron (South-West)
    [[48.3435, 11.7580], [48.3475, 11.7590], [48.3470, 11.7700], [48.3430, 11.7690]],
    // Maintenance / Hangar Apron (South-East LH Technik)
    [[48.3440, 11.8050], [48.3485, 11.8060], [48.3480, 11.8230], [48.3435, 11.8220]]
  ];

  // ==========================================
  // REGION OBERBAYERN (Fluss Isar, Seen, Städte, Flugplätze)
  // ==========================================

  // Flusslauf der Isar (Süden bis Nordosten)
  const ISAR_PATH = [
    [47.760, 11.560], // Bad Tölz Bereich
    [47.910, 11.430], // Wolfratshausen
    [48.050, 11.530], // Grünwald
    [48.137, 11.585], // München Innenstadt (Museumsinsel)
    [48.190, 11.630], // München Nord / Ismaning
    [48.320, 11.710], // Achering / Hallbergmoos
    [48.395, 11.735], // Freising (westlich EDDM)
    [48.470, 11.930], // Moosburg
    [48.540, 12.140]  // Landshut
  ];

  // Seen im Südwesten (Starnberger See & Ammersee)
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

  // Städte-Marker
  const REGION_CITIES = [
    { name: "MÜNCHEN", lat: 48.137, lon: 11.576, isMajor: true },
    { name: "FREISING", lat: 48.403, lon: 11.749, isMajor: false },
    { name: "ERDING", lat: 48.306, lon: 11.906, isMajor: false },
    { name: "AUGSBURG", lat: 48.371, lon: 10.898, isMajor: true },
    { name: "INGOLSTADT", lat: 48.766, lon: 11.425, isMajor: true },
    { name: "LANDSHUT", lat: 48.537, lon: 12.152, isMajor: true },
    { name: "ROSENHEIM", lat: 47.856, lon: 12.128, isMajor: true }
  ];

  // Umliegende Flugplätze
  const REGION_AIRPORTS = [
    { name: "EDMO // OBERPFAFFENHOFEN", lat: 48.081, lon: 11.283 },
    { name: "ETSI // INGOLSTADT-MANCHING", lat: 48.715, lon: 11.534 }
  ];

  // Detailed Terminal Buildings & Gates / Piers (EDDM Real World Geometry)
  const BUILDINGS = [
    // Terminal 1 Main Pier (West, Modules A, B, C, D, E along 11.769)
    {
      name: "TERMINAL 1 (MOD. A-E)",
      poly: [
        [48.3518, 11.7675], [48.3585, 11.7688], [48.3582, 11.7718], [48.3515, 11.7705]
      ],
      label: "T1 [MOD. A-E]"
    },
    // Terminal 1 Finger Modules A-E (Westward protruding gates)
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
    // Central Area / MAC Forum & Hotel (curved roofline)
    {
      name: "MAC / ZENTRALBEREICH",
      poly: [
        [48.3526, 11.7810], [48.3562, 11.7816], [48.3560, 11.7865], [48.3540, 11.7872], [48.3524, 11.7860]
      ],
      label: "MAC FORUM"
    },
    // Tower EDDM (North of MAC)
    {
      name: "EDDM TOWER",
      poly: [
        [48.3535, 11.7865], [48.3546, 11.7867], [48.3544, 11.7885], [48.3533, 11.7883]
      ],
      label: "EDDM // TOWER"
    },
    // Terminal 2 Main Building (GATES G / H)
    {
      name: "TERMINAL 2",
      poly: [
        [48.3508, 11.7925], [48.3578, 11.7938], [48.3574, 11.8005], [48.3504, 11.7992]
      ],
      label: "TERMINAL 2 (GATES G/H)"
    },
    // Terminal 2 Satellite Building (GATES K / L with central apron tower)
    {
      name: "T2 SATELLIT",
      poly: [
        [48.3510, 11.8095], [48.3576, 11.8108], [48.3572, 11.8158], [48.3506, 11.8145]
      ],
      label: "T2 SATELLIT (GATES K/L)"
    },
    // Cargo Facilities (South-West)
    {
      name: "CARGO COMPLEX",
      poly: [
        [48.3438, 11.7590], [48.3468, 11.7596], [48.3464, 11.7685], [48.3434, 11.7679]
      ],
      label: "CARGO / FRACHT"
    },
    // Lufthansa Technik Maintenance Hangars (South-East)
    {
      name: "MAINTENANCE HANGARS",
      poly: [
        [48.3442, 11.8060], [48.3478, 11.8068], [48.3474, 11.8210], [48.3438, 11.8202]
      ],
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

  // Coordinate Projection with Pan Offset & Continuous Zoom
  function geoToCanvas(lat, lon) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const centerLat = EDDM_LAT;
    const centerLon = EDDM_LON;

    // pixels per km given current span
    const pixelsPerKm = (Math.min(w, h) / 2) / currentKmSpan;

    const dyKm = (lat - centerLat) * 111.13 + panOffsetY;
    const dxKm = (lon - centerLon) * (111.13 * Math.cos(centerLat * Math.PI / 180)) + panOffsetX;

    const cx = w / 2;
    const cy = h / 2;

    const x = cx + dxKm * pixelsPerKm;
    const y = cy - dyKm * pixelsPerKm;

    return { x: x * dpr, y: y * dpr, rawX: x, rawY: y };
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
      // Dense 50% checkerboard dither
      pCtx.fillRect(0, 0, 1, 1);
      pCtx.fillRect(2, 0, 1, 1);
      pCtx.fillRect(1, 1, 1, 1);
      pCtx.fillRect(3, 1, 1, 1);
      pCtx.fillRect(0, 2, 1, 1);
      pCtx.fillRect(2, 2, 1, 1);
      pCtx.fillRect(1, 3, 1, 1);
      pCtx.fillRect(3, 3, 1, 1);
    } else {
      // 25% light dot dither for aprons
      pCtx.fillRect(0, 0, 1, 1);
      pCtx.fillRect(2, 2, 1, 1);
    }
    return ctx.createPattern(pCanvas, "repeat");
  }

  // Draw Runway Details: Piano Keys & Touchdown Zone Markers
  function drawRunwayDetailed(rwy, dpr, pixelsPerKm) {
    const p1 = geoToCanvas(rwy.lat1, rwy.lon1);
    const p2 = geoToCanvas(rwy.lat2, rwy.lon2);

    // Runway physical width: 60m = 0.060 km
    const rwyWidthPx = Math.max(8 * dpr, 0.060 * pixelsPerKm * dpr);

    ctx.save();
    // Runway strip
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = rwyWidthPx;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Centerline dashed
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5 * dpr, rwyWidthPx * 0.08);
    const dashLen = Math.max(4 * dpr, 0.030 * pixelsPerKm * dpr);
    ctx.setLineDash([dashLen, dashLen * 0.7]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Detailed Threshold "Piano Keys" & Touchdown Zone Markers in Ultra-Nah mode
    if (currentKmSpan < 3.0) {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = angle + Math.PI / 2;

      // Draw Piano keys & TDZ at p1 and p2 thresholds
      for (let side of [1, -1]) {
        const base = side === 1 ? p1 : p2;
        const dir = side === 1 ? 1 : -1;
        ctx.fillStyle = "#ffffff";
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

        // Aufsetzzonen-Markierungen (Touchdown Zone Markers TDZ)
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

    // Threshold labels
    ctx.fillStyle = "#000000";
    ctx.font = `${Math.round(10 * dpr)}px 'Silkscreen', monospace`;
    ctx.fillText(rwy.label1, p1.x - 30 * dpr, p1.y + 4 * dpr);
    ctx.fillText(rwy.label2, p2.x + 10 * dpr, p2.y + 4 * dpr);

    ctx.restore();
  }

  // Draw Regional Geography: River Isar, Lakes, Cities, Regional Airports
  function drawRegionGeography(dpr, pixelsPerKm) {
    ctx.save();

    // 1. Flusslauf der Isar (gepunktet/doppellinie im 1-Bit-Look)
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

    // Label "ISAR" am Flusslauf
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

    // 2. Seen (Starnberger See & Ammersee) mit Dither-Fläche
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

      // Label See
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

    // 3. Umliegende Flugplätze (Pixel-Kreuze)
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

      // Label
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

    // 4. Städte-Marker (Pixel-Quadrat + Label)
    REGION_CITIES.forEach(city => {
      // In Stufe 2x (Span ~14) zeigen wir z. B. nur Freising, Erding und München
      if (currentKmSpan < 25.0 && !city.isMajor && city.name !== "FREISING" && city.name !== "ERDING") {
        return;
      }

      const p = geoToCanvas(city.lat, city.lon);
      const boxSize = city.isMajor ? 7 * dpr : 5 * dpr;

      ctx.fillStyle = "#000000";
      ctx.fillRect(p.x - boxSize / 2, p.y - boxSize / 2, boxSize, boxSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x - (boxSize - 4 * dpr) / 2, p.y - (boxSize - 4 * dpr) / 2, boxSize - 4 * dpr, boxSize - 4 * dpr);

      // Label
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
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    // Pure 1-bit background
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

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(centerPos.x, 0);
    ctx.lineTo(centerPos.x, h);
    ctx.moveTo(0, centerPos.y);
    ctx.lineTo(w, centerPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1b. Region Oberbayern Geografie (Isar, Seen, Städte, Flugplätze ab Zoom-Stufe >= 10 km)
    if (currentKmSpan >= 10.0) {
      drawRegionGeography(dpr, pixelsPerKm);
    }

    // 2. Aprons & Ground Stands (25% dither pattern)
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

    // 2b. Vorfeld West Standplatz-Markierungslinien (in Ultra-Nah Ansicht)
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

    // 5. Taxiway Bridges (Die zwei markanten Brücken über die Zentralallee)
    TAXIWAY_BRIDGES.forEach(bridge => {
      const p = geoToCanvas(bridge.lat, bridge.lon);
      const bw = bridge.w * pixelsPerKm * dpr;
      const bh = bridge.h * pixelsPerKm * dpr;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);

      // Bridge guard rails (cross hatch)
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

    // 6. Runways with Centerline & Markers
    RUNWAYS.forEach(rwy => drawRunwayDetailed(rwy, dpr, pixelsPerKm));

    // 7. Buildings (Terminal 1, Modules A-E, Gates, MAC, Tower, T2, Satellite)
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

      // Label when zoomed in
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

    // 9. Aircraft Rendering (with exact ground & flight positioning)
    aircraftList.forEach(ac => {
      if (ac.lat == null || ac.lon == null) return;
      const pos = geoToCanvas(ac.lat, ac.lon);

      ac._screenX = pos.rawX;
      ac._screenY = pos.rawY;

      if (selectedAircraft && selectedAircraft.icao24 === ac.icao24 && pokeModal && !pokeModal.hidden) {
        const headingRad = (Number.isFinite(ac.heading) ? ac.heading : 0) * Math.PI / 180;
        const vectorDistanceMeters = 8000;
        const latitudeRad = ac.lat * Math.PI / 180;
        const vectorEnd = geoToCanvas(
          ac.lat + (vectorDistanceMeters * Math.cos(headingRad)) / 111320,
          ac.lon + (vectorDistanceMeters * Math.sin(headingRad)) /
            (111320 * Math.cos(latitudeRad))
        );
        ctx.save();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(vectorEnd.x, vectorEnd.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(pos.x, pos.y);

      ctx.rotate((Number.isFinite(ac.heading) ? ac.heading : 0) * Math.PI / 180);

      // Aircraft top-down silhouette
      // Ground planes: Dark Red (#8B0000), or inverted #74FFFF in dark mode so it stays deep dark red
      // Air planes: Classic 1-Bit black (#000000)
      const isThemeDark = document.body.classList.contains("theme-dark");
      const planeColor = ac.onGround 
        ? (isThemeDark ? "#74ffff" : "#8B0000") 
        : "#000000";

      ctx.fillStyle = planeColor;

      // Top-Down Aircraft Silhouette (Fuselage, Swept Wings, Stabilizers, Nose)
      // Fuselage central spine
      ctx.fillRect(-1.5 * dpr, -9 * dpr, 3 * dpr, 18 * dpr);
      // Swept main wings
      ctx.fillRect(-8 * dpr, -2 * dpr, 16 * dpr, 3 * dpr);
      // Wing angled leading edges
      ctx.fillRect(-6 * dpr, -3 * dpr, 12 * dpr, 1 * dpr);
      // Horizontal stabilizer (tail wing)
      ctx.fillRect(-4 * dpr, 6 * dpr, 8 * dpr, 2 * dpr);
      // Vertical tail fin tip
      ctx.fillRect(-0.75 * dpr, 4 * dpr, 1.5 * dpr, 4 * dpr);
      // Nose cone tip
      ctx.fillRect(-0.75 * dpr, -10 * dpr, 1.5 * dpr, 1.5 * dpr);

      // Distinctive center dot for ground aircraft
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

      // Selected highlight
      if (selectedAircraft && selectedAircraft.icao24 === ac.icao24) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([2 * dpr, 2 * dpr]);
        ctx.strokeRect(pos.x - 12 * dpr, pos.y - 12 * dpr, 24 * dpr, 24 * dpr);
        ctx.setLineDash([]);
      } else if (hoveredAircraftIcao === ac.icao24) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([1 * dpr, 2 * dpr]);
        ctx.strokeRect(pos.x - 12 * dpr, pos.y - 12 * dpr, 24 * dpr, 24 * dpr);
        ctx.setLineDash([]);
      }
    });

    // 10. Dynamic Scale Bar (Bottom Right)
    drawScaleBar(dpr, w, h, pixelsPerKm);
  }

  // Draw 1-Bit Dynamic Scale Bar
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

  // Show / Hide Overlay
  function showOverlay(title, text) {
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.textContent = text;
    if (overlayMsg) overlayMsg.hidden = false;
  }

  function hideOverlay() {
    if (overlayMsg) overlayMsg.hidden = true;
  }

  // ==========================================
  // LIVE API (Dedicated Cloudflare Worker)
  // ==========================================
  const RADAR_API_URL = "https://radar.fwolfph.workers.dev/";

  // Known ICAO Type Codes to Clean Names
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
    clearTimeout(fetchTimer);
    fetchTimer = null;
    isFetching = true;
    const reqStart = performance.now();

    console.info(`[MUC-RADAR] Starte Live-Abfrage via Cloudflare Worker: ${RADAR_API_URL}`);
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Timeout

      // Ohne eigene Request-Header aufrufen, um jeden OPTIONS-Preflight zu verhindern
      const resp = await fetch(RADAR_API_URL, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText || ""}`.trim());
      }

      const data = await resp.json();
      console.info("[MUC-RADAR] Antwort vom Worker empfangen:", data);

      const acArray = data && (Array.isArray(data.ac) ? data.ac : (Array.isArray(data.aircraft) ? data.aircraft : null));
      if (!Array.isArray(acArray)) {
        throw new Error("Kein gültiges 'ac'-Array in Worker-Antwort");
      }

      if (lastUpdateElem) {
        lastUpdateElem.textContent = new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
      }

      // Filter: Bodenfahrzeuge (TXLU01 etc.) mit category === "C0" oder type === "adsb_icao_nt" herausfiltern
      const filteredAc = acArray.filter(ac => {
        if (!ac) return false;
        if (ac.category === "C0") return false;
        if (ac.type === "adsb_icao_nt") return false;
        // Auch TXLU-Kennungen oder TWR-Fahrzeuge ignorieren falls Category fehlt
        const r = (ac.r || "").toUpperCase();
        const cs = (ac.flight || "").toUpperCase();
        if (r === "TWR" || cs.startsWith("TXLU")) return false;
        return true;
      });

      const rawAircraft = filteredAc.map(ac => {
        const onGround = ac.alt_baro === "ground" || Number(ac.gs || 0) < 35;
        const altitude = ac.alt_baro === "ground" ? 0 : Math.round(Number(ac.alt_baro || ac.alt_geom || 0));
        const typeCode = (ac.t || "").toUpperCase();
        const derivedDesc = ac.desc || ICAO_NAMES[typeCode] || (typeCode ? `TYP ${typeCode}` : "UNBEKANNTER TYP");

        const aircraft = {
          icao24: String(ac.hex || "").trim().toLowerCase(),
          callsign: (ac.flight || ac.r || ac.hex || "N/A").trim(),
          lat: Number(ac.lat),
          lon: Number(ac.lon),
          altitude: altitude, // in ft
          baroAltitude: altitude / 3.28084, // in m
          onGround: onGround,
          velocity: Number(ac.gs || 0), // in kt
          heading: Number(ac.track ?? ac.true_heading ?? 0),
          verticalRate: Math.round(Number(ac.baro_rate || ac.geom_rate || 0)), // in ft/min
          squawk: ac.squawk || "----",
          aircraftTypeCode: typeCode,
          aircraftDesc: derivedDesc,
          registration: ac.r || "----",
          ownOp: ac.ownOp || "UNBEKANNT",
          operator: ac.ownOp || "UNBEKANNT",
          country: ac.ownOp || "UNBEKANNT"
        };
        if (!Number.isFinite(aircraft.velocity)) aircraft.velocity = 0;
        if (!Number.isFinite(aircraft.heading)) aircraft.heading = 0;
        return aircraft;
      }).filter(a => !isNaN(a.lat) && !isNaN(a.lon));

      console.info(`[MUC-RADAR] ${rawAircraft.length} echte Flugzeuge erfolgreich gemappt (Bodenfahrzeuge gefiltert).`);

      if (rawAircraft.length === 0) {
        aircraftList = [];
        hoveredAircraftIcao = null;
        canvas.style.cursor = "";
        drawRadar();
        if (liveCountElem) liveCountElem.textContent = "0 FLIEGER";
        showOverlay(
          "INFO // AKTUELL KEINE FLUGZEUGE IM RADARBEREICH",
          "Im Moment senden keine echten Flugzeuge im Umkreis von EDDM / München ADS-B Signale."
        );
        return;
      }

      hideOverlay();
      aircraftList = rawAircraft;
      if (hoveredAircraftIcao && !aircraftList.some(ac => ac.icao24 === hoveredAircraftIcao)) {
        hoveredAircraftIcao = null;
        canvas.style.cursor = "";
      }

      if (liveCountElem) liveCountElem.textContent = `${aircraftList.length} FLIEGER`;

      // Update opened card if aircraft is selected
      if (selectedAircraft && pokeModal && !pokeModal.hidden) {
        try {
          const updated = aircraftList.find(a => a.icao24 === selectedAircraft.icao24);
          if (updated) {
            Object.assign(selectedAircraft, {
              lat: updated.lat,
              lon: updated.lon,
              altitude: updated.altitude,
              baroAltitude: updated.baroAltitude,
              velocity: updated.velocity,
              heading: updated.heading,
              verticalRate: updated.verticalRate,
              squawk: updated.squawk,
              onGround: updated.onGround
            });
            updateCardContent(selectedAircraft);
          }
        } catch (e) {
          console.error("[MUC-RADAR] Pokémon-Karte konnte nicht aktualisiert werden:", e);
        }
      }

      drawRadar();
    } catch (err) {
      console.warn("[MUC-RADAR] Fehler beim Laden der Live-Daten:", err);
      aircraftList = [];
      hoveredAircraftIcao = null;
      canvas.style.cursor = "";
      drawRadar();
      if (liveCountElem) liveCountElem.textContent = "OFFLINE";
      showOverlay(
        "ERR // API-VERBINDUNG FEHLGESCHLAGEN – KEINE LIVE-DATEN VERFÜGBAR",
        `Worker-Abfrage fehlgeschlagen (${err.message}). Prüfe F12 Konsole auf Netzwerkfehler.`
      );
    } finally {
      clearTimeout(timeoutId);
      isFetching = false;
      const elapsed = performance.now() - reqStart;
      if (elapsed > 1000) {
        console.warn(`[MUC-RADAR] Live-Abfrage dauerte ${Math.round(elapsed)} ms.`);
      }
      clearTimeout(fetchTimer);
      fetchTimer = setTimeout(fetchLiveAircraft, document.hidden ? 15000 : 1000);
    }
  }

  function findAircraftAtPoint(x, y) {
    let hit = null;
    let minDistance = 24;
    aircraftList.forEach(ac => {
      if (ac._screenX == null || ac._screenY == null) return;
      const dx = ac._screenX - x;
      const dy = ac._screenY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        hit = ac;
      }
    });
    return hit;
  }

  canvas.addEventListener("mousemove", (e) => {
    if (isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const hit = findAircraftAtPoint(e.clientX - rect.left, e.clientY - rect.top);
    const nextHoveredIcao = hit ? hit.icao24 : null;
    if (hoveredAircraftIcao !== nextHoveredIcao) {
      hoveredAircraftIcao = nextHoveredIcao;
      canvas.style.cursor = hit ? "pointer" : "";
      drawRadar();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (hoveredAircraftIcao !== null) {
      hoveredAircraftIcao = null;
      canvas.style.cursor = "";
      drawRadar();
    }
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

    // Convert pixel delta to km delta
    panOffsetX = dragStartPanX + dxPx / pixelsPerKm;
    panOffsetY = dragStartPanY - dyPx / pixelsPerKm;
    drawRadar();
  });

  window.addEventListener("mouseup", (e) => {
    if (isDragging) {
      isDragging = false;
      container.classList.remove("panning");
    }
  });

  // Mouse wheel zoom
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.25 : 0.8;
    currentKmSpan = Math.max(0.5, Math.min(100.0, currentKmSpan * zoomFactor));
    updateZoomButtons();
    drawRadar();
  }, { passive: false });

  // Touch pinch & pan
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
      drawRadar();
    } else if (e.touches.length === 2 && touchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = touchStartDist / dist;
      currentKmSpan = Math.max(0.5, Math.min(100.0, touchStartSpan * factor));
      updateZoomButtons();
      drawRadar();
    }
  }, { passive: true });

  container.addEventListener("touchend", () => {
    isDragging = false;
    touchStartDist = 0;
  });

  // Canvas Click: Aircraft Selection (only if not dragged)
  canvas.addEventListener("click", (e) => {
    if (hasDragged) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const hit = findAircraftAtPoint(clickX, clickY);

    if (hit) {
      openPokemonCard(hit);
    } else {
      selectedAircraft = null;
      drawRadar();
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
    panOffsetX = 0; // Auto-center to EDDM airport center
    panOffsetY = 0;
    updateZoomButtons();
    drawRadar();
  }

  if (zoomBtn0) zoomBtn0.addEventListener("click", () => setPresetZoom(0));
  if (zoomBtn1) zoomBtn1.addEventListener("click", () => setPresetZoom(1));
  if (zoomBtn2) zoomBtn2.addEventListener("click", () => setPresetZoom(2));
  if (zoomBtn3) zoomBtn3.addEventListener("click", () => setPresetZoom(3));
  if (zoomBtn4) zoomBtn4.addEventListener("click", () => setPresetZoom(4));

  if (resetPanBtn) {
    resetPanBtn.addEventListener("click", () => {
      setPresetZoom(0);
    });
  }

  if (overlayRetryBtn) overlayRetryBtn.addEventListener("click", () => fetchLiveAircraft());

  // ==========================================
  // POKÉMON CARD & SPRITES
  // ==========================================
  function categorizeAircraft(typeCode, typeDesc, callsign) {
    const code = (typeCode || "").toUpperCase();
    const desc = (typeDesc || "").toUpperCase();
    const cs = (callsign || "").toUpperCase();

    // 1. Helikopter
    if (code.startsWith("EC") || code.startsWith("H1") || code.startsWith("A139") || desc.includes("HELICOPTER") || cs.startsWith("CHX") || cs.startsWith("SAR")) {
      return { category: 6, label: "HELIKOPTER", name: typeDesc || "HELIKOPTER" };
    }

    // 2. Vierstrahliges Großraumflugzeug (A388, B744, B748)
    const quadCodes = ["A388", "B744", "B748", "A343", "A346", "A380", "B747"];
    if (quadCodes.includes(code) || code.startsWith("A38") || code.startsWith("B74") || desc.includes("A380") || desc.includes("747")) {
      return { category: 1, label: "QUAD-JET WIDEBODY", name: typeDesc || "AIRBUS A380 / BOEING 747" };
    }

    // 3. Zweistrahliges Langstrecken-Widebody (A359, A35K, B788, B789, B78X, B77W, B77L, A332, A333, A339)
    const widebodyCodes = ["A359", "A35K", "B788", "B789", "B78X", "B77W", "B77L", "A332", "A333", "A339", "B772", "B773", "B763", "B764"];
    if (widebodyCodes.includes(code) || code.startsWith("A35") || code.startsWith("A33") || code.startsWith("B77") || code.startsWith("B78") || desc.includes("A350") || desc.includes("A330") || desc.includes("777") || desc.includes("787")) {
      return { category: 2, label: "TWIN-JET WIDEBODY", name: typeDesc || "LANGSTRECKEN-JET" };
    }

    // 4. Regionaljet / Hecktriebwerke (CRJ9, E190, E195, E295)
    const regionalCodes = ["CRJ9", "CRJ7", "CRJ1", "CRJ2", "E190", "E195", "E295", "E170", "E175", "E190", "E75L", "C560", "C680", "CL35", "CL60"];
    if (regionalCodes.includes(code) || code.startsWith("CRJ") || code.startsWith("E1") || code.startsWith("E2") || desc.includes("EMBRAER") || desc.includes("BOMBARDIER") || desc.includes("CRJ")) {
      return { category: 4, label: "REGIONAL-JET", name: typeDesc || "REGIONALJET" };
    }

    // 5. Turboprop / Propellerflugzeug (AT76, DH8D)
    const turbopropCodes = ["AT76", "AT72", "AT45", "AT46", "DH8D", "DH8C", "C172", "C182", "BE20", "PC12"];
    if (turbopropCodes.includes(code) || code.startsWith("AT7") || code.startsWith("AT4") || code.startsWith("DH8") || desc.includes("PROP") || desc.includes("TURBOPROP")) {
      return { category: 5, label: "TURBOPROP / PROPELLER", name: typeDesc || "TURBOPROP-FLUGZEUG" };
    }

    // 6. Standard-Mittelstreckenjet / Narrowbody (A319, A320, A20N, A321, A21N, B738, B38M, B39M, BCS1, BCS3)
    return { category: 3, label: "STANDARD NARROWBODY", name: typeDesc || "AIRBUS A320 / BOEING 737" };
  }

  // Special Livery Registry (Known registrations)
  const SPECIAL_LIVERIES = {
    "D-ANRA": "CONDOR STRIPES LIVERY",
    "D-ANRB": "CONDOR STRIPES LIVERY",
    "D-ANRC": "CONDOR STRIPES LIVERY",
    "D-ANRD": "CONDOR STRIPES LIVERY",
    "D-ANRE": "CONDOR STRIPES LIVERY",
    "D-AICA": "CONDOR RETRO \"HANS\"",
    "D-ABYT": "LUFTHANSA RETRO LIVERY",
    "D-AIDV": "LUFTHANSA RETRO LIVERY",
    "D-AIKQ": "FANHANSA",
    "D-AIEQ": "LOVEHANSA",
    "D-AIYQ": "LUFTHANSA 100 YEARS ANNIVERSARY LIVERY",
    "D-AIXL": "FC BAYERN SPECIAL LIVERY",
    "D-AIXM": "FC BAYERN SPECIAL LIVERY",
    "D-AIUA": "STAR ALLIANCE LIVERY",
    "D-AIZM": "STAR ALLIANCE LIVERY",
    "D-AIBM": "STAR ALLIANCE LIVERY",
    "D-AIMC": "STAR ALLIANCE LIVERY",
    "D-AIHV": "STAR ALLIANCE LIVERY",
    "D-AIHW": "STAR ALLIANCE LIVERY",
    "OE-LBM": "STAR ALLIANCE LIVERY",
    "OE-LBX": "STAR ALLIANCE LIVERY",
    "HB-JCA": "STAR ALLIANCE LIVERY",
    "HB-JHG": "STAR ALLIANCE LIVERY",
    "TC-JRL": "STAR ALLIANCE LIVERY",
    "C-GHLM": "STAR ALLIANCE LIVERY",
    "N76021": "STAR ALLIANCE LIVERY",
    "N653UA": "STAR ALLIANCE LIVERY",
    "JA712A": "STAR ALLIANCE LIVERY",
    "HB-JHM": "SWISS WANDERLUST / PEOPLE LIVERY",
    "HB-JNA": "SWISS WANDERLUST / PEOPLE LIVERY",
    "OE-LZD": "AUSTRIAN MY SOUND / JOHANN STRAUSS LIVERY",
    "D-AEWM": "EUROWINGS BVB MANNSCHAFTSAIRBUS",
    "D-AIZS": "EUROWINGS EUROPA-PARK LIVERY",
    "D-ABHC": "EUROWINGS HOLIDAYS LIVERY",
    "D-ATUJ": "TUIFLY TROPIFRUTTI",
    "D-ATUZ": "TUIFLY RIU LIVERY",
    "D-ABMQ": "TUIFLY MAGIC LIFE LIVERY",
    "A7-BAA": "QATAR AIRWAYS ONEWORLD LIVERY",
    "A7-ALZ": "QATAR AIRWAYS SPECIAL LIVERY",
    "A7-BEX": "QATAR AIRWAYS SPECIAL LIVERY",
    "A6-EEU": "EMIRATES EXPO LIVERY",
    "A6-EOA": "EMIRATES SPECIAL LIVERY",
    "A6-EOT": "EMIRATES SPECIAL LIVERY",
    "A6-EVS": "EMIRATES SPECIAL LIVERY",
    "JA381A": "FLYING HONU (BLUE)",
    "JA382A": "FLYING HONU (EMERALD)",
    "JA383A": "FLYING HONU (ORANGE)",
    "JA873A": "ANA R2-D2 STAR WARS LIVERY",
    "A6-BND": "ETIHAD MANCHESTER CITY LIVERY",
    "A6-BLM": "ETIHAD GREENLINER",
    "A6-BLV": "ETIHAD CHOOSE THE USA LIVERY",
    "TC-LNA": "TURKISH AIRLINES UEFA CHAMPIONS LEAGUE",
    "TC-JRG": "TURKISH AIRLINES RETRO LIVERY",
    "TC-JJN": "TURKISH AIRLINES 300TH AIRCRAFT LIVERY",
    "G-EUPJ": "BRITISH AIRWAYS BEA RETRO LIVERY",
    "G-BNLY": "BRITISH AIRWAYS LANDOR RETRO LIVERY",
    "PH-BVA": "KLM ORANGE PRIDE LIVERY",
    "PH-KZU": "KLM SKYTEAM LIVERY",
    "F-GZNT": "AIR FRANCE SKYTEAM LIVERY",
    "EC-MUD": "IBERIA ONEWORLD LIVERY"
  };

  function detectKnownSpecialLivery(reg) {
    if (!reg || reg === "----") return null;
    const cleanReg = reg.toUpperCase().trim();
    if (SPECIAL_LIVERIES[cleanReg]) return SPECIAL_LIVERIES[cleanReg];
    const noDash = cleanReg.replace(/-/g, "");
    if (SPECIAL_LIVERIES[noDash]) return SPECIAL_LIVERIES[noDash];

    if (/^D-ANR[A-Z]$/.test(cleanReg) || /^DANR[A-Z]$/.test(noDash) ||
        /^D-ANC[A-Z]$/.test(cleanReg) || /^DANC[A-Z]$/.test(noDash) ||
        /^D-ANM[A-Z]$/.test(cleanReg) || /^DANM[A-Z]$/.test(noDash)) {
      return "CONDOR STRIPES LIVERY";
    }
    return null;
  }

  const ICAO_AIRLINES = {
    DLH: "LUFTHANSA",
    LHX: "LUFTHANSA CITY",
    CLH: "LUFTHANSA CITYLINE",
    EWG: "EUROWINGS",
    OCN: "DISCOVER AIRLINES",
    CFG: "CONDOR",
    TUI: "TUIFLY",
    AUA: "AUSTRIAN AIRLINES",
    SWR: "SWISS",
    BAW: "BRITISH AIRWAYS",
    AFR: "AIR FRANCE",
    KLM: "KLM",
    IBE: "IBERIA",
    TAP: "TAP AIR PORTUGAL",
    AZA: "ITA AIRWAYS",
    SAS: "SAS",
    FIN: "FINNAIR",
    LOT: "LOT POLISH AIRLINES",
    THY: "TURKISH AIRLINES",
    QTR: "QATAR AIRWAYS",
    UAE: "EMIRATES",
    ETD: "ETIHAD AIRWAYS",
    UAL: "UNITED AIRLINES",
    DAL: "DELTA AIR LINES",
    AAL: "AMERICAN AIRLINES",
    ACA: "AIR CANADA",
    ANA: "ALL NIPPON AIRWAYS",
    SIA: "SINGAPORE AIRLINES",
    CPA: "CATHAY PACIFIC",
    RYR: "RYANAIR",
    EZY: "EASYJET",
    WZZ: "WIZZ AIR",
    VLG: "VUELING",
    PGT: "PEGASUS AIRLINES",
    SXS: "SUNEXPRESS",
    ELY: "EL AL",
    EIN: "AER LINGUS",
    ICE: "ICELANDAIR",
    BTI: "AIR BALTIC",
    CRO: "CROATIA AIRLINES",
    AEE: "AEGEAN AIRLINES",
    MSR: "EGYPTAIR",
    RAM: "ROYAL AIR MAROC"
  };

  function resolveAirlineName(ac, hexData) {
    const ownOperator = String(ac.ownOp || "").trim();
    if (ownOperator && ownOperator.toUpperCase() !== "UNBEKANNT") return ownOperator;

    const registeredOwners = String((hexData && hexData.RegisteredOwners) || "").trim();
    if (registeredOwners && !["UNBEKANNT", "UNKNOWN"].includes(registeredOwners.toUpperCase())) {
      return registeredOwners;
    }

    const callsign = String(ac.callsign || "").trim().toUpperCase();
    const callsignPrefix = callsign.slice(0, 3);
    if (/^[A-Z]{3}[A-Z0-9]/.test(callsign)) {
      return ICAO_AIRLINES[callsignPrefix] || "UNBEKANNT";
    }
    return "UNBEKANNT";
  }

  function getPixelArtSvg(catId) {
    switch (catId) {
      case 1: // Quad Widebody (A380 / B747) - Double-deck / upper-deck hump, 4 high-bypass engines
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- Tail fin & rudder -->
          <path fill="currentColor" d="M14 44l30-40h14l-20 40h-24z"/>
          <path fill="currentColor" d="M12 40h10v4h-10z"/>
          <!-- Fuselage body (Double-deck tall profile) -->
          <path fill="currentColor" d="M30 40h104l14 4 8 10-6 4H26l-8-6 12-12z"/>
          <!-- Cockpit windows & Upper Deck hump -->
          <path fill="currentColor" d="M136 44h14l4 4-2 2h-16z"/>
          <!-- Cabin Windows: Main Deck & Upper Deck -->
          <path fill="#ffffff" d="M42 42h88v2H42zm0 6h88v2H42z"/>
          <path fill="currentColor" d="M42 42h88v2H42zm0 6h88v2H42z"/>
          <!-- Wing structure & Wingtips -->
          <path fill="currentColor" d="M54 58h56l-10 5H46l8-5zm54-4h4v6h-4z"/>
          <!-- 4 Turbofan Engines under wings -->
          <path fill="currentColor" d="M58 56h12v10H58zm18 0h12v10H76zm20 0h12v10H96zm18 0h10v9h-10z"/>
          <!-- Fuselage belly 1-bit dither strip -->
          <rect x="28" y="56" width="102" height="2" fill="currentColor"/>
          <rect x="34" y="58" width="88" height="1" fill="currentColor"/>
        </svg>`;

      case 2: // Twin Widebody (A350 / B787 / B777 / A330) - Sleek nose, curved raked wingtips, twin engines
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- Swept Vertical Stabilizer -->
          <path fill="currentColor" d="M18 44l26-36h14l-18 36h-22z"/>
          <path fill="currentColor" d="M14 42h8v2h-8z"/>
          <!-- Long sleek widebody fuselage -->
          <path fill="currentColor" d="M34 42h102l14 3 8 9-6 4H30l-8-6 12-10z"/>
          <!-- Zorro mask / Cockpit windows -->
          <path fill="currentColor" d="M138 43h12l4 4-2 2h-14z"/>
          <!-- Cabin window strip -->
          <path fill="currentColor" d="M40 46h94v2H40z"/>
          <!-- Swept wing with raked wingtip / sharklet -->
          <path fill="currentColor" d="M60 56h54l-12 5H52l8-5zm52-6h3v8h-3z"/>
          <!-- 2 Massive Turbofan Engines with chevrons -->
          <path fill="currentColor" d="M68 54h18v12H68zm26 0h18v12H94z"/>
          <!-- Fuselage belly shading -->
          <rect x="34" y="56" width="98" height="2" fill="currentColor"/>
          <rect x="42" y="58" width="80" height="1" fill="currentColor"/>
        </svg>`;

      case 4: // Regional Jet (CRJ / Embraer) - T-tail, rear-mounted twin engines, slim needle fuselage
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- T-Tail Stabilizer -->
          <path fill="currentColor" d="M20 44l22-34h12l-14 34h-20z"/>
          <path fill="currentColor" d="M30 10h28v4H30z"/>
          <!-- Slim fuselage -->
          <path fill="currentColor" d="M32 44h106l12 3 6 7-5 4H28l-6-5 10-9z"/>
          <!-- Cockpit window strip -->
          <path fill="currentColor" d="M138 45h10l3 3-2 2h-11z"/>
          <!-- Cabin windows -->
          <path fill="currentColor" d="M44 48h88v2H44z"/>
          <!-- Rear-mounted fuselage engines -->
          <path fill="currentColor" d="M36 40h16v8H36zm0 10h16v6H36z"/>
          <!-- Low swept wings with winglets -->
          <path fill="currentColor" d="M68 56h44l-8 4H62l6-4zm42-5h3v6h-3z"/>
          <!-- Belly shading -->
          <rect x="32" y="56" width="98" height="2" fill="currentColor"/>
        </svg>`;

      case 5: // Turboprop (ATR 72 / Dash 8) - High-wing shoulder configuration, large 6-blade props
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- T-tail or High Fin -->
          <path fill="currentColor" d="M22 44l24-34h12l-14 34h-22z"/>
          <path fill="currentColor" d="M34 10h24v4H34z"/>
          <!-- High wing fuselage box -->
          <path fill="currentColor" d="M36 42h100l12 4 8 8-6 4H32l-8-6 12-10z"/>
          <!-- Cockpit windows -->
          <path fill="currentColor" d="M136 44h12l4 4-2 2h-14z"/>
          <!-- Cabin windows -->
          <path fill="currentColor" d="M44 46h86v2H44z"/>
          <!-- High Shoulder Wing -->
          <path fill="currentColor" d="M58 38h64v5H58z"/>
          <!-- 2 Nacelles & Large Propeller blades -->
          <path fill="currentColor" d="M72 36h14v16H72zm30 0h14v16h-14z"/>
          <path fill="currentColor" d="M78 26h2v34h-2zm30 0h2v34h-2z"/>
          <!-- Belly line -->
          <rect x="34" y="56" width="96" height="2" fill="currentColor"/>
        </svg>`;

      case 6: // Helicopter - Main rotor, tail boom, fenestron/tail rotor, landing skids
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- Main Rotor Mast & Spinning Blades -->
          <path fill="currentColor" d="M18 16h124v3H18zm58 3h8v10h-8z"/>
          <!-- Cabin body & large bubble cockpit windshield -->
          <path fill="currentColor" d="M62 29h62l14 6 6 12-8 7H60l-8-8 10-17z"/>
          <path fill="currentColor" d="M118 31h18l4 6-2 6h-20z"/>
          <path fill="currentColor" d="M72 36h40v4H72zm0 6h40v4H72z"/>
          <!-- Tail boom and Tail fin -->
          <path fill="currentColor" d="M22 36h40v7H22zm-8-12h8v24h-8z"/>
          <!-- Tail Rotor -->
          <path fill="currentColor" d="M10 20h4v28h-4z"/>
          <!-- Tubular Landing skids & struts -->
          <path fill="currentColor" d="M56 61h72v4H56zm16-7h4v7h-4zm36 0h4v7h-4z"/>
        </svg>`;

      case 3: // Narrowbody (A320 / B737 / A220) - Standard commercial jet with sharklets
      default:
        return `<svg viewBox="0 0 160 72" class="poke-sprite-svg" shape-rendering="crispEdges">
          <!-- Swept Vertical Tail Fin -->
          <path fill="currentColor" d="M20 44l24-34h14l-16 34h-22z"/>
          <path fill="currentColor" d="M16 42h8v2h-8z"/>
          <!-- Classic Narrowbody Fuselage -->
          <path fill="currentColor" d="M34 43h102l12 3 8 8-6 4H30l-8-5 12-10z"/>
          <!-- Cockpit windows -->
          <path fill="currentColor" d="M136 44h12l4 4-2 2h-14z"/>
          <!-- Single row of cabin windows -->
          <path fill="currentColor" d="M42 47h88v2H42z"/>
          <!-- Swept Main Wing & Sharklet / Winglet -->
          <path fill="currentColor" d="M62 56h48l-10 5H56l6-5zm46-6h3v8h-3z"/>
          <!-- 2 Underwing Turbofans -->
          <path fill="currentColor" d="M70 54h14v11H70zm22 0h14v11H92z"/>
          <!-- Dither belly shading -->
          <rect x="34" y="56" width="96" height="2" fill="currentColor"/>
          <rect x="42" y="58" width="76" height="1" fill="currentColor"/>
        </svg>`;
    }
  }

  const ROUTE_IATA_BY_ICAO = {
    EDDM: "MUC", EDDF: "FRA", EDDB: "BER", EDDH: "HAM", EDDL: "DUS",
    EDDK: "CGN", EDDS: "STR", LOWW: "VIE", LSZH: "ZRH", EGLL: "LHR",
    LFPG: "CDG", EHAM: "AMS", LEMD: "MAD", LIRF: "FCO", OTHH: "DOH",
    OMDB: "DXB", KJFK: "JFK", CYYZ: "YYZ"
  };
  const ROUTE_ICAO_BY_IATA = Object.fromEntries(
    Object.entries(ROUTE_IATA_BY_ICAO).map(([icao, iata]) => [iata, icao])
  );
  const routeCache = new Map();
  let currentRouteCallsign = null;

  function formatAirport(airport) {
    let iata = "";
    let icao = "";
    let code = "";

    if (typeof airport === "string" || typeof airport === "number") {
      code = String(airport).trim().toUpperCase();
    } else if (airport && typeof airport === "object") {
      iata = String(airport.iata || airport.iata_code || airport.iataCode || airport.IATA || "").trim().toUpperCase();
      icao = String(airport.icao || airport.icao_code || airport.icaoCode || airport.ICAO || "").trim().toUpperCase();
      code = String(airport.code || airport.ident || "").trim().toUpperCase();
    }

    if (!icao && /^[A-Z]{4}$/.test(code)) icao = code;
    if (!iata && /^[A-Z]{3}$/.test(code)) iata = code;
    if (!iata && icao) iata = ROUTE_IATA_BY_ICAO[icao] || "";
    if (!icao && iata) icao = ROUTE_ICAO_BY_IATA[iata] || "";

    if (iata && icao) return `${iata} (${icao})`;
    return iata || icao || code;
  }

  function formatRoute(origin, destination) {
    const from = formatAirport(origin);
    const to = formatAirport(destination);
    return from && to ? `${from} ✈ ${to}` : "";
  }

  function parseWorkerRoute(data) {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const airports = item._airports || data._airports;
      if (Array.isArray(airports) && airports.length >= 2) {
        const route = formatRoute(airports[0], airports[1]);
        if (route) return route;
      }
      if (Array.isArray(item.airport_route) && item.airport_route.length >= 2) {
        const route = formatRoute(item.airport_route[0], item.airport_route[item.airport_route.length - 1]);
        if (route) return route;
      }
      const route = formatRoute(item.origin || item.from, item.destination || item.to);
      if (route) return route;
    }
    return "";
  }

  function parseHexdbRoute(data) {
    if (!data || typeof data.route !== "string") return "";
    const airports = data.route.trim().toUpperCase().split("-");
    return airports.length >= 2 ? formatRoute(airports[0], airports[airports.length - 1]) : "";
  }

  async function fetchFlightRoute(aircraft) {
    const cleanCallsign = (aircraft.callsign || "").trim().toUpperCase();
    const registration = (aircraft.registration || "").trim().toUpperCase();
    const hex = (aircraft.icao24 || "").trim().toUpperCase();
    if (!cleanCallsign || cleanCallsign === "N/A" || cleanCallsign === "----" ||
        cleanCallsign === registration || cleanCallsign === hex) {
      return "";
    }
    if (routeCache.has(cleanCallsign)) return routeCache.get(cleanCallsign);

    let routeText = "";
    try {
      const response = await fetch("https://radar.fwolfph.workers.dev/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planes: [{ callsign: cleanCallsign, lat: aircraft.lat, lng: aircraft.lon }]
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      routeText = parseWorkerRoute(await response.json());
    } catch (error) {
      console.warn("[MUC-RADAR] Worker-Routenabfrage fehlgeschlagen:", error);
    }

    if (!routeText) {
      try {
        const response = await fetch(
          `https://hexdb.io/api/v1/route/icao/${encodeURIComponent(cleanCallsign)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        routeText = parseHexdbRoute(await response.json());
      } catch (error) {
        console.warn("[MUC-RADAR] HexDB-Routenabfrage fehlgeschlagen:", error);
      }
    }

    if (routeText) routeCache.set(cleanCallsign, routeText);
    return routeText;
  }

  async function fetchAndDisplayRoute(aircraft) {
    const routeTextEl = document.getElementById("poke-route-text");
    if (!routeTextEl) return;

    const cleanCallsign = (aircraft.callsign || "").trim().toUpperCase();
    currentRouteCallsign = cleanCallsign;
    routeTextEl.classList.remove("poke-route-found");
    const registration = (aircraft.registration || "").trim().toUpperCase();
    const hex = (aircraft.icao24 || "").trim().toUpperCase();
    if (!cleanCallsign || cleanCallsign === "N/A" || cleanCallsign === "----" ||
        cleanCallsign === registration || cleanCallsign === hex) {
      currentRouteCallsign = null;
      routeTextEl.textContent = "ROUTE NICHT VERFÜGBAR";
      return;
    }

    const cachedRoute = routeCache.get(cleanCallsign);
    if (cachedRoute) {
      routeTextEl.textContent = cachedRoute;
      routeTextEl.classList.add("poke-route-found");
      return;
    }

    routeTextEl.textContent = "ROUTE WIRD ERMITTELT...";
    const routeText = await fetchFlightRoute(aircraft);
    if (currentRouteCallsign !== cleanCallsign) return;
    if (routeText) {
      routeTextEl.textContent = routeText;
      routeTextEl.classList.add("poke-route-found");
    } else {
      routeTextEl.textContent = "ROUTE NICHT VERFÜGBAR";
    }
  }

  async function checkSpecialLivery(ac, cardEl, liveryBadgeEl, liveryTextEl) {
    // 1. Immediate check in known registrations dictionary
    const reg = (ac.registration || "").toUpperCase().trim();
    let liveryName = detectKnownSpecialLivery(reg);

    if (liveryName) {
      applyLivery(liveryName);
      return;
    }

    // Hide initially if no known livery
    cardEl.classList.remove("special-livery");
    liveryBadgeEl.hidden = true;

    // 2. Optional check via planespotters API if registration exists
    if (reg && reg !== "----") {
      try {
        const cleanReg = reg.replace(/-/g, "");
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        try {
          const resp = await fetch(`https://api.planespotters.net/pub/photos/reg/${cleanReg}`, {
            signal: controller.signal
          });
          if (resp.ok) {
            const pData = await resp.json();
            if (pData && Array.isArray(pData.photos)) {
              const photoMetadata = pData.photos
                .filter(photo => photo && typeof photo === "object")
                .flatMap(photo => Object.values(photo).filter(value => typeof value === "string"))
                .join(" ")
                .toLowerCase();
              const specialKeywords = [
                "retro", "special", "livery", "stripes", "fanhansa", "alliance",
                "oneworld", "skyteam", "honu", "expo", "disney", "star wars"
              ];
              if (specialKeywords.some(keyword => photoMetadata.includes(keyword))) {
                applyLivery("SPECIAL LIVERY");
              }
            }
          }
        } finally {
          clearTimeout(tid);
        }
      } catch (error) {
        console.warn("[MUC-RADAR] Planespotters-Abfrage für Sonderlackierung fehlgeschlagen:", error);
      }
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

    if (!pokeModal) {
      drawRadar();
      return;
    }
    pokeModal.hidden = false;
    drawRadar();

    updateCardContent(ac);

    // Fetch and display route parallelly
    fetchAndDisplayRoute(ac);

    // Check special livery
    const cardEl = pokeModal.querySelector(".poke-card");
    const liveryBadgeEl = document.getElementById("poke-livery-badge");
    const liveryTextEl = document.getElementById("poke-livery-text");
    if (cardEl && liveryBadgeEl && liveryTextEl) {
      checkSpecialLivery(ac, cardEl, liveryBadgeEl, liveryTextEl);
    }

    // If hexdb not queried yet, fetch model info
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
    const operator = resolveAirlineName(ac, hex);

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
      else if (ac.verticalRate && ac.verticalRate < -1.5) phase = "ANFLUG / SINKFLUG";
      else if (ac.verticalRate && ac.verticalRate > 1.5) phase = "STEIGFLUG";

      const squawk = ac.squawk ? `SQUAWK ${ac.squawk}` : "SQUAWK ----";
      statusEl.textContent = `${phase} [${squawk}]`;
    }
  }

  function closePokemonCard() {
    if (pokeModal) pokeModal.hidden = true;
    selectedAircraft = null;
    drawRadar();
  }

  if (pokeCloseBtn) pokeCloseBtn.addEventListener("click", closePokemonCard);
  if (pokeModal) {
    pokeModal.addEventListener("click", (e) => {
      if (e.target === pokeModal) closePokemonCard();
    });
  }

  document.addEventListener("visibilitychange", () => {
    clearTimeout(fetchTimer);
    fetchTimer = null;
    if (document.hidden) {
      if (!isFetching) {
        fetchTimer = setTimeout(fetchLiveAircraft, 15000);
      }
    } else if (!isFetching) {
      void fetchLiveAircraft();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pokeModal && !pokeModal.hidden) {
      closePokemonCard();
    }
  });

  // Initial startup
  resizeCanvas();
  updateZoomButtons();
  void fetchLiveAircraft();
})();
