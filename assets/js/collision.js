
/* ==========================================================
   U OF T STATISTICAL SCIENCES
   UNDERGRADUATE DIGITAL BROCHURE

   Interactive Correlation Scatterplot

   Features:
   - Positive-correlation scatterplot
   - White particles on U of T blue
   - Pointer repulsion
   - Collision detection
   - Spring-like return to target positions
   - Responsive particle counts
   - Pre-settled initial state
   - Pause when off-screen
   - Reduced-motion support

   File: assets/js/collision.js
   Version: 2.0
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     01 / ELEMENTS
     ========================================================== */

  const canvas = document.getElementById("collision-canvas");

  if (!canvas || typeof d3 === "undefined") {
    console.warn("Scatterplot: canvas or D3 unavailable.");
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    console.warn("Scatterplot: canvas context unavailable.");
    return;
  }


  /* ==========================================================
     02 / SETTINGS
     ========================================================== */

  const SETTINGS = {
    mobileBreakpoint: 800,
    tabletBreakpoint: 1200,

    mobileParticles: 100,
    tabletParticles: 200,
    desktopParticles: 400,

    particleColor: "#ffffff",

    /*
     * Strength of the return to each particle's
     * assigned scatterplot coordinate.
     */

    returnStrength: 0.065,

    /*
     * How strongly the cursor pushes particles.
     */

    pointerStrength: -1800,

    /*
     * Controls how quickly particles settle.
     */

    velocityDecay: 0.22,

    collisionPadding: 1.5,
    collisionIterations: 4,

    alphaTarget: 0.12,

    maxDevicePixelRatio: 2
  };


  /* ==========================================================
     03 / STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let nodes = [];
  let simulation = null;

  let isSectionVisible = true;
  let resizeTimer = null;

  let pointerActive = false;


  /* ==========================================================
     04 / RESPONSIVE PARTICLE COUNT
     ========================================================== */

  function getParticleCount() {
    if (window.innerWidth <= SETTINGS.mobileBreakpoint) {
      return SETTINGS.mobileParticles;
    }

    if (window.innerWidth <= SETTINGS.tabletBreakpoint) {
      return SETTINGS.tabletParticles;
    }

    return SETTINGS.desktopParticles;
  }


  /* ==========================================================
     05 / CANVAS SIZE
     ========================================================== */

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);

    dpr = Math.min(
      window.devicePixelRatio || 1,
      SETTINGS.maxDevicePixelRatio
    );

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    context.setTransform(
      dpr, 0,
      0, dpr,
      0, 0
    );
  }


  /* ==========================================================
     06 / SCATTERPLOT DATA
     ========================================================== */

  function createScatterplotData() {
    const count = getParticleCount();

    /*
     * Plot dimensions inside the canvas.
     */

    const plotWidth = width * 0.78;
    const plotHeight = height * 0.72;

    /*
     * Use a seeded random generator so the initial
     * distribution remains visually consistent.
     */

    const random = d3.randomLcg(0.42);
    const normal = d3.randomNormal.source(random)(0, 0.16);

    const particles = [];

    for (let i = 0; i < count; i++) {
      /*
       * Normalized X coordinate.
       */

      const x = random();

      /*
       * Positive relationship:
       *
       * y = 0.15 + 0.7x + noise
       */

      const y = Math.max(
        0.05,
        Math.min(
          0.95,
          0.15 + 0.7 * x + normal()
        )
      );

      /*
       * Canvas Y increases downward, so invert the
       * statistical Y coordinate.
       */

      const targetX =
        (x - 0.5) * plotWidth;

      const targetY =
        (0.5 - y) * plotHeight;

      /*
       * Scale particle size to viewport.
       */

      const baseRadius = Math.min(
        width,
        height
      ) / 220;

      const radius =
        Math.max(
          1.6,
          Math.min(
            4.8,
            baseRadius * (0.7 + random() * 0.9)
          )
        );

      particles.push({
        r: radius,

        targetX,
        targetY,

        /*
         * Start near the intended position.
         * No long convergence animation.
         */

        x: targetX,
        y: targetY,

        vx: 0,
        vy: 0
      });
    }

    return particles;
  }


  /* ==========================================================
     07 / DRAW
     ========================================================== */

  function draw() {
    context.clearRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);

    context.fillStyle = SETTINGS.particleColor;

    /*
     * Node 0 is the invisible cursor repulsor.
     */

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];

      context.beginPath();

      context.arc(
        node.x,
        node.y,
        node.r,
        0,
        Math.PI * 2
      );

      context.fill();
    }

    context.restore();
  }


  /* ==========================================================
     08 / POINTER INTERACTION
     ========================================================== */

  function pointerMoved(event) {
    if (!nodes.length) return;

    const [x, y] = d3.pointer(event, canvas);

    pointerActive = true;

    nodes[0].fx = x - width / 2;
    nodes[0].fy = y - height / 2;

    if (simulation && isSectionVisible) {
      simulation.alphaTarget(SETTINGS.alphaTarget);
      simulation.restart();
    }
  }

  function pointerLeft() {
    pointerActive = false;

    if (!nodes.length) return;

    /*
     * Move the invisible repulsor away from the plot.
     */

    nodes[0].fx = width * 3;
    nodes[0].fy = height * 3;

    if (simulation) {
      simulation.alphaTarget(0);
      simulation.alpha(0.3).restart();
    }
  }


  /* ==========================================================
     09 / SIMULATION
     ========================================================== */

  function createSimulation() {
    if (simulation) {
      simulation.stop();
    }

    const particles = createScatterplotData();

    /*
     * Invisible pointer node.
     */

    const pointerNode = {
      r: 16,
      x: width * 3,
      y: height * 3,
      fx: width * 3,
      fy: height * 3,
      vx: 0,
      vy: 0
    };

    nodes = [pointerNode, ...particles];

    simulation = d3.forceSimulation(nodes)
      .alpha(0.35)
      .alphaTarget(0)
      .velocityDecay(SETTINGS.velocityDecay)

      /*
       * Every particle returns to its own scatterplot
       * coordinate rather than the global centre.
       */

      .force(
        "x",
        d3.forceX(d => d.targetX || 0)
          .strength(d => d === pointerNode ? 0 : SETTINGS.returnStrength)
      )

      .force(
        "y",
        d3.forceY(d => d.targetY || 0)
          .strength(d => d === pointerNode ? 0 : SETTINGS.returnStrength)
      )

      /*
       * Edge-to-edge collision.
       */

      .force(
        "collide",
        d3.forceCollide()
          .radius(d => d.r + SETTINGS.collisionPadding)
          .strength(1)
          .iterations(SETTINGS.collisionIterations)
      )

      /*
       * Only the invisible pointer node repels.
       */

      .force(
        "charge",
        d3.forceManyBody()
          .strength((d, i) =>
            i === 0 ? SETTINGS.pointerStrength : 0
          )
      )

      .on("tick", draw);

    /*
     * Pre-settle before displaying the plot.
     */

    simulation.stop();

    for (let i = 0; i < 50; i++) {
      simulation.tick();
    }

    draw();

    if (
      isSectionVisible &&
      !prefersReducedMotion()
    ) {
      simulation.restart();
    }
  }


  /* ==========================================================
     10 / RESIZE
     ========================================================== */

  function handleResize() {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      resizeCanvas();
      createSimulation();
    }, 150);
  }


  /* ==========================================================
     11 / REDUCED MOTION
     ========================================================== */

  function prefersReducedMotion() {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }


  /* ==========================================================
     12 / VISIBILITY OBSERVER
     ========================================================== */

  function observeVisibility() {
    const cover = document.getElementById("cover");

    if (
      !cover ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        isSectionVisible = entries[0].isIntersecting;

        if (!simulation) return;

        if (
          isSectionVisible &&
          !prefersReducedMotion()
        ) {
          simulation.restart();
        } else {
          simulation.stop();
        }
      },
      {
        root: document.querySelector(".snap"),
        threshold: 0.05
      }
    );

    observer.observe(cover);
  }


  /* ==========================================================
     13 / INITIALIZE
     ========================================================== */

  function init() {
    resizeCanvas();
    createSimulation();

    d3.select(canvas)
      .on("pointermove", pointerMoved)
      .on("pointerleave", pointerLeft)
      .on("touchmove", event => event.preventDefault());

    window.addEventListener(
      "resize",
      handleResize,
      { passive: true }
    );

    observeVisibility();

    console.log(
      `Correlation scatterplot initialized: ${getParticleCount()} particles.`
    );
  }


  /* ==========================================================
     START
     ========================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
