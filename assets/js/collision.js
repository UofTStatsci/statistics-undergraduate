
/* ==========================================================
   U of T Statistics
   Interactive Collision Hero

   Original graduate brochure implementation.

   Behaviour:
   - Particles begin already packed in the centre
   - No visible gathering animation on page load
   - Particles feel heavy rather than floaty
   - Pointer has a strong, immediate physical impact
   - Fast pointer movement transfers momentum to particles
   - Particles return quickly to the central mass
   - Collision keeps particles from overlapping
   ========================================================== */

(() => {
  "use strict";


  /* ==========================================================
     CANVAS
     ========================================================== */

  const canvas = document.getElementById("collision-canvas");

  if (!canvas) {
    console.warn("Collision canvas not found.");
    return;
  }

  if (typeof d3 === "undefined") {
    console.warn("D3 is not loaded.");
    return;
  }

  const ctx = canvas.getContext("2d");


  /* ==========================================================
     CONFIGURATION
     ========================================================== */

  const PARTICLE_COUNT = 150;

  /*
   * Particle sizes.
   */
  const MIN_RADIUS = 5;
  const MAX_RADIUS = 16;


  /*
   * INITIAL PACKING
   *
   * The particles are positioned geometrically before
   * anything is displayed.
   *
   * This controls the spacing of that initial cluster.
   */
  const INITIAL_SPACING = 14;


  /*
   * CENTRE FORCE
   *
   * This does NOT build the initial cluster.
   *
   * Its job is to restore particles after the mouse
   * knocks them out of position.
   *
   * Higher = faster return.
   */
  const CENTER_STRENGTH = 0.12;


  /*
   * WEIGHT / DAMPING
   *
   * Higher velocityDecay makes the balls feel heavier
   * and less like floating bubbles.
   */
  const VELOCITY_DECAY = 0.38;


  /*
   * POINTER INFLUENCE AREA
   *
   * Balls inside this radius are physically pushed
   * by the mouse.
   */
  const POINTER_RADIUS = 200;


  /*
   * POINTER FORCE
   *
   * Higher = stronger displacement.
   *
   * This is intentionally quite strong.
   */
  const POINTER_FORCE = 11;


  /*
   * POINTER MOMENTUM TRANSFER
   *
   * When the mouse moves quickly, some of that velocity
   * is transferred into the balls.
   */
  const POINTER_VELOCITY_FORCE = 0.16;


  /*
   * COLLISION
   */
  const COLLISION_PADDING = 1.5;
  const COLLISION_STRENGTH = 1;
  const COLLISION_ITERATIONS = 8;


  /*
   * INVISIBLE STARTUP TICKS
   *
   * Because particles already begin in a geometric cluster,
   * D3 only needs a few ticks to resolve minor overlaps.
   *
   * None of these frames are shown to the visitor.
   */
  const INITIAL_SETTLE_TICKS = 50;


  /* ==========================================================
     STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let nodes = [];
  let simulation = null;

  let pointerX = null;
  let pointerY = null;

  let previousPointerX = null;
  let previousPointerY = null;

  let pointerVX = 0;
  let pointerVY = 0;

  let pointerActive = false;


  /* ==========================================================
     HELPERS
     ========================================================== */

  function random(min, max) {
    return min + Math.random() * (max - min);
  }


  /* ==========================================================
     CREATE INITIAL PACKED CLUSTER
     ========================================================== */

  function createNodes() {

    nodes = [];

    /*
     * GOLDEN ANGLE
     *
     * This distributes points evenly around a spiral.
     *
     * Most importantly, it means the particles are already
     * located in the centre before the first frame.
     */

    const goldenAngle =
      Math.PI * (3 - Math.sqrt(5));


    for (let i = 0; i < PARTICLE_COUNT; i++) {

      const particleRadius =
        random(
          MIN_RADIUS,
          MAX_RADIUS
        );


      /*
       * sqrt(i) keeps the density approximately even
       * as the spiral grows outward.
       */

      const distance =
        INITIAL_SPACING *
        Math.sqrt(i);


      const angle =
        i * goldenAngle;


      nodes.push({

        r: particleRadius,

        x:
          Math.cos(angle) *
          distance,

        y:
          Math.sin(angle) *
          distance,

        vx: 0,

        vy: 0

      });
    }
  }


  /* ==========================================================
     CREATE SIMULATION
     ========================================================== */

  function createSimulation() {

    if (simulation) {
      simulation.stop();
    }


    simulation = d3
      .forceSimulation(nodes)


      /* ------------------------------------------------------
         HEAVY MOTION
         ------------------------------------------------------ */

      .velocityDecay(
        VELOCITY_DECAY
      )


      /* ------------------------------------------------------
         RETURN TO CENTRE — X
         ------------------------------------------------------ */

      .force(
        "x",

        d3
          .forceX(0)
          .strength(
            CENTER_STRENGTH
          )
      )


      /* ------------------------------------------------------
         RETURN TO CENTRE — Y
         ------------------------------------------------------ */

      .force(
        "y",

        d3
          .forceY(0)
          .strength(
            CENTER_STRENGTH
          )
      )


      /* ------------------------------------------------------
         HARD COLLISION
         ------------------------------------------------------ */

      .force(
        "collide",

        d3
          .forceCollide()

          .radius(
            d =>
              d.r +
              COLLISION_PADDING
          )

          .strength(
            COLLISION_STRENGTH
          )

          .iterations(
            COLLISION_ITERATIONS
          )
      )


      /*
       * Stop automatic animation while we prepare
       * the opening arrangement.
       */

      .stop();


    /* ========================================================
       INVISIBLE INITIAL SETTLE
       ======================================================== */

    simulation.alpha(0.7);


    for (
      let i = 0;
      i < INITIAL_SETTLE_TICKS;
      i++
    ) {

      simulation.tick();
    }


    /*
     * Remove any momentum generated by those
     * invisible collision ticks.
     */

    for (const node of nodes) {

      node.vx = 0;
      node.vy = 0;

    }


    /* ========================================================
       FIRST VISIBLE FRAME
       ======================================================== */

    draw();


    /* ========================================================
       START LIVE PHYSICS
       ======================================================== */

    simulation

      .alpha(0.03)

      .alphaTarget(0)

      .on(
        "tick",
        draw
      )

      .restart();
  }


  /* ==========================================================
     POINTER FORCE
     ========================================================== */

  function applyPointerForce() {

    if (
      !pointerActive ||
      pointerX === null ||
      pointerY === null
    ) {

      return;
    }


    for (const node of nodes) {


      /* ------------------------------------------------------
         DISTANCE FROM POINTER
         ------------------------------------------------------ */

      const dx =
        node.x -
        pointerX;

      const dy =
        node.y -
        pointerY;


      const distanceSquared =
        dx * dx +
        dy * dy;


      /*
       * Include the particle's own radius so larger
       * balls begin reacting slightly sooner.
       */

      const interactionRadius =
        POINTER_RADIUS +
        node.r;


      if (
        distanceSquared <
        interactionRadius *
        interactionRadius
      ) {


        let distance =
          Math.sqrt(
            distanceSquared
          );


        /*
         * Prevent divide-by-zero if the pointer lands
         * directly on the centre of a particle.
         */

        if (distance < 0.1) {

          distance = 0.1;

        }


        /* ----------------------------------------------------
           NORMALIZED DIRECTION AWAY FROM POINTER
           ---------------------------------------------------- */

        const nx =
          dx / distance;

        const ny =
          dy / distance;


        /* ----------------------------------------------------
           PROXIMITY

           1 = directly beside cursor
           0 = edge of interaction radius
           ---------------------------------------------------- */

        const proximity =
          Math.max(
            0,
            1 -
            distance /
            interactionRadius
          );


        /* ----------------------------------------------------
           IMPACT

           Squaring proximity means:

           - Very strong close to cursor
           - Rapid falloff farther away

           This makes the mouse feel like a physical object
           moving through the balls rather than a weak
           magnetic field.
           ---------------------------------------------------- */

        const impact =
          proximity *
          proximity *
          POINTER_FORCE;


        /* ----------------------------------------------------
           DIRECT PHYSICAL IMPULSE
           ---------------------------------------------------- */

        node.vx +=
          nx *
          impact;

        node.vy +=
          ny *
          impact;


        /* ----------------------------------------------------
           TRANSFER MOUSE MOMENTUM

           A quick mouse sweep therefore hits harder than
           slowly hovering in the same place.
           ---------------------------------------------------- */

        node.vx +=
          pointerVX *
          proximity *
          POINTER_VELOCITY_FORCE;

        node.vy +=
          pointerVY *
          proximity *
          POINTER_VELOCITY_FORCE;

      }
    }
  }


  /* ==========================================================
     DRAW
     ========================================================== */

  function draw() {


    /* --------------------------------------------------------
       APPLY POINTER PHYSICS
       -------------------------------------------------------- */

    applyPointerForce();


    /* --------------------------------------------------------
       CLEAR
       -------------------------------------------------------- */

    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    ctx.save();


    /* --------------------------------------------------------
       MOVE ORIGIN TO CENTRE OF SCREEN
       -------------------------------------------------------- */

    ctx.translate(
      width / 2,
      height / 2
    );


    /* --------------------------------------------------------
       WHITE PARTICLES
       -------------------------------------------------------- */

    ctx.fillStyle =
      "#ffffff";


    for (const node of nodes) {

      ctx.beginPath();


      ctx.arc(
        node.x,
        node.y,
        node.r,
        0,
        Math.PI * 2
      );


      ctx.fill();

    }


    ctx.restore();
  }


  /* ==========================================================
     POINTER ENTER
     ========================================================== */

  function pointerEntered(event) {

    const rect =
      canvas.getBoundingClientRect();


    pointerX =
      event.clientX -
      rect.left -
      width / 2;


    pointerY =
      event.clientY -
      rect.top -
      height / 2;


    previousPointerX =
      pointerX;

    previousPointerY =
      pointerY;


    pointerVX = 0;
    pointerVY = 0;

    pointerActive = true;


    /*
     * Wake the simulation immediately.
     */

    simulation
      .alpha(0.35)
      .restart();
  }


  /* ==========================================================
     POINTER MOVE
     ========================================================== */

  function pointerMoved(event) {

    const rect =
      canvas.getBoundingClientRect();


    const newX =
      event.clientX -
      rect.left -
      width / 2;


    const newY =
      event.clientY -
      rect.top -
      height / 2;


    /* --------------------------------------------------------
       POINTER VELOCITY
       -------------------------------------------------------- */

    if (
      previousPointerX !== null &&
      previousPointerY !== null
    ) {

      pointerVX =
        newX -
        previousPointerX;

      pointerVY =
        newY -
        previousPointerY;

    } else {

      pointerVX = 0;
      pointerVY = 0;

    }


    /* --------------------------------------------------------
       UPDATE POSITION
       -------------------------------------------------------- */

    previousPointerX =
      newX;

    previousPointerY =
      newY;


    pointerX =
      newX;

    pointerY =
      newY;


    pointerActive = true;


    /* --------------------------------------------------------
       WAKE PHYSICS IMMEDIATELY
       -------------------------------------------------------- */

    simulation
      .alpha(0.7)
      .restart();
  }


  /* ==========================================================
     POINTER LEAVE
     ========================================================== */

  function pointerLeft() {

    pointerActive = false;


    pointerX = null;
    pointerY = null;


    previousPointerX = null;
    previousPointerY = null;


    pointerVX = 0;
    pointerVY = 0;


    /*
     * Give the restoring forces enough energy to bring
     * displaced particles home quickly.
     */

    simulation
      .alpha(0.55)
      .restart();
  }


  /* ==========================================================
     TOUCH MOVE
     ========================================================== */

  function touchMoved(event) {

    if (
      !event.touches ||
      !event.touches.length
    ) {

      return;
    }


    event.preventDefault();


    const touch =
      event.touches[0];


    const rect =
      canvas.getBoundingClientRect();


    const newX =
      touch.clientX -
      rect.left -
      width / 2;


    const newY =
      touch.clientY -
      rect.top -
      height / 2;


    if (
      previousPointerX !== null &&
      previousPointerY !== null
    ) {

      pointerVX =
        newX -
        previousPointerX;

      pointerVY =
        newY -
        previousPointerY;

    } else {

      pointerVX = 0;
      pointerVY = 0;

    }


    previousPointerX =
      newX;

    previousPointerY =
      newY;


    pointerX =
      newX;

    pointerY =
      newY;


    pointerActive = true;


    simulation
      .alpha(0.7)
      .restart();
  }


  /* ==========================================================
     TOUCH END
     ========================================================== */

  function touchEnded() {

    pointerLeft();

  }


  /* ==========================================================
     RESIZE CANVAS
     ========================================================== */

  function resizeCanvas() {

    const rect =
      canvas.getBoundingClientRect();


    width =
      rect.width ||
      window.innerWidth;


    height =
      rect.height ||
      window.innerHeight;


    /*
     * Limit DPR to 2 to avoid unnecessarily expensive
     * rendering on very high-resolution displays.
     */

    dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );


    /* --------------------------------------------------------
       PHYSICAL CANVAS SIZE
       -------------------------------------------------------- */

    canvas.width =
      Math.round(
        width * dpr
      );


    canvas.height =
      Math.round(
        height * dpr
      );


    /* --------------------------------------------------------
       CSS SIZE
       -------------------------------------------------------- */

    canvas.style.width =
      `${width}px`;


    canvas.style.height =
      `${height}px`;


    /* --------------------------------------------------------
       HIGH-DPI SCALING
       -------------------------------------------------------- */

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );


    draw();
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

  function init() {


    /* --------------------------------------------------------
       SIZE CANVAS FIRST
       -------------------------------------------------------- */

    resizeCanvas();


    /* --------------------------------------------------------
       CREATE ALREADY-CENTRED PARTICLES
       -------------------------------------------------------- */

    createNodes();


    /* --------------------------------------------------------
       BUILD PHYSICS
       -------------------------------------------------------- */

    createSimulation();


    /* --------------------------------------------------------
       REDUCED MOTION

       Keep the packed visualization but don't add pointer
       interaction when reduced motion is requested.
       -------------------------------------------------------- */

    if (
      prefersReducedMotion()
    ) {

      draw();

      return;
    }


    /* --------------------------------------------------------
       POINTER EVENTS
       -------------------------------------------------------- */

    canvas.addEventListener(
      "pointerenter",
      pointerEntered
    );


    canvas.addEventListener(
      "pointermove",
      pointerMoved,
      {
        passive: true
      }
    );


    canvas.addEventListener(
      "pointerleave",
      pointerLeft
    );


    /* --------------------------------------------------------
       TOUCH EVENTS
       -------------------------------------------------------- */

    canvas.addEventListener(
      "touchmove",
      touchMoved,
      {
        passive: false
      }
    );


    canvas.addEventListener(
      "touchend",
      touchEnded
    );


    canvas.addEventListener(
      "touchcancel",
      touchEnded
    );


    /* --------------------------------------------------------
       RESPONSIVE RESIZE
       -------------------------------------------------------- */

    window.addEventListener(
      "resize",
      resizeCanvas
    );
  }


  /* ==========================================================
     START
     ========================================================== */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }

})();
