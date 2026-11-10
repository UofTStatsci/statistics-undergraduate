
/*
 * Image-locked topographic elevation highlight.
 *
 * contours.jpg: original, unchanged 2048 x 1365 raster artwork.
 * elevation-map.png: a mask derived from that same artwork:
 *   RED   = estimated normalized elevation (0 to 1)
 *   GREEN = coverage of the original contour strokes (0 to 1)
 *
 * The source artwork never moves, deforms or gets redrawn.
 * Only a transparent orange WebGL overlay is animated.
 *
 * Works with fullpage.js (v3/v4) without another fullpage initialization.
 */
(() => {
  'use strict';

  const CONFIG = {
    mapUrl: 'elevation-map.png', // relative to the HTML page, not this JS file
    imageWidth: 2048,
    imageHeight: 1365,
    initialElevation: 0.50,
    bandWidth: 0.040,      // smaller => thinner selection of elevation contours
    highlightOpacity: 0.98,
    idleAnimation: true,
    idleDelayMs: 4200,     // start sweeping after this long without interaction
    idleSpeed: 0.00018,   // radians per millisecond
    idleRange: 0.25,      // how far idle animation travels from its last level
    smoothing: 0.095      // low numbers = softer transitions
  };

  const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function initTopography(root) {
    const viewport = root.querySelector('[data-topo-viewport]');
    const art = root.querySelector('[data-topo-art]');
    const canvas = root.querySelector('[data-topo-canvas]');
    const label = root.querySelector('[data-topo-label]');
    const percent = root.querySelector('[data-topo-percent]');
    const slider = root.querySelector('[data-topo-slider]');
    const output = root.querySelector('[data-topo-output]');
    if (!viewport || !art || !canvas || !label || !percent || !slider || !output) return;

    let target = CONFIG.initialElevation;
    let current = target;
    let lastInteraction = performance.now();
    let lastFrame = performance.now();
    let displayPercent = -1;
    let activePointerId = null;
    let isIdling = false;
    let idleOrigin = target;
    let idleStart = 0;
    let inView = true;
    let ready = false;
    let rafId = 0;
    let gl, program, uniforms;

    function updateReadout(level) {
      const value = Math.round(clamp(level) * 100);
      if (value === displayPercent) return;
      displayPercent = value;
      label.textContent = value < 34 ? 'Lower elevation' : value < 67 ? 'Mid elevation' : 'Higher elevation';
      percent.textContent = `${value}%`;
      output.textContent = `${value}%`;
      slider.value = String(value);
    }

    function setElevation(level) {
      target = clamp(level);
      lastInteraction = performance.now();
      isIdling = false;
      updateReadout(target);
      startRendering();
    }

    function elevationFromPointer(event) {
      const box = art.getBoundingClientRect();
      if (!box.height) return;
      setElevation(1 - (event.clientY - box.top) / box.height);
    }

    art.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' && activePointerId !== null) return;
      activePointerId = event.pointerId;
      try { art.setPointerCapture(event.pointerId); } catch (_) { /* ignored */ }
      elevationFromPointer(event);
    });

    art.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse' || activePointerId === event.pointerId) {
        elevationFromPointer(event);
      }
    });

    function finishPointer(event) {
      if (activePointerId === event.pointerId) activePointerId = null;
    }
    art.addEventListener('pointerup', finishPointer);
    art.addEventListener('pointercancel', finishPointer);
    art.addEventListener('lostpointercapture', finishPointer);

    // fullpage.js listens to touch gestures on the page. Keep dragging inside
    // the actual artwork for elevation changes; allow swipes elsewhere for navigation.
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      art.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
    for (const type of ['touchstart', 'touchmove']) {
      slider.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }

    slider.addEventListener('input', () => setElevation(Number(slider.value) / 100));

    art.addEventListener('keydown', event => {
      const step = event.shiftKey ? 0.10 : 0.02;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') setElevation(target + step);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') setElevation(target - step);
      else if (event.key === 'Home') setElevation(0);
      else if (event.key === 'End') setElevation(1);
      else return;
      event.preventDefault();
      event.stopPropagation(); // keep fullpage.js from turning this into section navigation
    });

    function fitArt() {
      const box = viewport.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      const ratio = CONFIG.imageWidth / CONFIG.imageHeight;
      const width = Math.min(box.width, box.height * ratio);
      const height = width / ratio;
      art.style.width = `${width}px`;
      art.style.height = `${height}px`;
      if (gl) resizeCanvas();
    }

    function resizeCanvas() {
      const box = art.getBoundingClientRect();
      if (!gl || box.width < 1 || box.height < 1) return;
      const maxSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.min(maxSize, Math.round(box.width * dpr)));
      canvas.height = Math.max(1, Math.min(maxSize, Math.round(box.height * dpr)));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function shader(type, source) {
      const instance = gl.createShader(type);
      gl.shaderSource(instance, source);
      gl.compileShader(instance);
      if (!gl.getShaderParameter(instance, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(instance) || 'Shader compilation failed');
      }
      return instance;
    }

    function initializeRenderer(image) {
      gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false
      });
      if (!gl) throw new Error('WebGL is not available');

      const vertex = shader(gl.VERTEX_SHADER, `
        attribute vec2 aPosition;
        varying vec2 vUv;
        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `);
      const fragment = shader(gl.FRAGMENT_SHADER, `
        precision highp float;
        uniform sampler2D uMap;
        uniform float uElevation;
        uniform float uBandWidth;
        uniform float uOpacity;
        uniform vec2 uTexel;
        varying vec2 vUv;

        float strokeAt(vec2 uv) {
          vec2 mask = texture2D(uMap, uv).rg;
          float distanceFromLevel = (mask.r - uElevation) / uBandWidth;
          float band = exp(-0.5 * distanceFromLevel * distanceFromLevel);
          float lineCoverage = smoothstep(0.14, 0.85, mask.g);
          return band * lineCoverage;
        }

        void main() {
          float line = strokeAt(vUv);
          vec2 d = 3.0 * uTexel;
          float softGlow = (
            strokeAt(vUv + vec2( d.x, 0.0)) +
            strokeAt(vUv + vec2(-d.x, 0.0)) +
            strokeAt(vUv + vec2(0.0,  d.y)) +
            strokeAt(vUv + vec2(0.0, -d.y)) +
            strokeAt(vUv + vec2( d.x,  d.y)) +
            strokeAt(vUv + vec2(-d.x, -d.y))
          ) / 6.0;
          float alpha = min(0.99, (line * 0.96 + softGlow * 0.23) * uOpacity);
          gl_FragColor = vec4(1.0, 0.408, 0.051, alpha);
        }
      `);

      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
      }
      gl.useProgram(program);

      const vertices = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, 1, 1
      ]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

      uniforms = {
        elevation: gl.getUniformLocation(program, 'uElevation'),
        bandWidth: gl.getUniformLocation(program, 'uBandWidth'),
        opacity: gl.getUniformLocation(program, 'uOpacity'),
        texel: gl.getUniformLocation(program, 'uTexel')
      };
      gl.uniform1i(gl.getUniformLocation(program, 'uMap'), 0);
      gl.uniform1f(uniforms.bandWidth, CONFIG.bandWidth);
      gl.uniform1f(uniforms.opacity, CONFIG.highlightOpacity);
      gl.uniform2f(uniforms.texel, 1 / image.width, 1 / image.height);
      fitArt();
      ready = true;
      startRendering();
    }

    function startRendering() {
      if (ready && inView && !document.hidden && rafId === 0) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(render);
      }
    }

    function render(now) {
      rafId = 0;
      if (!ready || !inView || document.hidden) return;
      const deltaMs = Math.min(64, Math.max(0, now - lastFrame));
      lastFrame = now;
      if (CONFIG.idleAnimation && !prefersReducedMotion.matches &&
          activePointerId === null && now - lastInteraction > CONFIG.idleDelayMs) {
        if (!isIdling) {
          isIdling = true;
          idleOrigin = target;
          idleStart = now;
        }
        target = clamp(idleOrigin + CONFIG.idleRange * Math.sin((now - idleStart) * CONFIG.idleSpeed));
        updateReadout(target);
      }
      const blend = prefersReducedMotion.matches
        ? 1
        : 1 - Math.pow(1 - CONFIG.smoothing, deltaMs / 16.67);
      current += (target - current) * blend;
      gl.useProgram(program);
      gl.uniform1f(uniforms.elevation, current);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    }

    // Automatically pause WebGL when another fullpage.js section is in view.
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        if (inView) startRendering();
      }, { threshold: 0.01 });
      observer.observe(root);
    }
    document.addEventListener('visibilitychange', startRendering);

    if ('ResizeObserver' in window) {
      new ResizeObserver(fitArt).observe(viewport);
    } else {
      window.addEventListener('resize', fitArt, { passive: true });
    }
    fitArt();
    updateReadout(target);

    const image = new Image();
    image.onload = () => {
      try { initializeRenderer(image); }
      catch (error) { console.error('[topography] Orange elevation overlay failed:', error); }
    };
    image.onerror = () => {
      console.error('[topography] Cannot load elevation-map.png. Put it next to index.html and contours.jpg.');
    };
    image.src = CONFIG.mapUrl;
  }

  function init() {
    document.querySelectorAll('[data-topography]').forEach(initTopography);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
