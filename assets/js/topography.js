
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   IMAGE-LOCKED INTERACTIVE TOPOGRAPHY

   File: assets/js/topography.js
   Version: 2.0

   Features:
   - Original fixed topographic artwork
   - Pixel-aligned elevation mask
   - Smooth orange contour highlighting
   - Mouse-controlled elevation
   - Touch and drag interaction
   - Automatic idle elevation sweep
   - 4.2-second idle delay
   - Smooth transitions without recoil
   - No visible elevation controls
   - No readouts or percentage labels
   - Responsive image fitting
   - Full-page scrolling compatibility
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

    /* Elevation mask relative to index.html */

    mapUrl: "assets/images/elevation-map.png",

    /* Original artwork dimensions */

    imageWidth: 2048,
    imageHeight: 1365,

    /* Initial highlighted elevation */

    initialElevation: 0.50,

    /* Width of the highlighted elevation band */

    bandWidth: 0.040,

    /* Orange overlay opacity */

    highlightOpacity: 0.98,

    /* Automatic idle movement */

    idleAnimation: true,

    idleDelayMs: 4200,

    idleSpeed: 0.00018,

    idleRange: 0.25,

    /* Smoothness of elevation transitions */

    smoothing: 0.095,

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
     03 / INITIALIZE TOPOGRAPHY
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


    if (
      !viewport ||
      !art ||
      !canvas
    ) {

      console.warn(
        "[topography] Required artwork elements not found."
      );

      return;
    }


    /* ========================================================
       04 / REMOVE OBSOLETE CONTROLS

       The elevation slider and readout are no longer
       required in the approved design.

       Remove any leftovers from the previous HTML.
       ======================================================== */

    root.querySelector(
      ".topo-readout"
    )?.remove();

    root.querySelector(
      ".topo-footer"
    )?.remove();


    /* ========================================================
       05 / STATE
       ======================================================== */

    let target = CONFIG.initialElevation;

    let current = target;

    let lastInteraction = performance.now();

    let lastFrame = performance.now();

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

    let texture = null;

    let vertexBuffer = null;

    let observer = null;


    /* ========================================================
       06 / SET ELEVATION
       ======================================================== */

    function setElevation(level) {

      target = clamp(level);

      lastInteraction = performance.now();

      /*
       * Every new interaction interrupts idle movement.
       */

      isIdling = false;

      startRendering();
    }


    /* ========================================================
       07 / POINTER ELEVATION
       ======================================================== */

    function elevationFromPointer(event) {

      const box = art.getBoundingClientRect();

      if (!box.height) return;

      /*
       * Upper edge = higher elevation.
       * Lower edge = lower elevation.
       */

      const normalizedY =
        (event.clientY - box.top) / box.height;

      setElevation(
        1 - normalizedY
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
       11 / FULL-PAGE TOUCH COMPATIBILITY
       ======================================================== */

    /*
     * Prevent touch interaction within the artwork
     * from triggering section navigation.
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

        } else if (
          event.key === "Home"
        ) {

          setElevation(0);

        } else if (
          event.key === "End"
        ) {

          setElevation(1);

        } else {

          return;

        }

        event.preventDefault();
        event.stopPropagation();

      }
    );


    /* ========================================================
       13 / FIT ARTWORK

       Both the image and transparent canvas occupy
       exactly the same dimensions.

       This prevents overlay misalignment.
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

      art.style.width =
        `${width}px`;

      art.style.height =
        `${height}px`;

      if (gl) {
        resizeCanvas();
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

      const canvasWidth = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.width * dpr)
        )
      );

      const canvasHeight = Math.max(
        1,
        Math.min(
          maxSize,
          Math.round(box.height * dpr)
        )
      );

      if (
        canvas.width !== canvasWidth ||
        canvas.height !== canvasHeight
      ) {

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

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

      const shader =
        gl.createShader(type);

      gl.shaderSource(
        shader,
        source
      );

      gl.compileShader(shader);

      if (
        !gl.getShaderParameter(
          shader,
          gl.COMPILE_STATUS
        )
      ) {

        const message =
          gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(
          message || "Shader compilation failed."
        );

      }

      return shader;
    }


    /* ========================================================
       16 / WEBGL RENDERER
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
         Estimated normalized elevation.

         GREEN:
         Coverage of original contour strokes.

         Only existing contour pixels can turn orange.
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

            /*
             * A restrained glow around the selected
             * contour. This does not redraw the image.
             */

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

      vertexBuffer = gl.createBuffer();

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

      texture = gl.createTexture();

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
       * Upload the mask without converting its channels
       * into colour space.
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
        "[topography] WebGL elevation highlighting initialized."
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
       23 / RENDER LOOP
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
         Idle animation

         Begins 4.2 seconds after the last user interaction.

         The orange contour gently sweeps through the
         elevation levels without moving the artwork.
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

      }


      /* ------------------------------------------------------
         Smooth interpolation

         Retains the original implementation's easing.
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
         Draw transparent overlay
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


      rafId = requestAnimationFrame(
        render
      );

    }


    /* ========================================================
       24 / VISIBILITY OBSERVER
       ======================================================== */

    if (
      "IntersectionObserver" in window
    ) {

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
       25 / PAGE VISIBILITY
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
       26 / REDUCED MOTION
       ======================================================== */

    prefersReducedMotion.addEventListener(
      "change",
      () => {

        if (prefersReducedMotion.matches) {

          target = current;

          isIdling = false;

        } else {

          lastInteraction = performance.now();

          startRendering();

        }

      }
    );


    /* ========================================================
       27 / RESIZE
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
       28 / INITIAL LAYOUT
       ======================================================== */

    fitArt();


    /* ========================================================
       29 / LOAD ELEVATION MASK
       ======================================================== */

    const image = new Image();

    image.onload = () => {

      try {

        /*
         * Validate the mask dimensions before upload.
         */

        if (
          image.width !== CONFIG.imageWidth ||
          image.height !== CONFIG.imageHeight
        ) {

          throw new Error(
            `Elevation mask dimensions are ${image.width} × ${image.height}; expected ${CONFIG.imageWidth} × ${CONFIG.imageHeight}.`
          );

        }

        initializeRenderer(image);

      } catch (error) {

        console.error(
          "[topography] Elevation overlay failed:",
          error
        );

      }

    };


    image.onerror = () => {

      console.error(
        "[topography] Cannot load assets/images/elevation-map.png. Check the repository asset path."
      );

    };

    image.src = CONFIG.mapUrl;

  }


  /* ==========================================================
     30 / INITIALIZE TOPOGRAPHY INSTANCES
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
