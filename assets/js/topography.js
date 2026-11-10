
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   IMAGE-LOCKED INTERACTIVE TOPOGRAPHY

   File: assets/js/topography.js
   Version: 5.0

   Features:
   - Single WebGL rendering pipeline
   - Original artwork and elevation mask synchronized
   - Full-width responsive image
   - Smooth vertical edge blending
   - Subtle continuous contour wave movement
   - No camera zoom or translation
   - Smooth orange elevation highlighting
   - Mouse and touch interaction
   - Automatic idle elevation sweep
   - 4.2-second idle delay
   - Improved contour coverage sampling
   - Reduced artwork and highlight opacity
   - Full-page scrolling compatibility
   - Reduced-motion support

   Required assets:
   assets/images/contours.jpg
   assets/images/elevation-map.png

   No Three.js or build system required.
   ========================================================== */

(() => {
  "use strict";

  /* ========================================================
     01 / CONFIGURATION
     ======================================================== */

  const CONFIG = {
    mapUrl: "assets/images/elevation-map.png",

    imageWidth: 2048,
    imageHeight: 1365,

    initialElevation: 0.50,

    bandWidth: 0.040,
    highlightOpacity: 0.48,
    artworkOpacity: 0.21,

    idleAnimation: true,
    idleDelayMs: 4200,
    idleSpeed: 0.00018,
    idleRange: 0.25,

    smoothing: 0.095,

    /*
     * Continuous low-amplitude displacement.
     * The artwork and elevation mask use identical UVs.
     */

    waveEnabled: true,
    waveSpeed: 0.55,
    waveAmplitudeX: 0.00085,
    waveAmplitudeY: 0.00075,

    /*
     * Slight feathering at the top and bottom.
     */

    edgeFade: 0.10,

    maxPixelRatio: 2
  };


  /* ========================================================
     02 / UTILITIES
     ======================================================== */

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.max(minimum, Math.min(maximum, value));

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ========================================================
     03 / INITIALIZE
     ======================================================== */

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

    const artwork = art?.querySelector("img");

    if (!viewport || !art || !canvas || !artwork) {
      console.warn("[topography] Required elements missing.");
      return;
    }


    /* ======================================================
       04 / REMOVE OLD CONTROLS
       ====================================================== */

    root.querySelector(".topo-readout")?.remove();
    root.querySelector(".topo-footer")?.remove();


    /* ======================================================
       05 / VISUAL STYLING
       ====================================================== */

    root.style.backgroundColor = "#002A5C";
    viewport.style.backgroundColor = "#002A5C";
    art.style.backgroundColor = "#002A5C";

    art.style.transform = "none";
    art.style.filter = "none";
    art.style.willChange = "auto";

    artwork.style.opacity = String(CONFIG.artworkOpacity);
    artwork.style.transition = "none";

    canvas.style.opacity = "1";
    canvas.style.transition = "none";


    /* ======================================================
       06 / STATE
       ====================================================== */

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

    let artworkTexture = null;
    let elevationTexture = null;

    let lastArtWidth = 0;
    let lastArtHeight = 0;


    /* ======================================================
       07 / POINTER ELEVATION
       ====================================================== */

    function setElevation(level) {

      target = clamp(level);

      lastInteraction = performance.now();

      isIdling = false;

      startRendering();
    }


    function elevationFromPointer(event) {

      const box = art.getBoundingClientRect();

      if (!box.height) return;

      const normalizedY =
        (event.clientY - box.top) / box.height;

      setElevation(1 - normalizedY);
    }


    /* ======================================================
       08 / POINTER EVENTS
       ====================================================== */

    art.addEventListener("pointerdown", event => {

      if (
        event.pointerType !== "mouse" &&
        activePointerId !== null
      ) {
        return;
      }

      activePointerId = event.pointerId;

      try {
        art.setPointerCapture(event.pointerId);
      } catch (_) {}

      elevationFromPointer(event);
    });


    art.addEventListener("pointermove", event => {

      if (
        event.pointerType === "mouse" ||
        activePointerId === event.pointerId
      ) {
        elevationFromPointer(event);
      }

    }, { passive: true });


    function finishPointer(event) {

      if (activePointerId === event.pointerId) {
        activePointerId = null;
        lastInteraction = performance.now();
      }
    }


    art.addEventListener("pointerup", finishPointer);
    art.addEventListener("pointercancel", finishPointer);
    art.addEventListener("lostpointercapture", finishPointer);


    /* ======================================================
       09 / TOUCH COMPATIBILITY
       ====================================================== */

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


    /* ======================================================
       10 / KEYBOARD ACCESSIBILITY
       ====================================================== */

    art.addEventListener("keydown", event => {

      const step = event.shiftKey ? 0.10 : 0.02;

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
    });


    /* ======================================================
       11 / RESPONSIVE ARTWORK SIZING

       Always use the full available viewport width.

       Height follows the original 2048:1365 ratio.

       This intentionally preserves the blue space
       above and below the centered artwork.
       ====================================================== */

    function fitArt() {

      const box = viewport.getBoundingClientRect();

      if (box.width < 1 || box.height < 1) return;

      const width = box.width;

      const height =
        width * CONFIG.imageHeight / CONFIG.imageWidth;

      if (
        Math.abs(width - lastArtWidth) > 0.5 ||
        Math.abs(height - lastArtHeight) > 0.5
      ) {

        art.style.width = `${width}px`;
        art.style.height = `${height}px`;

        lastArtWidth = width;
        lastArtHeight = height;

        if (gl) resizeCanvas();
      }
    }


    /* ======================================================
       12 / RESIZE CANVAS
       ====================================================== */

    function resizeCanvas() {

      if (!gl) return;

      const box = art.getBoundingClientRect();

      if (box.width < 1 || box.height < 1) return;

      const maxSize = gl.getParameter(
        gl.MAX_RENDERBUFFER_SIZE
      );

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        CONFIG.maxPixelRatio
      );

      const width = Math.min(
        maxSize,
        Math.max(1, Math.round(box.width * dpr))
      );

      const height = Math.min(
        maxSize,
        Math.max(1, Math.round(box.height * dpr))
      );

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);

      if (ready) startRendering();
    }


    /* ======================================================
       13 / SHADER COMPILATION
       ====================================================== */

    function createShader(type, source) {

      const shader = gl.createShader(type);

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (
        !gl.getShaderParameter(shader, gl.COMPILE_STATUS)
      ) {

        const message = gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(
          message || "Shader compilation failed."
        );
      }

      return shader;
    }


    /* ======================================================
       14 / CREATE TEXTURE
       ====================================================== */

    function createTexture(image, unit, preserveData = false) {

      const texture = gl.createTexture();

      gl.activeTexture(gl.TEXTURE0 + unit);

      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      if (preserveData) {
        gl.pixelStorei(
          gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
          gl.NONE
        );
      }

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

      return texture;
    }


    /* ======================================================
       15 / WEBGL INITIALIZATION
       ====================================================== */

    function initializeRenderer(image, mask) {

      gl = canvas.getContext("webgl", {

        alpha: false,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,

        powerPreference: "high-performance"

      });

      if (!gl) {
        throw new Error("WebGL is not available.");
      }


      /* ----------------------------------------------------
         Vertex shader
         ---------------------------------------------------- */

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


      /* ----------------------------------------------------
         Fragment shader

         Both artwork and elevation mask use the SAME
         displaced UV coordinates.

         This is essential for maintaining alignment.
         ---------------------------------------------------- */

      const fragment = createShader(
        gl.FRAGMENT_SHADER,
        `
          precision highp float;

          uniform sampler2D uArtwork;
          uniform sampler2D uMap;

          uniform float uElevation;
          uniform float uBandWidth;
          uniform float uHighlightOpacity;
          uniform float uArtworkOpacity;
          uniform float uTime;
          uniform float uWaveEnabled;
          uniform float uEdgeFade;

          uniform vec2 uTexel;

          varying vec2 vUv;


          /* ------------------------------------------------
             Smooth continuous wave displacement
             ------------------------------------------------ */

          vec2 displacedUV(vec2 uv) {

            float t = uTime;

            float waveX =

              sin(
                uv.y * 11.0 +
                t * 0.55
              ) * 0.00085 +

              sin(
                uv.y * 23.0 -
                t * 0.31
              ) * 0.00025;

            float waveY =

              sin(
                uv.x * 8.0 -
                t * 0.43
              ) * 0.00075 +

              sin(
                uv.x * 19.0 +
                t * 0.27
              ) * 0.00020;

            return clamp(
              uv + vec2(
                waveX * uWaveEnabled,
                waveY * uWaveEnabled
              ),
              vec2(0.001),
              vec2(0.999)
            );
          }


          /* ------------------------------------------------
             Elevation contour activation
             ------------------------------------------------ */

          float strokeAt(vec2 uv) {

            vec2 mask = texture2D(
              uMap,
              uv
            ).rg;

            float normalizedDistance =
              (mask.r - uElevation) /
              uBandWidth;

            float band = exp(
              -0.5 *
              normalizedDistance *
              normalizedDistance
            );

            float coverage = smoothstep(
              0.025,
              0.42,
              mask.g
            );

            return band * coverage;
          }


          /* ------------------------------------------------
             Improved pixel coverage

             Neighbour sampling fills small gaps in the
             contour mask while preserving fine detail.
             ------------------------------------------------ */

          float smoothStroke(vec2 uv) {

            vec2 d = uTexel * 1.5;

            float center = strokeAt(uv);

            float neighbours = max(
              max(
                strokeAt(uv + vec2(d.x, 0.0)),
                strokeAt(uv + vec2(-d.x, 0.0))
              ),
              max(
                strokeAt(uv + vec2(0.0, d.y)),
                strokeAt(uv + vec2(0.0, -d.y))
              )
            );

            float diagonals = max(
              max(
                strokeAt(uv + vec2(d.x, d.y)),
                strokeAt(uv + vec2(-d.x, -d.y))
              ),
              max(
                strokeAt(uv + vec2(-d.x, d.y)),
                strokeAt(uv + vec2(d.x, -d.y))
              )
            );

            return max(
              center,
              max(
                neighbours * 0.82,
                diagonals * 0.68
              )
            );
          }


          /* ------------------------------------------------
             Main rendering
             ------------------------------------------------ */

          void main() {

            vec2 uv = displacedUV(vUv);

            /* Source artwork */

            vec3 artwork = texture2D(
              uArtwork,
              uv
            ).rgb;

            /*
             * U of T institutional blue.
             */

            vec3 background = vec3(
              0.0,
              0.164706,
              0.360784
            );

            /*
             * Blend the original image into the blue
             * background instead of applying CSS opacity.
             */

            vec3 base = mix(
              background,
              artwork,
              uArtworkOpacity
            );


            /* Orange elevation contour */

            float line = smoothStroke(uv);

            float orangeAlpha = clamp(
              line * uHighlightOpacity,
              0.0,
              0.90
            );

            vec3 orange = vec3(
              1.0,
              0.408,
              0.051
            );

            vec3 finalColor = mix(
              base,
              orange,
              orangeAlpha
            );


            /* ------------------------------------------------
               Feathered top and bottom edges
               ------------------------------------------------ */

            float top = smoothstep(
              0.0,
              uEdgeFade,
              uv.y
            );

            float bottom = smoothstep(
              0.0,
              uEdgeFade,
              1.0 - uv.y
            );

            float horizontalLeft = smoothstep(
              0.0,
              0.012,
              uv.x
            );

            float horizontalRight = smoothstep(
              0.0,
              0.012,
              1.0 - uv.x
            );

            float edge = (
              top *
              bottom *
              horizontalLeft *
              horizontalRight
            );

            finalColor = mix(
              background,
              finalColor,
              edge
            );

            gl_FragColor = vec4(
              finalColor,
              1.0
            );

          }
        `
      );


      /* ======================================================
         16 / LINK PROGRAM
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
          "Shader linking failed."
        );
      }

      gl.useProgram(program);


      /* ======================================================
         17 / FULL-SCREEN QUAD
         ====================================================== */

      const buffer = gl.createBuffer();

      gl.bindBuffer(
        gl.ARRAY_BUFFER,
        buffer
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
         18 / UPLOAD ARTWORK AND MASK
         ====================================================== */

      artworkTexture = createTexture(
        image,
        0,
        false
      );

      elevationTexture = createTexture(
        mask,
        1,
        true
      );

      gl.uniform1i(
        gl.getUniformLocation(
          program,
          "uArtwork"
        ),
        0
      );

      gl.uniform1i(
        gl.getUniformLocation(
          program,
          "uMap"
        ),
        1
      );


      /* ======================================================
         19 / UNIFORMS
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

        highlightOpacity: gl.getUniformLocation(
          program,
          "uHighlightOpacity"
        ),

        artworkOpacity: gl.getUniformLocation(
          program,
          "uArtworkOpacity"
        ),

        time: gl.getUniformLocation(
          program,
          "uTime"
        ),

        waveEnabled: gl.getUniformLocation(
          program,
          "uWaveEnabled"
        ),

        edgeFade: gl.getUniformLocation(
          program,
          "uEdgeFade"
        ),

        texel: gl.getUniformLocation(
          program,
          "uTexel"
        )

      };


      gl.uniform1f(
        uniforms.bandWidth,
        CONFIG.bandWidth
      );

      gl.uniform1f(
        uniforms.highlightOpacity,
        CONFIG.highlightOpacity
      );

      gl.uniform1f(
        uniforms.artworkOpacity,
        CONFIG.artworkOpacity
      );

      gl.uniform1f(
        uniforms.waveEnabled,
        CONFIG.waveEnabled &&
        !prefersReducedMotion.matches
          ? 1
          : 0
      );

      gl.uniform1f(
        uniforms.edgeFade,
        CONFIG.edgeFade
      );

      gl.uniform2f(
        uniforms.texel,
        1 / image.width,
        1 / image.height
      );


      /* ======================================================
         20 / FINALIZE
         ====================================================== */

      fitArt();

      /*
       * Hide the DOM image only after the WebGL composite
       * has successfully initialized.
       *
       * If WebGL fails, the original image remains visible.
       */

      art.classList.add("topo-webgl-ready");

      ready = true;

      current = CONFIG.initialElevation;
      target = CONFIG.initialElevation;

      resizeCanvas();

      console.log(
        "[topography] Unified image and elevation shader initialized."
      );

      startRendering();
    }


    /* ========================================================
       21 / IDLE ELEVATION
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
       22 / RENDER CONTROL
       ======================================================== */

    function startRendering() {

      if (
        !ready ||
        !inView ||
        document.hidden ||
        rafId !== 0
      ) {
        return;
      }

      lastFrame = performance.now();

      rafId = requestAnimationFrame(render);
    }


    function stopRendering() {

      if (rafId !== 0) {

        cancelAnimationFrame(rafId);

        rafId = 0;
      }
    }


    /* ========================================================
       23 / MAIN RENDER LOOP
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


      /* Idle elevation sweep */

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


      /* Shader inputs */

      gl.useProgram(program);

      gl.uniform1f(
        uniforms.elevation,
        current
      );

      gl.uniform1f(
        uniforms.time,
        prefersReducedMotion.matches
          ? 0
          : now * 0.001
      );

      gl.uniform1f(
        uniforms.waveEnabled,
        prefersReducedMotion.matches
          ? 0
          : CONFIG.waveEnabled ? 1 : 0
      );


      /* Draw composite */

      gl.clearColor(0, 0, 0, 1);

      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.drawArrays(
        gl.TRIANGLE_STRIP,
        0,
        4
      );


      /*
       * Continuous rendering is required for the
       * ambient wave and idle elevation animation.
       */

      if (!prefersReducedMotion.matches) {
        rafId = requestAnimationFrame(render);
      }
    }


    /* ========================================================
       24 / VISIBILITY
       ======================================================== */

    if ("IntersectionObserver" in window) {

      const observer = new IntersectionObserver(
        entries => {

          inView = entries[0].isIntersecting;

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

          isIdling = false;

          target = current;

          stopRendering();

          if (ready && inView) {
            startRendering();
          }

        } else {

          lastInteraction = performance.now();

          startRendering();
        }
      }
    );


    /* ========================================================
       27 / RESPONSIVE LAYOUT
       ======================================================== */

    if ("ResizeObserver" in window) {

      const observer = new ResizeObserver(() => {
        fitArt();
      });

      observer.observe(viewport);

    } else {

      window.addEventListener(
        "resize",
        fitArt,
        { passive: true }
      );
    }


    /* ========================================================
       28 / LOAD BOTH SOURCE IMAGES
       ======================================================== */

    let loadedCount = 0;

    let artworkImage = null;
    let maskImage = null;

    function checkLoaded() {

      loadedCount++;

      if (loadedCount !== 2) return;

      try {

        if (
          artworkImage.width !== CONFIG.imageWidth ||
          artworkImage.height !== CONFIG.imageHeight
        ) {
          throw new Error(
            "contours.jpg must be 2048 × 1365."
          );
        }

        if (
          maskImage.width !== CONFIG.imageWidth ||
          maskImage.height !== CONFIG.imageHeight
        ) {
          throw new Error(
            "elevation-map.png must be 2048 × 1365."
          );
        }

        initializeRenderer(
          artworkImage,
          maskImage
        );

      } catch (error) {

        console.error(
          "[topography] Initialization failed:",
          error
        );
      }
    }


    /* Source artwork */

    artworkImage = new Image();

    artworkImage.onload = checkLoaded;

    artworkImage.onerror = () => {
      console.error(
        "[topography] Could not load contours.jpg."
      );
    };

    artworkImage.src =
      artwork.currentSrc ||
      artwork.getAttribute("src");


    /* Elevation mask */

    maskImage = new Image();

    maskImage.onload = checkLoaded;

    maskImage.onerror = () => {
      console.error(
        "[topography] Could not load elevation-map.png."
      );
    };

    maskImage.src = CONFIG.mapUrl;


    /* Initial sizing */

    fitArt();
  }


  /* ==========================================================
     29 / INITIALIZE ALL TOPOGRAPHIC INSTANCES
     ========================================================== */

  function init() {

    document
      .querySelectorAll("[data-topography]")
      .forEach(initTopography);

  }


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
