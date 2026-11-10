
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE TOPOGRAPHIC ELEVATION HIGHLIGHT

   File: assets/js/topography.js
   Version: 1.0

   Adapted from the supplied working implementation.

   Features:
   - Fixed original topographic artwork
   - WebGL orange elevation overlay
   - Elevation-mask-based contour highlighting
   - Mouse-controlled elevation
   - Touch and drag interaction
   - Keyboard accessibility
   - Manual elevation slider
   - Automatic idle elevation sweep
   - Smooth transitions
   - Full-page scrolling compatibility
   - Responsive artwork sizing
   - Reduced-motion support

   Required image assets:
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

    /*
     * Elevation mask path, relative to index.html.
     */

    mapUrl: "assets/images/elevation-map.png",

    /*
     * Original artwork dimensions.
     */

    imageWidth: 2048,
    imageHeight: 1365,

    /*
     * Starting elevation.
     */

    initialElevation: 0.50,

    /*
     * Selection band width.
     * Smaller values produce thinner orange contours.
     */

    bandWidth: 0.040,

    /*
     * Maximum orange overlay opacity.
     */

    highlightOpacity: 0.98,

    /*
     * Automatically animate elevation when idle.
     */

    idleAnimation: true,

    /*
     * Begin automatic movement after 4.2 seconds.
     */

    idleDelayMs: 4200,

    /*
     * Speed of the idle elevation sweep.
     */

    idleSpeed: 0.00018,

    /*
     * Distance travelled from the last user-selected level.
     */

    idleRange: 0.25,

    /*
     * Colour transition smoothness.
     */

    smoothing: 0.095

  };


  /* ==========================================================
     02 / UTILITIES
     ========================================================== */

  const clamp = (
    value,
    low = 0,
    high = 1
  ) => Math.max(
    low,
    Math.min(high, value)
  );


  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ==========================================================
     03 / INITIALIZE EACH TOPOGRAPHIC EXPERIENCE
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

    const label = root.querySelector(
      "[data-topo-label]"
    );

    const percent = root.querySelector(
      "[data-topo-percent]"
    );

    const slider = root.querySelector(
      "[data-topo-slider]"
    );

    const output = root.querySelector(
      "[data-topo-output]"
    );


    if (
      !viewport ||
      !art ||
      !canvas ||
      !label ||
      !percent ||
      !slider ||
      !output
    ) {
      console.warn(
        "[topography] Required HTML elements not found."
      );

      return;
    }


    /* ========================================================
       04 / STATE
       ======================================================== */

    let target = CONFIG.initialElevation;

    let current = target;

    let lastInteraction = performance.now();

    let lastFrame = performance.now();

    let displayPercent = -1;

    let activePointerId = null;

    let isIdling = false;

    let idleOrigin = target;

    let idleStart = 0;

    let inView = true;

    let ready = false;

    let rafId = 0;

    let gl = null;

    let program = null;

    let uniforms = null;


    /* ========================================================
       05 / ELEVATION READOUT
       ======================================================== */

    function updateReadout(level) {

      const value = Math.round(
        clamp(level) * 100
      );

      if (value === displayPercent) {
        return;
      }

      displayPercent = value;

      label.textContent =
        value < 34
          ? "Lower elevation"
          : value < 67
            ? "Mid elevation"
            : "Higher elevation";

      percent.textContent = `${value}%`;

      output.textContent = `${value}%`;

      slider.value = String(value);
    }


    /* ========================================================
       06 / SET ELEVATION
       ======================================================== */

    function setElevation(level) {

      target = clamp(level);

      lastInteraction = performance.now();

      isIdling = false;

      updateReadout(target);

      startRendering();
    }


    /* ========================================================
       07 / POINTER ELEVATION
       ======================================================== */

    function elevationFromPointer(event) {

      const box = art.getBoundingClientRect();

      if (!box.height) {
        return;
      }

      /*
       * Upper part of artwork = higher elevation.
       * Lower part of artwork = lower elevation.
       */

      setElevation(
        1 - (
          (event.clientY - box.top) /
          box.height
        )
      );
    }


    /* ========================================================
       08 / POINTER DOWN
       ======================================================== */

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


    /* ========================================================
       09 / POINTER MOVE
       ======================================================== */

    art.addEventListener(
      "pointermove",
      event => {

        if (
          event.pointerType === "mouse" ||
          activePointerId === event.pointerId
        ) {

          elevationFromPointer(event);

        }

      }
    );


    /* ========================================================
       10 / POINTER RELEASE
       ======================================================== */

    function finishPointer(event) {

      if (activePointerId === event.pointerId) {

        activePointerId = null;

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
       11 / FULL-PAGE TOUCH COMPATIBILITY
       ======================================================== */

    /*
     * Prevent touch gestures inside the artwork from being
     * interpreted as fullpage.js section navigation.

     * Normal page navigation remains available outside
     * the artwork.
     */

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


    /*
     * The elevation slider must also remain usable
     * without triggering page navigation.
     */

    for (const type of [
      "touchstart",
      "touchmove"
    ]) {

      slider.addEventListener(
        type,
        event => event.stopPropagation(),
        { passive: true }
      );

    }


    /* ========================================================
       12 / SLIDER INTERACTION
       ======================================================== */

    slider.addEventListener(
      "input",
      () => {

        setElevation(
          Number(slider.value) / 100
        );

      }
    );


    /* ========================================================
       13 / KEYBOARD ACCESSIBILITY
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
       14 / FIT ORIGINAL ARTWORK
       ======================================================== */

    function fitArt() {

      const box = viewport.getBoundingClientRect();

      if (
        box.width < 1 ||
        box.height < 1
      ) {
        return;
      }

      const ratio =
        CONFIG.imageWidth / CONFIG.imageHeight;

      /*
       * Preserve the original image aspect ratio.
       */

      const width = Math.min(
        box.width,
        box.height * ratio
      );

      const height = width / ratio;

      art.style.width = `${width}px`;

      art.style.height = `${height}px`;

      if (gl) {
        resizeCanvas();
      }

    }


    /* ========================================================
       15 / RESIZE WEBGL CANVAS
       ======================================================== */

    function resizeCanvas() {

      const box = art.getBoundingClientRect();

      if (
        !gl ||
        box.width < 1 ||
        box.height < 1
      ) {
        return;
      }

      const maxSize = gl.getParameter(
        gl.MAX_RENDERBUFFER_SIZE
      );

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2
      );

      canvas.width = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.width * dpr)
        )
      );

      canvas.height = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.height * dpr)
        )
      );

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
       16 / COMPILE SHADER
       ======================================================== */

    function shader(type, source) {

      const instance = gl.createShader(type);

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

        throw new Error(
          gl.getShaderInfoLog(instance) ||
          "Shader compilation failed"
        );

      }

      return instance;
    }


    /* ========================================================
       17 / INITIALIZE WEBGL RENDERER
       ======================================================== */

    function initializeRenderer(image) {

      gl = canvas.getContext(
        "webgl",
        {
          alpha: true,
          premultipliedAlpha: false,
          antialias: false,
          depth: false,
          stencil: false
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

      const vertex = shader(
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

         Red channel:
         Normalized elevation.

         Green channel:
         Original contour-stroke coverage.

         Orange overlay is calculated from both channels.
         ------------------------------------------------------ */

      const fragment = shader(
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

            float lineCoverage = smoothstep(
              0.14,
              0.85,
              mask.g
            );

            return band * lineCoverage;
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
         18 / LINK SHADERS
         ====================================================== */

      program = gl.createProgram();

      gl.attachShader(program, vertex);

      gl.attachShader(program, fragment);

      gl.linkProgram(program);

      if (
        !gl.getProgramParameter(
          program,
          gl.LINK_STATUS
        )
      ) {

        throw new Error(
          gl.getProgramInfoLog(program) ||
          "Shader linking failed"
        );

      }

      gl.useProgram(program);


      /* ======================================================
         19 / FULL-SCREEN QUAD
         ====================================================== */

      const vertices = gl.createBuffer();

      gl.bindBuffer(
        gl.ARRAY_BUFFER,
        vertices
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

      const position = gl.getAttribLocation(
        program,
        "aPosition"
      );

      gl.enableVertexAttribArray(position);

      gl.vertexAttribPointer(
        position,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );


      /* ======================================================
         20 / ELEVATION TEXTURE
         ====================================================== */

      const texture = gl.createTexture();

      gl.activeTexture(gl.TEXTURE0);

      gl.bindTexture(
        gl.TEXTURE_2D,
        texture
      );

      gl.pixelStorei(
        gl.UNPACK_FLIP_Y_WEBGL,
        true
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

      /*
       * The elevation mask must contain the original
       * elevation data in its red and green channels.
       */

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        image
      );


      /* ======================================================
         21 / SHADER UNIFORMS
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
         22 / COMPLETE INITIALIZATION
         ====================================================== */

      fitArt();

      ready = true;

      updateReadout(target);

      startRendering();

    }


    /* ========================================================
       23 / START RENDERING
       ======================================================== */

    function startRendering() {

      if (
        ready &&
        inView &&
        !document.hidden &&
        rafId === 0
      ) {

        lastFrame = performance.now();

        rafId = requestAnimationFrame(render);

      }

    }


    /* ========================================================
       24 / RENDER LOOP
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


      /* ------------------------------------------------------
         Automatic idle animation

         After 4.2 seconds without user interaction,
         elevation slowly moves through a defined range.

         Any new interaction immediately takes control.
         ------------------------------------------------------ */

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

        updateReadout(target);

      }


      /* ------------------------------------------------------
         Smooth elevation transition
         ------------------------------------------------------ */

      const blend = prefersReducedMotion.matches
        ? 1
        : 1 - Math.pow(
            1 - CONFIG.smoothing,
            deltaMs / 16.67
          );

      current +=
        (target - current) * blend;


      /* ------------------------------------------------------
         Render transparent orange overlay
         ------------------------------------------------------ */

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


      /* Continue rendering while the section is visible. */

      rafId = requestAnimationFrame(render);

    }


    /* ========================================================
       25 / VISIBILITY OBSERVER
       ======================================================== */

    if (
      "IntersectionObserver" in window
    ) {

      const observer = new IntersectionObserver(
        entries => {

          inView =
            entries[0].isIntersecting;

          if (inView) {
            startRendering();
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
       26 / PAGE VISIBILITY
       ======================================================== */

    document.addEventListener(
      "visibilitychange",
      startRendering
    );


    /* ========================================================
       27 / RESIZE OBSERVER
       ======================================================== */

    if ("ResizeObserver" in window) {

      new ResizeObserver(
        fitArt
      ).observe(viewport);

    } else {

      window.addEventListener(
        "resize",
        fitArt,
        { passive: true }
      );

    }


    /* ========================================================
       28 / INITIAL LAYOUT
       ======================================================== */

    fitArt();

    updateReadout(target);


    /* ========================================================
       29 / LOAD ELEVATION MASK
       ======================================================== */

    const image = new Image();

    image.onload = () => {

      try {

        initializeRenderer(image);

      } catch (error) {

        console.error(
          "[topography] Orange elevation overlay failed:",
          error
        );

      }

    };


    image.onerror = () => {

      console.error(
        "[topography] Cannot load elevation-map.png. " +
        "Check that it exists in assets/images/."
      );

    };


    image.src = CONFIG.mapUrl;

  }


  /* ==========================================================
     30 / INITIALIZE ALL TOPOGRAPHY INSTANCES
     ========================================================== */

  function init() {

    document
      .querySelectorAll("[data-topography]")
      .forEach(initTopography);

  }


  /* ==========================================================
     31 / DOCUMENT READY
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
