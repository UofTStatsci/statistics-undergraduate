
/* ==========================================================
   UNIVERSITY OF TORONTO
   DEPARTMENT OF STATISTICAL SCIENCES

   UNDERGRADUATE DIGITAL BROCHURE

   DRAMATIC INTERACTIVE TOPOGRAPHIC LANDSCAPE

   File: assets/js/statistical-landscape.js
   Version: 7.0

   Features:
   - Dramatic asymmetric mountains and valleys
   - Sharp ridges and irregular formations
   - Low-angle cinematic perspective
   - Crisp, thick elevation contours
   - No motion blur or trailing lines
   - Orange elevation highlighting
   - Slow camera flyover
   - Stationary terrain geometry
   - Responsive rendering
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
   02 / MAIN
   ========================================================== */

function initializeLandscape() {

  /* ========================================================
     03 / SETTINGS
     ======================================================== */

  const SETTINGS = {

    background: 0x0180a5,

    /* Terrain dimensions */

    worldWidth: 34,
    worldDepth: 24,

    /* Sampling resolution */

    desktopResolution: 190,
    tabletResolution: 135,
    mobileResolution: 90,

    /* Number of elevation levels */

    desktopContours: 38,
    tabletContours: 28,
    mobileContours: 19,

    /* Vertical exaggeration */

    verticalScale: 1.45,

    /* Contour appearance */

    lineWidth: 2.5,
    mobileLineWidth: 1.8,

    contourOffset: 0.035,

    /* Orange elevation highlight */

    highlightColor: 0xff9345,
    highlightWidth: 0.8,
    highlightResponse: 0.15,

    /* Camera movement */

    flyoverSpeed: 0.13,
    flyoverDistance: 1.25,

    cameraSway: 0.35,
    cameraSwaySpeed: 0.11,

    /* Rendering */

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

     A low viewpoint creates a stronger sense of scale.

     The camera looks across the landscape rather than
     down at it from above.
     ======================================================== */

  const camera = new THREE.PerspectiveCamera(
    43,
    1,
    0.1,
    150
  );

  const cameraBase = new THREE.Vector3(
    0,
    5.4,
    17
  );

  const cameraTarget = new THREE.Vector3(
    0,
    2.3,
    -3.5
  );

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
     09 / MATHEMATICAL TERRAIN HELPERS
     ======================================================== */

  function gaussian(
    x,
    z,
    centerX,
    centerZ,
    widthX,
    widthZ,
    height
  ) {

    const dx = (x - centerX) / widthX;
    const dz = (z - centerZ) / widthZ;

    return height * Math.exp(
      -(dx * dx + dz * dz)
    );
  }


  /*
   * Rotated, elongated ridge.
   *
   * Unlike a circular Gaussian hill, this produces
   * directional formations resembling mountain ridges.
   */

  function ridge(
    x,
    z,
    centerX,
    centerZ,
    angle,
    length,
    width,
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
     10 / DRAMATIC ASYMMETRIC TERRAIN

     This surface combines:

     - Large elongated mountain ridges
     - Sharp secondary peaks
     - Narrow valleys
     - Coordinate warping
     - Smaller irregular formations

     The result is intentionally not symmetrical.
     ======================================================== */

  function terrainHeight(x, z) {

    /* ------------------------------------------------------
       Coordinate warping

       Warping prevents formations from appearing like
       perfectly symmetrical mathematical domes.
       ------------------------------------------------------ */

    const warpedX =
      x +
      1.35 * Math.sin(z * 0.43 + x * 0.12) +
      0.55 * Math.sin(z * 1.1);

    const warpedZ =
      z +
      1.15 * Math.cos(x * 0.31) +
      0.45 * Math.sin(x * 0.9 + z * 0.2);


    /* ------------------------------------------------------
       Major mountain formations
       ------------------------------------------------------ */

    const mountainOne = ridge(
      warpedX,
      warpedZ,
      -10,
      -3,
      0.45,
      7.2,
      1.8,
      5.8
    );

    const mountainTwo = ridge(
      warpedX,
      warpedZ,
      -3,
      -7,
      -0.35,
      5.5,
      1.4,
      7.4
    );

    const mountainThree = ridge(
      warpedX,
      warpedZ,
      5,
      -1.5,
      0.85,
      6.8,
      1.65,
      8.6
    );

    const mountainFour = ridge(
      warpedX,
      warpedZ,
      12,
      -5,
      -0.55,
      4.6,
      1.25,
      6.9
    );


    /* ------------------------------------------------------
       Smaller sharp peaks
       ------------------------------------------------------ */

    const peakOne = gaussian(
      warpedX,
      warpedZ,
      -13,
      4,
      2.2,
      1.8,
      4.1
    );

    const peakTwo = gaussian(
      warpedX,
      warpedZ,
      -5,
      3,
      1.7,
      2.1,
      5.4
    );

    const peakThree = gaussian(
      warpedX,
      warpedZ,
      1,
      -9,
      1.5,
      1.8,
      4.9
    );

    const peakFour = gaussian(
      warpedX,
      warpedZ,
      10,
      5,
      2.1,
      1.6,
      5.6
    );

    const peakFive = gaussian(
      warpedX,
      warpedZ,
      15,
      1,
      1.5,
      2.2,
      4.4
    );


    /* ------------------------------------------------------
       Deep valleys

       Negative formations carve channels between peaks.
       ------------------------------------------------------ */

    const valleyOne = ridge(
      warpedX,
      warpedZ,
      -7,
      -1,
      -0.4,
      8,
      0.85,
      -3.8
    );

    const valleyTwo = ridge(
      warpedX,
      warpedZ,
      3,
      4,
      0.65,
      7,
      1.1,
      -4.6
    );

    const valleyThree = ridge(
      warpedX,
      warpedZ,
      11,
      -1,
      -0.8,
      5,
      0.75,
      -3.5
    );


    /* ------------------------------------------------------
       Fine topographic variation

       Creates irregular slopes and smaller ridges.
       ------------------------------------------------------ */

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


    /* ------------------------------------------------------
       Combine formations
       ------------------------------------------------------ */

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

        const height =
          terrainHeight(x, z);

        values.push(height);

        minimum = Math.min(
          minimum,
          height
        );

        maximum = Math.max(
          maximum,
          height
        );
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

     Extracts fixed elevation contours from the terrain.

     Saddle cases use a centre-value decision to avoid
     arbitrary crossings.
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

        const x1 = x0 + stepX;

        const z0 =
          -halfDepth + row * stepZ;

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

     Uses true screen-space line width.

     No glow or duplicate motion trails.
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

     One LineSegments2 object per elevation level.

     This avoids creating thousands of individual
     Three.js objects.
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

      if (!positions.length) {
        continue;
      }

      const geometry =
        new LineSegmentsGeometry();

      geometry.setPositions(
        positions
      );

      const baseColor =
        baseColors[
          i % baseColors.length
        ].clone();

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
     18 / ORANGE ELEVATION HIGHLIGHT

     Only colour changes.

     Terrain and contour geometry remain stationary.
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

      const influence =
        Math.exp(
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
     19 / POINTER INTERACTION

     Mouse height selects elevation.

     Top = higher contours.
     Bottom = lower contours.
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
     20 / CINEMATIC CAMERA FLYOVER

     Gentle camera travel.

     No terrain animation or deformation.
     ======================================================== */

  function updateCamera(
    deltaSeconds
  ) {

    if (reducedMotion.matches) return;

    elapsedTime += deltaSeconds;

    const forward =
      Math.sin(
        elapsedTime *
        SETTINGS.flyoverSpeed
      ) *
      SETTINGS.flyoverDistance;

    const sway =
      Math.sin(
        elapsedTime *
        SETTINGS.cameraSwaySpeed
      ) *
      SETTINGS.cameraSway;

    camera.position.set(
      cameraBase.x + sway,
      cameraBase.y,
      cameraBase.z - forward
    );

    camera.lookAt(
      cameraTarget.x + sway * 0.25,
      cameraTarget.y,
      cameraTarget.z - forward * 0.2
    );
  }


  /* ========================================================
     21 / RESIZE
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

    const aspect =
      viewportWidth / viewportHeight;


    /* ------------------------------------------------------
       Responsive camera positions
       ------------------------------------------------------ */

    if (aspect < 0.8) {

      cameraBase.set(
        0,
        8.5,
        24
      );

      cameraTarget.set(
        0,
        2,
        -2
      );

    } else if (aspect < 1.4) {

      cameraBase.set(
        0,
        6.8,
        20
      );

      cameraTarget.set(
        0,
        2.2,
        -3
      );

    } else {

      cameraBase.set(
        0,
        5.4,
        17
      );

      cameraTarget.set(
        0,
        2.3,
        -3.5
      );
    }

    camera.position.copy(cameraBase);
    camera.lookAt(cameraTarget);

    camera.updateProjectionMatrix();


    /* ------------------------------------------------------
       Renderer
       ------------------------------------------------------ */

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


    /* ------------------------------------------------------
       Responsive contour density
       ------------------------------------------------------ */

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


    /* ------------------------------------------------------
       Update line resolution
       ------------------------------------------------------ */

    for (const contour of contourLines) {

      contour.material.resolution.set(
        viewportWidth,
        viewportHeight
      );
    }

    renderer.render(scene, camera);
  }


  /* ========================================================
     22 / ANIMATION
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


    /* ------------------------------------------------------
       Smooth orange highlighting
       ------------------------------------------------------ */

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


    /* ------------------------------------------------------
       Camera flyover
       ------------------------------------------------------ */

    updateCamera(
      deltaSeconds
    );

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
     23 / ANIMATION CONTROL
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
      requestAnimationFrame(
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
  }


  /* ========================================================
     24 / VISIBILITY OBSERVER
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
     25 / REDUCED MOTION
     ======================================================== */

  reducedMotion.addEventListener(
    "change",
    () => {

      if (reducedMotion.matches) {

        camera.position.copy(
          cameraBase
        );

        camera.lookAt(
          cameraTarget
        );

        updateHighlight(true);

        renderer.render(
          scene,
          camera
        );
      }
    }
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

    const observer =
      new ResizeObserver(resize);

    observer.observe(
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
     28 / INITIALIZE
     ======================================================== */

  resize();

  updateHighlight(true);

  renderer.render(
    scene,
    camera
  );

  startAnimation();

  console.log(
    `Dramatic topographic landscape initialized: ${contourLines.length} contour levels.`
  );
}
