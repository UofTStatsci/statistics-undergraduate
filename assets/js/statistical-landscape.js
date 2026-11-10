
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   INTERACTIVE TOPOGRAPHIC LANDSCAPE

   File: assets/js/statistical-landscape.js
   Version: 8.0

   Improvements:
   - Reduced vertical exaggeration
   - More balanced camera perspective
   - Automatic terrain framing
   - Peaks remain inside the viewport
   - Irregular ridges and valleys preserved
   - Crisp, thick contour lines
   - Orange elevation highlighting
   - Slow cinematic camera movement
   - No motion blur
   - Responsive desktop and mobile
   - Reduced-motion support

   Requires Three.js 0.160.1 and import map.
   ========================================================== */

import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

import { LineSegments2 } from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/lines/LineSegments2.js";

import { LineSegmentsGeometry } from
  "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/lines/LineSegmentsGeometry.js";

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
   02 / INITIALIZE
   ========================================================== */

function initializeLandscape() {

  /* ========================================================
     03 / SETTINGS
     ======================================================== */

  const SETTINGS = {

    background: 0x0180a5,

    /* Terrain */

    worldWidth: 34,
    worldDepth: 24,

    verticalScale: 0.95,

    /* Sampling */

    desktopResolution: 190,
    tabletResolution: 135,
    mobileResolution: 90,

    /* Elevation contours */

    desktopContours: 38,
    tabletContours: 28,
    mobileContours: 19,

    contourOffset: 0.035,

    /* Lines */

    lineWidth: 2.5,
    mobileLineWidth: 1.8,

    /* Highlight */

    highlightColor: 0xff9345,
    highlightWidth: 0.8,
    highlightResponse: 0.15,

    /* Camera */

    cameraFov: 48,

    /*
     * Fraction of the available viewport occupied
     * by the automatically framed landscape.

     * Smaller values create more breathing room.
     */

    frameMargin: 0.82,

    /*
     * Slow ambient movement.
     */

    flyoverSpeed: 0.13,
    flyoverDistance: 0.65,

    cameraSway: 0.20,
    cameraSwaySpeed: 0.11,

    /* Rendering */

    maxPixelRatio: 2

  };


  /* ========================================================
     04 / COVER POSITIONING
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

  let targetElevation = 0.48;
  let currentElevation = 0.48;

  let resolution = 0;
  let contourCount = 0;

  let viewportWidth = 1;
  let viewportHeight = 1;

  let animationFrame = null;
  let lastFrameTime = null;

  let elapsedTime = 0;

  let isSectionVisible = true;
  let currentDimensions = "";

  let terrainBounds = null;

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
    SETTINGS.cameraFov,
    1,
    0.1,
    250
  );

  const cameraBase = new THREE.Vector3(
    0,
    9,
    23
  );

  const cameraTarget = new THREE.Vector3(
    0,
    2.5,
    0
  );

  const cameraDirection = new THREE.Vector3();

  camera.position.copy(cameraBase);
  camera.lookAt(cameraTarget);


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
      "Topographic landscape: WebGL unavailable.",
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
     09 / TERRAIN HELPERS
     ======================================================== */

  function gaussian(
    x, z,
    centerX, centerZ,
    widthX, widthZ,
    height
  ) {

    const dx = (x - centerX) / widthX;
    const dz = (z - centerZ) / widthZ;

    return height * Math.exp(
      -(dx * dx + dz * dz)
    );
  }


  function ridge(
    x, z,
    centerX, centerZ,
    angle,
    length, width,
    height
  ) {

    const dx = x - centerX;
    const dz = z - centerZ;

    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    const along =
      dx * cosine + dz * sine;

    const across =
      -dx * sine + dz * cosine;

    return height * Math.exp(
      -(
        (along * along) / (length * length) +
        (across * across) / (width * width)
      )
    );
  }


  /* ========================================================
     10 / ASYMMETRIC TERRAIN

     The same irregular mountain formations as Version 7,
     with reduced vertical exaggeration.

     The geometry remains stationary.
     ======================================================== */

  function terrainHeight(x, z) {

    const warpedX =
      x +
      1.35 * Math.sin(z * 0.43 + x * 0.12) +
      0.55 * Math.sin(z * 1.1);

    const warpedZ =
      z +
      1.15 * Math.cos(x * 0.31) +
      0.45 * Math.sin(x * 0.9 + z * 0.2);


    /* Major ridges */

    const mountainOne = ridge(
      warpedX, warpedZ,
      -10, -3,
      0.45, 7.2, 1.8, 5.8
    );

    const mountainTwo = ridge(
      warpedX, warpedZ,
      -3, -7,
      -0.35, 5.5, 1.4, 7.4
    );

    const mountainThree = ridge(
      warpedX, warpedZ,
      5, -1.5,
      0.85, 6.8, 1.65, 8.6
    );

    const mountainFour = ridge(
      warpedX, warpedZ,
      12, -5,
      -0.55, 4.6, 1.25, 6.9
    );


    /* Secondary peaks */

    const peakOne = gaussian(
      warpedX, warpedZ,
      -13, 4,
      2.2, 1.8, 4.1
    );

    const peakTwo = gaussian(
      warpedX, warpedZ,
      -5, 3,
      1.7, 2.1, 5.4
    );

    const peakThree = gaussian(
      warpedX, warpedZ,
      1, -9,
      1.5, 1.8, 4.9
    );

    const peakFour = gaussian(
      warpedX, warpedZ,
      10, 5,
      2.1, 1.6, 5.6
    );

    const peakFive = gaussian(
      warpedX, warpedZ,
      15, 1,
      1.5, 2.2, 4.4
    );


    /* Valleys */

    const valleyOne = ridge(
      warpedX, warpedZ,
      -7, -1,
      -0.4, 8, 0.85, -3.8
    );

    const valleyTwo = ridge(
      warpedX, warpedZ,
      3, 4,
      0.65, 7, 1.1, -4.6
    );

    const valleyThree = ridge(
      warpedX, warpedZ,
      11, -1,
      -0.8, 5, 0.75, -3.5
    );


    /* Fine irregularities */

    const fineVariation =
      0.35 * Math.sin(
        warpedX * 0.85 +
        warpedZ * 0.48
      ) +

      0.24 * Math.cos(
        warpedX * 1.35 -
        warpedZ * 0.72
      ) +

      0.15 * Math.sin(
        warpedX * 2.1 +
        warpedZ * 1.4
      );


    const elevation =
      mountainOne +
      mountainTwo +
      mountainThree +
      mountainFour +

      peakOne +
      peakTwo +
      peakThree +
      peakFour +
      peakFive +

      valleyOne +
      valleyTwo +
      valleyThree +

      fineVariation;


    return Math.max(
      0,
      elevation * SETTINGS.verticalScale
    );
  }


  /* ========================================================
     11 / RESPONSIVE DIMENSIONS
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
     12 / SAMPLE TERRAIN
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
     13 / MARCHING SQUARES
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

        const x0 = -halfWidth + col * stepX;
        const x1 = x0 + stepX;

        const z0 = -halfDepth + row * stepZ;
        const z1 = z0 + stepZ;

        const A = heights[row][col];
        const B = heights[row][col + 1];
        const C = heights[row + 1][col + 1];
        const D = heights[row + 1][col];

        const edges = [];

        if ((A < elevation) !== (B < elevation)) {

          edges.push({
            edge: 0,
            point: interpolate(
              x0, z0, A,
              x1, z0, B
            )
          });
        }

        if ((B < elevation) !== (C < elevation)) {

          edges.push({
            edge: 1,
            point: interpolate(
              x1, z0, B,
              x1, z1, C
            )
          });
        }

        if ((C < elevation) !== (D < elevation)) {

          edges.push({
            edge: 2,
            point: interpolate(
              x1, z1, C,
              x0, z1, D
            )
          });
        }

        if ((D < elevation) !== (A < elevation)) {

          edges.push({
            edge: 3,
            point: interpolate(
              x0, z1, D,
              x0, z0, A
            )
          });
        }

        if (edges.length === 2) {

          segments.push([
            edges[0].point,
            edges[1].point
          ]);

        } else if (edges.length === 4) {

          const center =
            (A + B + C + D) / 4;

          const byEdge = new Map(
            edges.map(item => [
              item.edge,
              item.point
            ])
          );

          const pairs = center >= elevation
            ? [[0, 1], [2, 3]]
            : [[0, 3], [1, 2]];

          for (const pair of pairs) {

            segments.push([
              byEdge.get(pair[0]),
              byEdge.get(pair[1])
            ]);
          }
        }
      }
    }

    return segments;
  }


  /* ========================================================
     14 / COLOURS
     ======================================================== */

  const baseColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xd4f5ff),
    new THREE.Color(0x86e3f5),
    new THREE.Color(0x56cde8)
  ];

  const orange = new THREE.Color(
    SETTINGS.highlightColor
  );


  /* ========================================================
     15 / LINE MATERIAL
     ======================================================== */

  function createLineMaterial(
    color,
    opacity
  ) {

    const isMobile =
      window.innerWidth <= 800;

    return new LineMaterial({

      color,

      linewidth: isMobile
        ? SETTINGS.mobileLineWidth
        : SETTINGS.lineWidth,

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
     16 / CLEAR CONTOURS
     ======================================================== */

  function clearContours() {

    for (const contour of contourLines) {

      scene.remove(contour.line);

      contour.line.geometry.dispose();
      contour.material.dispose();
    }

    contourLines = [];
  }


  /* ========================================================
     17 / BUILD CONTOURS
     ======================================================== */

  function buildContours() {

    clearContours();

    const terrain = sampleTerrain();

    const minimum =
      terrain.minimum +
      (terrain.maximum - terrain.minimum) * 0.025;

    const maximum =
      terrain.minimum +
      (terrain.maximum - terrain.minimum) * 0.965;


    /* ------------------------------------------------------
       Save terrain bounds for automatic camera framing.
       ------------------------------------------------------ */

    terrainBounds = new THREE.Box3(
      new THREE.Vector3(
        -SETTINGS.worldWidth / 2,
        terrain.minimum,
        -SETTINGS.worldDepth / 2
      ),
      new THREE.Vector3(
        SETTINGS.worldWidth / 2,
        terrain.maximum,
        SETTINGS.worldDepth / 2
      )
    );


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

      if (!positions.length) continue;

      const geometry =
        new LineSegmentsGeometry();

      geometry.setPositions(positions);

      const baseColor =
        baseColors[i % baseColors.length].clone();

      const material =
        createLineMaterial(
          baseColor,
          0.85
        );

      const line =
        new LineSegments2(
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
     18 / AUTOMATIC CAMERA FRAMING

     Determine a safe camera distance using the actual
     sampled terrain bounds.

     All eight bounding-box corners must fit inside
     the viewport with a margin.

     The flyover is included in the framing allowance.
     ======================================================== */

  function frameTerrain() {

    if (!terrainBounds) return;

    const center = terrainBounds.getCenter(
      new THREE.Vector3()
    );

    cameraTarget.copy(center);

    /*
     * Camera direction maintains a moderately elevated
     * perspective without returning to the old top-down
     * view.
     */

    const aspect = viewportWidth / viewportHeight;

    if (aspect < 0.8) {

      cameraDirection.set(0, 0.48, 1);

    } else if (aspect < 1.4) {

      cameraDirection.set(0, 0.40, 1);

    } else {

      cameraDirection.set(0, 0.34, 1);
    }

    cameraDirection.normalize();

    const corners = [];

    for (const x of [
      terrainBounds.min.x,
      terrainBounds.max.x
    ]) {

      for (const y of [
        terrainBounds.min.y,
        terrainBounds.max.y
      ]) {

        for (const z of [
          terrainBounds.min.z,
          terrainBounds.max.z
        ]) {

          corners.push(
            new THREE.Vector3(x, y, z)
          );
        }
      }
    }

    const margin = SETTINGS.frameMargin;

    /*
     * Test whether every bounding-box corner is inside
     * the desired screen-space margin.
     */

    function fitsAtDistance(distance) {

      camera.position.copy(
        cameraTarget
      ).addScaledVector(
        cameraDirection,
        distance
      );

      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld();

      for (const corner of corners) {

        const projected = corner.clone().project(camera);

        if (
          !Number.isFinite(projected.x) ||
          !Number.isFinite(projected.y) ||
          !Number.isFinite(projected.z) ||
          Math.abs(projected.x) > margin ||
          Math.abs(projected.y) > margin ||
          projected.z >= 1 ||
          projected.z <= -1
        ) {
          return false;
        }
      }

      return true;
    }

    /*
     * Binary search for the nearest safe camera position.
     */

    let near = 1;
    let far = 200;

    for (let i = 0; i < 32; i++) {

      const middle = (near + far) / 2;

      if (fitsAtDistance(middle)) {
        far = middle;
      } else {
        near = middle;
      }
    }

    /*
     * Additional room for camera flyover.
     */

    const safeDistance =
      far + SETTINGS.flyoverDistance * 1.5;

    cameraBase.copy(cameraTarget)
      .addScaledVector(
        cameraDirection,
        safeDistance
      );

    camera.position.copy(cameraBase);
    camera.lookAt(cameraTarget);

    camera.updateMatrixWorld();
  }


  /* ========================================================
     19 / ORANGE ELEVATION HIGHLIGHT
     ======================================================== */

  function updateHighlight(
    immediate = false
  ) {

    if (immediate) {
      currentElevation = targetElevation;
    }

    const width =
      SETTINGS.highlightWidth /
      Math.max(1, contourCount);

    for (const contour of contourLines) {

      const distance =
        Math.abs(
          contour.normalized -
          currentElevation
        );

      const influence = Math.exp(
        -(distance * distance) /
        (2 * width * width)
      );

      contour.material.color
        .copy(contour.baseColor)
        .lerp(
          orange,
          influence
        );

      contour.material.opacity =
        0.82 + influence * 0.18;
    }
  }


  /* ========================================================
     20 / POINTER INTERACTION
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
     21 / CAMERA FLYOVER

     Camera moves gently toward and away from the terrain.

     The terrain geometry remains stationary.
     ======================================================== */

  function updateCamera(deltaSeconds) {

    if (reducedMotion.matches) return;

    elapsedTime += deltaSeconds;

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

    camera.position.copy(cameraBase);

    camera.position.z -= forward;
    camera.position.x += sway;

    camera.lookAt(
      cameraTarget.x + sway * 0.2,
      cameraTarget.y,
      cameraTarget.z
    );
  }


  /* ========================================================
     22 / RESIZE
     ======================================================== */

  function resize() {

    const rect =
      container.getBoundingClientRect();

    viewportWidth =
      Math.max(1, rect.width);

    viewportHeight =
      Math.max(1, rect.height);

    camera.aspect =
      viewportWidth / viewportHeight;

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
     * Reframe whenever viewport dimensions change.
     */

    frameTerrain();

    for (const contour of contourLines) {

      contour.material.resolution.set(
        viewportWidth,
        viewportHeight
      );
    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     23 / ANIMATION
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


    /* Highlight */

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


    /* Camera */

    updateCamera(deltaSeconds);


    /* Render */

    renderer.render(
      scene,
      camera
    );

    animationFrame =
      requestAnimationFrame(animate);
  }


  /* ========================================================
     24 / ANIMATION CONTROL
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

    animationFrame =
      requestAnimationFrame(animate);
  }


  function stopAnimation() {

    if (animationFrame !== null) {

      cancelAnimationFrame(
        animationFrame
      );

      animationFrame = null;
    }

    lastFrameTime = null;
  }


  /* ========================================================
     25 / VISIBILITY OBSERVER
     ======================================================== */

  if ("IntersectionObserver" in window) {

    const observer =
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

    observer.observe(cover);
  }


  /* ========================================================
     26 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {

        stopAnimation();

        camera.position.copy(cameraBase);
        camera.lookAt(cameraTarget);

        updateHighlight(true);
        renderer.render(scene, camera);

      } else {

        startAnimation();
      }
    }
  );


  /* ========================================================
     27 / PAGE VISIBILITY
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
     28 / RESIZE OBSERVER
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
     29 / INITIALIZE
     ======================================================== */

  resize();

  updateHighlight(true);

  renderer.render(
    scene,
    camera
  );

  startAnimation();

  console.log(
    `Topographic landscape v8 initialized: ${contourLines.length} elevation levels.`
  );
}
