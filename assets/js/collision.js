
/* ==========================================================
   U OF T STATISTICAL SCIENCES
   UNDERGRADUATE COLLISION ANIMATION

   Shared by:
   - Statistics Undergraduate
   - Actuarial Science Undergraduate

   ORIGINAL PHYSICS RETAINED:
   - Mobile <= 800px:       100 nodes
   - Tablet 801-1200px:     200 nodes
   - Desktop > 1200px:      400 nodes
   - Original particle size distribution
   - Original pointer repulsion
   - Original centering forces
   - Original velocity damping
   - Original particle-to-particle collision

   COLLISION OBSTACLES:
   - Transparent-pixel SVG logo mask
   - Responsive heading mask
   - Undergraduate Programs label
   - Program subtitle

   NEW INTERACTION:
   - Individually coloured particles
   - White-to-orange proximity transition
   - Orange contact response
   - Gradual cooling as particles move away
   - Mouse and mobile touch support

   ========================================================== */

(() => {
  "use strict";


  /* ==========================================================
     1. DEPENDENCIES AND CANVAS
     ========================================================== */

  const canvas = document.getElementById("collision-canvas");

  if (!canvas) {
    console.warn("[collision] Canvas not found.");
    return;
  }

  if (typeof d3 === "undefined") {
    console.error("[collision] D3 is not loaded.");
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    console.error("[collision] Canvas context unavailable.");
    return;
  }


  /* ==========================================================
     2. CONFIGURATION
     ========================================================== */

  const CONFIG = {

    // Collision settings
    clearance: 6,
    maskScale: 2,
    maskPadding: 12,
    alphaThreshold: 48,
    bounce: 0.16,
    velocityRetention: 0.9,
    maxSweepStep: 2.5,

    // Mouse / touch colour interaction
    orangeRadius: 130,
    orangeContact: 18,
    orangeWarmRate: 0.14,
    orangeCoolRate: 0.04,

    // Orange colour
    orangeRed: 255,
    orangeGreen: 130,
    orangeBlue: 0

  };


  /* ==========================================================
     3. STATE
     ========================================================== */

  let width = 1;
  let height = 1;
  let dpr = 1;

  let nodes = [];
  let simulation = null;
  let currentParticleCount = 0;

  let resizeTimer = null;
  let maskTimer = null;

  let masks = [];
  let observer = null;

  // Cursor position in canvas-centred coordinates.
  const pointer = {
    x: 0,
    y: 0,
    active: false
  };

  const logo = document.getElementById("cover-logo");

  // Covers both versions of the brochure.
  const textSelectors = [
    "#cover h1.cover-title",
    "#cover h2.cover-title",
    "#cover .cover-bottom p",
    "#cover .cover-bottom div"
  ];


  /* ==========================================================
     4. RESPONSIVE PARTICLE COUNT
     ========================================================== */

  function getParticleCount() {

    if (width <= 800) return 100;

    if (width <= 1200) return 200;

    return 400;

  }


  /* ==========================================================
     5. PARTICLE SIZE
     ========================================================== */

  function getParticleScale() {

    return Math.min(width, height) / 200;

  }


  /* ==========================================================
     6. CREATE PARTICLE DATA
     ========================================================== */

  function createData() {

    const count = getParticleCount();

    currentParticleCount = count;

    const k = getParticleScale();

    const radius = d3.randomUniform(k, k * 4);

    return Array.from({ length: count }, (_, i) => ({

      r: radius(),

      group: i && (i % 4 + 1),

      // Individual colour intensity.
      // 0 = white
      // 1 = fully orange
      orange: 0

    }));

  }


  /* ==========================================================
     7. CANVAS RESIZE
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

    buildMasks();

  }


  /* ==========================================================
     8. MASK CANVAS UTILITIES
     ========================================================== */

  function makeMaskCanvas(w, h) {

    const c = document.createElement("canvas");

    c.width = Math.max(1, Math.ceil(w));

    c.height = Math.max(1, Math.ceil(h));

    return c;

  }


  function getMaskPosition(element, canvasRect) {

    const rect = element.getBoundingClientRect();

    return {

      left:
        rect.left -
        canvasRect.left -
        width / 2 -
        CONFIG.maskPadding,

      top:
        rect.top -
        canvasRect.top -
        height / 2 -
        CONFIG.maskPadding

    };

  }


  /* ==========================================================
     9. FINALIZE MASK
     ========================================================== */

  function finishMask(maskCanvas, element, canvasRect) {

    try {

      const maskContext = maskCanvas.getContext("2d", {

        willReadFrequently: true

      });

      if (!maskContext) return null;

      const image = maskContext.getImageData(

        0,
        0,
        maskCanvas.width,
        maskCanvas.height

      );

      const position = getMaskPosition(element, canvasRect);

      return {

        left: position.left,

        top: position.top,

        width: maskCanvas.width,

        height: maskCanvas.height,

        data: image.data

      };

    } catch (error) {

      console.error(

        "[collision] Unable to read collision mask.",

        error

      );

      return null;

    }

  }


  /* ==========================================================
     10. SVG LOGO COLLISION MASK
     ========================================================== */

  function buildImageMask(element, canvasRect) {

    if (

      !element ||

      !element.complete ||

      !element.naturalWidth ||

      !element.naturalHeight

    ) {

      return null;

    }

    const rect = element.getBoundingClientRect();

    if (!rect.width || !rect.height) return null;

    const scale = CONFIG.maskScale;

    const pad = CONFIG.maskPadding;

    const maskCanvas = makeMaskCanvas(

      (rect.width + pad * 2) * scale,

      (rect.height + pad * 2) * scale

    );

    const maskContext = maskCanvas.getContext("2d", {

      willReadFrequently: true

    });

    if (!maskContext) return null;

    maskContext.setTransform(

      scale,
      0,
      0,
      scale,
      pad * scale,
      pad * scale

    );

    const style = window.getComputedStyle(element);

    const fit = style.objectFit || "fill";

    let drawX = 0;

    let drawY = 0;

    let drawWidth = rect.width;

    let drawHeight = rect.height;

    // Match the visible SVG positioning.
    if (fit === "contain" || fit === "scale-down") {

      let factor = Math.min(

        rect.width / element.naturalWidth,

        rect.height / element.naturalHeight

      );

      if (fit === "scale-down") {

        factor = Math.min(1, factor);

      }

      drawWidth = element.naturalWidth * factor;

      drawHeight = element.naturalHeight * factor;

      const position = (

        style.objectPosition || "50% 50%"

      ).split(/\s+/);

      drawX =

        position[0] === "left" ? 0 :

        position[0] === "right"
          ? rect.width - drawWidth :

        (rect.width - drawWidth) / 2;

      drawY =

        position[1] === "top" ? 0 :

        position[1] === "bottom"
          ? rect.height - drawHeight :

        (rect.height - drawHeight) / 2;

    }

    try {

      maskContext.drawImage(

        element,

        drawX,
        drawY,

        drawWidth,
        drawHeight

      );

    } catch (error) {

      console.error(

        "[collision] SVG image mask could not be created.",

        error

      );

      return null;

    }

    return finishMask(maskCanvas, element, canvasRect);

  }


  /* ==========================================================
     11. TEXT FONT UTILITIES
     ========================================================== */

  function getFont(style) {

    const fontSize = parseFloat(style.fontSize) || 16;

    return {

      fontSize,

      font:
        `${style.fontStyle} ${style.fontVariant} ` +
        `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,

      letterSpacing: style.letterSpacing || "normal"

    };

  }


  function getLineHeight(style, size) {

    if (!style.lineHeight || style.lineHeight === "normal") {

      return size * 1.2;

    }

    const value = parseFloat(style.lineHeight);

    return Number.isFinite(value) ? value : size * 1.2;

  }


  /* ==========================================================
     12. TEXT COLLISION MASK
     ========================================================== */

  function buildTextMask(element, canvasRect) {

    const rect = element.getBoundingClientRect();

    const style = window.getComputedStyle(element);

    if (!rect.width || !rect.height) return null;

    const scale = CONFIG.maskScale;

    const pad = CONFIG.maskPadding;

    const maskCanvas = makeMaskCanvas(

      (rect.width + pad * 2) * scale,

      (rect.height + pad * 2) * scale

    );

    const ctx = maskCanvas.getContext("2d", {

      willReadFrequently: true

    });

    if (!ctx) return null;

    const font = getFont(style);

    const lh = getLineHeight(style, font.fontSize);

    ctx.setTransform(

      scale,
      0,
      0,
      scale,
      pad * scale,
      pad * scale

    );

    ctx.font = font.font;

    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#ffffff";

    if ("fontKerning" in ctx) {

      ctx.fontKerning = style.fontKerning || "auto";

    }

    if ("letterSpacing" in ctx && font.letterSpacing !== "normal") {

      ctx.letterSpacing = font.letterSpacing;

    }

    const text = (

      element.innerText ||

      element.textContent ||

      ""

    ).trim();

    if (!text) return null;

    // Respect explicit line breaks.
    const lines = text.replace(/\r/g, "").split("\n");

    lines.forEach((line, index) => {

      const metrics = ctx.measureText(line);

      let x = 0;

      if (style.textAlign === "center") {

        x = (rect.width - metrics.width) / 2;

      } else if (

        style.textAlign === "right" ||

        style.textAlign === "end"

      ) {

        x = rect.width - metrics.width;

      }

      const baseline =

        (lh - font.fontSize) / 2 +

        font.fontSize * 0.82 +

        index * lh;

      ctx.fillText(line, x, baseline);

    });

    return finishMask(maskCanvas, element, canvasRect);

  }


  /* ==========================================================
     13. BUILD ALL COLLISION MASKS
     ========================================================== */

  function buildMasks() {

    const canvasRect = canvas.getBoundingClientRect();

    const nextMasks = [];

    // Logo mask.
    if (logo) {

      const logoMask = buildImageMask(logo, canvasRect);

      if (logoMask) {

        nextMasks.push(logoMask);

      }

    }

    // Text masks: supports both Statistics and Actuarial covers.
    textSelectors.forEach(selector => {

      const element = document.querySelector(selector);

      if (!element) return;

      const mask = buildTextMask(element, canvasRect);

      if (mask) {

        nextMasks.push(mask);

      }

    });

    masks = nextMasks;

  }


  /* ==========================================================
     14. ALPHA LOOKUP
     ========================================================== */

  function alphaAt(mask, x, y) {

    const px = Math.round(

      (x - mask.left) * CONFIG.maskScale

    );

    const py = Math.round(

      (y - mask.top) * CONFIG.maskScale

    );

    if (

      px < 0 ||

      py < 0 ||

      px >= mask.width ||

      py >= mask.height

    ) {

      return 0;

    }

    return mask.data[

      (py * mask.width + px) * 4 + 3

    ];

  }


  function occupancyAt(x, y) {

    for (const mask of masks) {

      if (

        alphaAt(mask, x, y) > CONFIG.alphaThreshold

      ) {

        return true;

      }

    }

    return false;

  }


  /* ==========================================================
     15. CIRCLE-TO-GLYPH COLLISION
     ========================================================== */

  function circleHitsMask(x, y, radius) {

    if (occupancyAt(x, y)) return true;

    const rings = [0.65, 1];

    for (const fraction of rings) {

      const r = radius * fraction;

      const count = Math.max(

        16,

        Math.ceil(2 * Math.PI * r / 2)

      );

      for (let i = 0; i < count; i++) {

        const angle = (i / count) * Math.PI * 2;

        const px = x + Math.cos(angle) * r;

        const py = y + Math.sin(angle) * r;

        if (occupancyAt(px, py)) {

          return true;

        }

      }

    }

    return false;

  }


  /* ==========================================================
     16. FIND NEAREST MASK POINT
     ========================================================== */

  function nearestMaskPoint(x, y, radius) {

    let best = null;

    let bestD2 = Infinity;

    const step = 1 / CONFIG.maskScale;

    for (const mask of masks) {

      const minX = Math.max(

        mask.left,

        x - radius

      );

      const maxX = Math.min(

        mask.left + mask.width / CONFIG.maskScale,

        x + radius

      );

      const minY = Math.max(

        mask.top,

        y - radius

      );

      const maxY = Math.min(

        mask.top + mask.height / CONFIG.maskScale,

        y + radius

      );

      for (let py = minY; py <= maxY; py += step) {

        for (let px = minX; px <= maxX; px += step) {

          if (

            alphaAt(mask, px, py) <= CONFIG.alphaThreshold

          ) {

            continue;

          }

          const dx = x - px;

          const dy = y - py;

          const d2 = dx * dx + dy * dy;

          if (d2 < bestD2) {

            bestD2 = d2;

            best = { x: px, y: py };

          }

        }

      }

    }

    return best;

  }


  /* ==========================================================
     17. GLYPH COLLISION FORCE
     ========================================================== */

  function createGlyphCollisionForce() {

    let forceNodes = [];

    function force() {

      if (!masks.length) return;

      for (let i = 1; i < forceNodes.length; i++) {

        const node = forceNodes[i];

        const radius = node.r + CONFIG.clearance;

        const startX = node.x;

        const startY = node.y;

        const moveX = node.vx * CONFIG.velocityRetention;

        const moveY = node.vy * CONFIG.velocityRetention;

        const distance = Math.hypot(moveX, moveY);

        const steps = Math.max(

          1,

          Math.ceil(distance / CONFIG.maxSweepStep)

        );

        let safeX = startX;

        let safeY = startY;

        let hitX = startX;

        let hitY = startY;

        let hit = false;

        // Sweep through the predicted trajectory.
        for (let step = 1; step <= steps; step++) {

          const t = step / steps;

          const testX = startX + moveX * t;

          const testY = startY + moveY * t;

          if (circleHitsMask(testX, testY, radius)) {

            hit = true;

            hitX = testX;

            hitY = testY;

            break;

          }

          safeX = testX;

          safeY = testY;

        }

        if (!hit) continue;

        const nearest = nearestMaskPoint(

          hitX,

          hitY,

          radius + 5

        );

        let nx;

        let ny;

        if (nearest) {

          nx = safeX - nearest.x;

          ny = safeY - nearest.y;

          const length = Math.hypot(nx, ny);

          if (length > 0.001) {

            nx /= length;

            ny /= length;

          } else {

            nx = undefined;

          }

        }

        // Fallback for overlapping particles.
        if (

          nx === undefined ||

          !Number.isFinite(nx) ||

          !Number.isFinite(ny)

        ) {

          const length = Math.hypot(moveX, moveY) || 1;

          nx = -moveX / length;

          ny = -moveY / length;

        }

        // Reflect inward velocity while preserving momentum.
        const dot = node.vx * nx + node.vy * ny;

        let vx = node.vx;

        let vy = node.vy;

        if (dot < 0) {

          const impulse = (1 + CONFIG.bounce) * dot;

          vx -= impulse * nx;

          vy -= impulse * ny;

        }

        node.vx = vx;

        node.vy = vy;

        // Compensate for D3 velocity decay.
        node.x = safeX - vx * CONFIG.velocityRetention;

        node.y = safeY - vy * CONFIG.velocityRetention;

      }

    }

    force.initialize = simulationNodes => {

      forceNodes = simulationNodes;

    };

    return force;

  }


  /* ==========================================================
     18. ORANGE COLOUR INTERACTION
     ========================================================== */

  function getOrangeIntensity(x, y) {

    if (!pointer.active) return 0;

    const distance = Math.hypot(

      x - pointer.x,

      y - pointer.y

    );

    const t = Math.max(

      0,

      Math.min(

        1,

        (distance - CONFIG.orangeContact) /

        (CONFIG.orangeRadius - CONFIG.orangeContact)

      )

    );

    // Smoothstep interpolation.
    const smooth = t * t * (3 - 2 * t);

    return 1 - smooth;

  }


  /* ==========================================================
     19. INDIVIDUAL PARTICLE COLOUR
     ========================================================== */

  function updateParticleColour(node) {

    if (typeof node.orange !== "number") {

      node.orange = 0;

    }

    const target = getOrangeIntensity(node.x, node.y);

    // Heat rises faster than it dissipates.
    const rate = target > node.orange

      ? CONFIG.orangeWarmRate

      : CONFIG.orangeCoolRate;

    node.orange += (target - node.orange) * rate;

    // Clamp the colour intensity.
    node.orange = Math.max(

      0,

      Math.min(1, node.orange)

    );

    // White to orange interpolation.
    const red = Math.round(

      255 +

      (CONFIG.orangeRed - 255) * node.orange

    );

    const green = Math.round(

      255 +

      (CONFIG.orangeGreen - 255) * node.orange

    );

    const blue = Math.round(

      255 +

      (CONFIG.orangeBlue - 255) * node.orange

    );

    return `rgb(${red}, ${green}, ${blue})`;

  }


  /* ==========================================================
     20. DRAW PARTICLES
     ========================================================== */

  function ticked() {

    context.clearRect(0, 0, width, height);

    context.save();

    context.translate(width / 2, height / 2);

    // Node 0 is the invisible cursor repeller.
    for (let i = 1; i < nodes.length; i++) {

      const d = nodes[i];

      context.beginPath();

      context.moveTo(d.x + d.r, d.y);

      context.arc(

        d.x,

        d.y,

        d.r,

        0,

        2 * Math.PI

      );

      // Each particle maintains its own colour state.
      context.fillStyle = updateParticleColour(d);

      context.fill();

    }

    context.restore();

  }


  /* ==========================================================
     21. POINTER INTERACTION
     ========================================================== */

  function pointermoved(event) {

    if (!nodes.length || !nodes[0]) return;

    const [x, y] = d3.pointer(event, canvas);

    pointer.x = x - width / 2;

    pointer.y = y - height / 2;

    pointer.active = true;

    // Original invisible repulsion node.
    nodes[0].fx = pointer.x;

    nodes[0].fy = pointer.y;

  }


  function pointerleft() {

    pointer.active = false;

    // Allow the particles to cool naturally.
    // Keep the original simulation's pointer node at its
    // final location rather than abruptly changing the force.

  }


  /* ==========================================================
     22. D3 SIMULATION
     ========================================================== */

  function createSimulation() {

    if (simulation) {

      simulation.stop();

    }

    // Create independent node objects.
    nodes = createData().map(d => ({ ...d }));

    simulation = d3.forceSimulation(nodes)

      // Original simulation target.
      .alphaTarget(0.3)

      // Original damping.
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

      // Original particle-to-particle collision.
      .force(

        "collide",

        d3.forceCollide()

          .radius(d => d.r + 2)

          .strength(1)

          .iterations(8)

      )

      // Original mouse repulsion.
      .force(

        "charge",

        d3.forceManyBody().strength((d, i) =>

          i ? 0 : -width * 2 / 3

        )

      )

      // Logo and text barriers.
      .force(

        "glyph-collisions",

        createGlyphCollisionForce()

      )

      .on("tick", ticked);

    console.log(

      `[collision] ${currentParticleCount} nodes; ` +

      `${masks.length} collision masks; ` +

      `canvas ${Math.round(width)} x ${Math.round(height)}`

    );

  }


  /* ==========================================================
     23. MASK REFRESH
     ========================================================== */

  function scheduleMaskRefresh() {

    clearTimeout(maskTimer);

    maskTimer = setTimeout(() => {

      buildMasks();

      if (simulation) {

        simulation.alpha(0.15).restart();

      }

    }, 60);

  }


  /* ==========================================================
     24. RESPONSIVE RESIZE
     ========================================================== */

  function resized() {

    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {

      resizeCanvas();

      createSimulation();

    }, 120);

  }


  /* ==========================================================
     25. INITIALIZE
     ========================================================== */

  function init() {

    resizeCanvas();

    createSimulation();


    /* LOGO LOAD */

    if (logo) {

      if (logo.complete && logo.naturalWidth) {

        scheduleMaskRefresh();

      } else {

        logo.addEventListener(

          "load",

          scheduleMaskRefresh

        );

        logo.addEventListener("error", () => {

          console.error(

            "[collision] Logo image could not be loaded."

          );

        });

      }

    }


    /* POINTER EVENTS */

    d3.select(canvas)

      .on(

        "touchmove",

        event => event.preventDefault()

      )

      .on(

        "pointermove",

        pointermoved

      )

      .on(

        "pointerleave",

        pointerleft

      );


    /* RESIZE */

    window.addEventListener(

      "resize",

      resized,

      { passive: true }

    );


    /* FONT LOADING */

    if (document.fonts && document.fonts.ready) {

      document.fonts.ready

        .then(scheduleMaskRefresh)

        .catch(() => {});

    }


    /* RESPONSIVE ELEMENT OBSERVATION */

    if ("ResizeObserver" in window) {

      observer = new ResizeObserver(

        scheduleMaskRefresh

      );

      [

        logo,

        ...textSelectors.map(selector =>

          document.querySelector(selector)

        )

      ]

        .filter(Boolean)

        .forEach(element => {

          observer.observe(element);

        });

    }

  }


  /* ==========================================================
     26. START
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
