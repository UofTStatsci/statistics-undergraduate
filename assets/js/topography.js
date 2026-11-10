
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   IMAGE-LOCKED INTERACTIVE TOPOGRAPHY

   File: assets/js/topography.js
   Version: 4.0

   Features:
   - Fixed original topographic artwork
   - Pixel-aligned elevation mask
   - Smooth orange contour highlighting
   - Mouse and touch elevation interaction
   - Automatic idle elevation sweep
   - 4.2-second idle delay
   - Gentle cinematic flyover
   - Subtle continuous contour wave animation
   - Approximately 2px displacement
   - Original line weights and opacity preserved
   - No visible elevation controls
   - Responsive rendering
   - Reduced-motion support

   Required assets:
   assets/images/contours.jpg
   assets/images/elevation-map.png

   No Three.js or build system required.
   ========================================================== */

(() => {

  "use strict";


  /* ==========================================================
     01 / CONFIGURATION
     ========================================================== */

  const CONFIG = {

    /* Asset paths relative to index.html */

    mapUrl: "assets/images/elevation-map.png",

    imageWidth: 2048,
    imageHeight: 1365,

    /* Initial elevation */

    initialElevation: 0.50,

    /* Orange contour selection */

    bandWidth: 0.040,
    highlightOpacity: 0.98,

    /* Idle elevation animation */

    idleAnimation: true,
    idleDelayMs: 4200,
    idleSpeed: 0.00018,
    idleRange: 0.25,

    /* Smooth elevation transitions */

    smoothing: 0.095,

    /* Artwork appearance */

    artworkOpacity: 0.26,
    overlayOpacity: 0.55,

    /* Cinematic flyover */

    flyoverEnabled: true,
    flyoverZoom: 0.035,
    flyoverPanX: 0.006,
    flyoverPanY: 0.005,
    flyoverSpeed: 0.000035,
    flyoverSmoothing: 0.035,

    /* Subtle contour wave */

    waveAnimation: true,
    waveDisplacement: 2.1,
    waveDuration: "26s",
    waveFrequencyStart: "0.003 0.005",
    waveFrequencyMiddle: "0.0045 0.0065",

    /* Rendering */

    maxPixelRatio: 2

  };


  /* ==========================================================
     02 / UTILITIES
     ========================================================== */

  const clamp = (
    value,
    minimum = 0,
    maximum = 1
  ) => Math.max(
    minimum,
    Math.min(maximum, value)
  );


  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ==========================================================
     03 / SHARED SVG WAVE FILTER
     
     The filter is applied to the combined artwork element,
     not separately to the image and canvas.

     This is important: both layers receive exactly the
     same displacement, preserving their alignment.
     ========================================================== */

  function createWaveFilter() {

    if (
      !CONFIG.waveAnimation ||
      prefersReducedMotion.matches
    ) {
      return null;
    }

    const existing = document.getElementById(
      "topography-wave-filter"
    );

    if (existing) {
      return existing;
    }

    const svgNS =
      "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(
      svgNS,
      "svg"
    );

    svg.setAttribute("aria-hidden", "true");

    Object.assign(svg.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      left: "-10000px",
      top: "-10000px",
      overflow: "hidden",
      pointerEvents: "none"
    });


    const defs = document.createElementNS(
      svgNS,
      "defs"
    );

    const filter = document.createElementNS(
      svgNS,
      "filter"
    );

    filter.setAttribute(
      "id",
      "topography-wave-filter"
    );

    /*
     * Extend the filter region slightly so the subtle
     * displacement does not clip the image edges.
     */

    filter.setAttribute(
      "filterUnits",
      "objectBoundingBox"
    );

    filter.setAttribute(
      "primitiveUnits",
      "userSpaceOnUse"
    );

    filter.setAttribute("x", "-1%");
    filter.setAttribute("y", "-1%");
    filter.setAttribute("width", "102%");
    filter.setAttribute("height", "102%");


    /* ------------------------------------------------------
       Smooth low-frequency turbulence
       ------------------------------------------------------ */

    const turbulence =
      document.createElementNS(
        svgNS,
        "feTurbulence"
      );

    turbulence.setAttribute(
      "type",
      "fractalNoise"
    );

    turbulence.setAttribute(
      "baseFrequency",
      CONFIG.waveFrequencyStart
    );

    turbulence.setAttribute(
      "numOctaves",
      "1"
    );

    turbulence.setAttribute(
      "seed",
      "8"
    );

    turbulence.setAttribute(
      "stitchTiles",
      "stitch"
    );

    turbulence.setAttribute(
      "result",
      "topographicNoise"
    );


    /* ------------------------------------------------------
       Gradually evolve the noise pattern.

       The low frequency and long duration make the
       movement broad, organic and barely noticeable.
       ------------------------------------------------------ */

    const animateFrequency =
      document.createElementNS(
        svgNS,
        "animate"
      );

    animateFrequency.setAttribute(
      "attributeName",
      "baseFrequency"
    );

    animateFrequency.setAttribute(
      "dur",
      CONFIG.waveDuration
    );

    animateFrequency.setAttribute(
      "values",
      [
        CONFIG.waveFrequencyStart,
        CONFIG.waveFrequencyMiddle,
        CONFIG.waveFrequencyStart
      ].join(";")
    );

    animateFrequency.setAttribute(
      "repeatCount",
      "indefinite"
    );

    animateFrequency.setAttribute(
      "calcMode",
      "spline"
    );

    animateFrequency.setAttribute(
      "keyTimes",
      "0;0.5;1"
    );

    animateFrequency.setAttribute(
      "keySplines",
      "0.42 0 0.58 1;0.42 0 0.58 1"
    );

    turbulence.appendChild(
      animateFrequency
    );


    /* ------------------------------------------------------
       Displace the combined image and contour overlay.

       The displacement is deliberately very small.
       ------------------------------------------------------ */

    const displacement =
      document.createElementNS(
        svgNS,
        "feDisplacementMap"
      );

    displacement.setAttribute(
      "in",
      "SourceGraphic"
    );

    displacement.setAttribute(
      "in2",
      "topographicNoise"
    );

    displacement.setAttribute(
      "scale",
      String(CONFIG.waveDisplacement)
    );

    displacement.setAttribute(
      "xChannelSelector",
      "R"
    );

    displacement.setAttribute(
      "yChannelSelector",
      "G"
    );


    filter.appendChild(turbulence);
    filter.appendChild(displacement);

    defs.appendChild(filter);
    svg.appendChild(defs);

    document.body.appendChild(svg);

    return svg;
  }


  /* ==========================================================
     04 / INITIALIZE TOPOGRAPHY
     ========================================================== */

  function initTopography(root) {

    const viewport = root.querySelector(
      "[data-topo-viewport]"
    );

    const art = root.querySelector(
      "[data-topo-art]"
    );

    const canvas = root.querySelector(
      "[data-topo-canvas]"
    );


    if (!viewport || !art || !canvas) {

      console.warn(
        "[topography] Required artwork elements not found."
      );

      return;
    }


    /* ========================================================
       05 / REMOVE OBSOLETE CONTROLS
       ======================================================== */

    root.querySelector(
      ".topo-readout"
    )?.remove();

    root.querySelector(
      ".topo-footer"
    )?.remove();


    /* ========================================================
       06 / VISUAL STYLING
       ======================================================== */

    root.style.backgroundColor = "#002A5C";

    viewport.style.backgroundColor = "#002A5C";

    art.style.backgroundColor = "#002A5C";

    art.style.transformOrigin = "50% 50%";

    art.style.willChange = "transform, filter";

    art.style.overflow = "hidden";


    const artwork = art.querySelector("img");

    if (artwork) {

      artwork.style.opacity =
        String(CONFIG.artworkOpacity);

      artwork.style.transition = "none";

    }

    canvas.style.opacity =
      String(CONFIG.overlayOpacity);

    canvas.style.transition = "none";


    /* ------------------------------------------------------
       Install subtle wave filter on the complete artwork.

       The original image and orange overlay are displaced
       as a single composite, so they never drift apart.
       ------------------------------------------------------ */

    let waveFilter = createWaveFilter();

    function applyWaveFilter() {

      if (
        CONFIG.waveAnimation &&
        !prefersReducedMotion.matches &&
        waveFilter
      ) {

        art.style.filter =
          "url(#topography-wave-filter)";

      } else {

        art.style.filter = "none";

      }

    }

    applyWaveFilter();


    /* ========================================================
       07 / STATE
       ======================================================== */

    let target = CONFIG.initialElevation;

    let current = target;

    let lastInteraction = performance.now();

    let lastFrame = performance.now();

    let activePointerId = null;

    let isIdling = false;

    let idleOrigin = target;

    let idleStart = 0;

    let idleMix = 0;

    let inView = true;

    let ready = false;

    let rafId = 0;

    let gl = null;

    let program = null;

    let uniforms = null;

    let texture = null;

    let vertexBuffer = null;

    let lastArtWidth = 0;

    let lastArtHeight = 0;


    /* ========================================================
       08 / SET ELEVATION
       ======================================================== */

    function setElevation(level) {

      target = clamp(level);

      lastInteraction = performance.now();

      /*
       * A fresh interaction interrupts the idle sweep.
       */

      isIdling = false;

      startRendering();
    }


    /* ========================================================
       09 / POINTER INTERACTION
       ======================================================== */

    function elevationFromPointer(event) {

      const box = art.getBoundingClientRect();

      if (!box.height) return;

      const normalizedY =
        (event.clientY - box.top) / box.height;

      setElevation(
        1 - normalizedY
      );
    }


    art.addEventListener(
      "pointerdown",
      event => {

        if (
          event.pointerType !== "mouse" &&
          activePointerId !== null
        ) {
          return;
        }

        activePointerId = event.pointerId;

        try {

          art.setPointerCapture(
            event.pointerId
          );

        } catch (_) {
          /* Pointer capture is optional. */
        }

        elevationFromPointer(event);

      }
    );


    art.addEventListener(
      "pointermove",
      event => {

        if (
          event.pointerType === "mouse" ||
          activePointerId === event.pointerId
        ) {

          elevationFromPointer(event);

        }

      },
      { passive: true }
    );


    /* ========================================================
       10 / POINTER RELEASE
       ======================================================== */

    function finishPointer(event) {

      if (
        activePointerId === event.pointerId
      ) {

        activePointerId = null;

        lastInteraction = performance.now();

      }

    }


    art.addEventListener(
      "pointerup",
      finishPointer
    );

    art.addEventListener(
      "pointercancel",
      finishPointer
    );

    art.addEventListener(
      "lostpointercapture",
      finishPointer
    );


    /* ========================================================
       11 / TOUCH COMPATIBILITY
       ======================================================== */

    for (const type of [
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel"
    ]) {

      art.addEventListener(
        type,
        event => event.stopPropagation(),
        { passive: true }
      );

    }


    /* ========================================================
       12 / KEYBOARD ACCESSIBILITY
       ======================================================== */

    art.addEventListener(
      "keydown",
      event => {

        const step = event.shiftKey
          ? 0.10
          : 0.02;

        if (
          event.key === "ArrowUp" ||
          event.key === "ArrowRight"
        ) {

          setElevation(target + step);

        } else if (
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft"
        ) {

          setElevation(target - step);

        } else if (event.key === "Home") {

          setElevation(0);

        } else if (event.key === "End") {

          setElevation(1);

        } else {

          return;

        }

        event.preventDefault();
        event.stopPropagation();

      }
    );


    /* ========================================================
       13 / ARTWORK SIZING
       ======================================================== */

    function fitArt() {

      const box =
        viewport.getBoundingClientRect();

      if (
        box.width < 1 ||
        box.height < 1
      ) {
        return;
      }

      const ratio =
        CONFIG.imageWidth /
        CONFIG.imageHeight;

      const width = Math.min(
        box.width,
        box.height * ratio
      );

      const height =
        width / ratio;

      if (
        Math.abs(width - lastArtWidth) > 0.5 ||
        Math.abs(height - lastArtHeight) > 0.5
      ) {

        art.style.width =
          `${width}px`;

        art.style.height =
          `${height}px`;

        lastArtWidth = width;
        lastArtHeight = height;

        if (gl) {
          resizeCanvas();
        }

      }

    }


    /* ========================================================
       14 / RESIZE WEBGL CANVAS
       ======================================================== */

    function resizeCanvas() {

      const box =
        art.getBoundingClientRect();

      if (
        !gl ||
        box.width < 1 ||
        box.height < 1
      ) {
        return;
      }

      const maxSize =
        gl.getParameter(
          gl.MAX_RENDERBUFFER_SIZE
        );

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        CONFIG.maxPixelRatio
      );

      const width = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.width * dpr)
        )
      );

      const height = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.height * dpr)
        )
      );

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {

        canvas.width = width;
        canvas.height = height;

      }

      gl.viewport(
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (ready) {
        startRendering();
      }

    }


    /* ========================================================
       15 / SHADER COMPILATION
       ======================================================== */

    function createShader(type, source) {

      const instance =
        gl.createShader(type);

      gl.shaderSource(
        instance,
        source
      );

      gl.compileShader(instance);

      if (
        !gl.getShaderParameter(
          instance,
          gl.COMPILE_STATUS
        )
      ) {

        const message =
          gl.getShaderInfoLog(instance);

        gl.deleteShader(instance);

        throw new Error(
          message || "Shader compilation failed."
        );

      }

      return instance;
    }


    /* ========================================================
       16 / WEBGL INITIALIZATION
       ======================================================== */

    function initializeRenderer(image) {

      gl = canvas.getContext(
        "webgl",
        {
          alpha: true,
          premultipliedAlpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: "low-power"
        }
      );

      if (!gl) {

        throw new Error(
          "WebGL is not available."
        );

      }


      /* ------------------------------------------------------
         Vertex shader
         ------------------------------------------------------ */

      const vertex = createShader(
        gl.VERTEX_SHADER,
        `
          attribute vec2 aPosition;

          varying vec2 vUv;

          void main() {

            vUv = aPosition * 0.5 + 0.5;

            gl_Position = vec4(
              aPosition,
              0.0,
              1.0
            );

          }
        `
      );


      /* ------------------------------------------------------
         Fragment shader

         RED:
         Estimated elevation.

         GREEN:
         Coverage of original contour strokes.

         Only existing contour pixels are highlighted.
         ------------------------------------------------------ */

      const fragment = createShader(
        gl.FRAGMENT_SHADER,
        `
          precision highp float;

          uniform sampler2D uMap;

          uniform float uElevation;
          uniform float uBandWidth;
          uniform float uOpacity;

          uniform vec2 uTexel;

          varying vec2 vUv;


          float strokeAt(vec2 uv) {

            vec2 mask = texture2D(
              uMap,
              uv
            ).rg;

            float distanceFromLevel =
              (mask.r - uElevation) /
              uBandWidth;

            float band = exp(
              -0.5 *
              distanceFromLevel *
              distanceFromLevel
            );

            float coverage = smoothstep(
              0.14,
              0.85,
              mask.g
            );

            return band * coverage;
          }


          void main() {

            float line = strokeAt(vUv);

            vec2 d = 3.0 * uTexel;

            float softGlow = (

              strokeAt(
                vUv + vec2(d.x, 0.0)
              ) +

              strokeAt(
                vUv + vec2(-d.x, 0.0)
              ) +

              strokeAt(
                vUv + vec2(0.0, d.y)
              ) +

              strokeAt(
                vUv + vec2(0.0, -d.y)
              ) +

              strokeAt(
                vUv + vec2(d.x, d.y)
              ) +

              strokeAt(
                vUv + vec2(-d.x, -d.y)
              )

            ) / 6.0;

            float alpha = min(
              0.99,
              (
                line * 0.96 +
                softGlow * 0.23
              ) * uOpacity
            );

            gl_FragColor = vec4(
              1.0,
              0.408,
              0.051,
              alpha
            );

          }
        `
      );


      /* ======================================================
         17 / LINK PROGRAM
         ====================================================== */

      program = gl.createProgram();

      gl.attachShader(
        program,
        vertex
      );

      gl.attachShader(
        program,
        fragment
      );

      gl.linkProgram(program);

      if (
        !gl.getProgramParameter(
          program,
          gl.LINK_STATUS
        )
      ) {

        const message =
          gl.getProgramInfoLog(program);

        throw new Error(
          message || "Shader linking failed."
        );

      }

      gl.useProgram(program);


      /* ======================================================
         18 / FULL-SCREEN QUAD
         ====================================================== */

      vertexBuffer =
        gl.createBuffer();

      gl.bindBuffer(
        gl.ARRAY_BUFFER,
        vertexBuffer
      );

      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
           1,  1
        ]),
        gl.STATIC_DRAW
      );

      const position =
        gl.getAttribLocation(
          program,
          "aPosition"
        );

      gl.enableVertexAttribArray(
        position
      );

      gl.vertexAttribPointer(
        position,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );


      /* ======================================================
         19 / ELEVATION MASK TEXTURE
         ====================================================== */

      gl.pixelStorei(
        gl.UNPACK_ALIGNMENT,
        1
      );

      gl.pixelStorei(
        gl.UNPACK_FLIP_Y_WEBGL,
        true
      );

      gl.pixelStorei(
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        false
      );

      texture = gl.createTexture();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        texture
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.LINEAR
      );

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        image
      );


      /* ======================================================
         20 / UNIFORMS
         ====================================================== */

      uniforms = {

        elevation: gl.getUniformLocation(
          program,
          "uElevation"
        ),

        bandWidth: gl.getUniformLocation(
          program,
          "uBandWidth"
        ),

        opacity: gl.getUniformLocation(
          program,
          "uOpacity"
        ),

        texel: gl.getUniformLocation(
          program,
          "uTexel"
        )

      };


      gl.uniform1i(
        gl.getUniformLocation(
          program,
          "uMap"
        ),
        0
      );

      gl.uniform1f(
        uniforms.bandWidth,
        CONFIG.bandWidth
      );

      gl.uniform1f(
        uniforms.opacity,
        CONFIG.highlightOpacity
      );

      gl.uniform2f(
        uniforms.texel,
        1 / image.width,
        1 / image.height
      );


      /* ======================================================
         21 / COMPLETE INITIALIZATION
         ====================================================== */

      fitArt();

      ready = true;

      current = CONFIG.initialElevation;
      target = CONFIG.initialElevation;

      startRendering();

      console.log(
        "[topography] Interactive topography v4 initialized."
      );

    }


    /* ========================================================
       22 / RENDERING CONTROL
       ======================================================== */

    function startRendering() {

      if (
        ready &&
        inView &&
        !document.hidden &&
        rafId === 0
      ) {

        lastFrame = performance.now();

        rafId = requestAnimationFrame(
          render
        );

      }

    }


    function stopRendering() {

      if (rafId !== 0) {

        cancelAnimationFrame(rafId);

        rafId = 0;

      }

    }


    /* ========================================================
       23 / IDLE ELEVATION ANIMATION
       ======================================================== */

    function updateIdleElevation(now) {

      if (
        CONFIG.idleAnimation &&
        !prefersReducedMotion.matches &&
        activePointerId === null &&
        now - lastInteraction > CONFIG.idleDelayMs
      ) {

        if (!isIdling) {

          isIdling = true;

          idleOrigin = target;

          idleStart = now;

        }

        target = clamp(
          idleOrigin +
          CONFIG.idleRange *
          Math.sin(
            (now - idleStart) *
            CONFIG.idleSpeed
          )
        );

      }

    }


    /* ========================================================
       24 / CINEMATIC FLYOVER
       ======================================================== */

    function updateFlyover(now, deltaMs) {

      if (!CONFIG.flyoverEnabled) return;

      const idleTime =
        now - lastInteraction;

      const idleTarget = (
        !prefersReducedMotion.matches &&
        idleTime > CONFIG.idleDelayMs &&
        activePointerId === null
      ) ? 1 : 0;


      /* Smoothly enter and leave idle movement */

      const blend =
        1 - Math.pow(
          1 - CONFIG.flyoverSmoothing,
          deltaMs / 16.67
        );

      idleMix +=
        (idleTarget - idleMix) * blend;

      if (idleMix < 0.0005) {
        idleMix = 0;
      }

      if (idleMix > 0.9995) {
        idleMix = 1;
      }


      const phase =
        prefersReducedMotion.matches
          ? 0
          : now * CONFIG.flyoverSpeed;


      const x =
        Math.sin(phase) *
        CONFIG.flyoverPanX *
        idleMix *
        lastArtWidth;

      const y =
        Math.cos(phase * 0.72) *
        CONFIG.flyoverPanY *
        idleMix *
        lastArtHeight;

      const zoom =
        1 +
        CONFIG.flyoverZoom *
        idleMix *
        (
          0.5 +
          0.5 * Math.sin(phase * 0.55)
        );


      /*
       * Image and overlay remain a single transformed unit.
       */

      art.style.transform =
        `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;

    }


    /* ========================================================
       25 / RENDER LOOP
       ======================================================== */

    function render(now) {

      rafId = 0;

      if (
        !ready ||
        !inView ||
        document.hidden
      ) {
        return;
      }

      const deltaMs = Math.min(
        64,
        Math.max(
          0,
          now - lastFrame
        )
      );

      lastFrame = now;


      /* Automatic elevation */

      updateIdleElevation(now);


      /* Smooth elevation interpolation */

      const blend = prefersReducedMotion.matches
        ? 1
        : 1 - Math.pow(
            1 - CONFIG.smoothing,
            deltaMs / 16.67
          );

      current +=
        (target - current) * blend;


      /* Gentle cinematic movement */

      updateFlyover(now, deltaMs);


      /* Draw transparent orange contour overlay */

      gl.useProgram(program);

      gl.uniform1f(
        uniforms.elevation,
        current
      );

      gl.clearColor(
        0,
        0,
        0,
        0
      );

      gl.clear(
        gl.COLOR_BUFFER_BIT
      );

      gl.drawArrays(
        gl.TRIANGLE_STRIP,
        0,
        4
      );


      if (!prefersReducedMotion.matches) {

        rafId = requestAnimationFrame(render);

      }

    }


    /* ========================================================
       26 / VISIBILITY OBSERVER
       ======================================================== */

    let observer = null;

    if ("IntersectionObserver" in window) {

      observer = new IntersectionObserver(
        entries => {

          inView =
            entries[0].isIntersecting;

          if (inView) {

            startRendering();

          } else {

            stopRendering();

          }

        },
        {
          root: document.querySelector(".snap"),
          threshold: 0.01
        }
      );

      observer.observe(root);

    }


    /* ========================================================
       27 / PAGE VISIBILITY
       ======================================================== */

    document.addEventListener(
      "visibilitychange",
      () => {

        if (document.hidden) {

          stopRendering();

        } else {

          startRendering();

        }

      }
    );


    /* ========================================================
       28 / REDUCED MOTION
       ======================================================== */

    prefersReducedMotion.addEventListener(
      "change",
      () => {

        if (prefersReducedMotion.matches) {

          isIdling = false;

          idleMix = 0;

          art.style.transform =
            "translate3d(0, 0, 0) scale(1)";

          art.style.filter = "none";

          stopRendering();

          current = target;

          if (ready && inView) {
            startRendering();
          }

        } else {

          /*
           * Re-enable the subtle wave effect.
           */

          waveFilter = createWaveFilter();

          applyWaveFilter();

          lastInteraction = performance.now();

          startRendering();

        }

      }
    );


    /* ========================================================
       29 / RESIZE
       ======================================================== */

    if ("ResizeObserver" in window) {

      const resizeObserver =
        new ResizeObserver(fitArt);

      resizeObserver.observe(viewport);

    } else {

      window.addEventListener(
        "resize",
        fitArt,
        { passive: true }
      );

    }


    /* ========================================================
       30 / INITIAL LAYOUT
       ======================================================== */

    fitArt();


    /* ========================================================
       31 / LOAD ELEVATION MASK
       ======================================================== */

    const image = new Image();

    image.onload = () => {

      try {

        if (
          image.width !== CONFIG.imageWidth ||
          image.height !== CONFIG.imageHeight
        ) {

          throw new Error(
            `Mask dimensions ${image.width} × ${image.height} do not match expected ${CONFIG.imageWidth} × ${CONFIG.imageHeight}.`
          );

        }

        initializeRenderer(image);

      } catch (error) {

        console.error(
          "[topography] WebGL initialization failed:",
          error
        );

      }

    };


    image.onerror = () => {

      console.error(
        "[topography] Cannot load assets/images/elevation-map.png."
      );

    };

    image.src = CONFIG.mapUrl;

  }


  /* ==========================================================
     32 / INITIALIZE INSTANCES
     ========================================================== */

  function init() {

    document
      .querySelectorAll("[data-topography]")
      .forEach(initTopography);

  }


  /* ==========================================================
     33 / DOCUMENT READY
     ========================================================== */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();

  }

})();
