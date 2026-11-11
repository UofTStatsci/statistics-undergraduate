/* ==========================================================
   U of T Statistics Graduate Programs
   Collision Hero

   Based directly on:
   D3 / Observable Collision Detection
   https://observablehq.com/@d3/collision-detection/2

   Responsive node counts:
   - Mobile <= 800px:       100
   - Tablet 801–1200px:     200
   - Desktop > 1200px:      400

   Changes from Observable:
   - Responsive full-screen canvas
   - White nodes
   - Responsive node counts
   - Stronger collision solving to prevent visible overlap
   ========================================================== */

(() => {
  "use strict";


  /* ==========================================================
     CANVAS
     ========================================================== */

  const canvas =
    document.getElementById("collision-canvas");

  if (!canvas) {
    console.warn("Collision canvas not found.");
    return;
  }

  if (typeof d3 === "undefined") {
    console.warn("D3 is not loaded.");
    return;
  }

  const context =
    canvas.getContext("2d");


  /* ==========================================================
     STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let nodes = [];
  let simulation = null;

  let currentParticleCount = 0;


  /* ==========================================================
     RESPONSIVE PARTICLE COUNT
     ========================================================== */

  function getParticleCount() {

    /*
     * Match the website's CSS mobile breakpoint.
     */

    if (width <= 800) {
      return 100;
    }

    /*
     * Tablet / smaller laptop.
     */

    if (width <= 1200) {
      return 200;
    }

    /*
     * Desktop.
     */

    return 400;
  }


  /* ==========================================================
     PARTICLE SIZE
     ========================================================== */

  function getParticleScale() {

    /*
     * Observable's original chart is square and uses:
     *
     * const k = width / 200;
     *
     * Our hero is usually much wider than it is tall.
     *
     * Using the smaller dimension preserves approximately
     * the same visual scale without creating huge circles
     * on widescreen monitors.
     */

    const referenceSize =
      Math.min(
        width,
        height
      );

    return referenceSize / 200;
  }


  /* ==========================================================
     CREATE DATA
     ========================================================== */

  function createData() {

    const particleCount =
      getParticleCount();

    currentParticleCount =
      particleCount;


    const k =
      getParticleScale();


    /*
     * Same radius distribution as Observable.
     */

    const radius =
      d3.randomUniform(
        k,
        k * 4
      );


    const groups = 4;


    return Array.from(
      {
        length: particleCount
      },

      (_, i) => ({

        r:
          radius(),

        group:
          i &&
          (i % groups + 1)

      })
    );
  }


  /* ==========================================================
     CANVAS SIZE
     ========================================================== */

  function resizeCanvas() {

    const rect =
      canvas.getBoundingClientRect();


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


    /*
     * Limit DPR for performance.
     */

    dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );


    /* --------------------------------------------------------
       Physical canvas resolution
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
       CSS dimensions
       -------------------------------------------------------- */

    canvas.style.width =
      `${width}px`;


    canvas.style.height =
      `${height}px`;


    /* --------------------------------------------------------
       Retina / HiDPI scaling
       -------------------------------------------------------- */

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  }


  /* ==========================================================
     DRAW
     ========================================================== */

  function ticked() {

    context.clearRect(
      0,
      0,
      width,
      height
    );


    context.save();


    /*
     * Same coordinate system as Observable:
     * simulation origin is the middle of the canvas.
     */

    context.translate(
      width / 2,
      height / 2
    );


    /*
     * Start at node 1.
     *
     * Node 0 is invisible and acts as the charged
     * pointer-repulsion node.
     */

    for (
      let i = 1;
      i < nodes.length;
      ++i
    ) {

      const d =
        nodes[i];


      context.beginPath();


      context.moveTo(
        d.x + d.r,
        d.y
      );


      context.arc(
        d.x,
        d.y,
        d.r,
        0,
        2 * Math.PI
      );


      /*
       * All visible nodes are white.
       */

      context.fillStyle =
        "#ffffff";


      context.fill();
    }


    context.restore();
  }


  /* ==========================================================
     POINTER
     ========================================================== */

  function pointermoved(event) {

    /*
     * Match Observable's pointer behaviour.
     */

    const [x, y] =
      d3.pointer(
        event,
        canvas
      );


    /*
     * Node 0 follows the pointer.
     */

    nodes[0].fx =
      x -
      width / 2;


    nodes[0].fy =
      y -
      height / 2;
  }


  /* ==========================================================
     SIMULATION
     ========================================================== */

  function createSimulation() {

    /*
     * Stop previous simulation.
     */

    if (simulation) {
      simulation.stop();
    }


    /*
     * Create responsive node set.
     */

    nodes =
      createData()
        .map(Object.create);


    /* ========================================================
       D3 / OBSERVABLE PHYSICS
       ======================================================== */

    simulation =
      d3.forceSimulation(
        nodes
      )


        /* ----------------------------------------------------
           Keep simulation hot

           Same as Observable.
           ---------------------------------------------------- */

        .alphaTarget(
          0.3
        )


        /* ----------------------------------------------------
           Low friction

           Same as Observable.
           ---------------------------------------------------- */

        .velocityDecay(
          0.1
        )


        /* ----------------------------------------------------
           X centering

           Same as Observable.
           ---------------------------------------------------- */

        .force(
          "x",

          d3
            .forceX()
            .strength(
              0.01
            )
        )


        /* ----------------------------------------------------
           Y centering

           Same as Observable.
           ---------------------------------------------------- */

        .force(
          "y",

          d3
            .forceY()
            .strength(
              0.01
            )
        )


        /* ----------------------------------------------------
           COLLISION

           Observable uses:

           radius(d => d.r + 1)
           iterations(3)

           We're making two small changes:

           1. r + 2
              Gives the visible circles a tiny physical
              buffer around their outer circumference.

           2. iterations(8)
              Resolves collisions more aggressively.

           This is especially important with 400 desktop
           nodes, where three iterations can allow visible
           penetration during rapid movement.
           ---------------------------------------------------- */

        .force(
          "collide",

          d3
            .forceCollide()

            .radius(
              d =>
                d.r + 2
            )

            .strength(
              1
            )

            .iterations(
              8
            )
        )


        /* ----------------------------------------------------
           POINTER REPULSION

           Same model as Observable.

           Node 0:
           strong negative charge.

           Every visible node:
           zero charge.
           ---------------------------------------------------- */

        .force(
          "charge",

          d3
            .forceManyBody()

            .strength(
              (d, i) =>
                i
                  ? 0
                  : -width * 2 / 3
            )
        )


        /* ----------------------------------------------------
           DRAW
           ---------------------------------------------------- */

        .on(
          "tick",
          ticked
        );


    /*
     * Helpful while we're developing.
     *
     * Open the browser console and you'll see exactly
     * which responsive node count is being used.
     */

    console.log(
      `Collision hero: ${currentParticleCount} nodes at ${Math.round(width)}px viewport width`
    );
  }


  /* ==========================================================
     RESPONSIVE RESIZE
     ========================================================== */

  let resizeTimer = null;


  function resized() {

    /*
     * Debounce resize events.
     *
     * Without this, dragging the browser window can rebuild
     * the entire 400-node simulation dozens of times per
     * second.
     */

    clearTimeout(
      resizeTimer
    );


    resizeTimer =
      setTimeout(
        () => {

          resizeCanvas();

          createSimulation();

        },
        120
      );
  }


  /* ==========================================================
     INITIALIZE
     ========================================================== */

  function init() {

    /*
     * Determine actual canvas dimensions.
     */

    resizeCanvas();


    /*
     * Create the appropriate responsive simulation.
     */

    createSimulation();


    /* --------------------------------------------------------
       POINTER / TOUCH
       -------------------------------------------------------- */

    d3
      .select(canvas)

      .on(
        "touchmove",

        event =>
          event.preventDefault()
      )

      .on(
        "pointermove",
        pointermoved
      );


    /* --------------------------------------------------------
       RESIZE
       -------------------------------------------------------- */

    window.addEventListener(
      "resize",
      resized,
      {
        passive: true
      }
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
