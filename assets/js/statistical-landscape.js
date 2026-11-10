
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE TOPOGRAPHIC FLOW FIELD

   File: assets/js/statistical-landscape.js
   Version: 3.0

   Features:
   - Flowing 3D topographic lines
   - Full-cover transparent visualization
   - Mouse-generated displacement waves
   - Spring physics and neighbour propagation
   - Subtle ambient motion
   - White, cyan and occasional orange lines
   - Responsive geometry
   - Touch interaction
   - Reduced-motion support
   - Pauses when off-screen

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

    desktopLines: 48,
    tabletLines: 34,
    mobileLines: 22,

    desktopSamples: 160,
    tabletSamples: 120,
    mobileSamples: 80,

    worldWidth: 22,
    worldDepth: 13,

    terrainHeight: 2.4,

    springStrength: 0.065,
    neighbourStrength: 0.22,
    damping: 0.91,

    waveStrength: 0.28,
    waveRadius: 1.9,

    ambientAmplitude: 0.12,
    ambientSpeed: 0.42,

    maxVelocity: 0.38,

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

  let points = [];
  let lines = [];

  let spacingX = 0;
  let spacingZ = 0;

  let simulationTime = 0;

  let animationFrame = null;
  let lastFrameTime = null;
  let accumulator = 0;

  let isSectionVisible = true;

  let lastWaveTime = 0;
  let lastWaveX = null;
  let lastWaveZ = null;

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
    42,
    1,
    0.1,
    100
  );

  camera.position.set(0, 8.5, 17);
  camera.lookAt(0, 0.8, 0);


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
     09 / GEOMETRY
     ======================================================== */

  const lineMaterials = [
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0xb6efff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0x66d9f0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    }),

    new THREE.LineBasicMaterial({
      color: 0xffa15a,
      transparent: true,
      opacity: 0.65,
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
     11 / TOPOGRAPHIC HEIGHT FUNCTION
     ======================================================== */

  function terrainHeight(x, z) {

    const hillOne =
      2.3 * Math.exp(
        -(
          ((x + 5.2) ** 2) / 17 +
          ((z + 1.3) ** 2) / 7
        )
      );

    const hillTwo =
      3.1 * Math.exp(
        -(
          ((x - 2.5) ** 2) / 13 +
          ((z - 2.2) ** 2) / 9
        )
      );

    const hillThree =
      1.8 * Math.exp(
        -(
          ((x - 7.1) ** 2) / 10 +
          ((z + 2.8) ** 2) / 6
        )
      );

    const rolling =
      0.32 *
      Math.sin(x * 0.7 + z * 0.4) *
      Math.cos(z * 0.9);

    return (
      (hillOne + hillTwo + hillThree + rolling) *
      SETTINGS.terrainHeight *
      0.42
    );
  }


  /* ========================================================
     12 / CLEAR EXISTING LINES
     ======================================================== */

  function clearLines() {

    for (const line of lines) {
      scene.remove(line);
      line.geometry.dispose();
    }

    lines = [];
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

    spacingX =
      SETTINGS.worldWidth / (sampleCount - 1);

    spacingZ =
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

          baseHeight: terrainHeight(x, z),

          displacement: 0,
          velocity: 0
        });
      }

      points.push(rowPoints);

      const positions = new Float32Array(
        sampleCount * 3
      );

      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          positions,
          3
        )
      );

      /*
       * Most lines are white or cyan.
       * Every 17th line receives a warm accent.
       */

      let materialIndex = row % 3;

      if (row % 17 === 0) {
        materialIndex = 3;
      }

      const line = new THREE.Line(
        geometry,
        lineMaterials[materialIndex]
      );

      line.frustumCulled = false;

      lines.push(line);
      scene.add(line);
    }

    updateGeometry();
  }


  /* ========================================================
     14 / UPDATE LINE GEOMETRY
     ======================================================== */

  function updateGeometry() {

    for (let row = 0; row < lineCount; row++) {

      const positions =
        lines[row].geometry.attributes.position;

      for (let col = 0; col < sampleCount; col++) {

        const point = points[row][col];

        const ambient = reducedMotion.matches
          ? 0
          : SETTINGS.ambientAmplitude *
            Math.sin(
              point.x * 0.52 +
              point.z * 0.64 +
              simulationTime * SETTINGS.ambientSpeed
            );

        const y =
          point.baseHeight +
          point.displacement +
          ambient;

        positions.setXYZ(
          col,
          point.x,
          y,
          point.z
        );
      }

      positions.needsUpdate = true;
    }
  }


  /* ========================================================
     15 / SPRING AND WAVE PHYSICS
     ======================================================== */

  function updatePhysics() {

    const accelerations = Array.from(
      { length: lineCount },
      () => new Float32Array(sampleCount)
    );

    for (let row = 0; row < lineCount; row++) {

      for (let col = 0; col < sampleCount; col++) {

        const point = points[row][col];

        let neighbourSum = 0;
        let neighbourCount = 0;

        if (col > 0) {
          neighbourSum += points[row][col - 1].displacement;
          neighbourCount++;
        }

        if (col < sampleCount - 1) {
          neighbourSum += points[row][col + 1].displacement;
          neighbourCount++;
        }

        if (row > 0) {
          neighbourSum += points[row - 1][col].displacement;
          neighbourCount++;
        }

        if (row < lineCount - 1) {
          neighbourSum += points[row + 1][col].displacement;
          neighbourCount++;
        }

        const average = neighbourCount
          ? neighbourSum / neighbourCount
          : 0;

        const spring =
          -point.displacement *
          SETTINGS.springStrength;

        const propagation =
          (average - point.displacement) *
          SETTINGS.neighbourStrength;

        accelerations[row][col] =
          spring + propagation;
      }
    }

    for (let row = 0; row < lineCount; row++) {

      for (let col = 0; col < sampleCount; col++) {

        const point = points[row][col];

        point.velocity +=
          accelerations[row][col];

        point.velocity = THREE.MathUtils.clamp(
          point.velocity,
          -SETTINGS.maxVelocity,
          SETTINGS.maxVelocity
        );

        point.velocity *= SETTINGS.damping;

        point.displacement += point.velocity;
      }
    }
  }


  /* ========================================================
     16 / CREATE CURSOR WAVE
     ======================================================== */

  function createWave(x, z, strength = 1) {

    if (reducedMotion.matches) return;

    const radiusSquared =
      SETTINGS.waveRadius ** 2;

    for (let row = 0; row < lineCount; row++) {

      for (let col = 0; col < sampleCount; col++) {

        const point = points[row][col];

        const dx = point.x - x;
        const dz = point.z - z;

        const distanceSquared =
          dx * dx + dz * dz;

        if (distanceSquared > radiusSquared * 5) {
          continue;
        }

        const influence = Math.exp(
          -distanceSquared /
          (radiusSquared * 0.75)
        );

        point.velocity +=
          SETTINGS.waveStrength *
          influence *
          strength;

        point.velocity = THREE.MathUtils.clamp(
          point.velocity,
          -SETTINGS.maxVelocity,
          SETTINGS.maxVelocity
        );
      }
    }
  }


  /* ========================================================
     17 / POINTER RAYCASTING
     ======================================================== */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const interactionPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.7
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

    const x = intersection.x;
    const z = intersection.z;

    if (
      Math.abs(x) > SETTINGS.worldWidth / 2 ||
      Math.abs(z) > SETTINGS.worldDepth / 2
    ) {
      return;
    }

    const now = performance.now();

    if (now - lastWaveTime < 25) {
      return;
    }

    let strength = 1;

    if (
      lastWaveX !== null &&
      lastWaveZ !== null
    ) {

      const movement = Math.hypot(
        x - lastWaveX,
        z - lastWaveZ
      );

      strength = THREE.MathUtils.clamp(
        movement * 1.7,
        0.3,
        1.6
      );
    }

    createWave(x, z, strength);

    lastWaveX = x;
    lastWaveZ = z;
    lastWaveTime = now;
  }


  /* ========================================================
     18 / POINTER EVENTS
     ======================================================== */

  container.addEventListener(
    "pointermove",
    handlePointerMove,
    { passive: true }
  );

  container.addEventListener(
    "pointerdown",
    event => {
      lastWaveX = null;
      lastWaveZ = null;

      handlePointerMove(event);
    }
  );

  container.addEventListener(
    "pointerleave",
    () => {
      lastWaveX = null;
      lastWaveZ = null;
    }
  );


  /* ========================================================
     19 / RESIZE
     ======================================================== */

  let currentDimensions = "";

  function resize() {

    const rect = container.getBoundingClientRect();

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    camera.aspect = width / height;

    const aspect = width / height;

    if (aspect < 0.8) {
      camera.position.set(0, 11, 23);
    } else if (aspect < 1.4) {
      camera.position.set(0, 9.5, 19);
    } else {
      camera.position.set(0, 8.5, 17);
    }

    camera.lookAt(0, 0.8, 0);
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
     20 / ANIMATION
     ======================================================== */

  const FIXED_STEP = 1000 / 60;

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

    const delta = Math.min(
      50,
      Math.max(0, timestamp - lastFrameTime)
    );

    lastFrameTime = timestamp;
    accumulator += delta;

    let steps = 0;

    while (
      accumulator >= FIXED_STEP &&
      steps < 3
    ) {
      updatePhysics();

      simulationTime += FIXED_STEP / 1000;

      accumulator -= FIXED_STEP;
      steps++;
    }

    updateGeometry();
    renderer.render(scene, camera);

    animationFrame = requestAnimationFrame(animate);
  }


  /* ========================================================
     21 / ANIMATION CONTROL
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
    accumulator = 0;

    animationFrame = requestAnimationFrame(animate);
  }


  function stopAnimation() {

    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    lastFrameTime = null;
    accumulator = 0;
  }


  /* ========================================================
     22 / VISIBILITY
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
     23 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {
        stopAnimation();

        for (const row of points) {
          for (const point of row) {
            point.displacement = 0;
            point.velocity = 0;
          }
        }

        updateGeometry();
        renderer.render(scene, camera);

      } else {
        startAnimation();
      }
    }
  );


  /* ========================================================
     24 / PAGE VISIBILITY
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
     25 / RESIZE OBSERVER
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
     26 / INITIALIZE
     ======================================================== */

  resize();
  startAnimation();

  console.log(
    `Topographic flow field initialized: ${lineCount} lines.`
  );
}
