
/* ==========================================================
   U of T Statistical Sciences — Undergraduate Collision Hero

   Preserves the graduate brochure's D3 particle simulation:
   - Mobile <= 800px:       100 nodes
   - Tablet 801–1200px:     200 nodes
   - Desktop > 1200px:      400 nodes
   - Existing particle size distribution and pointer charge
   - Existing centering, damping and node-to-node collisions

   Addition:
   - The title and two cover subtitles act as invisible,
     responsive rectangular collision obstacles.
   - Nodes deflect around the text and cannot pass through it.
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     CANVAS / DEPENDENCIES
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

  const context = canvas.getContext("2d");
  if (!context) {
    console.warn("2D canvas context is not available.");
    return;
  }

  /* ==========================================================
     STATE
     ========================================================== */

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let simulation = null;
  let currentParticleCount = 0;
  let resizeTimer = null;
  let textObstacles = [];

  // Space between particles and lettering.
  const TEXT_CLEARANCE = 7;

  // Matches D3's .velocityDecay(0.1).
  const VELOCITY_RETENTION = 0.9;

  /* ==========================================================
     RESPONSIVE PARTICLE COUNT
     ========================================================== */

  function getParticleCount() {
    if (width <= 800) return 100;
    if (width <= 1200) return 200;
    return 400;
  }

  /* ==========================================================
     PARTICLE SIZE
     ========================================================== */

  function getParticleScale() {
    const referenceSize = Math.min(width, height);
    return referenceSize / 200;
  }

  /* ==========================================================
     CREATE DATA
     ========================================================== */

  function createData() {
    const particleCount = getParticleCount();
    currentParticleCount = particleCount;

    const k = getParticleScale();
    const radius = d3.randomUniform(k, k * 4);
    const groups = 4;

    return Array.from({ length: particleCount }, (_, i) => ({
      r: radius(),
      group: i && (i % groups + 1)
    }));
  }

  /* ==========================================================
     CANVAS SIZE
     ========================================================== */

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);

    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateTextObstacles();
  }

  /* ==========================================================
     TEXT COLLISION OBSTACLES
     ========================================================== */

  function updateTextObstacles() {
    const canvasRect = canvas.getBoundingClientRect();

    // Each text element has its own collision boundary.
    // The heading is shrink-wrapped using width: fit-content
    // in the CSS, so its boundary follows the actual lettering.

    const selectors = [
      "#cover h1",
      "#cover .cover-bottom p",
      "#cover .cover-bottom div"
    ];

    textObstacles = selectors
      .map(selector => document.querySelector(selector))
      .filter(element =>
        element && element.getClientRects().length
      )
      .map(element => {
        const rect = element.getBoundingClientRect();

        return {
          left: rect.left - canvasRect.left - width / 2,
          right: rect.right - canvasRect.left - width / 2,
          top: rect.top - canvasRect.top - height / 2,
          bottom: rect.bottom - canvasRect.top - height / 2
        };
      })
      .filter(rect =>
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.right) &&
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.bottom) &&
        rect.right > rect.left &&
        rect.bottom > rect.top
      );
  }

  /* ==========================================================
     D3 FORCE: SOLID TEXT WALLS

     Each text element becomes an invisible rectangle.

     Every particle is treated as a circle. Its radius and
     additional clearance expand the collision boundary.

     A swept segment / rectangle test checks the particle's
     predicted movement. This prevents fast particles from
     passing through text between simulation frames.
     ========================================================== */

  function createTextObstacleForce() {
    let forceNodes = [];

    function force() {
      if (!textObstacles.length) return;

      for (let i = 1; i < forceNodes.length; i += 1) {
        const node = forceNodes[i];
        const padding = node.r + TEXT_CLEARANCE;

        const startX = node.x;
        const startY = node.y;

        let nextX =
          startX + node.vx * VELOCITY_RETENTION;

        let nextY =
          startY + node.vy * VELOCITY_RETENTION;

        let corrected = false;

        for (const obstacle of textObstacles) {

          // Expand the text boundary by the particle radius
          // and clearance. The particle centre must remain outside.

          const left = obstacle.left - padding;
          const right = obstacle.right + padding;
          const top = obstacle.top - padding;
          const bottom = obstacle.bottom + padding;

          const startInside =
            startX >= left && startX <= right &&
            startY >= top && startY <= bottom;

          if (startInside) {

            // A node may start inside after a viewport change.
            // Push it out through the nearest side.

            const distances = [
              { distance: startX - left, side: "left" },
              { distance: right - startX, side: "right" },
              { distance: startY - top, side: "top" },
              { distance: bottom - startY, side: "bottom" }
            ];

            distances.sort(
              (a, b) => a.distance - b.distance
            );

            const side = distances[0].side;

            if (side === "left") nextX = left - 0.5;
            if (side === "right") nextX = right + 0.5;
            if (side === "top") nextY = top - 0.5;
            if (side === "bottom") nextY = bottom + 0.5;

            corrected = true;
            continue;
          }

          // Swept segment / rectangle intersection.
          // This catches fast particles even when both their
          // starting and ending positions are outside the box.

          const dx = nextX - startX;
          const dy = nextY - startY;

          let tEnter = 0;
          let tExit = 1;

          let normalX = 0;
          let normalY = 0;

          let possible = true;

          // Horizontal slab.

          if (Math.abs(dx) < 0.000001) {

            if (startX < left || startX > right) {
              possible = false;
            }

          } else {

            let nearX = (left - startX) / dx;
            let farX = (right - startX) / dx;

            let enteringNormalX = -1;

            if (nearX > farX) {
              [nearX, farX] = [farX, nearX];
              enteringNormalX = 1;
            }

            if (nearX > tEnter) {
              tEnter = nearX;
              normalX = enteringNormalX;
              normalY = 0;
            }

            tExit = Math.min(tExit, farX);
          }

          // Vertical slab.

          if (possible) {

            if (Math.abs(dy) < 0.000001) {

              if (startY < top || startY > bottom) {
                possible = false;
              }

            } else {

              let nearY = (top - startY) / dy;
              let farY = (bottom - startY) / dy;

              let enteringNormalY = -1;

              if (nearY > farY) {
                [nearY, farY] = [farY, nearY];
                enteringNormalY = 1;
              }

              if (nearY > tEnter) {
                tEnter = nearY;
                normalX = 0;
                normalY = enteringNormalY;

              } else if (
                Math.abs(nearY - tEnter) < 0.000001
              ) {

                // At a corner, block movement along both axes.
                normalY = enteringNormalY;
              }

              tExit = Math.min(tExit, farY);
            }
          }

          const intersects =
            possible &&
            tEnter <= tExit &&
            tExit >= 0 &&
            tEnter >= 0 &&
            tEnter <= 1;

          if (!intersects) continue;

          // Stop just before first contact.
          // The offset prevents floating-point contact jitter.

          nextX =
            startX + dx * tEnter + normalX * 0.5;

          nextY =
            startY + dy * tEnter + normalY * 0.5;

          corrected = true;
        }

        if (corrected) {

          // D3 applies velocityDecay(0.1) after forces.
          // Adjust velocity so the next integration step ends
          // exactly outside the text boundary.

          node.vx =
            (nextX - node.x) / VELOCITY_RETENTION;

          node.vy =
            (nextY - node.y) / VELOCITY_RETENTION;
        }
      }
    }

    force.initialize = simulationNodes => {
      forceNodes = simulationNodes;
    };

    return force;
  }

  /* ==========================================================
     DRAW
     ========================================================== */

  function ticked() {
    context.clearRect(0, 0, width, height);

    context.save();

    // Simulation origin remains centred on the canvas.
    context.translate(width / 2, height / 2);

    // Node 0 is invisible and follows the pointer.
    for (let i = 1; i < nodes.length; i += 1) {

      const d = nodes[i];

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

      context.fillStyle = "#ffffff";
      context.fill();
    }

    context.restore();
  }

  /* ==========================================================
     POINTER
     ========================================================== */

  function pointermoved(event) {
    if (!nodes.length || !nodes[0]) return;

    const [x, y] = d3.pointer(event, canvas);

    // Node 0 follows the pointer and repels the other nodes.
    nodes[0].fx = x - width / 2;
    nodes[0].fy = y - height / 2;
  }

  /* ==========================================================
     SIMULATION
     ========================================================== */

  function createSimulation() {

    if (simulation) {
      simulation.stop();
    }

    nodes = createData().map(Object.create);

    simulation = d3.forceSimulation(nodes)

      // Original simulation settings.
      .alphaTarget(0.3)
      .velocityDecay(0.1)

      // Horizontal centering.
      .force(
        "x",
        d3.forceX().strength(0.01)
      )

      // Vertical centering.
      .force(
        "y",
        d3.forceY().strength(0.01)
      )

      // Original node-to-node collision behaviour.
      .force(
        "collide",
        d3.forceCollide()
          .radius(d => d.r + 2)
          .strength(1)
          .iterations(8)
      )

      // Original pointer repulsion.
      .force(
        "charge",
        d3.forceManyBody().strength((d, i) =>
          i ? 0 : -width * 2 / 3
        )
      )

      // Text collision boundaries.
      // Run after pointer charge to prevent particles entering
      // the text regions during the next position update.
      .force(
        "text-obstacles",
        createTextObstacleForce()
      )

      .on("tick", ticked);

    console.log(
      `Collision hero: ${currentParticleCount} nodes at ${Math.round(width)}px; ${textObstacles.length} text obstacles`
    );
  }

  /* ==========================================================
     RESPONSIVE RESIZE
     ========================================================== */

  function resized() {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      resizeCanvas();
      createSimulation();
    }, 120);
  }

  /* ==========================================================
     INITIALIZE
     ========================================================== */

  function init() {

    resizeCanvas();
    createSimulation();

    // Pointer and touch interaction.
    d3.select(canvas)

      .on(
        "touchmove",
        event => event.preventDefault()
      )

      .on(
        "pointermove",
        pointermoved
      );

    // Responsive canvas and obstacle recalculation.
    window.addEventListener(
      "resize",
      resized,
      { passive: true }
    );

    // Recalculate boundaries after font metrics settle.
    if (document.fonts && document.fonts.ready) {

      document.fonts.ready.then(() => {

        updateTextObstacles();

        if (simulation) {
          simulation.alpha(0.3).restart();
        }
      });
    }
  }

  /* ==========================================================
     START
     ========================================================== */

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();
  }

})();
