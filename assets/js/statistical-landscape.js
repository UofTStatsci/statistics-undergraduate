
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE 3D STATISTICAL LANDSCAPE

   File: assets/js/statistical-landscape.js
   Version: 1.0

   Features:
   - Three-dimensional statistical surface
   - X/Y grid with vertical data stems
   - White spherical data points
   - Perspective projection
   - Ambient rotation
   - Mouse-responsive camera movement
   - Drag-to-rotate
   - Inertial momentum
   - Responsive rendering
   - Reduced-motion support

   No build system required.
   Three.js loaded from CDN.
   ========================================================== */


/* ==========================================================
   01 / IMPORT THREE.JS
   ========================================================== */

import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";


/* ==========================================================
   02 / INITIALIZE
   ========================================================== */

const container = document.getElementById(
  "statistical-landscape"
);

if (!container) {
  console.warn(
    "Statistical landscape: container not found."
  );
} else {
  initializeLandscape();
}


/* ==========================================================
   03 / MAIN FUNCTION
   ========================================================== */

function initializeLandscape() {

  /* --------------------------------------------------------
     Configuration
     -------------------------------------------------------- */

  const SETTINGS = {
    background: 0x0180a5,

    gridColor: 0xffffff,
    stemColor: 0xffffff,
    pointColor: 0xffffff,

    gridOpacity: 0.30,
    stemOpacity: 0.46,

    desktopGridSize: 13,
    tabletGridSize: 11,
    mobileGridSize: 8,

    gridSpacing: 0.48,

    maximumHeight: 3.2,

    pointRadius: 0.085,

    autoRotateSpeed: 0.11,

    dragSensitivity: 0.006,

    momentumFriction: 0.94,
    momentumMinimum: 0.00008,
    maximumMomentum: 0.055,

    pointerTiltStrength: 0.075,

    maxPixelRatio: 2
  };


  /* ========================================================
     04 / STATE
     ======================================================== */

  let width = 1;
  let height = 1;

  let isDragging = false;
  let isVisible = true;

  let momentumX = 0;
  let momentumY = 0;

  let pointerX = 0;
  let pointerY = 0;

  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastPointerTime = 0;

  let lastFrameTime = null;

  let animationFrame = null;

  let gridSize = 0;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );


  /* ========================================================
     05 / THREE.JS SCENE
     ======================================================== */

  const scene = new THREE.Scene();

  /*
   * Transparent background allows the U of T blue
   * cover background to show through.
   */

  scene.background = null;


  /* ========================================================
     06 / CAMERA
     ======================================================== */

  const camera = new THREE.PerspectiveCamera(
    35,
    1,
    0.1,
    100
  );

  camera.position.set(
    8,
    7,
    10
  );

  camera.lookAt(
    0,
    1.1,
    0
  );


  /* ========================================================
     07 / RENDERER
     ======================================================== */

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      SETTINGS.maxPixelRatio
    )
  );

  renderer.setClearColor(
    SETTINGS.background,
    0
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  container.appendChild(
    renderer.domElement
  );


  /* ========================================================
     08 / LIGHTING
     ======================================================== */

  const ambientLight = new THREE.AmbientLight(
    0xffffff,
    1.7
  );

  scene.add(
    ambientLight
  );


  const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    2.4
  );

  directionalLight.position.set(
    5,
    9,
    7
  );

  scene.add(
    directionalLight
  );


  /* ========================================================
     09 / ROTATING GROUP
     ======================================================== */

  /*
   * All statistical geometry lives inside one group.

   * Rotating this group rotates the entire chart
   * without changing the camera position.
   */

  const landscapeGroup = new THREE.Group();

  scene.add(
    landscapeGroup
  );


  /* ========================================================
     10 / GRID SIZE
     ======================================================== */

  function getGridSize() {
    const viewportWidth = window.innerWidth;

    if (viewportWidth <= 800) {
      return SETTINGS.mobileGridSize;
    }

    if (viewportWidth <= 1200) {
      return SETTINGS.tabletGridSize;
    }

    return SETTINGS.desktopGridSize;
  }


  /* ========================================================
     11 / STATISTICAL FUNCTION
     ======================================================== */

  /*
   * The data heights represent a smooth statistical
   * landscape with two overlapping peaks.

   * This produces a visually interesting surface
   * rather than a perfectly symmetrical bell curve.

   * It is an illustrative function, not real data.
   */

  function statisticalHeight(x, z) {

    const peakOne =
      2.5 *
      Math.exp(
        -(
          Math.pow(x + 0.9, 2) / 3.5 +
          Math.pow(z - 0.3, 2) / 2.2
        )
      );

    const peakTwo =
      1.6 *
      Math.exp(
        -(
          Math.pow(x - 1.3, 2) / 1.8 +
          Math.pow(z + 1.1, 2) / 2.8
        )
      );

    const variation =
      0.12 *
      Math.sin(x * 2.1) *
      Math.cos(z * 1.7);

    return Math.max(
      0.12,
      Math.min(
        SETTINGS.maximumHeight,
        peakOne + peakTwo + variation
      )
    );
  }


  /* ========================================================
     12 / CLEAR GEOMETRY
     ======================================================== */

  function clearLandscape() {

    while (landscapeGroup.children.length) {

      const child =
        landscapeGroup.children[0];

      landscapeGroup.remove(
        child
      );

      child.traverse(object => {

        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {

          const materials = Array.isArray(
            object.material
          )
            ? object.material
            : [object.material];

          materials.forEach(material => {
            material.dispose();
          });
        }

      });
    }
  }


  /* ========================================================
     13 / CREATE GRID
     ======================================================== */

  function createGrid(size) {

    const spacing =
      SETTINGS.gridSpacing;

    const totalSize =
      (size - 1) * spacing;

    const halfSize =
      totalSize / 2;

    const gridMaterial =
      new THREE.LineBasicMaterial({
        color: SETTINGS.gridColor,
        transparent: true,
        opacity: SETTINGS.gridOpacity,
        depthWrite: false
      });

    const gridPoints = [];

    for (let i = 0; i < size; i++) {

      const position =
        -halfSize + i * spacing;

      /*
       * Lines parallel to X axis.
       */

      gridPoints.push(
        -halfSize, 0, position,
        halfSize, 0, position
      );

      /*
       * Lines parallel to Z axis.
       */

      gridPoints.push(
        position, 0, -halfSize,
        position, 0, halfSize
      );
    }

    const geometry =
      new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        gridPoints,
        3
      )
    );

    const grid =
      new THREE.LineSegments(
        geometry,
        gridMaterial
      );

    landscapeGroup.add(
      grid
    );
  }


  /* ========================================================
     14 / CREATE STEMS AND POINTS
     ======================================================== */

  function createObservations(size) {

    const spacing =
      SETTINGS.gridSpacing;

    const totalSize =
      (size - 1) * spacing;

    const halfSize =
      totalSize / 2;


    /* ------------------------------------------------------
       Stem material
       ------------------------------------------------------ */

    const stemMaterial =
      new THREE.LineBasicMaterial({
        color: SETTINGS.stemColor,
        transparent: true,
        opacity: SETTINGS.stemOpacity,
        depthWrite: false
      });


    /* ------------------------------------------------------
       Point material
       ------------------------------------------------------ */

    const pointMaterial =
      new THREE.MeshStandardMaterial({
        color: SETTINGS.pointColor,
        roughness: 0.35,
        metalness: 0.0
      });


    /* ------------------------------------------------------
       Shared sphere geometry
       ------------------------------------------------------ */

    const sphereGeometry =
      new THREE.SphereGeometry(
        SETTINGS.pointRadius,
        12,
        10
      );


    /* ------------------------------------------------------
       Instanced spheres for performance
       ------------------------------------------------------ */

    const observationCount =
      size * size;

    const spheres =
      new THREE.InstancedMesh(
        sphereGeometry,
        pointMaterial,
        observationCount
      );

    const dummy =
      new THREE.Object3D();

    const stemPositions =
      [];

    let index = 0;


    /* ------------------------------------------------------
       Populate observations
       ------------------------------------------------------ */

    for (let xIndex = 0; xIndex < size; xIndex++) {

      for (let zIndex = 0; zIndex < size; zIndex++) {

        const x =
          -halfSize + xIndex * spacing;

        const z =
          -halfSize + zIndex * spacing;

        const height =
          statisticalHeight(
            x,
            z
          );

        /*
         * Sphere position.
         */

        dummy.position.set(
          x,
          height,
          z
        );

        dummy.updateMatrix();

        spheres.setMatrixAt(
          index,
          dummy.matrix
        );


        /*
         * Vertical stem from grid to sphere.
         */

        stemPositions.push(
          x, 0, z,
          x, height, z
        );

        index++;
      }
    }

    spheres.instanceMatrix.needsUpdate =
      true;

    landscapeGroup.add(
      spheres
    );


    /* ------------------------------------------------------
       Create all stems as one line-segment geometry.
       ------------------------------------------------------ */

    const stemGeometry =
      new THREE.BufferGeometry();

    stemGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        stemPositions,
        3
      )
    );

    const stems =
      new THREE.LineSegments(
        stemGeometry,
        stemMaterial
      );

    landscapeGroup.add(
      stems
    );
  }


  /* ========================================================
     15 / BUILD LANDSCAPE
     ======================================================== */

  function buildLandscape() {

    const nextGridSize =
      getGridSize();

    if (
      gridSize === nextGridSize &&
      landscapeGroup.children.length
    ) {
      return;
    }

    gridSize =
      nextGridSize;

    clearLandscape();

    createGrid(
      gridSize
    );

    createObservations(
      gridSize
    );
  }


  /* ========================================================
     16 / RESIZE
     ======================================================== */

  function resize() {

    const rect =
      container.getBoundingClientRect();

    width =
      Math.max(
        1,
        rect.width
      );

    height =
      Math.max(
        1,
        rect.height
      );

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(
      width,
      height,
      false
    );

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxPixelRatio
      )
    );

    buildLandscape();

    renderer.render(
      scene,
      camera
    );
  }


  /* ========================================================
     17 / POINTER POSITION
     ======================================================== */

  function updatePointerPosition(event) {

    const rect =
      container.getBoundingClientRect();

    pointerX =
      (
        (event.clientX - rect.left) /
        Math.max(1, rect.width)
      ) * 2 - 1;

    pointerY =
      (
        (event.clientY - rect.top) /
        Math.max(1, rect.height)
      ) * 2 - 1;

    pointerX =
      THREE.MathUtils.clamp(
        pointerX,
        -1,
        1
      );

    pointerY =
      THREE.MathUtils.clamp(
        pointerY,
        -1,
        1
      );
  }


  /* ========================================================
     18 / POINTER DOWN
     ======================================================== */

  function pointerDown(event) {

    isDragging =
      true;

    /*
     * Immediately cancel existing momentum.
     */

    momentumX =
      0;

    momentumY =
      0;

    lastPointerX =
      event.clientX;

    lastPointerY =
      event.clientY;

    lastPointerTime =
      performance.now();

    container.setPointerCapture?.(
      event.pointerId
    );

    container.style.cursor =
      "grabbing";
  }


  /* ========================================================
     19 / POINTER MOVE
     ======================================================== */

  function pointerMove(event) {

    updatePointerPosition(
      event
    );

    if (!isDragging) {
      return;
    }

    const now =
      performance.now();

    const elapsed =
      Math.max(
        1,
        now - lastPointerTime
      );

    const dx =
      event.clientX - lastPointerX;

    const dy =
      event.clientY - lastPointerY;

    lastPointerX =
      event.clientX;

    lastPointerY =
      event.clientY;

    lastPointerTime =
      now;


    /* ------------------------------------------------------
       Direct rotation
       ------------------------------------------------------ */

    const deltaX =
      dx * SETTINGS.dragSensitivity;

    const deltaY =
      dy * SETTINGS.dragSensitivity;

    landscapeGroup.rotation.y +=
      deltaX;

    landscapeGroup.rotation.x +=
      deltaY;

    landscapeGroup.rotation.x =
      THREE.MathUtils.clamp(
        landscapeGroup.rotation.x,
        -0.65,
        0.65
      );


    /* ------------------------------------------------------
       Measure angular velocity
       ------------------------------------------------------ */

    const frameScale =
      (1000 / 60) / elapsed;

    const measuredX =
      deltaX * frameScale;

    const measuredY =
      deltaY * frameScale;

    momentumX =
      THREE.MathUtils.lerp(
        momentumX,
        measuredX,
        0.65
      );

    momentumY =
      THREE.MathUtils.lerp(
        momentumY,
        measuredY,
        0.65
      );

    momentumX =
      THREE.MathUtils.clamp(
        momentumX,
        -SETTINGS.maximumMomentum,
        SETTINGS.maximumMomentum
      );

    momentumY =
      THREE.MathUtils.clamp(
        momentumY,
        -SETTINGS.maximumMomentum,
        SETTINGS.maximumMomentum
      );
  }


  /* ========================================================
     20 / POINTER UP
     ======================================================== */

  function pointerUp(event) {

    if (!isDragging) {
      return;
    }

    isDragging =
      false;

    container.releasePointerCapture?.(
      event.pointerId
    );

    container.style.cursor =
      "grab";

    lastFrameTime =
      null;
  }


  /* ========================================================
     21 / ANIMATION
     ======================================================== */

  function animate(timestamp) {

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
    }

    const delta =
      Math.min(
        50,
        timestamp - lastFrameTime
      );

    lastFrameTime =
      timestamp;

    const frameScale =
      delta / (1000 / 60);


    /* ------------------------------------------------------
       Momentum
       ------------------------------------------------------ */

    if (!isDragging) {

      if (
        Math.abs(momentumX) >
        SETTINGS.momentumMinimum
      ) {

        landscapeGroup.rotation.y +=
          momentumX * frameScale;

        momentumX *=
          Math.pow(
            SETTINGS.momentumFriction,
            frameScale
          );

      } else {

        momentumX = 0;

        /*
         * Ambient rotation.
         */

        landscapeGroup.rotation.y +=
          SETTINGS.autoRotateSpeed *
          (delta / 1000);
      }


      if (
        Math.abs(momentumY) >
        SETTINGS.momentumMinimum
      ) {

        landscapeGroup.rotation.x +=
          momentumY * frameScale;

        momentumY *=
          Math.pow(
            SETTINGS.momentumFriction,
            frameScale
          );

      } else {

        momentumY = 0;
      }


      landscapeGroup.rotation.x =
        THREE.MathUtils.clamp(
          landscapeGroup.rotation.x,
          -0.65,
          0.65
        );
    }


    /* ------------------------------------------------------
       Subtle mouse-responsive tilt
       ------------------------------------------------------ */

    if (!isDragging) {

      const targetTiltX =
        -pointerY *
        SETTINGS.pointerTiltStrength;

      const targetTiltZ =
        -pointerX *
        SETTINGS.pointerTiltStrength;

      landscapeGroup.rotation.x +=
        (targetTiltX - landscapeGroup.rotation.x) *
        0.0025;

      landscapeGroup.rotation.z +=
        (targetTiltZ - landscapeGroup.rotation.z) *
        0.025;
    }


    renderer.render(
      scene,
      camera
    );

    animationFrame =
      requestAnimationFrame(
        animate
      );
  }


  /* ========================================================
     22 / VISIBILITY OBSERVER
     ======================================================== */

  function observeVisibility() {

    const cover =
      document.getElementById(
        "cover"
      );

    if (
      !cover ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

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
          threshold: 0.05
        }
      );

    observer.observe(
      cover
    );
  }


  /* ========================================================
     23 / ANIMATION CONTROL
     ======================================================== */

  function startAnimation() {

    if (
      animationFrame !== null ||
      reducedMotion.matches
    ) {
      return;
    }

    lastFrameTime =
      null;

    animationFrame =
      requestAnimationFrame(
        animate
      );
  }


  function stopAnimation() {

    if (
      animationFrame !== null
    ) {

      cancelAnimationFrame(
        animationFrame
      );

      animationFrame =
        null;
    }

    lastFrameTime =
      null;
  }


  /* ========================================================
     24 / EVENT LISTENERS
     ======================================================== */

  container.addEventListener(
    "pointerdown",
    pointerDown
  );

  container.addEventListener(
    "pointermove",
    pointerMove
  );

  container.addEventListener(
    "pointerup",
    pointerUp
  );

  container.addEventListener(
    "pointercancel",
    pointerUp
  );

  container.addEventListener(
    "pointerleave",
    () => {
      pointerX = 0;
      pointerY = 0;
    }
  );


  /* ========================================================
     25 / RESIZE OBSERVER
     ======================================================== */

  if (
    "ResizeObserver" in window
  ) {

    const resizeObserver =
      new ResizeObserver(
        resize
      );

    resizeObserver.observe(
      container
    );

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

  buildLandscape();

  resize();

  observeVisibility();

  if (
    !reducedMotion.matches
  ) {
    startAnimation();
  }

  console.log(
    "3D statistical landscape initialized."
  );
}
