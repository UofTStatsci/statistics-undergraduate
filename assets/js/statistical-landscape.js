
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   GENERATIVE DATA STREAM VISUALIZATION

   File: assets/js/statistical-landscape.js
   Version: 1.0

   Features:
   - Entirely generative Canvas visualization
   - No external images or elevation maps
   - No Three.js or WebGL
   - Multicoloured flowing data streams
   - Scattered observation nodes
   - Smooth mathematical ribbon formation
   - Subtle continuous ambient movement
   - Mouse-reactive collision / repulsion
   - Soft spring recovery without bouncing
   - Responsive desktop, tablet and mobile
   - Reduced-motion support
   - Full-page scrolling compatibility

   ========================================================== */

(() => {

  "use strict";


  /* ==========================================================
     01 / SETTINGS
     ========================================================== */

  const SETTINGS = {

    background: "#002A5C",

    /* Number of flowing streams */

    desktopLines: 68,
    tabletLines: 52,
    mobileLines: 34,

    /* Samples per stream */

    desktopSamples: 125,
    tabletSamples: 105,
    mobileSamples: 85,

    /* Appearance */

    lineWidth: 1.0,
    lineOpacity: 0.68,

    nodeRadius: 3.2,
    nodeOpacity: 0.92,

    /*
     * Restrained multicolour palette.
     */

    colors: [
      "#51c8f0",
      "#419be0",
      "#54d4b1",
      "#6fc66b",
      "#e6d35d",
      "#e77aaa"
    ],

    /* Ambient animation */

    ambientAmplitude: 2.0,
    ambientSpeed: 0.55,

    /* Mouse interaction */

    interactionRadius: 125,
    interactionStrength: 0.20,
    maximumDisplacement: 11,

    /*
     * Higher = faster recovery.
     * No overshoot or elastic recoil.
     */

    recovery: 0.17,

    /* Rendering */

    maxPixelRatio: 2

  };


  /* ==========================================================
     02 / ELEMENTS AND INITIALIZATION
     ========================================================== */

  const cover = document.getElementById("cover");

  if (!cover) {
    console.warn(
      "[statistical landscape] Cover element not found."
    );
    return;
  }


  /* ==========================================================
     03 / CLEAN UP PREVIOUS TOPOGRAPHY HTML

     Preserve the University branding, title and
     undergraduate program information.

     Remove the previous image-based visualization.
     ========================================================== */

  const oldExperience = cover.querySelector(
    ".topo-experience"
  );

  if (oldExperience) {

    const preservedElements = [
      ".cover-top",
      ".cover-bottom",
      ".down"
    ];

    for (const selector of preservedElements) {

      const element = oldExperience.querySelector(
        selector
      );

      if (element) {
        cover.appendChild(element);
      }

    }

    oldExperience.remove();
  }


  /* Remove any previous topographic artwork or controls. */

  cover.querySelector(
    ".topo-readout"
  )?.remove();

  cover.querySelector(
    ".topo-footer"
  )?.remove();


  /* ==========================================================
     04 / CREATE CANVAS LAYER
     ========================================================== */

  cover.style.backgroundColor =
    SETTINGS.background;

  cover.style.position = "relative";

  cover.style.isolation = "isolate";

  const previousCanvas =
    cover.querySelector("#statistical-landscape");

  previousCanvas?.remove();


  const layer = document.createElement("div");

  layer.id = "statistical-landscape";

  Object.assign(layer.style, {

    position: "absolute",

    inset: "0",

    width: "100%",

    height: "100%",

    zIndex: "1",

    overflow: "hidden",

    pointerEvents: "none",

    background: SETTINGS.background

  });


  const canvas = document.createElement("canvas");

  canvas.id = "statistical-landscape-canvas";

  canvas.setAttribute(
    "aria-hidden",
    "true"
  );

  Object.assign(canvas.style, {

    display: "block",

    width: "100%",

    height: "100%",

    maxWidth: "none"

  });


  layer.appendChild(canvas);

  cover.insertBefore(
    layer,
    cover.firstChild
  );


  /* Keep existing foreground elements above canvas. */

  for (const selector of [
    ".cover-top",
    ".cover-bottom",
    ".down"
  ]) {

    const element = cover.querySelector(selector);

    if (element) {

      element.style.zIndex =
        selector === ".down" ? "5" : "3";

    }
  }


  /* ==========================================================
     05 / CANVAS CONTEXT
     ========================================================== */

  const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });

  if (!ctx) {

    console.error(
      "[statistical landscape] Canvas rendering unavailable."
    );

    return;
  }


  /* ==========================================================
     06 / STATE
     ========================================================== */

  let width = 1;
  let height = 1;

  let dpr = 1;

  let lines = [];

  let lineCount = 0;
  let sampleCount = 0;

  let animationFrame = null;
  let lastFrame = 0;

  let elapsedTime = 0;

  let isVisible = true;

  let pointer = null;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ==========================================================
     07 / SEEDED RANDOM NUMBER

     Creates consistent line patterns across redraws.
     ========================================================== */

  function random(seed) {

    const value = Math.sin(
      seed * 127.1 + 311.7
    ) * 43758.5453;

    return value - Math.floor(value);
  }


  /* ==========================================================
     08 / SMOOTH CURVE INTERPOLATION
     ========================================================== */

  function catmullRom(points, t) {

    const segments = points.length - 1;

    const position = Math.max(
      0,
      Math.min(
        segments - 0.000001,
        t * segments
      )
    );

    const index = Math.floor(position);

    const local = position - index;

    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[
      Math.min(points.length - 1, index + 2)
    ];

    const v0 = p0 * -0.5 + p1 * 1.5 -
      p2 * 1.5 + p3 * 0.5;

    const v1 = p0 - p1 * 2.5 +
      p2 * 2 - p3 * 0.5;

    const v2 = -p0 * 0.5 + p2 * 0.5;

    const v3 = p1;

    return (
      v0 * local * local * local +
      v1 * local * local +
      v2 * local +
      v3
    );
  }


  /* ==========================================================
     09 / RIBBON SHAPE

     The overall trajectory follows the reference:

     - Dispersed observations on the left
     - A broad descending valley
     - A prominent central crest
     - A second valley
     - An upward sweep on the right

     Each stream follows the same general trajectory,
     but occupies a different position in the ribbon.
     ========================================================== */

  const CENTER_CURVE = [
    0.44,
    0.48,
    0.64,
    0.76,
    0.20,
    0.34,
    0.50,
    -0.20
  ];


  const RIBBON_WIDTH = [
    0.36,
    0.26,
    0.15,
    0.105,
    0.105,
    0.12,
    0.18,
    0.34
  ];


  function curveY(t) {

    return catmullRom(
      CENTER_CURVE,
      t
    );
  }


  function ribbonWidth(t) {

    return catmullRom(
      RIBBON_WIDTH,
      t
    );
  }


  /* ==========================================================
     10 / RESPONSIVE DIMENSIONS
     ========================================================== */

  function getDimensions() {

    if (window.innerWidth <= 600) {

      return [
        SETTINGS.mobileLines,
        SETTINGS.mobileSamples
      ];

    }

    if (window.innerWidth <= 1100) {

      return [
        SETTINGS.tabletLines,
        SETTINGS.tabletSamples
      ];

    }

    return [
      SETTINGS.desktopLines,
      SETTINGS.desktopSamples
    ];

  }


  /* ==========================================================
     11 / BUILD DATA STREAMS
     ========================================================== */

  function buildLines() {

    const dimensions = getDimensions();

    lineCount = dimensions[0];

    sampleCount = dimensions[1];

    lines = [];


    for (let i = 0; i < lineCount; i++) {

      const normalized =
        (i / (lineCount - 1)) * 2 - 1;

      const seed = i + 1;

      const startRandom =
        random(seed * 3.7);

      const startX =
        width * (
          0.075 + startRandom * 0.20
        );

      const phase =
        random(seed * 8.3) * Math.PI * 2;

      const colorIndex =
        Math.floor(
          random(seed * 4.2) *
          SETTINGS.colors.length
        );

      const color =
        SETTINGS.colors[colorIndex];

      const opacity =
        SETTINGS.lineOpacity *
        (
          0.72 +
          random(seed * 6.1) * 0.28
        );

      const showNode =
        random(seed * 9.1) > 0.28;


      /*
       * Precalculate the original trajectory.
       */

      const baseX = new Float32Array(sampleCount);

      const baseY = new Float32Array(sampleCount);

      const displacement = new Float32Array(sampleCount);

      const currentX = new Float32Array(sampleCount);

      const currentY = new Float32Array(sampleCount);


      for (let j = 0; j < sampleCount; j++) {

        const t =
          j / (sampleCount - 1);

        const x =
          startX +
          (width * 1.055 - startX) * t;

        const center =
          curveY(t) * height;

        const spread =
          ribbonWidth(t) * height;

        /*
         * Fine variations differentiate individual
         * streams without disturbing the main ribbon.
         */

        const individualVariation =
          Math.sin(
            t * 8.0 + phase
          ) * 1.25;

        const y =
          center +
          normalized * spread +
          individualVariation;

        baseX[j] = x;
        baseY[j] = y;

      }


      lines.push({

        index: i,

        normalized,

        phase,

        color,

        opacity,

        startX,

        showNode,

        baseX,

        baseY,

        displacement,

        currentX,

        currentY

      });

    }

  }


  /* ==========================================================
     12 / MOUSE INTERACTION

     Creates a soft local repulsion field.

     The cursor minimally displaces nearby streams
     perpendicular to their direction of travel.

     No collisions, bouncing or excessive recoil.
     ========================================================== */

  function updateInteraction(line, frameScale) {

    const {

      baseX,
      baseY,
      displacement,
      currentX,
      currentY

    } = line;


    for (let j = 0; j < sampleCount; j++) {

      const x = baseX[j];

      const y = baseY[j];

      let target = 0;


      /* ------------------------------------------------------
         Calculate local curve direction
         ------------------------------------------------------ */

      const previous =
        Math.max(0, j - 1);

      const next =
        Math.min(sampleCount - 1, j + 1);

      const dx =
        baseX[next] - baseX[previous];

      const dy =
        baseY[next] - baseY[previous];

      const length =
        Math.hypot(dx, dy) || 1;

      const normalX =
        -dy / length;

      const normalY =
        dx / length;


      /* ------------------------------------------------------
         Mouse repulsion
         ------------------------------------------------------ */

      if (pointer) {

        const differenceX =
          pointer.x - x;

        const differenceY =
          pointer.y - y;

        const distance =
          Math.hypot(
            differenceX,
            differenceY
          );

        const radius =
          SETTINGS.interactionRadius *
          (width < 650 ? 0.78 : 1);

        if (distance < radius * 2.5) {

          const influence = Math.exp(
            -(
              distance * distance
            ) /
            (radius * radius)
          );

          /*
           * Push the stream away from the cursor.
           */

          const signedDistance =
            differenceX * normalX +
            differenceY * normalY;

          target =
            -signedDistance *
            influence *
            SETTINGS.interactionStrength;

          target = Math.max(
            -SETTINGS.maximumDisplacement,
            Math.min(
              SETTINGS.maximumDisplacement,
              target
            )
          );

        }

      }


      /* ------------------------------------------------------
         Smooth spring recovery

         This interpolation is deliberately damped.
         There is no velocity overshoot.
         ------------------------------------------------------ */

      const blend =
        1 - Math.pow(
          1 - SETTINGS.recovery,
          frameScale
        );

      displacement[j] +=
        (target - displacement[j]) * blend;


      /* ------------------------------------------------------
         Final position
         ------------------------------------------------------ */

      currentX[j] =
        x + normalX * displacement[j];

      currentY[j] =
        y + normalY * displacement[j];

    }

  }


  /* ==========================================================
     13 / AMBIENT MOVEMENT

     Small continuous undulations make the ribbon feel
     alive without noticeably changing its shape.
     ========================================================== */

  function ambientY(line, t, time) {

    if (reducedMotion.matches) {
      return 0;
    }

    const a =
      Math.sin(
        t * 5.2 +
        line.phase +
        time * SETTINGS.ambientSpeed
      ) * 1.35;

    const b =
      Math.sin(
        t * 10.5 -
        time * 0.32 +
        line.phase * 0.65
      ) * 0.55;

    const c =
      Math.sin(
        time * 0.25 +
        line.phase
      ) * 0.35;

    return (a + b + c);
  }


  /* ==========================================================
     14 / DRAW STREAMS
     ========================================================== */

  function drawLines(frameScale, time) {

    for (const line of lines) {

      updateInteraction(
        line,
        frameScale
      );

      const {
        currentX,
        currentY,
        color,
        opacity
      } = line;


      ctx.beginPath();

      for (let j = 0; j < sampleCount; j++) {

        const t =
          j / (sampleCount - 1);

        const x =
          currentX[j];

        const y =
          currentY[j] +
          ambientY(line, t, time);


        if (j === 0) {

          ctx.moveTo(x, y);

        } else {

          ctx.lineTo(x, y);

        }

      }


      ctx.strokeStyle = color;

      ctx.globalAlpha = opacity;

      ctx.lineWidth =
        width < 600 ? 0.85 : SETTINGS.lineWidth;

      ctx.lineCap = "round";

      ctx.lineJoin = "round";

      ctx.stroke();

    }

    ctx.globalAlpha = 1;

  }


  /* ==========================================================
     15 / DRAW OBSERVATION NODES

     Small coloured points at the beginning of selected
     streams represent individual data observations.
     ========================================================== */

  function drawNodes(time) {

    for (const line of lines) {

      if (!line.showNode) continue;

      const x =
        line.currentX[0];

      const y =
        line.currentY[0] +
        ambientY(line, 0, time);

      const radius =
        width < 600
          ? 2.3
          : SETTINGS.nodeRadius;


      /*
       * Soft coloured glow.
       */

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        radius * 2.4,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = line.color;

      ctx.globalAlpha = 0.13;

      ctx.fill();


      /*
       * Solid observation point.
       */

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
      );

      ctx.globalAlpha =
        SETTINGS.nodeOpacity;

      ctx.fillStyle = line.color;

      ctx.fill();

    }

    ctx.globalAlpha = 1;

  }


  /* ==========================================================
     16 / SUBTLE BACKGROUND GRADIENT

     Gives the data ribbon depth without introducing
     visual clutter or competing with the heading.
     ========================================================== */

  function drawBackground() {

    ctx.fillStyle =
      SETTINGS.background;

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    /*
     * Very subtle darkening behind the text area.
     */

    const gradient =
      ctx.createLinearGradient(
        0,
        0,
        width * 0.48,
        height * 0.55
      );

    gradient.addColorStop(
      0,
      "rgba(0, 0, 0, 0.13)"
    );

    gradient.addColorStop(
      1,
      "rgba(0, 0, 0, 0)"
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

  }


  /* ==========================================================
     17 / RENDER FRAME
     ========================================================== */

  function render(now) {

    animationFrame = null;

    if (!isVisible || document.hidden) {
      return;
    }

    if (!lastFrame) {
      lastFrame = now;
    }

    const delta =
      Math.min(
        50,
        Math.max(
          0,
          now - lastFrame
        )
      );

    lastFrame = now;

    const frameScale =
      delta / 16.667;

    elapsedTime +=
      reducedMotion.matches
        ? 0
        : delta / 1000;


    /* Clear background */

    drawBackground();


    /* Draw continuous data ribbon */

    drawLines(
      frameScale,
      elapsedTime
    );


    /* Draw observation nodes */

    drawNodes(elapsedTime);


    /*
     * Continue while visible.

     * Even with no cursor interaction, the ambient
     * ribbon movement continues.
     */

    if (!reducedMotion.matches) {

      animationFrame =
        requestAnimationFrame(render);

    }

  }


  /* ==========================================================
     18 / ANIMATION CONTROL
     ========================================================== */

  function startAnimation() {

    if (
      animationFrame !== null ||
      !isVisible ||
      document.hidden
    ) {
      return;
    }

    lastFrame = 0;

    animationFrame =
      requestAnimationFrame(render);

  }


  function stopAnimation() {

    if (animationFrame !== null) {

      cancelAnimationFrame(
        animationFrame
      );

      animationFrame = null;

    }

    lastFrame = 0;

  }


  /* ==========================================================
     19 / POINTER EVENTS
     ========================================================== */

  cover.addEventListener(
    "pointermove",
    event => {

      const rect =
        cover.getBoundingClientRect();

      pointer = {

        x: event.clientX - rect.left,

        y: event.clientY - rect.top

      };

      if (reducedMotion.matches) {
        renderStatic();
      }

    },
    { passive: true }
  );


  cover.addEventListener(
    "pointerleave",
    () => {

      pointer = null;

      if (reducedMotion.matches) {
        renderStatic();
      }

    }
  );


  /* ==========================================================
     20 / STATIC RENDER
     ========================================================== */

  function renderStatic() {

    if (!lines.length) return;

    drawBackground();

    drawLines(
      1,
      0
    );

    drawNodes(0);

  }


  /* ==========================================================
     21 / RESIZE
     ========================================================== */

  function resize() {

    const rect =
      cover.getBoundingClientRect();

    const newWidth =
      Math.max(1, rect.width);

    const newHeight =
      Math.max(1, rect.height);

    const newDpr =
      Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxPixelRatio
      );

    const dimensionsChanged =
      newWidth !== width ||
      newHeight !== height;

    width = newWidth;

    height = newHeight;

    dpr = newDpr;


    canvas.width =
      Math.round(width * dpr);

    canvas.height =
      Math.round(height * dpr);

    canvas.style.width =
      `${width}px`;

    canvas.style.height =
      `${height}px`;


    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );


    if (dimensionsChanged || !lines.length) {

      buildLines();

    }

    renderStatic();

  }


  /* ==========================================================
     22 / VISIBILITY OBSERVER
     ========================================================== */

  if ("IntersectionObserver" in window) {

    const observer =
      new IntersectionObserver(
        entries => {

          isVisible =
            entries[0].isIntersecting;

          if (isVisible) {

            startAnimation();

          } else {

            stopAnimation();

          }

        },
        {
          root: document.querySelector(".snap"),
          threshold: 0.01
        }
      );

    observer.observe(cover);

  }


  /* ==========================================================
     23 / PAGE VISIBILITY
     ========================================================== */

  document.addEventListener(
    "visibilitychange",
    () => {

      if (document.hidden) {

        stopAnimation();

      } else {

        startAnimation();

      }

    }
  );


  /* ==========================================================
     24 / REDUCED MOTION
     ========================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {

        stopAnimation();

        pointer = null;

        renderStatic();

      } else {

        startAnimation();

      }

    }
  );


  /* ==========================================================
     25 / RESPONSIVE RESIZE OBSERVER
     ========================================================== */

  if ("ResizeObserver" in window) {

    const observer =
      new ResizeObserver(resize);

    observer.observe(cover);

  } else {

    window.addEventListener(
      "resize",
      resize,
      { passive: true }
    );

  }


  /* ==========================================================
     26 / INITIALIZE
     ========================================================== */

  resize();

  startAnimation();

  console.log(
    `[statistical landscape] Initialized: ${lineCount} data streams.`
  );

})();
