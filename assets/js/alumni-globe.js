
/* ==========================================================
   U OF T STATISTICAL SCIENCES
   UNDERGRADUATE DIGITAL BROCHURE

   Interactive Alumni Destinations Globe

   Based on the Graduate Programs digital brochure.

   Features:
   - Orthographic globe
   - Anonymous destination points
   - Toronto-to-destination connections
   - Automatic rotation
   - Drag interaction
   - Momentum / inertia
   - Friction-based deceleration
   - Responsive canvas
   - Reduced-motion support

   File: assets/js/alumni-globe.js
   Version: 1.0
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     01 / ELEMENTS
     ========================================================== */

  const container = document.getElementById("alumni-globe");
  const canvas = document.getElementById("globe-canvas");

  if (
    !container ||
    !canvas ||
    typeof d3 === "undefined" ||
    typeof topojson === "undefined"
  ) {
    console.warn(
      "Alumni globe: required element or library not found."
    );
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    console.warn("Alumni globe: canvas context unavailable.");
    return;
  }


  /* ==========================================================
     02 / COLOURS
     ========================================================== */

  const COLORS = {
    ocean: "#ffffff",
    land: "#d9e8ed",
    blue: "#0180a5",
    darkBlue: "#071b33",

    landOutline: "rgba(1,128,165,0.55)",
    graticule: "rgba(1,128,165,0.16)",
    arc: "rgba(1,128,165,0.34)",
    pointHalo: "rgba(1,128,165,0.16)"
  };


  /* ==========================================================
     03 / TORONTO ORIGIN
     ========================================================== */

  const TORONTO = {
    coordinates: [-79.3832, 43.6532]
  };


  /* ==========================================================
     04 / VISUAL SETTINGS
     ========================================================== */

  const DESTINATION_RADIUS = 4.25;
  const DESTINATION_HALO_RADIUS = 7;

  const ARC_WIDTH = 0.9;

  const TORONTO_RADIUS = 8;
  const TORONTO_HALO_RADIUS = 13;


  /* ==========================================================
     05 / ROTATION SETTINGS
     ========================================================== */

  /*
   * Ambient rotation in degrees per second.
   */

  const AUTO_ROTATE_SPEED = 3.25;

  /*
   * Angular movement per pixel dragged.
   */

  const DRAG_SENSITIVITY = 0.35;

  /*
   * Momentum retention per 60fps frame.
   *
   * Higher values = longer coast.
   */

  const MOMENTUM_FRICTION = 0.94;

  /*
   * Minimum angular velocity before returning
   * to ambient rotation.
   */

  const MOMENTUM_MINIMUM = 0.01;

  /*
   * Maximum angular momentum per 60fps frame.
   */

  const MAX_MOMENTUM = 2.8;

  /*
   * Smoothing applied to pointer velocity.
   */

  const MOMENTUM_SMOOTHING = 0.65;


  /* ==========================================================
     06 / STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let land = null;
  let destinations = [];

  /*
   * Initial globe orientation.
   *
   * North America is prominent on load.
   */

  const rotation = [79, -28, 0];

  let isDragging = false;
  let hasMomentum = false;

  let momentumX = 0;
  let momentumY = 0;

  let animationFrame = null;
  let lastFrameTime = null;
  let lastDragTime = null;

  let resizeTimer = null;
  let isVisible = true;


  /* ==========================================================
     07 / D3 PROJECTION
     ========================================================== */

  const projection = d3.geoOrthographic()
    .clipAngle(90)
    .precision(0.4);

  const path = d3.geoPath(
    projection,
    context
  );


  /* ==========================================================
     08 / HELPERS
     ========================================================== */

  function clamp(value, minimum, maximum) {
    return Math.max(
      minimum,
      Math.min(maximum, value)
    );
  }

  function clampLatitude() {
    rotation[1] = clamp(
      rotation[1],
      -90,
      90
    );
  }

  function normalizeLongitude() {
    if (
      rotation[0] > 360 ||
      rotation[0] < -360
    ) {
      rotation[0] %= 360;
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }


  /* ==========================================================
     09 / LOAD GEOGRAPHIC DATA
     ========================================================== */

  async function loadData() {

    /* --------------------------------------------------------
       World geography
       -------------------------------------------------------- */

    const worldResponse = await fetch(
      "assets/data/land-110m.json"
    );

    if (!worldResponse.ok) {
      throw new Error(
        "Unable to load assets/data/land-110m.json"
      );
    }

    const worldData = await worldResponse.json();

    land = topojson.feature(
      worldData,
      worldData.objects.land
    );


    /* --------------------------------------------------------
       Anonymous alumni destinations

       Only coordinates are used.

       Names, counts, and other alumni information are
       ignored by the visualization.
       -------------------------------------------------------- */

    try {
      const response = await fetch(
        "assets/data/alumni-cities.json"
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load alumni-cities.json"
        );
      }

      const data = await response.json();

      destinations = data
        .filter(d =>
          Number.isFinite(Number(d.longitude)) &&
          Number.isFinite(Number(d.latitude)) &&
          Math.abs(Number(d.latitude)) <= 90 &&
          Math.abs(Number(d.longitude)) <= 180
        )
        .map(d => ({
          longitude: Number(d.longitude),
          latitude: Number(d.latitude)
        }));

      console.log(
        `Alumni globe: ${destinations.length} anonymous destinations loaded.`
      );

    } catch (error) {
      console.warn(
        "Alumni destination data unavailable. Globe will render without destination points.",
        error
      );

      destinations = [];
    }

    updateStats();
  }


  /* ==========================================================
     10 / FIXED ALUMNI STATISTICS
     ========================================================== */

  function updateStats() {
    const stats = {
      "alumni-total": "12K+",
      "country-total": "47",
      "city-total": "212+"
    };

    for (const [id, value] of Object.entries(stats)) {
      const element = document.getElementById(id);

      if (element) {
        element.textContent = value;
      }
    }
  }


  /* ==========================================================
     11 / RESIZE CANVAS
     ========================================================== */

  function resize() {
    const rect = container.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);

    dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    context.setTransform(
      dpr, 0,
      0, dpr,
      0, 0
    );

    projection
      .translate([width / 2, height / 2])
      .scale(Math.min(width, height) * 0.43)
      .rotate(rotation);

    draw();
  }


  /* ==========================================================
     12 / GEOGRAPHIC VISIBILITY
     ========================================================== */

  function isVisible(longitude, latitude) {
    const center = projection.invert([
      width / 2,
      height / 2
    ]);

    if (!center) return false;

    return d3.geoDistance(
      center,
      [longitude, latitude]
    ) < Math.PI / 2;
  }


  /* ==========================================================
     13 / TORONTO CHECK
     ========================================================== */

  function isToronto(destination) {
    return (
      Math.abs(
        destination.longitude - TORONTO.coordinates[0]
      ) < 0.05 &&
      Math.abs(
        destination.latitude - TORONTO.coordinates[1]
      ) < 0.05
    );
  }


  /* ==========================================================
     14 / DRAW DESTINATION ARC
     ========================================================== */

  function drawArc(destination) {
    if (isToronto(destination)) return;

    if (
      !isVisible(
        destination.longitude,
        destination.latitude
      )
    ) {
      return;
    }

    const start = TORONTO.coordinates;

    const end = [
      destination.longitude,
      destination.latitude
    ];

    const projectedStart = projection(start);
    const projectedEnd = projection(end);

    if (!projectedStart || !projectedEnd) return;

    const interpolate = d3.geoInterpolate(start, end);

    const steps = 50;

    const dx = projectedEnd[0] - projectedStart[0];
    const dy = projectedEnd[1] - projectedStart[1];

    const screenDistance = Math.sqrt(
      dx * dx + dy * dy
    );

    const lift = Math.min(
      105,
      screenDistance * 0.22
    );

    context.beginPath();

    let started = false;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      const geographicPoint = interpolate(t);

      if (
        !isVisible(
          geographicPoint[0],
          geographicPoint[1]
        )
      ) {
        started = false;
        continue;
      }

      const point = projection(geographicPoint);

      if (!point) continue;

      const arcHeight =
        4 * t * (1 - t) * lift;

      const x = point[0];
      const y = point[1] - arcHeight;

      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }

    context.strokeStyle = COLORS.arc;
    context.lineWidth = ARC_WIDTH;
    context.stroke();
  }


  /* ==========================================================
     15 / DRAW DESTINATION POINT
     ========================================================== */

  function drawDestination(destination) {
    if (
      !isVisible(
        destination.longitude,
        destination.latitude
      )
    ) {
      return;
    }

    const point = projection([
      destination.longitude,
      destination.latitude
    ]);

    if (!point) return;

    /* Halo */

    context.beginPath();

    context.arc(
      point[0],
      point[1],
      DESTINATION_HALO_RADIUS,
      0,
      Math.PI * 2
    );

    context.fillStyle = COLORS.pointHalo;
    context.fill();


    /* Destination */

    context.beginPath();

    context.arc(
      point[0],
      point[1],
      DESTINATION_RADIUS,
      0,
      Math.PI * 2
    );

    context.fillStyle = COLORS.blue;
    context.fill();

    context.strokeStyle = COLORS.ocean;
    context.lineWidth = 1;
    context.stroke();
  }


  /* ==========================================================
     16 / DRAW TORONTO
     ========================================================== */

  function drawToronto() {
    if (
      !isVisible(
        TORONTO.coordinates[0],
        TORONTO.coordinates[1]
      )
    ) {
      return;
    }

    const point = projection(TORONTO.coordinates);

    if (!point) return;

    /* Halo */

    context.beginPath();

    context.arc(
      point[0],
      point[1],
      TORONTO_HALO_RADIUS,
      0,
      Math.PI * 2
    );

    context.fillStyle = "rgba(1,128,165,0.18)";
    context.fill();


    /* Main marker */

    context.beginPath();

    context.arc(
      point[0],
      point[1],
      TORONTO_RADIUS,
      0,
      Math.PI * 2
    );

    context.fillStyle = COLORS.darkBlue;
    context.fill();

    context.strokeStyle = COLORS.blue;
    context.lineWidth = 3;
    context.stroke();


    /* Centre */

    context.beginPath();

    context.arc(
      point[0],
      point[1],
      2.75,
      0,
      Math.PI * 2
    );

    context.fillStyle = COLORS.ocean;
    context.fill();
  }


  /* ==========================================================
     17 / DRAW GLOBE
     ========================================================== */

  function draw() {
    if (!land) return;

    context.clearRect(
      0, 0,
      width, height
    );

    projection.rotate(rotation);


    /* White sphere */

    context.beginPath();
    path({ type: "Sphere" });

    context.fillStyle = COLORS.ocean;
    context.fill();


    /* Land */

    context.beginPath();
    path(land);

    context.fillStyle = COLORS.land;
    context.fill();

    context.strokeStyle = COLORS.landOutline;
    context.lineWidth = 0.55;
    context.stroke();


    /* Geographic grid */

    context.beginPath();
    path(d3.geoGraticule10());

    context.strokeStyle = COLORS.graticule;
    context.lineWidth = 0.5;
    context.stroke();


    /* Destination connections */

    for (const destination of destinations) {
      drawArc(destination);
    }


    /* Destination points */

    for (const destination of destinations) {
      drawDestination(destination);
    }


    /* Toronto origin */

    drawToronto();


    /* Outer sphere */

    context.beginPath();
    path({ type: "Sphere" });

    context.strokeStyle = "rgba(255,255,255,0.95)";
    context.lineWidth = 1.25;
    context.stroke();
  }


  /* ==========================================================
     18 / ANIMATION LOOP
     ========================================================== */

  function animate(timestamp) {
    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
    }

    const delta = Math.min(
      50,
      timestamp - lastFrameTime
    );

    lastFrameTime = timestamp;

    const frameScale = delta / (1000 / 60);

    if (!isDragging && isVisible) {

      /* ------------------------------------------------------
         Momentum
         ------------------------------------------------------ */

      if (hasMomentum) {
        rotation[0] += momentumX * frameScale;
        rotation[1] += momentumY * frameScale;

        clampLatitude();
        normalizeLongitude();

        const friction = Math.pow(
          MOMENTUM_FRICTION,
          frameScale
        );

        momentumX *= friction;
        momentumY *= friction;

        if (
          Math.abs(momentumX) < MOMENTUM_MINIMUM &&
          Math.abs(momentumY) < MOMENTUM_MINIMUM
        ) {
          momentumX = 0;
          momentumY = 0;
          hasMomentum = false;
        }

      } else {

        /* ----------------------------------------------------
           Ambient rotation
           ---------------------------------------------------- */

        rotation[0] +=
          AUTO_ROTATE_SPEED * (delta / 1000);

        normalizeLongitude();
      }

      draw();
    }

    animationFrame = requestAnimationFrame(animate);
  }


  /* ==========================================================
     19 / D3 DRAG INTERACTION
     ========================================================== */

  const drag = d3.drag()

    /* --------------------------------------------------------
       Grab
       -------------------------------------------------------- */

    .on("start", () => {
      isDragging = true;
      hasMomentum = false;

      momentumX = 0;
      momentumY = 0;

      lastDragTime = performance.now();

      canvas.style.cursor = "grabbing";
    })


    /* --------------------------------------------------------
       Drag
       -------------------------------------------------------- */

    .on("drag", event => {
      const now = performance.now();

      const elapsed = Math.max(
        1,
        now - lastDragTime
      );

      lastDragTime = now;

      const rotationX =
        event.dx * DRAG_SENSITIVITY;

      const rotationY =
        -event.dy * DRAG_SENSITIVITY;

      rotation[0] += rotationX;
      rotation[1] += rotationY;

      clampLatitude();
      normalizeLongitude();

      const timeScale =
        (1000 / 60) / elapsed;

      const measuredX = rotationX * timeScale;
      const measuredY = rotationY * timeScale;

      momentumX =
        momentumX * (1 - MOMENTUM_SMOOTHING) +
        measuredX * MOMENTUM_SMOOTHING;

      momentumY =
        momentumY * (1 - MOMENTUM_SMOOTHING) +
        measuredY * MOMENTUM_SMOOTHING;

      momentumX = clamp(
        momentumX,
        -MAX_MOMENTUM,
        MAX_MOMENTUM
      );

      momentumY = clamp(
        momentumY,
        -MAX_MOMENTUM,
        MAX_MOMENTUM
      );

      draw();
    })


    /* --------------------------------------------------------
       Release
       -------------------------------------------------------- */

    .on("end", () => {
      isDragging = false;

      hasMomentum =
        Math.abs(momentumX) >= MOMENTUM_MINIMUM ||
        Math.abs(momentumY) >= MOMENTUM_MINIMUM;

      lastFrameTime = null;
      lastDragTime = null;

      canvas.style.cursor = "grab";
    });


  /* ==========================================================
     20 / STOP MOMENTUM
     ========================================================== */

  function stopMomentum() {
    hasMomentum = false;

    momentumX = 0;
    momentumY = 0;
  }


  /* ==========================================================
     21 / RESIZE
     ========================================================== */

  function handleResize() {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(
      resize,
      100
    );
  }


  /* ==========================================================
     22 / VISIBILITY OBSERVER
     ========================================================== */

  function observeVisibility() {
    const section = document.getElementById("alumni");

    if (
      !section ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        isVisible = entries[0].isIntersecting;
        lastFrameTime = null;
      },
      { threshold: 0.05 }
    );

    observer.observe(section);
  }


  /* ==========================================================
     23 / INITIALIZE
     ========================================================== */

  async function init() {
    try {
      await loadData();

      resize();

      d3.select(canvas).call(drag);

      canvas.addEventListener(
        "pointerdown",
        stopMomentum,
        { passive: true }
      );

      window.addEventListener(
        "resize",
        handleResize,
        { passive: true }
      );

      observeVisibility();

      if (!prefersReducedMotion()) {
        animationFrame = requestAnimationFrame(animate);
      }

    } catch (error) {
      console.error(
        "Unable to initialize alumni globe:",
        error
      );
    }
  }


  /* ==========================================================
     START
     ========================================================== */

  init();

})();
