/* ==========================================================
   U of T Statistical Sciences
   Alumni Destinations Globe

   Behaviour:
   - Uses alumni-cities.json as anonymous destinations
   - No city names or alumni counts displayed
   - Equal-weight destination points
   - One connection per destination
   - Toronto is the origin
   - Slow automatic rotation when idle
   - Drag to rotate
   - Flick / swipe gives the globe momentum
   - Momentum gradually decays
   - Touching the globe immediately stops momentum
   - Ambient rotation resumes after momentum dissipates
   ========================================================== */

(() => {
  "use strict";


  /* ==========================================================
     ELEMENTS
     ========================================================== */

  const container =
    document.getElementById("alumni-globe");

  const canvas =
    document.getElementById("globe-canvas");


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


  const context =
    canvas.getContext("2d");


  /* ==========================================================
     COLOURS
     ========================================================== */

  const COLORS = {

    ocean:
      "#ffffff",

    land:
      "#d9e8ed",

    blue:
      "#0180a5",

    darkBlue:
      "#071b33",

    landOutline:
      "rgba(1,128,165,0.55)",

    graticule:
      "rgba(1,128,165,0.16)",

    arc:
      "rgba(1,128,165,0.34)",

    pointHalo:
      "rgba(1,128,165,0.16)"

  };


  /* ==========================================================
     TORONTO
     ========================================================== */

  const TORONTO = {

    coordinates: [
      -79.3832,
      43.6532
    ]

  };


  /* ==========================================================
     VISUAL SETTINGS
     ========================================================== */

  const DESTINATION_RADIUS =
    4.25;


  const DESTINATION_HALO_RADIUS =
    7;


  const ARC_WIDTH =
    0.9;


  const TORONTO_RADIUS =
    8;


  const TORONTO_HALO_RADIUS =
    13;


  /* ==========================================================
     ROTATION SETTINGS
     ========================================================== */

  /*
   * Normal idle rotation.
   *
   * Degrees per second.
   */

  const AUTO_ROTATE_SPEED =
    3.25;


  /*
   * How much pointer movement rotates the globe.
   */

  const DRAG_SENSITIVITY =
    0.35;


  /*
   * Momentum retention per 60fps frame.
   *
   * Closer to 1 = longer coast.
   *
   * 0.94 gives a noticeable but controlled glide.
   */

  const MOMENTUM_FRICTION =
    0.94;


  /*
   * Once momentum drops below this value,
   * return to normal ambient rotation.
   */

  const MOMENTUM_MINIMUM =
    0.01;


  /*
   * Prevent extremely violent flicks from spinning
   * the globe unrealistically fast.
   */

  const MAX_MOMENTUM =
    2.8;


  /*
   * Smoothing applied to measured drag velocity.
   *
   * Higher = final movement has more influence.
   */

  const MOMENTUM_SMOOTHING =
    0.65;


  /* ==========================================================
     STATE
     ========================================================== */

  let width = 0;

  let height = 0;

  let dpr = 1;


  let land =
    null;


  let destinations =
    [];


  /*
   * Initial orientation.
   */

  let rotation = [
    79,
    -28,
    0
  ];


  /*
   * Interaction state.
   */

  let isDragging =
    false;


  let hasMomentum =
    false;


  /*
   * Angular momentum.
   *
   * X corresponds to longitude.
   * Y corresponds to latitude.
   */

  let momentumX =
    0;


  let momentumY =
    0;


  /*
   * Animation timing.
   */

  let animationFrame =
    null;


  let lastFrameTime =
    null;


  /*
   * Drag timing.
   */

  let lastDragTime =
    null;


  /* ==========================================================
     PROJECTION
     ========================================================== */

  const projection =
    d3
      .geoOrthographic()

      .clipAngle(90)

      .precision(0.4);


  const path =
    d3.geoPath(
      projection,
      context
    );


  /* ==========================================================
     HELPERS
     ========================================================== */

  function clamp(
    value,
    minimum,
    maximum
  ) {

    return Math.max(
      minimum,
      Math.min(
        maximum,
        value
      )
    );
  }


  function clampLatitude() {

    rotation[1] =
      clamp(
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

      rotation[0] %=
        360;

    }
  }


  /* ==========================================================
     LOAD DATA
     ========================================================== */

  async function loadData() {


    /* --------------------------------------------------------
       World geography
       -------------------------------------------------------- */

    const worldResponse =
      await fetch(
        "assets/data/land-110m.json"
      );


    if (!worldResponse.ok) {

      throw new Error(
        "Unable to load assets/data/land-110m.json"
      );

    }


    const worldData =
      await worldResponse.json();


    land =
      topojson.feature(
        worldData,
        worldData.objects.land
      );


    /* --------------------------------------------------------
       Anonymous destinations
       -------------------------------------------------------- */

    try {

      const destinationResponse =
        await fetch(
          "assets/data/alumni-cities.json"
        );


      if (!destinationResponse.ok) {

        throw new Error(
          "alumni-cities.json not found"
        );

      }


      const destinationData =
        await destinationResponse.json();


      destinations =
        destinationData

          .filter(
            d =>
              Number.isFinite(
                Number(d.longitude)
              ) &&
              Number.isFinite(
                Number(d.latitude)
              )
          )

          .map(
            d => ({

              longitude:
                Number(d.longitude),

              latitude:
                Number(d.latitude)

            })
          );


      console.log(
        `Alumni globe: loaded ${destinations.length} anonymous destinations.`
      );


    } catch (error) {

      console.warn(
        "Destination data unavailable. Rendering globe without destination points.",
        error
      );


      destinations = [];

    }


    updateStats();
  }


  /* ==========================================================
     FIXED STATISTICS
     ========================================================== */

  function updateStats() {

    const alumniElement =
      document.getElementById(
        "alumni-total"
      );


    const countryElement =
      document.getElementById(
        "country-total"
      );


    const destinationElement =
      document.getElementById(
        "city-total"
      );


    if (alumniElement) {

      alumniElement.textContent =
        "12K+";

    }


    if (countryElement) {

      countryElement.textContent =
        "47";

    }


    if (destinationElement) {

      destinationElement.textContent =
        "212+";

    }
  }


  /* ==========================================================
     RESIZE
     ========================================================== */

  function resize() {

    const rect =
      container.getBoundingClientRect();


    width =
      Math.max(
        1,
        rect.width
      );


    height =
      Math.max(
        1,
        rect.height
      );


    dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );


    canvas.width =
      Math.round(
        width * dpr
      );


    canvas.height =
      Math.round(
        height * dpr
      );


    canvas.style.width =
      `${width}px`;


    canvas.style.height =
      `${height}px`;


    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );


    projection

      .translate([
        width / 2,
        height / 2
      ])

      .scale(
        Math.min(
          width,
          height
        ) * 0.43
      )

      .rotate(
        rotation
      );


    draw();
  }


  /* ==========================================================
     VISIBILITY
     ========================================================== */

  function isVisible(
    longitude,
    latitude
  ) {

    const center =
      projection.invert([
        width / 2,
        height / 2
      ]);


    if (!center) {

      return false;

    }


    return (
      d3.geoDistance(
        center,
        [
          longitude,
          latitude
        ]
      ) <
      Math.PI / 2
    );
  }


  /* ==========================================================
     TORONTO CHECK
     ========================================================== */

  function isToronto(
    destination
  ) {

    return (
      Math.abs(
        destination.longitude -
        TORONTO.coordinates[0]
      ) < 0.05
      &&
      Math.abs(
        destination.latitude -
        TORONTO.coordinates[1]
      ) < 0.05
    );
  }


  /* ==========================================================
     DRAW DESTINATION ARC
     ========================================================== */

  function drawArc(
    destination
  ) {

    if (
      isToronto(
        destination
      )
    ) {

      return;

    }


    if (
      !isVisible(
        destination.longitude,
        destination.latitude
      )
    ) {

      return;

    }


    const start =
      TORONTO.coordinates;


    const end = [
      destination.longitude,
      destination.latitude
    ];


    const projectedStart =
      projection(
        start
      );


    const projectedEnd =
      projection(
        end
      );


    if (
      !projectedStart ||
      !projectedEnd
    ) {

      return;

    }


    const interpolate =
      d3.geoInterpolate(
        start,
        end
      );


    const steps =
      50;


    const points =
      d3
        .range(
          steps + 1
        )

        .map(
          i =>
            interpolate(
              i / steps
            )
        );


    const dx =
      projectedEnd[0] -
      projectedStart[0];


    const dy =
      projectedEnd[1] -
      projectedStart[1];


    const screenDistance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );


    const lift =
      Math.min(
        105,
        screenDistance * 0.22
      );


    context.beginPath();


    let started =
      false;


    for (
      let i = 0;
      i < points.length;
      i++
    ) {

      const geographicPoint =
        points[i];


      if (
        !isVisible(
          geographicPoint[0],
          geographicPoint[1]
        )
      ) {

        started =
          false;

        continue;

      }


      const point =
        projection(
          geographicPoint
        );


      if (!point) {

        continue;

      }


      const t =
        i /
        (points.length - 1);


      const arcHeight =
        4 *
        t *
        (1 - t) *
        lift;


      const x =
        point[0];


      const y =
        point[1] -
        arcHeight;


      if (!started) {

        context.moveTo(
          x,
          y
        );


        started =
          true;

      } else {

        context.lineTo(
          x,
          y
        );

      }
    }


    context.strokeStyle =
      COLORS.arc;


    context.lineWidth =
      ARC_WIDTH;


    context.stroke();
  }


  /* ==========================================================
     DRAW DESTINATION POINT
     ========================================================== */

  function drawDestination(
    destination
  ) {

    if (
      !isVisible(
        destination.longitude,
        destination.latitude
      )
    ) {

      return;

    }


    const point =
      projection([
        destination.longitude,
        destination.latitude
      ]);


    if (!point) {

      return;

    }


    /* --------------------------------------------------------
       Halo
       -------------------------------------------------------- */

    context.beginPath();


    context.arc(
      point[0],
      point[1],
      DESTINATION_HALO_RADIUS,
      0,
      Math.PI * 2
    );


    context.fillStyle =
      COLORS.pointHalo;


    context.fill();


    /* --------------------------------------------------------
       Destination point
       -------------------------------------------------------- */

    context.beginPath();


    context.arc(
      point[0],
      point[1],
      DESTINATION_RADIUS,
      0,
      Math.PI * 2
    );


    context.fillStyle =
      COLORS.blue;


    context.fill();


    context.strokeStyle =
      COLORS.ocean;


    context.lineWidth =
      1;


    context.stroke();
  }


  /* ==========================================================
     DRAW TORONTO
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


    const toronto =
      projection(
        TORONTO.coordinates
      );


    if (!toronto) {

      return;

    }


    /* --------------------------------------------------------
       Halo
       -------------------------------------------------------- */

    context.beginPath();


    context.arc(
      toronto[0],
      toronto[1],
      TORONTO_HALO_RADIUS,
      0,
      Math.PI * 2
    );


    context.fillStyle =
      "rgba(1,128,165,0.18)";


    context.fill();


    /* --------------------------------------------------------
       Toronto marker
       -------------------------------------------------------- */

    context.beginPath();


    context.arc(
      toronto[0],
      toronto[1],
      TORONTO_RADIUS,
      0,
      Math.PI * 2
    );


    context.fillStyle =
      COLORS.darkBlue;


    context.fill();


    context.strokeStyle =
      COLORS.blue;


    context.lineWidth =
      3;


    context.stroke();


    /* --------------------------------------------------------
       Centre
       -------------------------------------------------------- */

    context.beginPath();


    context.arc(
      toronto[0],
      toronto[1],
      2.75,
      0,
      Math.PI * 2
    );


    context.fillStyle =
      COLORS.ocean;


    context.fill();
  }


  /* ==========================================================
     DRAW GLOBE
     ========================================================== */

  function draw() {

    if (!land) {

      return;

    }


    context.clearRect(
      0,
      0,
      width,
      height
    );


    projection.rotate(
      rotation
    );


    /* --------------------------------------------------------
       White sphere
       -------------------------------------------------------- */

    context.beginPath();


    path({
      type: "Sphere"
    });


    context.fillStyle =
      COLORS.ocean;


    context.fill();


    /* --------------------------------------------------------
       Land
       -------------------------------------------------------- */

    context.beginPath();


    path(
      land
    );


    context.fillStyle =
      COLORS.land;


    context.fill();


    context.strokeStyle =
      COLORS.landOutline;


    context.lineWidth =
      0.55;


    context.stroke();


    /* --------------------------------------------------------
       Graticule
       -------------------------------------------------------- */

    context.beginPath();


    path(
      d3.geoGraticule10()
    );


    context.strokeStyle =
      COLORS.graticule;


    context.lineWidth =
      0.5;


    context.stroke();


    /* --------------------------------------------------------
       Destination connections
       -------------------------------------------------------- */

    for (
      const destination
      of destinations
    ) {

      drawArc(
        destination
      );

    }


    /* --------------------------------------------------------
       Destination points
       -------------------------------------------------------- */

    for (
      const destination
      of destinations
    ) {

      drawDestination(
        destination
      );

    }


    /* --------------------------------------------------------
       Toronto
       -------------------------------------------------------- */

    drawToronto();


    /* --------------------------------------------------------
       Globe edge
       -------------------------------------------------------- */

    context.beginPath();


    path({
      type: "Sphere"
    });


    context.strokeStyle =
      "rgba(255,255,255,0.95)";


    context.lineWidth =
      1.25;


    context.stroke();
  }


  /* ==========================================================
     ANIMATION

     Three possible states:

     1. User dragging:
        animation does not alter rotation.

     2. Momentum:
        globe continues with the velocity of the last drag
        and gradually slows down.

     3. Idle:
        normal automatic rotation.
     ========================================================== */

  function animate(
    timestamp
  ) {

    if (
      lastFrameTime === null
    ) {

      lastFrameTime =
        timestamp;

    }


    const delta =
      Math.min(
        50,
        timestamp -
        lastFrameTime
      );


    lastFrameTime =
      timestamp;


    /*
     * Convert frame duration to a 60fps multiplier.
     *
     * This keeps momentum behaviour similar on 60Hz,
     * 120Hz and other displays.
     */

    const frameScale =
      delta /
      (1000 / 60);


    /* ========================================================
       MOMENTUM
       ======================================================== */

    if (
      !isDragging &&
      hasMomentum
    ) {

      rotation[0] +=
        momentumX *
        frameScale;


      rotation[1] +=
        momentumY *
        frameScale;


      clampLatitude();

      normalizeLongitude();


      /*
       * Apply frame-rate-independent friction.
       */

      const friction =
        Math.pow(
          MOMENTUM_FRICTION,
          frameScale
        );


      momentumX *=
        friction;


      momentumY *=
        friction;


      /*
       * Once momentum becomes imperceptible,
       * return to ambient rotation.
       */

      if (
        Math.abs(
          momentumX
        ) <
        MOMENTUM_MINIMUM
        &&
        Math.abs(
          momentumY
        ) <
        MOMENTUM_MINIMUM
      ) {

        momentumX =
          0;


        momentumY =
          0;


        hasMomentum =
          false;

      }


      projection.rotate(
        rotation
      );


      draw();

    }


    /* ========================================================
       IDLE AUTO ROTATION
       ======================================================== */

    else if (
      !isDragging
    ) {

      rotation[0] +=
        AUTO_ROTATE_SPEED *
        (delta / 1000);


      normalizeLongitude();


      projection.rotate(
        rotation
      );


      draw();

    }


    animationFrame =
      requestAnimationFrame(
        animate
      );
  }


  /* ==========================================================
     DRAG WITH MOMENTUM
     ========================================================== */

  const drag =
    d3
      .drag()


      /* ------------------------------------------------------
         GRAB

         Immediately stop any existing momentum.
         ------------------------------------------------------ */

      .on(
        "start",
        () => {

          isDragging =
            true;


          hasMomentum =
            false;


          momentumX =
            0;


          momentumY =
            0;


          lastDragTime =
            performance.now();


          canvas.style.cursor =
            "grabbing";

        }
      )


      /* ------------------------------------------------------
         DRAG

         Rotate globe and continuously measure angular
         velocity for the eventual release.
         ------------------------------------------------------ */

      .on(
        "drag",
        event => {

          const now =
            performance.now();


          /*
           * Milliseconds since previous drag event.
           */

          const elapsed =
            Math.max(
              1,
              now -
              lastDragTime
            );


          lastDragTime =
            now;


          /*
           * Convert pointer movement to angular movement.
           */

          const rotationX =
            event.dx *
            DRAG_SENSITIVITY;


          const rotationY =
            -event.dy *
            DRAG_SENSITIVITY;


          rotation[0] +=
            rotationX;


          rotation[1] +=
            rotationY;


          clampLatitude();

          normalizeLongitude();


          /*
           * Normalize drag velocity to approximately
           * one 60fps frame.

           * This means momentum is based on how FAST
           * the user moved, not merely how far.
           */

          const timeScale =
            (1000 / 60) /
            elapsed;


          const measuredMomentumX =
            rotationX *
            timeScale;


          const measuredMomentumY =
            rotationY *
            timeScale;


          /*
           * Smooth velocity measurements.

           * This prevents one noisy pointer event from
           * determining the entire release velocity.
           */

          momentumX =
            momentumX *
            (1 - MOMENTUM_SMOOTHING)
            +
            measuredMomentumX *
            MOMENTUM_SMOOTHING;


          momentumY =
            momentumY *
            (1 - MOMENTUM_SMOOTHING)
            +
            measuredMomentumY *
            MOMENTUM_SMOOTHING;


          /*
           * Cap extreme flicks.
           */

          momentumX =
            clamp(
              momentumX,
              -MAX_MOMENTUM,
              MAX_MOMENTUM
            );


          momentumY =
            clamp(
              momentumY,
              -MAX_MOMENTUM,
              MAX_MOMENTUM
            );


          projection.rotate(
            rotation
          );


          draw();

        }
      )


      /* ------------------------------------------------------
         RELEASE

         Preserve the velocity measured during the drag.
         ------------------------------------------------------ */

      .on(
        "end",
        () => {

          isDragging =
            false;


          /*
           * Only enter momentum mode if the release
           * velocity is actually meaningful.
           */

          hasMomentum =
            (
              Math.abs(
                momentumX
              ) >=
              MOMENTUM_MINIMUM
              ||
              Math.abs(
                momentumY
              ) >=
              MOMENTUM_MINIMUM
            );


          /*
           * Reset animation timing so there is no jump
           * immediately after release.
           */

          lastFrameTime =
            null;


          lastDragTime =
            null;


          canvas.style.cursor =
            "grab";

        }
      );


  /* ==========================================================
     STOP MOMENTUM IMMEDIATELY ON POINTER DOWN

     D3 drag start will also do this, but pointerdown makes
     the response instantaneous even before D3 determines
     that a drag has begun.
     ========================================================== */

  function stopMomentum() {

    hasMomentum =
      false;


    momentumX =
      0;


    momentumY =
      0;

  }


  /* ==========================================================
     RESIZE
     ========================================================== */

  let resizeTimer =
    null;


  function handleResize() {

    clearTimeout(
      resizeTimer
    );


    resizeTimer =
      setTimeout(
        resize,
        100
      );
  }


  /* ==========================================================
     REDUCED MOTION
     ========================================================== */

  function prefersReducedMotion() {

    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }


  /* ==========================================================
     INITIALIZE
     ========================================================== */

  async function init() {

    try {

      await loadData();


      resize();


      /* ------------------------------------------------------
         Drag interaction
         ------------------------------------------------------ */

      d3
        .select(canvas)

        .call(
          drag
        );


      /*
       * Touching/grabbing the globe immediately kills
       * any existing inertia.
       */

      canvas.addEventListener(
        "pointerdown",
        stopMomentum,
        {
          passive: true
        }
      );


      /* ------------------------------------------------------
         Resize
         ------------------------------------------------------ */

      window.addEventListener(
        "resize",
        handleResize,
        {
          passive: true
        }
      );


      /* ------------------------------------------------------
         Animation
         ------------------------------------------------------ */

      if (
        !prefersReducedMotion()
      ) {

        animationFrame =
          requestAnimationFrame(
            animate
          );

      }


    } catch (error) {

      console.error(
        "Unable to load alumni globe:",
        error
      );

    }
  }


  /* ==========================================================
     START
     ========================================================== */

  init();

})();
