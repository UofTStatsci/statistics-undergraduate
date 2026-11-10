
/* ==========================================================
   U OF T STATISTICAL SCIENCES
   UNDERGRADUATE DIGITAL BROCHURE

   Interactive Collision Hero

   Based on:
   D3 / Observable Collision Detection
   https://observablehq.com/@d3/collision-detection/2

   Responsive particles:
   Mobile:  100
   Tablet:  200
   Desktop: 400
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     ELEMENTS
     ========================================================== */

  const canvas = document.getElementById("collision-canvas");

  if (!canvas) {
    console.warn("Collision hero: canvas not found.");
    return;
  }

  if (typeof d3 === "undefined") {
    console.warn("Collision hero: D3 is not loaded.");
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    console.warn("Collision hero: canvas context unavailable.");
    return;
  }


  /* ==========================================================
     SETTINGS
     ========================================================== */

  const SETTINGS = {
    mobileBreakpoint: 800,
    tabletBreakpoint: 1200,

    mobileParticles: 100,
    tabletParticles: 200,
    desktopParticles: 400,

    particleColor: "#ffffff",

    alphaTarget: 0.3,
    velocityDecay: 0.1,

    centerStrength: 0.01,

    collisionPadding: 2,
    collisionIterations: 8,

    maxDevicePixelRatio: 2
  };


  /* ==========================================================
     STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let nodes = [];
  let simulation = null;

  let isVisible = true;
  let resizeTimer = null;


  /* ==========================================================
     RESPONSIVE PARTICLE COUNT
     ========================================================== */

  function getParticleCount() {
    const viewportWidth = window.innerWidth;

    if (viewportWidth <= SETTINGS.mobileBreakpoint) {
      return SETTINGS.mobileParticles;
    }

    if (viewportWidth <= SETTINGS.tabletBreakpoint) {
      return SETTINGS.tabletParticles;
    }

    return SETTINGS.desktopParticles;
  }


  /* ==========================================================
     CREATE PARTICLES
     ========================================================== */

  function createData() {
    const referenceSize = Math.min(width, height);
    const k = referenceSize / 200;

    const radius = d3.randomUniform(k, k * 4);
    const particleCount = getParticleCount();

    return Array.from(
      { length: particleCount + 1 },
      (_, i) => ({
        r: radius(),
        group: i === 0 ? 0 : ((i - 1) % 4) + 1
      })
    );
  }


  /* ==========================================================
     CANVAS SIZE
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
     DRAW PARTICLES
     ========================================================== */

  function draw() {
    context.clearRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);

    /*
     * Node 0 is the invisible pointer repulsor.
     * Only nodes 1 onward are rendered.
     */

    context.fillStyle = SETTINGS.particleColor;

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
     POINTER INTERACTION
     ========================================================== */

  function pointerMoved(event) {
    if (!nodes.length) return;

    const [x, y] = d3.pointer(event, canvas);

    nodes[0].fx = x - width / 2;
    nodes[0].fy = y - height / 2;

    if (simulation && isVisible) {
      simulation.alphaTarget(SETTINGS.alphaTarget);
      simulation.restart();
    }
  }


  /* ==========================================================
     SIMULATION
     ========================================================== */

  function createSimulation() {
    if (simulation) {
      simulation.stop();
    }

    nodes = createData().map(Object.create);

    /*
     * Start all particles near the centre.
     *
     * This avoids the long convergence animation
     * encountered during early graduate-site testing.
     */

    const initialRadius = Math.min(width, height) * 0.12;

    for (let i = 1; i < nodes.length; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * initialRadius;

      nodes[i].x = Math.cos(angle) * distance;
      nodes[i].y = Math.sin(angle) * distance;

      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }

    /*
     * Invisible repulsion node begins away from the
     * visible particle cluster until pointer interaction.
     */

    nodes[0].fx = width * 2;
    nodes[0].fy = height * 2;

    simulation = d3.forceSimulation(nodes)
      .alphaTarget(SETTINGS.alphaTarget)
      .velocityDecay(SETTINGS.velocityDecay)

      .force(
        "x",
        d3.forceX().strength(SETTINGS.centerStrength)
      )

      .force(
        "y",
        d3.forceY().strength(SETTINGS.centerStrength)
      )

      .force(
        "collide",
        d3.forceCollide()
          .radius(d => d.r + SETTINGS.collisionPadding)
          .strength(1)
          .iterations(SETTINGS.collisionIterations)
      )

      .force(
        "charge",
        d3.forceManyBody()
          .strength((d, i) => (
            i === 0 ? -width * 2 / 3 : 0
          ))
      )

      .on("tick", draw);

    /*
     * Pre-settle the initial cluster before it appears.
     * This avoids waiting for particles to converge.
     */

    simulation.stop();

    for (let i = 0; i < 120; i++) {
      simulation.tick();
    }

    draw();

    if (isVisible && !prefersReducedMotion()) {
      simulation.restart();
    }
  }


  /* ==========================================================
     RESIZE
     ========================================================== */

  function handleResize() {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      resizeCanvas();
      createSimulation();
    }, 150);
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
     VISIBILITY OBSERVER
     ========================================================== */

  function observeVisibility() {
    const cover = document.getElementById("cover");

    if (!cover || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        isVisible = entries[0].isIntersecting;

        if (!simulation) return;

        if (isVisible && !prefersReducedMotion()) {
          simulation.restart();
        } else {
          simulation.stop();
        }
      },
      {
        threshold: 0.05
      }
    );

    observer.observe(cover);
  }


  /* ==========================================================
     INITIALIZE
     ========================================================== */

  function init() {
    resizeCanvas();
    createSimulation();

    d3.select(canvas)
      .on("pointermove", pointerMoved)
      .on("touchmove", event => {
        event.preventDefault();
      });

    window.addEventListener(
      "resize",
      handleResize,
      { passive: true }
    );

    observeVisibility();

    console.log(
      `Collision hero initialized: ${getParticleCount()} visible particles.`
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
