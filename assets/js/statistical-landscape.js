
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE TOPOGRAPHIC FLOW FIELD

   File: assets/js/statistical-landscape.js
   Version: 4.0

   Visual direction:
   - Inspired by flowing topographic contour artwork
   - Continuously evolving mathematical landscape
   - Layered luminous contours
   - Strong three-dimensional perspective
   - Cursor pushes and parts the surface
   - Fast response, heavily damped recovery
   - No elastic bouncing or excessive recoil
   - Full-cover visualization
   - Responsive and reduced-motion aware
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

    desktopLines: 54,
    tabletLines: 38,
    mobileLines: 24,

    desktopSamples: 200,
    tabletSamples: 150,
    mobileSamples: 100,

    worldWidth: 24,
    worldDepth: 15,

    terrainHeight: 2.8,

    /*
     * Continuous landscape evolution.
     */

    flowSpeed: 0.42,
    terrainVariation: 0.65,

    /*
     * Cursor interaction.
     *
     * Lower responseSmoothness = slower response.
     * Higher recoverySmoothness = faster recovery.
     */

    cursorRadius: 2.6,
    cursorStrength: 1.65,

    responseSmoothness: 0.18,
    recoverySmoothness: 0.11,

    /*
     * Visual treatment.
     */

    primaryOpacity: 0.88,
    secondaryOpacity: 0.48,
    accentOpacity: 0.72,

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

  let lineCount = 0;
  let sampleCount = 0;

  let lines = [];
  let glowLines = [];

  let points = [];

  let simulationTime = 0;

  let animationFrame = null;
  let lastFrameTime = null;

  let isSectionVisible = true;

  let cursorActive = false;
  let cursorX = 0;
  let cursorZ = 0;

  let cursorInfluence = 0;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ========================================================
     06 / THREE.JS SCENE
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

  camera.position.set(0, 7.5, 18);
  camera.lookAt(0, 0.5, 0);


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
      "Topographic flow field: WebGL unavailable.",
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
     09 / LINE MATERIALS
     ======================================================== */

  const materials = [

    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: SETTINGS.primaryOpacity,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0xc8f4ff,
      transparent: true,
      opacity: SETTINGS.secondaryOpacity,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0x6de4f5,
      transparent: true,
      opacity: 0.68,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0xffa15a,
      transparent: true,
      opacity: SETTINGS.accentOpacity,
      depthWrite: false
    })
  ];


  /* ========================================================
     10 / RESPONSIVE DIMENSIONS
     ======================================================== */

  function getDimensions() {

    const viewport = window.innerWidth;

    if (viewport <= 800) {
      return [
        SETTINGS.mobileLines,
        SETTINGS.mobileSamples
      ];
    }

    if (viewport <= 1200) {
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


  /* ========================================================
     11 / CONTINUOUS TOPOGRAPHIC SURFACE

     Several moving Gaussian peaks combine with
     low-frequency wave functions.

     The result evolves continuously without using
     spring oscillation.
     ======================================================== */

  function terrainHeight(x, z, t) {

    /*
     * Slowly drifting centres.
     */

    const peak1X =
      -6 + Math.sin(t * 0.21) * 1.6;

    const peak1Z =
      -1 + Math.cos(t * 0.17) * 1.1;

    const peak2X =
      1.8 + Math.cos(t * 0.16) * 1.8;

    const peak2Z =
      2.4 + Math.sin(t * 0.19) * 1.4;

    const peak3X =
      7 + Math.sin(t * 0.13 + 1.2) * 1.5;

    const peak3Z =
      -2.8 + Math.cos(t * 0.15) * 1.3;


    /*
     * Gaussian hills.
     */

    const hill1 =
      2.4 * Math.exp(
        -(
          ((x - peak1X) ** 2) / 15 +
          ((z - peak1Z) ** 2) / 8
        )
      );

    const hill2 =
      3.6 * Math.exp(
        -(
          ((x - peak2X) ** 2) / 12 +
          ((z - peak2Z) ** 2) / 9
        )
      );

    const hill3 =
      2.2 * Math.exp(
        -(
          ((x - peak3X) ** 2) / 13 +
          ((z - peak3Z) ** 2) / 7
        )
      );


    /*
     * Flowing undulations.
     */

    const flow1 =
      Math.sin(
        x * 0.55 +
        z * 0.42 +
        t * 0.55
      ) * 0.32;

    const flow2 =
      Math.cos(
        x * 0.34 -
        z * 0.7 -
        t * 0.38
      ) * 0.25;

    const flow3 =
      Math.sin(
        x * 0.18 +
        z * 1.1 +
        t * 0.24
      ) * 0.18;


    return (
      hill1 +
      hill2 +
      hill3 +
      (flow1 + flow2 + flow3) *
      SETTINGS.terrainVariation
    ) * SETTINGS.terrainHeight * 0.42;
  }


  /* ========================================================
     12 / CLEAR LINES
     ======================================================== */

  function clearLines() {

    for (const line of lines) {
      scene.remove(line);
      line.geometry.dispose();
    }

    for (const line of glowLines) {
      scene.remove(line);
      line.geometry.dispose();
    }

    lines = [];
    glowLines = [];
    points = [];
  }


  /* ========================================================
     13 / BUILD FLOW FIELD
     ======================================================== */

  function buildField() {

    clearLines();

    const dimensions = getDimensions();

    lineCount = dimensions[0];
    sampleCount = dimensions[1];

    const spacingX =
      SETTINGS.worldWidth / (sampleCount - 1);

    const spacingZ =
      SETTINGS.worldDepth / (lineCount - 1);


    for (let row = 0; row < lineCount; row++) {

      const rowPoints = [];

      const z =
        -SETTINGS.worldDepth / 2 +
        row * spacingZ;

      for (let col = 0; col < sampleCount; col++) {

        const x =
          -SETTINGS.worldWidth / 2 +
          col * spacingX;

        rowPoints.push({
          x,
          z,

          currentY: 0,
          cursorOffset: 0
        });
      }

      points.push(rowPoints);


      /*
       * Main contour.
       */

      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(sampleCount * 3),
          3
        )
      );

      let materialIndex = row % 3;

      if (row % 17 === 0) {
        materialIndex = 3;
      }

      const line = new THREE.Line(
        geometry,
        materials[materialIndex]
      );

      line.frustumCulled = false;

      lines.push(line);
      scene.add(line);


      /*
       * Secondary translucent contour for depth.
       */

      if (row % 3 === 0) {

        const glowGeometry =
          new THREE.BufferGeometry();

        glowGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            new Float32Array(sampleCount * 3),
            3
          )
        );

        const glowMaterial =
          new THREE.LineBasicMaterial({
            color: 0xb8efff,
            transparent: true,
            opacity: 0.14,
            depthWrite: false
          });

        const glowLine = new THREE.Line(
          glowGeometry,
          glowMaterial
        );

        glowLine.userData.sourceRow = row;
        glowLine.frustumCulled = false;

        glowLines.push(glowLine);
        scene.add(glowLine);
      }
    }

    updateGeometry(0);
  }


  /* ========================================================
     14 / UPDATE GEOMETRY

     Smooth, non-oscillating movement.

     No springs or velocity integration are used.
     ======================================================== */

  function updateGeometry(deltaSeconds) {

    const frameFactor =
      Math.min(
        3,
        deltaSeconds * 60
      );

    const response =
      1 - Math.pow(
        1 - SETTINGS.responseSmoothness,
        frameFactor
      );

    const recovery =
      1 - Math.pow(
        1 - SETTINGS.recoverySmoothness,
        frameFactor
      );


    /*
     * Cursor influence fades in/out smoothly.
     */

    const targetInfluence =
      cursorActive ? 1 : 0;

    cursorInfluence +=
      (targetInfluence - cursorInfluence) *
      response;


    for (let row = 0; row < lineCount; row++) {

      const positions =
        lines[row].geometry.attributes.position;

      for (let col = 0; col < sampleCount; col++) {

        const point = points[row][col];

        const baseY =
          terrainHeight(
            point.x,
            point.z,
            simulationTime
          );


        /*
         * Cursor displacement.
         *
         * Smooth Gaussian influence with no recoil.
         */

        let targetOffset = 0;

        if (cursorInfluence > 0.001) {

          const dx =
            point.x - cursorX;

          const dz =
            point.z - cursorZ;

          const distanceSquared =
            dx * dx + dz * dz;

          targetOffset =
            SETTINGS.cursorStrength *
            Math.exp(
              -distanceSquared /
              (SETTINGS.cursorRadius ** 2)
            ) *
            cursorInfluence;
        }


        /*
         * Critically damped-style interpolation.
         *
         * This is intentionally monotonic:
         * it approaches the target without overshooting.
         */

        point.cursorOffset +=
          (targetOffset - point.cursorOffset) *
          (cursorActive ? response : recovery);


        const targetY =
          baseY + point.cursorOffset;

        point.currentY +=
          (targetY - point.currentY) *
          response;


        positions.setXYZ(
          col,
          point.x,
          point.currentY,
          point.z
        );
      }

      positions.needsUpdate = true;
    }


    /*
     * Update secondary glow contours.
     */

    for (const glowLine of glowLines) {

      const row =
        glowLine.userData.sourceRow;

      const source =
        lines[row].geometry.attributes.position;

      const target =
        glowLine.geometry.attributes.position;

      for (let col = 0; col < sampleCount; col++) {

        target.setXYZ(
          col,
          source.getX(col),
          source.getY(col) + 0.035,
          source.getZ(col) + 0.02
        );
      }

      target.needsUpdate = true;
    }
  }


  /* ========================================================
     15 / POINTER INTERACTION
     ======================================================== */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const interactionPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.8
  );

  const intersection = new THREE.Vector3();


  function handlePointerMove(event) {

    if (reducedMotion.matches) return;

    const rect = container.getBoundingClientRect();

    pointer.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;

    pointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.ray.intersectPlane(
      interactionPlane,
      intersection
    );

    if (!hit) return;

    cursorX = intersection.x;
    cursorZ = intersection.z;

    cursorActive =
      Math.abs(cursorX) < SETTINGS.worldWidth / 2 &&
      Math.abs(cursorZ) < SETTINGS.worldDepth / 2;
  }


  function handlePointerLeave() {
    cursorActive = false;
  }


  container.addEventListener(
    "pointermove",
    handlePointerMove,
    { passive: true }
  );

  container.addEventListener(
    "pointerdown",
    handlePointerMove
  );

  container.addEventListener(
    "pointerleave",
    handlePointerLeave
  );


  /* ========================================================
     16 / RESIZE
     ======================================================== */

  let currentDimensions = "";

  function resize() {

    const rect = container.getBoundingClientRect();

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    camera.aspect = width / height;

    const aspect = width / height;

    if (aspect < 0.8) {
      camera.position.set(0, 10, 24);
    } else if (aspect < 1.4) {
      camera.position.set(0, 8.5, 20);
    } else {
      camera.position.set(0, 7.5, 18);
    }

    camera.lookAt(0, 0.5, 0);
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

    const dimensions = getDimensions().join("x");

    if (dimensions !== currentDimensions) {
      currentDimensions = dimensions;
      buildField();
    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     17 / ANIMATION
     ======================================================== */

  function animate(timestamp) {

    animationFrame = null;

    if (
      !isSectionVisible ||
      reducedMotion.matches ||
      document.hidden
    ) {
      return;
    }

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
    }

    const deltaSeconds =
      Math.min(
        0.05,
        Math.max(
          0,
          (timestamp - lastFrameTime) / 1000
        )
      );

    lastFrameTime = timestamp;

    simulationTime +=
      deltaSeconds * SETTINGS.flowSpeed;

    updateGeometry(deltaSeconds);

    renderer.render(scene, camera);

    animationFrame = requestAnimationFrame(animate);
  }


  /* ========================================================
     18 / ANIMATION CONTROL
     ======================================================== */

  function startAnimation() {

    if (
      animationFrame !== null ||
      reducedMotion.matches ||
      !isSectionVisible ||
      document.hidden
    ) {
      return;
    }

    lastFrameTime = null;

    animationFrame = requestAnimationFrame(animate);
  }


  function stopAnimation() {

    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    lastFrameTime = null;
  }


  /* ========================================================
     19 / VISIBILITY OBSERVER
     ======================================================== */

  const visibilityObserver = new IntersectionObserver(
    entries => {

      isSectionVisible = entries[0].isIntersecting;

      if (isSectionVisible) {
        startAnimation();
      } else {
        stopAnimation();
      }
    },
    {
      root: document.querySelector(".snap"),
      threshold: 0.05
    }
  );

  visibilityObserver.observe(cover);


  /* ========================================================
     20 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {
        stopAnimation();

        cursorActive = false;
        cursorInfluence = 0;

        updateGeometry(1);
        renderer.render(scene, camera);

      } else {
        startAnimation();
      }
    }
  );


  /* ========================================================
     21 / PAGE VISIBILITY
     ======================================================== */

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


  /* ========================================================
     22 / RESIZE OBSERVER
     ======================================================== */

  if ("ResizeObserver" in window) {

    const observer = new ResizeObserver(resize);
    observer.observe(container);

  } else {

    window.addEventListener(
      "resize",
      resize,
      { passive: true }
    );
  }


  /* ========================================================
     23 / INITIALIZE
     ======================================================== */

  resize();

  /*
   * Pre-render the initial landscape.
   */

  updateGeometry(1);

  renderer.render(scene, camera);

  startAnimation();

  console.log(
    `Topographic flow field initialized: ${lineCount} lines.`
  );
}
