
/* ==========================================================
   U of T Statistical Sciences — Undergraduate Collision Hero
   Glyph-contoured text collision edition.
   ========================================================== */

(() => {
  "use strict";

  const canvas = document.getElementById("collision-canvas");

  if (!canvas || typeof d3 === "undefined") return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const TEXT_CLEARANCE = 6;
  const MASK_SCALE = 2;
  const MASK_PADDING = 10;
  const VELOCITY_RETENTION = 0.9;
  const BOUNCE = 0.16;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let simulation = null;
  let currentParticleCount = 0;
  let resizeTimer = null;
  let textMasks = [];

  function getParticleCount() {
    if (width <= 800) return 100;
    if (width <= 1200) return 200;
    return 400;
  }

  function getParticleScale() {
    return Math.min(width, height) / 200;
  }

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

  /* ==========================================================
     RESIZE CANVAS
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

    buildTextMasks();
  }

  /* ==========================================================
     TEXT MASK GENERATION
     ========================================================== */

  function parseLineHeight(style, fontSize) {
    const value = style.lineHeight;

    if (!value || value === "normal") return fontSize * 1.2;

    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fontSize * 1.2;
  }

  function makeCanvas(widthPx, heightPx) {
    const result = document.createElement("canvas");

    result.width = Math.max(1, Math.ceil(widthPx));
    result.height = Math.max(1, Math.ceil(heightPx));

    return result;
  }

  function getFont(style) {
    const fontSize = parseFloat(style.fontSize) || 16;

    return {
      fontSize,
      font: `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      letterSpacing: style.letterSpacing || "normal"
    };
  }

  function measureText(ctx, text) {
    let widthPx = ctx.measureText(text).width;

    if (!("letterSpacing" in ctx) && ctx._letterSpacing) {
      widthPx += Math.max(0, text.length - 1) * ctx._letterSpacing;
    }

    return widthPx;
  }

  function wrapTextLines(ctx, text, maxWidth) {
    const output = [];
    const explicitLines = text.replace(/\r/g, "").split("\n");

    explicitLines.forEach(paragraph => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);

      if (!words.length) {
        output.push("");
        return;
      }

      let line = "";

      words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;

        if (line && measureText(ctx, candidate) > maxWidth) {
          output.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });

      if (line) output.push(line);
    });

    return output.length ? output : [text.trim()];
  }

  function buildOneTextMask(element, canvasRect) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    if (!rect.width || !rect.height) return null;

    const maskCanvas = makeCanvas(
      (rect.width + MASK_PADDING * 2) * MASK_SCALE,
      (rect.height + MASK_PADDING * 2) * MASK_SCALE
    );

    const maskContext = maskCanvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!maskContext) return null;

    const font = getFont(style);
    const lineHeight = parseLineHeight(style, font.fontSize);

    maskContext.setTransform(
      MASK_SCALE,
      0,
      0,
      MASK_SCALE,
      MASK_PADDING * MASK_SCALE,
      MASK_PADDING * MASK_SCALE
    );

    maskContext.font = font.font;
    maskContext.textBaseline = "alphabetic";
    maskContext.fillStyle = "#ffffff";

    if ("fontKerning" in maskContext) {
      maskContext.fontKerning = style.fontKerning || "auto";
    }

    if ("letterSpacing" in maskContext && font.letterSpacing !== "normal") {
      maskContext.letterSpacing = font.letterSpacing;
    } else if (font.letterSpacing !== "normal") {
      maskContext._letterSpacing = parseFloat(font.letterSpacing) || 0;
    }

    const text = (element.innerText || element.textContent || "").trim();

    if (!text) return null;

    const lines = wrapTextLines(maskContext, text, rect.width);
    const align = style.textAlign;

    lines.forEach((line, index) => {
      const textWidth = measureText(maskContext, line);
      let x = 0;

      if (align === "center") {
        x = (rect.width - textWidth) / 2;
      } else if (align === "right" || align === "end") {
        x = rect.width - textWidth;
      }

      const baseline =
        (lineHeight - font.fontSize) / 2 +
        font.fontSize * 0.82 +
        index * lineHeight;

      maskContext.fillText(line, x, baseline);
    });

    const image = maskContext.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );

    return {
      left: rect.left - canvasRect.left - width / 2 - MASK_PADDING,
      top: rect.top - canvasRect.top - height / 2 - MASK_PADDING,
      width: maskCanvas.width,
      height: maskCanvas.height,
      data: image.data
    };
  }

  /* ==========================================================
     BUILD GLYPH MASKS

     The transparent masks follow the individual letterforms.
     There are no rectangular text collision boundaries.
     ========================================================== */

  function buildTextMasks() {
    const canvasRect = canvas.getBoundingClientRect();

    const selectors = [
      "#cover h1",
      "#cover .cover-bottom p",
      "#cover .cover-bottom div"
    ];

    textMasks = selectors
      .map(selector => document.querySelector(selector))
      .filter(Boolean)
      .map(element => buildOneTextMask(element, canvasRect))
      .filter(Boolean);
  }

  /* ==========================================================
     PIXEL DETECTION
     ========================================================== */

  function alphaAt(mask, x, y) {
    const px = Math.round((x - mask.left) * MASK_SCALE);
    const py = Math.round((y - mask.top) * MASK_SCALE);

    if (
      px < 0 ||
      py < 0 ||
      px >= mask.width ||
      py >= mask.height
    ) {
      return 0;
    }

    return mask.data[(py * mask.width + px) * 4 + 3];
  }

  function pointHitsGlyph(x, y) {
    for (const mask of textMasks) {
      if (alphaAt(mask, x, y) > 48) return true;
    }

    return false;
  }

  /* ==========================================================
     CIRCLE-TO-GLYPH COLLISION

     Checks multiple concentric rings around each particle.
     This detects contact with the actual character strokes.
     ========================================================== */

  function circleHitsGlyph(x, y, radius) {
    if (pointHitsGlyph(x, y)) return true;

    const rings = [0.42, 0.72, 1.0];

    for (const fraction of rings) {
      const ringRadius = Math.max(1, radius * fraction);

      const count = Math.max(
        16,
        Math.ceil(2 * Math.PI * ringRadius * MASK_SCALE / 2)
      );

      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;

        const px = x + Math.cos(angle) * ringRadius;
        const py = y + Math.sin(angle) * ringRadius;

        if (pointHitsGlyph(px, py)) return true;
      }
    }

    return false;
  }

  /* ==========================================================
     FIND NEAREST LETTER PIXEL

     Calculates the outward direction needed to deflect a node.
     ========================================================== */

  function nearestGlyphPoint(x, y, searchRadius) {
    let best = null;
    let bestDistanceSquared = Infinity;

    const step = 1 / MASK_SCALE;

    for (const mask of textMasks) {
      const minX = Math.max(mask.left, x - searchRadius);
      const maxX = Math.min(
        mask.left + mask.width / MASK_SCALE,
        x + searchRadius
      );

      const minY = Math.max(mask.top, y - searchRadius);
      const maxY = Math.min(
        mask.top + mask.height / MASK_SCALE,
        y + searchRadius
      );

      for (let py = minY; py <= maxY; py += step) {
        for (let px = minX; px <= maxX; px += step) {
          if (alphaAt(mask, px, py) <= 48) continue;

          const dx = x - px;
          const dy = y - py;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < bestDistanceSquared) {
            bestDistanceSquared = distanceSquared;
            best = { x: px, y: py };
          }
        }
      }
    }

    return best;
  }

  /* ==========================================================
     GLYPH COLLISION FORCE

     Uses swept movement checks to prevent fast nodes from
     passing through the letterforms between animation frames.

     Tangential momentum is preserved so nodes slide around
     the contours instead of stopping at the edges.
     ========================================================== */

  function createGlyphCollisionForce() {
    let forceNodes = [];

    function force() {
      if (!textMasks.length) return;

      for (let i = 1; i < forceNodes.length; i += 1) {
        const node = forceNodes[i];
        const radius = node.r + TEXT_CLEARANCE;

        const startX = node.x;
        const startY = node.y;

        const moveX = node.vx * VELOCITY_RETENTION;
        const moveY = node.vy * VELOCITY_RETENTION;

        const distance = Math.hypot(moveX, moveY);

        const stepSize = Math.max(
          1.2,
          Math.min(2.5, radius * 0.25)
        );

        const steps = Math.max(1, Math.ceil(distance / stepSize));

        let safeX = startX;
        let safeY = startY;

        let hit = false;
        let hitX = startX;
        let hitY = startY;

        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;

          const testX = startX + moveX * t;
          const testY = startY + moveY * t;

          if (circleHitsGlyph(testX, testY, radius)) {
            hit = true;
            hitX = testX;
            hitY = testY;
            break;
          }

          safeX = testX;
          safeY = testY;
        }

        if (!hit) continue;

        const edge = nearestGlyphPoint(
          hitX,
          hitY,
          radius + 5
        );

        let normalX;
        let normalY;

        if (edge) {
          const nx = safeX - edge.x;
          const ny = safeY - edge.y;
          const length = Math.hypot(nx, ny);

          if (length > 0.001) {
            normalX = nx / length;
            normalY = ny / length;
          }
        }

        if (normalX === undefined) {
          const length = Math.hypot(moveX, moveY) || 1;

          normalX = -moveX / length;
          normalY = -moveY / length;
        }

        const dot = node.vx * normalX + node.vy * normalY;

        let vx = node.vx;
        let vy = node.vy;

        if (dot < 0) {
          const impulse = (1 + BOUNCE) * dot;

          vx -= impulse * normalX;
          vy -= impulse * normalY;
        }

        node.vx = vx;
        node.vy = vy;

        // Account for D3's velocity decay and subsequent
        // position integration.
        node.x = safeX - node.vx * VELOCITY_RETENTION;
        node.y = safeY - node.vy * VELOCITY_RETENTION;
      }
    }

    force.initialize = simulationNodes => {
      forceNodes = simulationNodes;
    };

    return force;
  }

  /* ==========================================================
     DRAW PARTICLES
     ========================================================== */

  function ticked() {
    context.clearRect(0, 0, width, height);
    context.save();

    context.translate(width / 2, height / 2);

    for (let i = 1; i < nodes.length; i += 1) {
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

  /* ==========================================================
     POINTER INTERACTION
     ========================================================== */

  function pointermoved(event) {
    if (!nodes.length || !nodes[0]) return;

    const [x, y] = d3.pointer(event, canvas);

    nodes[0].fx = x - width / 2;
    nodes[0].fy = y - height / 2;
  }

  /* ==========================================================
     D3 SIMULATION
     ========================================================== */

  function createSimulation() {
    if (simulation) simulation.stop();

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
      `Collision hero: ${currentParticleCount} nodes at ${Math.round(width)}px; ${textMasks.length} glyph masks`
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

    d3.select(canvas)

      .on(
        "touchmove",
        event => event.preventDefault()
      )

      .on(
        "pointermove",
        pointermoved
      );

    window.addEventListener(
      "resize",
      resized,
      { passive: true }
    );

    // Rebuild masks after web fonts load.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        buildTextMasks();

        if (simulation) {
          simulation.alpha(0.3).restart();
        }
      });
    }

    // Rebuild when text dimensions change at responsive breakpoints.
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        buildTextMasks();

        if (simulation) {
          simulation.alpha(0.15).restart();
        }
      });

      [
        "#cover h1",
        "#cover .cover-bottom p",
        "#cover .cover-bottom div"
      ].forEach(selector => {
        const element = document.querySelector(selector);

        if (element) observer.observe(element);
      });
    }
  }

  /* ==========================================================
     START
     ========================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }

})();
