
/* ==========================================================
   U of T Statistical Sciences — Undergraduate Collision Hero

   Recovery version: keeps the original D3 simulation and adds
   transparent-pixel collision masks for the SVG logo and the
   two lower cover text lines.

   Original simulation settings retained:
   - Mobile <= 800px:       100 nodes
   - Tablet 801-1200px:     200 nodes
   - Desktop > 1200px:      400 nodes
   - Original node sizing and pointer repulsion
   - Original centering, damping and collisions
   ========================================================== */

(() => {
  "use strict";

  const canvas = document.getElementById("collision-canvas");

  if (!canvas) {
    console.warn("[collision] #collision-canvas not found.");
    return;
  }

  if (typeof d3 === "undefined") {
    console.error("[collision] D3 is not loaded. Check the D3 script in index.html.");
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    console.error("[collision] Could not create a 2D canvas context.");
    return;
  }

  const CONFIG = {
    clearance: 6,
    maskScale: 2,
    maskPadding: 12,
    alphaThreshold: 48,
    bounce: 0.16,
    velocityRetention: 0.9,
    maxSweepStep: 2.5,
    maskRefreshDelay: 60
  };

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

  const logo = document.getElementById("cover-logo");

  const textSelectors = [
    "#cover .cover-bottom p",
    "#cover .cover-bottom div"
  ];

  /* RESPONSIVE PARTICLE COUNT */

  function getParticleCount() {
    if (width <= 800) return 100;
    if (width <= 1200) return 200;
    return 400;
  }

  /* PARTICLE SIZE */

  function getParticleScale() {
    return Math.min(width, height) / 200;
  }

  /* CREATE PARTICLE DATA */

  function createData() {
    const count = getParticleCount();
    currentParticleCount = count;

    const k = getParticleScale();
    const radius = d3.randomUniform(k, k * 4);

    return Array.from({ length: count }, (_, i) => ({
      r: radius(),
      group: i && (i % 4 + 1)
    }));
  }

  /* CANVAS SIZE */

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

  /* CREATE MASK CANVAS */

  function makeMaskCanvas(w, h) {
    const c = document.createElement("canvas");

    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));

    return c;
  }

  /* MASK POSITION */

  function getMaskPosition(element, canvasRect) {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left - canvasRect.left - width / 2 - CONFIG.maskPadding,
      top: rect.top - canvasRect.top - height / 2 - CONFIG.maskPadding
    };
  }

  /*
   * Read mask pixels.
   *
   * If an SVG is malformed, references a cross-origin asset,
   * or cannot be read by Canvas, the function returns null.
   *
   * Crucially, this does not stop the particle simulation.
   */

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

      const pos = getMaskPosition(element, canvasRect);

      return {
        left: pos.left,
        top: pos.top,
        width: maskCanvas.width,
        height: maskCanvas.height,
        data: image.data
      };

    } catch (error) {

      console.error(
        "[collision] Could not read logo/text mask. Check that the SVG is same-origin and has no external linked assets.",
        error
      );

      return null;
    }
  }

  /* ==========================================================
     SVG LOGO MASK

     Reads the actual transparency of the displayed SVG.

     Transparent areas remain open to particles.
     Visible logo artwork becomes the collision surface.
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

    // Match CSS object-fit: contain and object-position: left center.
    const style = window.getComputedStyle(element);
    const fit = style.objectFit || "fill";

    let drawX = 0;
    let drawY = 0;
    let drawWidth = rect.width;
    let drawHeight = rect.height;

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
        position[0] === "right" ? rect.width - drawWidth :
        (rect.width - drawWidth) / 2;

      drawY =
        position[1] === "top" ? 0 :
        position[1] === "bottom" ? rect.height - drawHeight :
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
        "[collision] SVG could not be drawn into the collision mask.",
        error
      );

      return null;
    }

    return finishMask(maskCanvas, element, canvasRect);
  }

  /* TEXT FONT UTILITIES */

  function getFont(style) {
    const fontSize = parseFloat(style.fontSize) || 16;

    return {
      fontSize,
      font: `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      letterSpacing: style.letterSpacing || "normal"
    };
  }

  function lineHeight(style, size) {
    if (!style.lineHeight || style.lineHeight === "normal") {
      return size * 1.2;
    }

    const value = parseFloat(style.lineHeight);

    return Number.isFinite(value) ? value : size * 1.2;
  }

  /* BUILD TEXT MASK */

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
    const lh = lineHeight(style, font.fontSize);

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
    ctx.fillStyle = "#fff";

    if ("fontKerning" in ctx) {
      ctx.fontKerning = style.fontKerning || "auto";
    }

    if ("letterSpacing" in ctx && font.letterSpacing !== "normal") {
      ctx.letterSpacing = font.letterSpacing;
    } else if (font.letterSpacing !== "normal") {
      ctx._letterSpacing = parseFloat(font.letterSpacing) || 0;
    }

    const text = (
      element.innerText || element.textContent || ""
    ).trim();

    if (!text) return null;

    const paragraphs = text.replace(/\r/g, "").split("\n");
    const lines = [];

    paragraphs.forEach(paragraph => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);

      if (!words.length) {
        lines.push("");
        return;
      }

      let current = "";

      words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;

        if (
          current &&
          ctx.measureText(candidate).width > rect.width
        ) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });

      if (current) lines.push(current);
    });

    lines.forEach((line, index) => {
      const metrics = ctx.measureText(line);
      let x = 0;

      if (style.textAlign === "center") {
        x = (rect.width - metrics.width) / 2;
      }

      if (
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

  /* BUILD ALL MASKS */

  function buildMasks() {
    const canvasRect = canvas.getBoundingClientRect();
    const next = [];

    // Logo is an image; its alpha channel defines the mask.
    if (logo) {
      const logoMask = buildImageMask(logo, canvasRect);

      if (logoMask) {
        next.push(logoMask);
      }
    }

    // The two lower cover labels are rasterized from their fonts.
    textSelectors.forEach(selector => {
      const element = document.querySelector(selector);

      if (!element) return;

      const mask = buildTextMask(element, canvasRect);

      if (mask) {
        next.push(mask);
      }
    });

    masks = next;
  }

  /* ALPHA LOOKUP */

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
      if (alphaAt(mask, x, y) > CONFIG.alphaThreshold) {
        return true;
      }
    }

    return false;
  }

  /* CIRCLE-TO-GLYPH COLLISION */

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

        if (
          occupancyAt(
            x + Math.cos(angle) * r,
            y + Math.sin(angle) * r
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /* FIND NEAREST MASK POINT */

  function nearestMaskPoint(x, y, radius) {
    let best = null;
    let bestD2 = Infinity;

    const step = 1 / CONFIG.maskScale;

    for (const mask of masks) {
      const minX = Math.max(mask.left, x - radius);

      const maxX = Math.min(
        mask.left + mask.width / CONFIG.maskScale,
        x + radius
      );

      const minY = Math.max(mask.top, y - radius);

      const maxY = Math.min(
        mask.top + mask.height / CONFIG.maskScale,
        y + radius
      );

      for (let py = minY; py <= maxY; py += step) {
        for (let px = minX; px <= maxX; px += step) {

          if (alphaAt(mask, px, py) <= CONFIG.alphaThreshold) {
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
     GLYPH COLLISION FORCE
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

        // Check predicted movement in short increments.
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

        // Find the nearest actual opaque pixel.
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

        // Fallback direction for an initial overlap.
        if (
          nx === undefined ||
          !Number.isFinite(nx) ||
          !Number.isFinite(ny)
        ) {
          const length = Math.hypot(moveX, moveY) || 1;

          nx = -moveX / length;
          ny = -moveY / length;
        }

        // Reflect inward velocity while preserving tangential motion.
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

        // Account for D3 velocity decay and position integration.
        node.x = safeX - vx * CONFIG.velocityRetention;
        node.y = safeY - vy * CONFIG.velocityRetention;
      }
    }

    force.initialize = simulationNodes => {
      forceNodes = simulationNodes;
    };

    return force;
  }

  /* DRAW PARTICLES */

  function ticked() {
    context.clearRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);

    // Node 0 is invisible and follows the pointer.
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

      context.fillStyle = "#ffffff";
      context.fill();
    }

    context.restore();
  }

  /* POINTER INTERACTION */

  function pointermoved(event) {
    if (!nodes.length || !nodes[0]) return;

    const [x, y] = d3.pointer(event, canvas);

    nodes[0].fx = x - width / 2;
    nodes[0].fy = y - height / 2;
  }

  /* D3 SIMULATION */

  function createSimulation() {
    if (simulation) {
      simulation.stop();
    }

    nodes = createData().map(Object.create);

    simulation = d3.forceSimulation(nodes)

      .alphaTarget(0.3)

      .velocityDecay(0.1)

      .force(
        "x",
        d3.forceX().strength(0.01)
      )

      .force(
        "y",
        d3.forceY().strength(0.01)
      )

      .force(
        "collide",
        d3.forceCollide()
          .radius(d => d.r + 2)
          .strength(1)
          .iterations(8)
      )

      .force(
        "charge",
        d3.forceManyBody().strength((d, i) =>
          i ? 0 : -width * 2 / 3
        )
      )

      .force(
        "glyph-collisions",
        createGlyphCollisionForce()
      )

      .on("tick", ticked);

    console.log(
      `[collision] ${currentParticleCount} nodes; ${masks.length} masks; canvas ${Math.round(width)} x ${Math.round(height)}`
    );
  }

  /* MASK REFRESH */

  function scheduleMaskRefresh() {
    clearTimeout(maskTimer);

    maskTimer = setTimeout(() => {
      buildMasks();

      if (simulation) {
        simulation.alpha(0.15).restart();
      }
    }, CONFIG.maskRefreshDelay);
  }

  /* RESIZE */

  function resized() {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      resizeCanvas();
      createSimulation();
    }, 120);
  }

  /* INITIALIZE */

  function init() {
    resizeCanvas();
    createSimulation();

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
            "[collision] Logo not found. Check the exact filename: statistical sciences_knockedout.svg"
          );
        });
      }
    }

    // Mouse, pen and touch interaction.
    d3.select(canvas)
      .on("touchmove", event => event.preventDefault())
      .on("pointermove", pointermoved);

    window.addEventListener(
      "resize",
      resized,
      { passive: true }
    );

    // Wait for fonts before rasterizing text masks.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(scheduleMaskRefresh)
        .catch(() => {});
    }

    // Update masks when logo or cover text changes dimensions.
    if ("ResizeObserver" in window) {

      observer = new ResizeObserver(scheduleMaskRefresh);

      [
        logo,
        ...textSelectors.map(selector =>
          document.querySelector(selector)
        )
      ]
        .filter(Boolean)
        .forEach(element => observer.observe(element));
    }
  }

  /* START */

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
