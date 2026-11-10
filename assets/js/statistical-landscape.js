
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE 3D TOPOGRAPHIC PARTICLE FIELD

   File: assets/js/statistical-landscape.js
   Version: 2.0

   Features:
   - Full-width three-dimensional particle landscape
   - White spheres on U of T blue
   - Rolling topographic hills and valleys
   - Mouse-generated travelling waves
   - Spring physics and damping
   - Neighbour-to-neighbour wave propagation
   - Subtle ambient surface movement
   - Responsive particle counts
   - Touch interaction
   - Reduced-motion support
   - Pauses when off-screen

   Three.js CDN, no build system required.
   ========================================================== */

import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";


/* ==========================================================
   01 / ELEMENT
   ========================================================== */

const container = document.getElementById(
  "statistical-landscape"
);

if (container) {
  initializeLandscape();
}


/* ==========================================================
   02 / MAIN
   ========================================================== */

function initializeLandscape() {

  const cover = document.getElementById("cover");

  if (!cover) return;


  /* ========================================================
     03 / SETTINGS

     These are the main controls for the experience.
     ======================================================== */

  const SETTINGS = {

    color: 0xffffff,

    desktopColumns: 42,
    desktopRows: 24,

    tabletColumns: 32,
    tabletRows: 20,

    mobileColumns: 22,
    mobileRows: 16,

    pointRadius: 0.065,

    terrainHeight: 1.45,

    waveStrength: 2.8,
    waveRadius: 1.65,

    springStrength: 0.075,
    neighbourStrength: 0.16,
    damping: 0.91,

    ambientAmplitude: 0.065,
    ambientSpeed: 0.65,

    maxVelocity: 0.38,

    maxPixelRatio: 2

  };


  /* ========================================================
     04 / FULL-WIDTH COVER POSITIONING

     Override the previous centre-right chart placement.

     The visualization occupies the full cover but remains
     beneath the heading and program labels.

     No CSS changes are required for this initial test.
     ======================================================== */

  Object.assign(container.style, {
    position: "absolute",
    inset: "0",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    zIndex: "1",
    cursor: "crosshair",
    touchAction: "pan-y"
  });


  /* ========================================================
     05 / STATE
     ======================================================== */

  let columns = 0;
  let rows = 0;

  let points = [];
  let spheres = null;
  let gridLines = null;

  let gridWidth = 0;
  let gridDepth = 0;

  let spacingX = 0;
  let spacingZ = 0;

  let animationFrame = null;
  let lastFrameTime = null;

  let isSectionVisible = true;
  let pointerDown = false;

  let simulationTime = 0;

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

     Perspective view looking across the landscape.

     The camera is stationary. The data points move.
     ======================================================== */

  const camera = new THREE.PerspectiveCamera(
    38,
    1,
    0.1,
    100
  );

  camera.position.set(
    0,
    9.5,
    15.5
  );

  camera.lookAt(
    0,
    0,
    0
  );


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
      "Unable to initialize 3D landscape:",
      error
    );

    return;
  }

  renderer.setClearColor(
    0x0180a5,
    0
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "pan-y";

  container.appendChild(
    renderer.domElement
  );


  /* ========================================================
     09 / LIGHTING
     ======================================================== */

  scene.add(
    new THREE.AmbientLight(
      0xffffff,
      2.2
    )
  );

  const light = new THREE.DirectionalLight(
    0xffffff,
    2.4
  );

  light.position.set(
    -5,
    12,
    8
  );

  scene.add(light);


  /* ========================================================
     10 / GEOMETRY GROUP
     ======================================================== */

  const landscape = new THREE.Group();

  scene.add(landscape);

  const sphereGeometry = new THREE.SphereGeometry(
    SETTINGS.pointRadius,
    8,
    6
  );

  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: SETTINGS.color,
    roughness: 0.48,
    metalness: 0
  });

  const dummy = new THREE.Object3D();


  /* ========================================================
     11 / RESPONSIVE GRID
     ======================================================== */

  function getGridDimensions() {

    const viewport = window.innerWidth;

    if (viewport <= 800) {
      return [
        SETTINGS.mobileColumns,
        SETTINGS.mobileRows
      ];
    }

    if (viewport <= 1200) {
      return [
        SETTINGS.tabletColumns,
        SETTINGS.tabletRows
      ];
    }

    return [
      SETTINGS.desktopColumns,
      SETTINGS.desktopRows
    ];
  }


  /* ========================================================
     12 / TOPOGRAPHIC HEIGHT FUNCTION

     Three overlapping Gaussian hills create a smooth,
     irregular statistical landscape.

     This is an illustrative mathematical surface.
     ======================================================== */

  function terrainHeight(x, z) {

    const hillOne =
      1.55 * Math.exp(
        -(
          ((x + 3.4) ** 2) / 13 +
          ((z + 0.5) ** 2) / 8
        )
      );

    const hillTwo =
      2.1 * Math.exp(
        -(
          ((x - 2.2) ** 2) / 8 +
          ((z - 1.2) ** 2) / 10
        )
      );

    const hillThree =
      1.15 * Math.exp(
        -(
          ((x - 0.5) ** 2) / 16 +
          ((z + 3.1) ** 2) / 5
        )
      );

    const rolling =
      0.22 *
      Math.sin(x * 0.75) *
      Math.cos(z * 0.9);

    return (
      (hillOne + hillTwo + hillThree + rolling) *
      SETTINGS.terrainHeight *
      0.65
    );
  }


  /* ========================================================
     13 / CLEAN UP OLD GRID
     ======================================================== */

  function clearGrid() {

    if (spheres) {
      landscape.remove(spheres);
      spheres.dispose();
      spheres = null;
    }

    if (gridLines) {
      landscape.remove(gridLines);
      gridLines.geometry.dispose();
      gridLines.material.dispose();
      gridLines = null;
    }

    points = [];
  }


  /* ========================================================
     14 / CREATE PARTICLE FIELD
     ======================================================== */

  function createGrid() {

    clearGrid();

    const dimensions = getGridDimensions();

    columns = dimensions[0];
    rows = dimensions[1];

    /*
     * Wide landscape, extending across the cover.
     */

    gridWidth = 16;
    gridDepth = 10;

    spacingX = gridWidth / (columns - 1);
    spacingZ = gridDepth / (rows - 1);

    const count = columns * rows;

    spheres = new THREE.InstancedMesh(
      sphereGeometry,
      sphereMaterial,
      count
    );

    spheres.instanceMatrix.setUsage(
      THREE.DynamicDrawUsage
    );

    spheres.frustumCulled = false;

    let index = 0;

    for (let row = 0; row < rows; row++) {

      for (let col = 0; col < columns; col++) {

        const x =
          -gridWidth / 2 +
          col * spacingX;

        const z =
          -gridDepth / 2 +
          row * spacingZ;

        const baseHeight = terrainHeight(x, z);

        points.push({

          x,
          z,

          row,
          col,

          baseHeight,

          displacement: 0,
          velocity: 0,

          index

        });

        index++;
      }
    }

    landscape.add(spheres);

    createGridLines();

    updateGeometry();
  }


  /* ========================================================
     15 / SUBTLE TOPOGRAPHIC GRID

     A faint wireframe beneath the particle surface.
     ======================================================== */

  function createGridLines() {

    const positions = [];

    for (let row = 0; row < rows; row++) {

      for (let col = 0; col < columns; col++) {

        const index = row * columns + col;
        const point = points[index];

        if (col < columns - 1) {

          const next = points[index + 1];

          positions.push(
            point.x, -0.28, point.z,
            next.x, -0.28, next.z
          );
        }

        if (row < rows - 1) {

          const next = points[index + columns];

          positions.push(
            point.x, -0.28, point.z,
            next.x, -0.28, next.z
          );
        }
      }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    );

    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false
    });

    gridLines = new THREE.LineSegments(
      geometry,
      material
    );

    landscape.add(gridLines);
  }


  /* ========================================================
     16 / UPDATE PARTICLE POSITIONS
     ======================================================== */

  function updateGeometry() {

    if (!spheres) return;

    for (const point of points) {

      const ambient =
        reducedMotion.matches
          ? 0
          : SETTINGS.ambientAmplitude *
            Math.sin(
              point.x * 0.85 +
              point.z * 0.55 +
              simulationTime * SETTINGS.ambientSpeed
            );

      const height =
        point.baseHeight +
        point.displacement +
        ambient;

      dummy.position.set(
        point.x,
        height,
        point.z
      );

      /*
       * Slightly vary sphere size by elevation
       * to reinforce the landscape's depth.
       */

      const scale =
        THREE.MathUtils.clamp(
          0.85 + height * 0.065,
          0.8,
          1.25
        );

      dummy.scale.setScalar(scale);

      dummy.updateMatrix();

      spheres.setMatrixAt(
        point.index,
        dummy.matrix
      );
    }

    spheres.instanceMatrix.needsUpdate = true;
  }


  /* ========================================================
     17 / WAVE PHYSICS

     Every particle is connected to neighbouring particles
     through a virtual spring system.

     A disturbance at one point propagates across the field.
     ======================================================== */

  function updatePhysics(frameScale) {

    const accelerations = new Float32Array(
      points.length
    );

    for (let i = 0; i < points.length; i++) {

      const point = points[i];

      let neighbourSum = 0;
      let neighbourCount = 0;

      if (point.col > 0) {
        neighbourSum += points[i - 1].displacement;
        neighbourCount++;
      }

      if (point.col < columns - 1) {
        neighbourSum += points[i + 1].displacement;
        neighbourCount++;
      }

      if (point.row > 0) {
        neighbourSum += points[i - columns].displacement;
        neighbourCount++;
      }

      if (point.row < rows - 1) {
        neighbourSum += points[i + columns].displacement;
        neighbourCount++;
      }

      const neighbourAverage =
        neighbourCount > 0
          ? neighbourSum / neighbourCount
          : 0;

      /*
       * Spring pulls the particle back to its
       * original topographic height.
       */

      const springForce =
        -point.displacement *
        SETTINGS.springStrength;

      /*
       * Neighbour coupling spreads the wave.
       */

      const waveForce =
        (neighbourAverage - point.displacement) *
        SETTINGS.neighbourStrength;

      accelerations[i] =
        springForce + waveForce;
    }

    /*
     * Apply all accelerations after calculating them.
     * This avoids updating neighbours out of sequence.
     */

    const step = Math.min(frameScale, 2);

    const damping = Math.pow(
      SETTINGS.damping,
      step
    );

    for (let i = 0; i < points.length; i++) {

      const point = points[i];

      point.velocity +=
        accelerations[i] * step;

      point.velocity = THREE.MathUtils.clamp(
        point.velocity,
        -SETTINGS.maxVelocity,
        SETTINGS.maxVelocity
      );

      point.velocity *= damping;

      point.displacement +=
        point.velocity * step;
    }
  }


  /* ========================================================
     18 / GENERATE RADIAL WAVE

     The cursor creates a localized impulse.

     Nearby particles receive a stronger impulse,
     while distant particles respond as the wave travels.
     ======================================================== */

  function createWave(x, z, strength = 1) {

    if (reducedMotion.matches) return;

    const radius = SETTINGS.waveRadius;
    const radiusSquared = radius * radius;

    for (const point of points) {

      const dx = point.x - x;
      const dz = point.z - z;

      const distanceSquared =
        dx * dx + dz * dz;

      if (distanceSquared > radiusSquared * 5) {
        continue;
      }

      /*
       * Smooth Gaussian falloff.
       */

      const influence = Math.exp(
        -distanceSquared /
        (radiusSquared * 0.7)
      );

      point.velocity +=
        SETTINGS.waveStrength *
        influence *
        strength *
        0.11;

      point.velocity = THREE.MathUtils.clamp(
        point.velocity,
        -SETTINGS.maxVelocity,
        SETTINGS.maxVelocity
      );
    }
  }


  /* ========================================================
     19 / POINTER RAYCASTING

     Convert the cursor's screen position into a point
     on the 3D landscape's X/Z plane.
     ======================================================== */

  const raycaster = new THREE.Raycaster();

  const pointer = new THREE.Vector2();

  const interactionPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.8
  );

  const intersection = new THREE.Vector3();

  let previousWaveX = null;
  let previousWaveZ = null;
  let previousWaveTime = 0;


  function pointerMoved(event) {

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
      Math.abs(x) > gridWidth / 2 + 1 ||
      Math.abs(z) > gridDepth / 2 + 1
    ) {
      return;
    }

    const now = performance.now();

    /*
     * Prevent excessive impulses when the browser
     * sends many pointer events per frame.
     */

    if (now - previousWaveTime < 28) {
      return;
    }

    let movement = 1;

    if (
      previousWaveX !== null &&
      previousWaveZ !== null
    ) {

      const distance = Math.hypot(
        x - previousWaveX,
        z - previousWaveZ
      );

      movement = THREE.MathUtils.clamp(
        distance * 2.2,
        0.25,
        1.5
      );
    }

    createWave(
      x,
      z,
      pointerDown ? movement * 1.4 : movement
    );

    previousWaveX = x;
    previousWaveZ = z;
    previousWaveTime = now;
  }


  /* ========================================================
     20 / TOUCH AND POINTER EVENTS
     ======================================================== */

  container.addEventListener(
    "pointermove",
    pointerMoved,
    { passive: true }
  );

  container.addEventListener(
    "pointerdown",
    event => {

      pointerDown = true;

      previousWaveX = null;
      previousWaveZ = null;

      pointerMoved(event);

    }
  );

  window.addEventListener(
    "pointerup",
    () => {
      pointerDown = false;
    }
  );

  window.addEventListener(
    "pointercancel",
    () => {
      pointerDown = false;
    }
  );

  container.addEventListener(
    "pointerleave",
    () => {

      previousWaveX = null;
      previousWaveZ = null;

    }
  );


  /* ========================================================
     21 / RESIZE
     ======================================================== */

  let currentGridKey = "";

  function resize() {

    const rect = container.getBoundingClientRect();

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    camera.aspect = width / height;

    /*
     * Adjust camera distance to preserve a broad
     * landscape on different aspect ratios.
     */

    const aspect = width / height;

    if (aspect < 0.8) {

      camera.position.set(
        0,
        12,
        22
      );

    } else if (aspect < 1.4) {

      camera.position.set(
        0,
        10.5,
        18
      );

    } else {

      camera.position.set(
        0,
        9.5,
        15.5
      );
    }

    camera.lookAt(
      0,
      0.55,
      0
    );

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

    const dimensions = getGridDimensions();
    const gridKey = dimensions.join("x");

    if (gridKey !== currentGridKey) {

      currentGridKey = gridKey;
      createGrid();

    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     22 / ANIMATION

     Physics runs at a fixed 60Hz step to keep the
     surface response consistent across refresh rates.
     ======================================================== */

  const FIXED_STEP = 1000 / 60;

  let accumulator = 0;

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

      updatePhysics(1);

      simulationTime += FIXED_STEP / 1000;

      accumulator -= FIXED_STEP;

      steps++;
    }

    updateGeometry();

    renderer.render(
      scene,
      camera
    );

    animationFrame = requestAnimationFrame(
      animate
    );
  }


  /* ========================================================
     23 / ANIMATION CONTROL
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

    animationFrame = requestAnimationFrame(
      animate
    );
  }


  function stopAnimation() {

    if (animationFrame !== null) {

      cancelAnimationFrame(
        animationFrame
      );

      animationFrame = null;
    }

    lastFrameTime = null;
    accumulator = 0;
  }


  /* ========================================================
     24 / VISIBILITY OBSERVER
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
     25 / REDUCED MOTION
     ======================================================== */

  function handleMotionChange() {

    if (reducedMotion.matches) {

      stopAnimation();

      for (const point of points) {
        point.displacement = 0;
        point.velocity = 0;
      }

      updateGeometry();
      renderer.render(scene, camera);

    } else {

      startAnimation();
    }
  }

  reducedMotion.addEventListener(
    "change",
    handleMotionChange
  );


  /* ========================================================
     26 / PAGE VISIBILITY
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
     27 / RESIZE OBSERVER
     ======================================================== */

  if ("ResizeObserver" in window) {

    const observer = new ResizeObserver(
      resize
    );

    observer.observe(container);

  } else {

    window.addEventListener(
      "resize",
      resize,
      { passive: true }
    );
  }


  /* ========================================================
     28 / INITIALIZE
     ======================================================== */

  resize();

  updateGeometry();

  renderer.render(scene, camera);

  startAnimation();

  console.log(
    `3D topographic landscape initialized: ${points.length} particles.`
  );
}
