
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   CINEMATIC INTERACTIVE TOPOGRAPHIC CONTOURS

   File: assets/js/statistical-landscape.js
   Version: 6.0

   Features:
   - Fixed mathematical terrain
   - True elevation contours
   - Thicker, luminous contour lines
   - Orange elevation highlighting
   - Mouse/touch elevation selection
   - Slow cinematic camera flyover
   - Sharp foreground contours
   - Soft distant contour trails
   - Responsive rendering
   - Reduced-motion support
   - Pause when off-screen

   Three.js 0.160.1
   GitHub Pages compatible
   ========================================================== */

import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

import { Line2 } from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/lines/Line2.js";

import { LineGeometry } from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/lines/LineGeometry.js";

import { LineMaterial } from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/lines/LineMaterial.js";


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
   02 / MAIN
   ========================================================== */

function initializeLandscape() {

  /* ========================================================
     03 / SETTINGS
     ======================================================== */

  const SETTINGS = {

    background: 0x0180a5,

    worldWidth: 24,
    worldDepth: 15,

    desktopResolution: 150,
    tabletResolution: 110,
    mobileResolution: 75,

    desktopContours: 28,
    tabletContours: 21,
    mobileContours: 15,

    contourOffset: 0.035,

    /*
     * Line appearance.
     *
     * LineMaterial linewidth is measured in pixels
     * when worldUnits is false.
     */

    foregroundLineWidth: 2.6,
    backgroundLineWidth: 1.5,

    glowLineWidth: 7.0,
    trailLineWidth: 5.0,

    highlightColor: 0xff9345,

    highlightWidth: 0.85,
    highlightResponse: 0.13,

    /*
     * Camera movement.
     *
     * Units per second.
     */

    flyoverSpeed: 0.16,
    flyoverDistance: 1.6,

    cameraSway: 0.18,
    cameraSwaySpeed: 0.16,

    /*
     * Depth treatment.
     */

    nearOpacity: 0.95,
    farOpacity: 0.28,

    glowOpacity: 0.12,
    trailOpacity: 0.075,

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

  let contourLines = [];

  let targetElevation = 0.5;
  let currentElevation = 0.5;

  let animationFrame = null;
  let lastFrameTime = null;

  let elapsedTime = 0;

  let isSectionVisible = true;

  let resolution = 0;
  let contourCount = 0;

  let viewportWidth = 1;
  let viewportHeight = 1;

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

  const cameraBase = new THREE.Vector3(
    0,
    8,
    18
  );

  camera.position.copy(cameraBase);
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
     10 / RESPONSIVE DIMENSIONS
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
     ======================================================== */

  function extractContourSegments(terrain, elevation) {

    const segments = [];

    const { heights, stepX, stepZ } = terrain;

    const halfWidth = SETTINGS.worldWidth / 2;
    const halfDepth = SETTINGS.worldDepth / 2;

    function interpolate(x1, z1, h1, x2, z2, h2) {

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

        const x0 = -halfWidth + col * stepX;
        const x1 = x0 + stepX;

        const z0 = -halfDepth + row * stepZ;
        const z1 = z0 + stepZ;

        const A = heights[row][col];
        const B = heights[row][col + 1];
        const C = heights[row + 1][col + 1];
        const D = heights[row + 1][col];

        const intersections = [];

        if ((A < elevation) !== (B < elevation)) {
          intersections.push(
            interpolate(x0, z0, A, x1, z0, B)
          );
        }

        if ((B < elevation) !== (C < elevation)) {
          intersections.push(
            interpolate(x1, z0, B, x1, z1, C)
          );
        }

        if ((C < elevation) !== (D < elevation)) {
          intersections.push(
            interpolate(x1, z1, C, x0, z1, D)
          );
        }

        if ((D < elevation) !== (A < elevation)) {
          intersections.push(
            interpolate(x0, z1, D, x0, z0, A)
          );
        }

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
     13 / COLOURS
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
     14 / LINE MATERIAL HELPER
     ======================================================== */

  function createLineMaterial(
    color,
    width,
    opacity
  ) {

    return new LineMaterial({
      color,
      linewidth: width,
      worldUnits: false,
      transparent: true,
      opacity,
      depthWrite: false,
      resolution: new THREE.Vector2(
        viewportWidth,
        viewportHeight
      )
    });
  }


  /* ========================================================
     15 / CLEAR CONTOURS
     ======================================================== */

  function clearContours() {

    for (const contour of contourLines) {

      for (const object of contour.objects) {
        scene.remove(object);
        object.geometry.dispose();
        object.material.dispose();
      }
    }

    contourLines = [];
  }


  /* ========================================================
     16 / BUILD CONTOURS
     ======================================================== */

  function buildContours() {

    clearContours();

    const terrain = sampleTerrain();

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

      const segments =
        extractContourSegments(
          terrain,
          elevation
        );

      /*
       * Line2 expects connected paths, not a flat
       * list of unrelated marching-squares segments.

       * For this initial implementation, each segment
       * is constructed independently.
       */

      const objects = [];

      const baseColor =
        baseColors[i % baseColors.length].clone();


      for (const segment of segments) {

        const [start, end] = segment;

        const positions = [
          start[0],
          elevation + SETTINGS.contourOffset,
          start[1],

          end[0],
          elevation + SETTINGS.contourOffset,
          end[1]
        ];


        /* ----------------------------------------------------
           Main contour
           ---------------------------------------------------- */

        const mainGeometry = new LineGeometry();
        mainGeometry.setPositions(positions);

        const mainMaterial = createLineMaterial(
          baseColor,
          SETTINGS.foregroundLineWidth,
          SETTINGS.nearOpacity
        );

        const mainLine = new Line2(
          mainGeometry,
          mainMaterial
        );

        mainLine.frustumCulled = false;

        scene.add(mainLine);
        objects.push(mainLine);


        /* ----------------------------------------------------
           Glow layer
           ---------------------------------------------------- */

        const glowGeometry = new LineGeometry();
        glowGeometry.setPositions(positions);

        const glowMaterial = createLineMaterial(
          baseColor,
          SETTINGS.glowLineWidth,
          SETTINGS.glowOpacity
        );

        const glowLine = new Line2(
          glowGeometry,
          glowMaterial
        );

        glowLine.frustumCulled = false;

        scene.add(glowLine);
        objects.push(glowLine);


        /* ----------------------------------------------------
           Distant motion trail

           Slightly offset in world depth and elevation.
           ---------------------------------------------------- */

        const trailPositions = [
          start[0],
          elevation + SETTINGS.contourOffset - 0.035,
          start[1] - 0.08,

          end[0],
          elevation + SETTINGS.contourOffset - 0.035,
          end[1] - 0.08
        ];

        const trailGeometry = new LineGeometry();
        trailGeometry.setPositions(trailPositions);

        const trailMaterial = createLineMaterial(
          baseColor,
          SETTINGS.trailLineWidth,
          SETTINGS.trailOpacity
        );

        const trailLine = new Line2(
          trailGeometry,
          trailMaterial
        );

        trailLine.frustumCulled = false;

        scene.add(trailLine);
        objects.push(trailLine);
      }

      contourLines.push({
        objects,
        baseColor,
        normalized,
        elevation
      });
    }

    updateHighlight(true);
  }


  /* ========================================================
     17 / HIGHLIGHT ELEVATION
     ======================================================== */

  function updateHighlight(immediate = false) {

    if (immediate) {
      currentElevation = targetElevation;
    }

    const width =
      SETTINGS.highlightWidth /
      Math.max(1, contourCount);

    for (const contour of contourLines) {

      const distance =
        Math.abs(
          contour.normalized - currentElevation
        );

      const influence = Math.exp(
        -(distance * distance) /
        (2 * width * width)
      );

      const activeColor =
        contour.baseColor.clone().lerp(
          orange,
          influence
        );

      for (let i = 0; i < contour.objects.length; i++) {

        const object = contour.objects[i];

        object.material.color.copy(activeColor);

        if (i % 3 === 0) {

          object.material.opacity =
            THREE.MathUtils.lerp(
              SETTINGS.nearOpacity,
              1,
              influence
            );

        } else if (i % 3 === 1) {

          object.material.opacity =
            SETTINGS.glowOpacity +
            influence * 0.12;

        } else {

          object.material.opacity =
            SETTINGS.trailOpacity;
        }
      }
    }
  }


  /* ========================================================
     18 / POINTER INTERACTION
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
     19 / CAMERA FLYOVER
     ======================================================== */

  function updateCamera(deltaSeconds) {

    if (reducedMotion.matches) return;

    elapsedTime += deltaSeconds;

    /*
     * Slowly travel forward and backward across
     * the topographic surface.

     * A bounded path avoids the camera eventually
     * leaving the terrain.
     */

    const forward =
      Math.sin(
        elapsedTime * SETTINGS.flyoverSpeed
      ) *
      SETTINGS.flyoverDistance;

    const sway =
      Math.sin(
        elapsedTime * SETTINGS.cameraSwaySpeed
      ) *
      SETTINGS.cameraSway;

    camera.position.set(
      cameraBase.x + sway,
      cameraBase.y,
      cameraBase.z - forward
    );

    camera.lookAt(
      sway * 0.3,
      0.7,
      -forward * 0.3
    );
  }


  /* ========================================================
     20 / RESIZE
     ======================================================== */

  let currentDimensions = "";

  function resize() {

    const rect =
      container.getBoundingClientRect();

    viewportWidth = Math.max(1, rect.width);
    viewportHeight = Math.max(1, rect.height);

    camera.aspect =
      viewportWidth / viewportHeight;

    const aspect =
      viewportWidth / viewportHeight;

    if (aspect < 0.8) {
      cameraBase.set(0, 11, 25);
    } else if (aspect < 1.4) {
      cameraBase.set(0, 9.5, 21);
    } else {
      cameraBase.set(0, 8, 18);
    }

    camera.position.copy(cameraBase);
    camera.lookAt(0, 0.7, 0);
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxPixelRatio
      )
    );

    renderer.setSize(
      viewportWidth,
      viewportHeight,
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

    /*
     * Update LineMaterial resolutions after resize.
     */

    for (const contour of contourLines) {

      for (const object of contour.objects) {

        object.material.resolution.set(
          viewportWidth,
          viewportHeight
        );
      }
    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     21 / ANIMATION
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

    const deltaSeconds =
      Math.min(
        0.05,
        Math.max(
          0,
          (timestamp - lastFrameTime) / 1000
        )
      );

    lastFrameTime = timestamp;

    /*
     * Smooth highlight transitions.
     */

    if (reducedMotion.matches) {

      currentElevation = targetElevation;

    } else {

      const response =
        1 - Math.pow(
          1 - SETTINGS.highlightResponse,
          deltaSeconds * 60
        );

      currentElevation +=
        (targetElevation - currentElevation) *
        response;
    }

    updateHighlight();

    /*
     * Cinematic camera movement.
     */

    updateCamera(deltaSeconds);

    renderer.render(scene, camera);

    animationFrame = requestAnimationFrame(animate);
  }


  /* ========================================================
     22 / ANIMATION CONTROL
     ======================================================== */

  function startAnimation() {

    if (
      animationFrame !== null ||
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
     23 / VISIBILITY OBSERVER
     ======================================================== */

  const visibilityObserver =
    new IntersectionObserver(
      entries => {

        isSectionVisible =
          entries[0].isIntersecting;

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
     24 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {

        elapsedTime = 0;

        camera.position.copy(cameraBase);
        camera.lookAt(0, 0.7, 0);

        currentElevation = targetElevation;

        updateHighlight(true);
        renderer.render(scene, camera);
      }
    }
  );


  /* ========================================================
     25 / PAGE VISIBILITY
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
     26 / RESIZE OBSERVER
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
     27 / INITIALIZE
     ======================================================== */

  resize();
  startAnimation();

  console.log(
    `Cinematic topographic landscape initialized: ${contourCount} contour levels.`
  );
}
