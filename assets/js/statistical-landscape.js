
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE TOPOGRAPHIC ELEVATION CONTOURS

   File: assets/js/statistical-landscape.js
   Version: 5.0

   Features:
   - Fixed three-dimensional topographic landscape
   - True elevation contour lines
   - White and cyan base contours
   - Orange elevation highlighting
   - Mouse position controls highlighted elevation
   - Touch dragging controls highlighted elevation
   - Smooth colour transitions
   - No terrain deformation
   - No spring physics
   - No continuous animation
   - Responsive rendering
   - Reduced-motion support

   Requires Three.js ES module.
   ========================================================== */

import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";


/* ==========================================================
   01 / ELEMENTS
   ========================================================== */

const container = document.getElementById(
  "statistical-landscape"
);

const cover = document.getElementById("cover");

if (container && cover) {
  initializeLandscape();
}


/* ==========================================================
   02 / INITIALIZE
   ========================================================== */

function initializeLandscape() {

  /* ========================================================
     03 / SETTINGS
     ======================================================== */

  const SETTINGS = {

    background: 0x0180a5,

    worldWidth: 24,
    worldDepth: 15,

    desktopResolution: 145,
    tabletResolution: 105,
    mobileResolution: 70,

    desktopContours: 24,
    tabletContours: 18,
    mobileContours: 13,

    contourOffset: 0.025,

    highlightColor: 0xff9345,

    /*
     * Highlighting range, measured in contour levels.

     * A narrow range produces a crisp orange contour.
     */

    highlightWidth: 0.8,

    /*
     * Speed of colour interpolation.

     * Higher values = faster colour transitions.
     */

    highlightResponse: 0.16,

    maxPixelRatio: 2
  };


  /* ========================================================
     04 / FULL-COVER POSITIONING
     ======================================================== */

  Object.assign(container.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "1",
    overflow: "hidden",
    cursor: "crosshair",
    touchAction: "pan-y"
  });


  /* ========================================================
     05 / STATE
     ======================================================== */

  let contourLevels = [];
  let contourLines = [];

  let targetElevation = 0.5;
  let currentElevation = 0.5;

  let animationFrame = null;
  let lastFrameTime = null;

  let isSectionVisible = true;

  let resolution = 0;
  let contourCount = 0;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ========================================================
     06 / SCENE
     ======================================================== */

  const scene = new THREE.Scene();
  scene.background = null;


  /* ========================================================
     07 / CAMERA
     ======================================================== */

  const camera = new THREE.PerspectiveCamera(
    38,
    1,
    0.1,
    120
  );

  camera.position.set(0, 8, 18);
  camera.lookAt(0, 0.7, 0);


  /* ========================================================
     08 / RENDERER
     ======================================================== */

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "default"
    });
  } catch (error) {
    console.error(
      "Topographic contours: WebGL unavailable.",
      error
    );
    return;
  }

  renderer.setClearColor(
    SETTINGS.background,
    0
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "pan-y";

  container.appendChild(renderer.domElement);


  /* ========================================================
     09 / TERRAIN HEIGHT FUNCTION

     Fixed mathematical landscape.

     Several Gaussian hills create an irregular
     topographic surface.

     The terrain does not change over time.
     ======================================================== */

  function terrainHeight(x, z) {

    const hill1 =
      2.7 * Math.exp(
        -(
          ((x + 6.2) ** 2) / 16 +
          ((z + 1.5) ** 2) / 7
        )
      );

    const hill2 =
      3.8 * Math.exp(
        -(
          ((x - 1.2) ** 2) / 14 +
          ((z - 2.2) ** 2) / 10
        )
      );

    const hill3 =
      2.9 * Math.exp(
        -(
          ((x - 7.4) ** 2) / 11 +
          ((z + 2.8) ** 2) / 7
        )
      );

    const hill4 =
      1.7 * Math.exp(
        -(
          ((x + 0.5) ** 2) / 9 +
          ((z + 4.2) ** 2) / 5
        )
      );

    const rolling =
      0.16 *
      Math.sin(x * 0.7 + z * 0.4) *
      Math.cos(z * 0.9);

    return Math.max(
      0,
      hill1 + hill2 + hill3 + hill4 + rolling
    );
  }


  /* ========================================================
     10 / RESPONSIVE SETTINGS
     ======================================================== */

  function getDimensions() {

    const viewport = window.innerWidth;

    if (viewport <= 800) {
      return [
        SETTINGS.mobileResolution,
        SETTINGS.mobileContours
      ];
    }

    if (viewport <= 1200) {
      return [
        SETTINGS.tabletResolution,
        SETTINGS.tabletContours
      ];
    }

    return [
      SETTINGS.desktopResolution,
      SETTINGS.desktopContours
    ];
  }


  /* ========================================================
     11 / SAMPLE TERRAIN
     ======================================================== */

  function sampleTerrain() {

    const heights = [];

    let minimum = Infinity;
    let maximum = -Infinity;

    const stepX =
      SETTINGS.worldWidth / (resolution - 1);

    const stepZ =
      SETTINGS.worldDepth / (resolution - 1);

    for (let row = 0; row < resolution; row++) {

      const z =
        -SETTINGS.worldDepth / 2 +
        row * stepZ;

      const values = [];

      for (let col = 0; col < resolution; col++) {

        const x =
          -SETTINGS.worldWidth / 2 +
          col * stepX;

        const height = terrainHeight(x, z);

        values.push(height);

        minimum = Math.min(minimum, height);
        maximum = Math.max(maximum, height);
      }

      heights.push(values);
    }

    return {
      heights,
      minimum,
      maximum,
      stepX,
      stepZ
    };
  }


  /* ========================================================
     12 / MARCHING SQUARES

     Extract line segments where the terrain crosses
     a particular elevation.

     These segments form the topographic contours.
     ======================================================== */

  function extractContourSegments(
    terrain,
    elevation
  ) {

    const segments = [];

    const {
      heights,
      stepX,
      stepZ
    } = terrain;

    const halfWidth =
      SETTINGS.worldWidth / 2;

    const halfDepth =
      SETTINGS.worldDepth / 2;


    function interpolate(
      x1, z1, h1,
      x2, z2, h2
    ) {

      const difference = h2 - h1;

      const t = Math.abs(difference) < 0.000001
        ? 0.5
        : THREE.MathUtils.clamp(
            (elevation - h1) / difference,
            0,
            1
          );

      return [
        x1 + (x2 - x1) * t,
        z1 + (z2 - z1) * t
      ];
    }


    for (let row = 0; row < resolution - 1; row++) {

      for (let col = 0; col < resolution - 1; col++) {

        const x0 =
          -halfWidth + col * stepX;

        const x1 =
          x0 + stepX;

        const z0 =
          -halfDepth + row * stepZ;

        const z1 =
          z0 + stepZ;


        /*
         * Cell corners:
         *
         * A ---- B
         * |      |
         * D ---- C
         */

        const A = heights[row][col];
        const B = heights[row][col + 1];
        const C = heights[row + 1][col + 1];
        const D = heights[row + 1][col];

        const intersections = [];


        /* Top edge */

        if ((A < elevation) !== (B < elevation)) {
          intersections.push(
            interpolate(
              x0, z0, A,
              x1, z0, B
            )
          );
        }


        /* Right edge */

        if ((B < elevation) !== (C < elevation)) {
          intersections.push(
            interpolate(
              x1, z0, B,
              x1, z1, C
            )
          );
        }


        /* Bottom edge */

        if ((C < elevation) !== (D < elevation)) {
          intersections.push(
            interpolate(
              x1, z1, C,
              x0, z1, D
            )
          );
        }


        /* Left edge */

        if ((D < elevation) !== (A < elevation)) {
          intersections.push(
            interpolate(
              x0, z1, D,
              x0, z0, A
            )
          );
        }


        /*
         * Most cells have two intersections.
         *
         * Ambiguous saddle cells can have four.
         * Pair intersections consistently.
         */

        if (intersections.length === 2) {

          segments.push([
            intersections[0],
            intersections[1]
          ]);

        } else if (intersections.length === 4) {

          segments.push([
            intersections[0],
            intersections[1]
          ]);

          segments.push([
            intersections[2],
            intersections[3]
          ]);
        }
      }
    }

    return segments;
  }


  /* ========================================================
     13 / MATERIALS
     ======================================================== */

  const baseColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xc8f4ff),
    new THREE.Color(0x69d7ed)
  ];

  const orange = new THREE.Color(
    SETTINGS.highlightColor
  );


  /* ========================================================
     14 / CLEAR CONTOURS
     ======================================================== */

  function clearContours() {

    for (const contour of contourLines) {

      scene.remove(contour.line);

      contour.line.geometry.dispose();
      contour.line.material.dispose();
    }

    contourLines = [];
    contourLevels = [];
  }


  /* ========================================================
     15 / BUILD CONTOURS
     ======================================================== */

  function buildContours() {

    clearContours();

    const terrain = sampleTerrain();

    /*
     * Exclude the extreme minimum and maximum,
     * where contours become very small or unstable.
     */

    const minimum =
      terrain.minimum +
      (terrain.maximum - terrain.minimum) * 0.035;

    const maximum =
      terrain.minimum +
      (terrain.maximum - terrain.minimum) * 0.96;


    for (let i = 0; i < contourCount; i++) {

      const normalized =
        (i + 1) / (contourCount + 1);

      const elevation =
        THREE.MathUtils.lerp(
          minimum,
          maximum,
          normalized
        );

      contourLevels.push(elevation);

      const segments =
        extractContourSegments(
          terrain,
          elevation
        );

      const positions = [];

      for (const segment of segments) {

        const [start, end] = segment;

        positions.push(
          start[0],
          elevation + SETTINGS.contourOffset,
          start[1],

          end[0],
          elevation + SETTINGS.contourOffset,
          end[1]
        );
      }

      const geometry =
        new THREE.BufferGeometry();

      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          positions,
          3
        )
      );

      const baseColor =
        baseColors[i % baseColors.length].clone();

      const material =
        new THREE.LineBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0.76,
          depthWrite: false
        });

      const line =
        new THREE.LineSegments(
          geometry,
          material
        );

      line.frustumCulled = false;

      scene.add(line);

      contourLines.push({
        line,
        material,
        baseColor,
        normalized,
        elevation
      });
    }

    updateHighlight(true);
  }


  /* ========================================================
     16 / HIGHLIGHT ELEVATION

     Geometry stays fixed.

     Only material colours and opacity change.
     ======================================================== */

  function updateHighlight(immediate = false) {

    if (immediate) {
      currentElevation = targetElevation;
    }

    for (const contour of contourLines) {

      const distance =
        Math.abs(
          contour.normalized - currentElevation
        );

      /*
       * Highlight width expressed as a fraction
       * of the number of contour levels.
       */

      const width =
        SETTINGS.highlightWidth /
        Math.max(1, contourCount);

      const influence = Math.exp(
        -(distance * distance) /
        (2 * width * width)
      );

      /*
       * Full orange at the selected level.
       * Neighbouring contours receive a softer tint.
       */

      contour.material.color
        .copy(contour.baseColor)
        .lerp(orange, influence);

      contour.material.opacity =
        0.60 + influence * 0.40;
    }
  }


  /* ========================================================
     17 / POINTER INTERACTION

     Vertical position selects elevation.

     Top of screen = high elevation.
     Bottom of screen = low elevation.
     ======================================================== */

  function handlePointer(event) {

    const rect =
      container.getBoundingClientRect();

    if (rect.height <= 0) return;

    const normalizedY =
      (event.clientY - rect.top) /
      rect.height;

    targetElevation =
      THREE.MathUtils.clamp(
        1 - normalizedY,
        0,
        1
      );

    if (reducedMotion.matches) {
      updateHighlight(true);
      renderer.render(scene, camera);
    } else {
      startAnimation();
    }
  }


  container.addEventListener(
    "pointermove",
    handlePointer,
    { passive: true }
  );

  container.addEventListener(
    "pointerdown",
    handlePointer
  );


  /* ========================================================
     18 / RESIZE
     ======================================================== */

  let currentDimensions = "";

  function resize() {

    const rect =
      container.getBoundingClientRect();

    const width =
      Math.max(1, rect.width);

    const height =
      Math.max(1, rect.height);

    camera.aspect =
      width / height;

    const aspect =
      width / height;

    if (aspect < 0.8) {
      camera.position.set(0, 11, 25);
    } else if (aspect < 1.4) {
      camera.position.set(0, 9.5, 21);
    } else {
      camera.position.set(0, 8, 18);
    }

    camera.lookAt(0, 0.7, 0);
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxPixelRatio
      )
    );

    renderer.setSize(
      width,
      height,
      false
    );

    const dimensions =
      getDimensions();

    const key =
      dimensions.join("x");

    if (key !== currentDimensions) {

      currentDimensions = key;

      resolution = dimensions[0];
      contourCount = dimensions[1];

      buildContours();
    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     19 / ANIMATION

     Only the highlight value is interpolated.

     The terrain and contour geometry never move.
     ======================================================== */

  function animate(timestamp) {

    animationFrame = null;

    if (
      !isSectionVisible ||
      document.hidden
    ) {
      return;
    }

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
    }

    const delta =
      Math.min(
        0.05,
        Math.max(
          0,
          (timestamp - lastFrameTime) / 1000
        )
      );

    lastFrameTime = timestamp;

    const response =
      1 - Math.pow(
        1 - SETTINGS.highlightResponse,
        delta * 60
      );

    currentElevation +=
      (targetElevation - currentElevation) *
      response;

    if (
      Math.abs(
        targetElevation - currentElevation
      ) < 0.0005
    ) {
      currentElevation = targetElevation;
    }

    updateHighlight();

    renderer.render(scene, camera);

    if (
      currentElevation !== targetElevation
    ) {
      animationFrame = requestAnimationFrame(
        animate
      );
    }
  }


  /* ========================================================
     20 / ANIMATION CONTROL
     ======================================================== */

  function startAnimation() {

    if (
      animationFrame !== null ||
      !isSectionVisible ||
      document.hidden ||
      reducedMotion.matches
    ) {
      return;
    }

    lastFrameTime = null;

    animationFrame = requestAnimationFrame(
      animate
    );
  }


  function stopAnimation() {

    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    lastFrameTime = null;
  }


  /* ========================================================
     21 / VISIBILITY OBSERVER
     ======================================================== */

  const visibilityObserver =
    new IntersectionObserver(
      entries => {

        isSectionVisible =
          entries[0].isIntersecting;

        if (!isSectionVisible) {
          stopAnimation();
        } else {
          updateHighlight(true);
          renderer.render(scene, camera);
        }
      },
      {
        root: document.querySelector(".snap"),
        threshold: 0.05
      }
    );

  visibilityObserver.observe(cover);


  /* ========================================================
     22 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {
        stopAnimation();
        updateHighlight(true);
        renderer.render(scene, camera);
      }
    }
  );


  /* ========================================================
     23 / PAGE VISIBILITY
     ======================================================== */

  document.addEventListener(
    "visibilitychange",
    () => {

      if (document.hidden) {
        stopAnimation();
      } else {
        updateHighlight(true);
        renderer.render(scene, camera);
      }
    }
  );


  /* ========================================================
     24 / RESIZE OBSERVER
     ======================================================== */

  if ("ResizeObserver" in window) {

    const observer =
      new ResizeObserver(resize);

    observer.observe(container);

  } else {

    window.addEventListener(
      "resize",
      resize,
      { passive: true }
    );
  }


  /* ========================================================
     25 / INITIALIZE
     ======================================================== */

  resize();

  updateHighlight(true);

  renderer.render(scene, camera);

  console.log(
    `Interactive topographic contours initialized: ${contourCount} elevation levels.`
  );
}
