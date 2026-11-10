
/* ==========================================================
   U OF T STATISTICAL SCIENCES
   UNDERGRADUATE DIGITAL BROCHURE

   General Site Interactions

   Features:
   - Full-page section navigation
   - Smooth anchor scrolling
   - Active navigation tracking
   - Keyboard accessibility
   - Scroll progress tracking
   - Reduced-motion support
   - Browser history integration
   - Responsive behaviour

   File: assets/js/main.js
   Version: 1.0
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     01 / ELEMENTS
     ========================================================== */

  const scrollContainer = document.querySelector(".snap");

  const sections = Array.from(
    document.querySelectorAll(".snap > section[id]")
  );

  const navigationLinks = Array.from(
    document.querySelectorAll('a[href^="#"]')
  );

  const primaryNavigationLinks = Array.from(
    document.querySelectorAll('.nav nav a[href^="#"]')
  );

  if (!scrollContainer) {
    console.warn("Site navigation: scroll container not found.");
    return;
  }


  /* ==========================================================
     02 / SETTINGS
     ========================================================== */

  const SETTINGS = {
    activeSectionThreshold: 0.35,
    scrollEndDelay: 120,
    keyboardNavigation: true
  };


  /* ==========================================================
     03 / STATE
     ========================================================== */

  let activeSection = null;
  let scrollTimer = null;
  let ticking = false;


  /* ==========================================================
     04 / REDUCED MOTION
     ========================================================== */

  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  function prefersReducedMotion() {
    return motionPreference.matches;
  }


  /* ==========================================================
     05 / SECTION LOOKUP
     ========================================================== */

  function getSectionById(id) {
    return document.getElementById(id);
  }

  function getSectionIndex(section) {
    return sections.indexOf(section);
  }


  /* ==========================================================
     06 / SCROLL TO SECTION
     ========================================================== */

  function scrollToSection(id, options = {}) {
    const section = getSectionById(id);

    if (!section) return;

    const smooth = options.smooth !== false &&
      !prefersReducedMotion();

    section.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start"
    });

    if (options.updateHistory !== false) {
      const newHash = `#${id}`;

      if (window.location.hash !== newHash) {
        history.pushState(null, "", newHash);
      }
    }

    setActiveSection(id);
  }


  /* ==========================================================
     07 / ACTIVE NAVIGATION
     ========================================================== */

  function setActiveSection(id) {
    if (activeSection === id) return;

    activeSection = id;

    /*
     * Set aria-current on the active navigation link.
     *
     * Only links pointing directly to the current section
     * receive the attribute.
     */

    primaryNavigationLinks.forEach(link => {
      const targetId = link.getAttribute("href").slice(1);

      if (targetId === id) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    /*
     * Store the active section on the document.
     *
     * This allows future CSS to respond to the current
     * section without changing the JS.
     */

    document.documentElement.dataset.activeSection = id;
  }


  /* ==========================================================
     08 / FIND CURRENT SECTION
     ========================================================== */

  function findCurrentSection() {
    const containerRect = scrollContainer.getBoundingClientRect();

    const viewportCenter =
      containerRect.top + containerRect.height * 0.45;

    let closestSection = null;
    let closestDistance = Infinity;

    sections.forEach(section => {
      const rect = section.getBoundingClientRect();

      const sectionCenter =
        rect.top + rect.height / 2;

      const distance = Math.abs(
        sectionCenter - viewportCenter
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSection = section;
      }
    });

    return closestSection;
  }


  /* ==========================================================
     09 / UPDATE SECTION ON SCROLL
     ========================================================== */

  function updateActiveSection() {
    const currentSection = findCurrentSection();

    if (currentSection) {
      setActiveSection(currentSection.id);
    }

    ticking = false;
  }

  function handleScroll() {
    if (!ticking) {
      ticking = true;

      requestAnimationFrame(updateActiveSection);
    }

    clearTimeout(scrollTimer);

    scrollTimer = setTimeout(() => {
      updateActiveSection();
    }, SETTINGS.scrollEndDelay);
  }


  /* ==========================================================
     10 / SCROLL PROGRESS
     ========================================================== */

  function updateScrollProgress() {
    const maximumScroll =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight;

    const progress = maximumScroll > 0
      ? scrollContainer.scrollTop / maximumScroll
      : 0;

    /*
     * CSS custom property for future progress indicators.
     *
     * Example:
     * width: calc(var(--scroll-progress) * 100%);
     */

    document.documentElement.style.setProperty(
      "--scroll-progress",
      progress.toFixed(4)
    );
  }


  /* ==========================================================
     11 / ANCHOR NAVIGATION
     ========================================================== */

  function handleAnchorClick(event) {
    const link = event.currentTarget;

    const href = link.getAttribute("href");

    if (!href || href === "#") return;

    const id = decodeURIComponent(href.slice(1));

    const section = getSectionById(id);

    if (!section) return;

    event.preventDefault();

    scrollToSection(id, {
      smooth: true,
      updateHistory: true
    });
  }


  /* ==========================================================
     12 / KEYBOARD NAVIGATION
     ========================================================== */

  function handleKeyboard(event) {
    if (!SETTINGS.keyboardNavigation) return;

    /*
     * Never intercept keyboard input while a visitor
     * is interacting with form controls.
     */

    const target = event.target;

    if (
      target.closest(
        "input, textarea, select, button, [contenteditable]"
      )
    ) {
      return;
    }

    /*
     * Preserve normal browser behaviour for modified keys.
     */

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    /*
     * Only intercept PageUp / PageDown.
     *
     * Arrow keys and Space retain their normal scrolling
     * behaviour for accessibility.
     */

    let direction = 0;

    if (event.key === "PageDown") {
      direction = 1;
    }

    if (event.key === "PageUp") {
      direction = -1;
    }

    if (!direction) return;

    /*
     * Do not interfere with interactive elements,
     * including the alumni globe.
     */

    if (
      target.closest(
        "a, [role='button'], [role='slider']"
      )
    ) {
      return;
    }

    const currentSection = findCurrentSection();

    if (!currentSection) return;

    const currentIndex = getSectionIndex(currentSection);

    const nextIndex = Math.max(
      0,
      Math.min(
        sections.length - 1,
        currentIndex + direction
      )
    );

    if (nextIndex === currentIndex) return;

    event.preventDefault();

    scrollToSection(sections[nextIndex].id, {
      smooth: true,
      updateHistory: true
    });
  }


  /* ==========================================================
     13 / BROWSER HISTORY
     ========================================================== */

  function handleHistoryNavigation() {
    const hash = window.location.hash;

    if (!hash) {
      scrollToSection("cover", {
        smooth: false,
        updateHistory: false
      });

      return;
    }

    const id = decodeURIComponent(hash.slice(1));

    if (getSectionById(id)) {
      scrollToSection(id, {
        smooth: false,
        updateHistory: false
      });
    }
  }


  /* ==========================================================
     14 / INITIAL URL HASH
     ========================================================== */

  function handleInitialHash() {
    const hash = window.location.hash;

    if (!hash) {
      setActiveSection("cover");
      return;
    }

    const id = decodeURIComponent(hash.slice(1));

    if (!getSectionById(id)) return;

    /*
     * Wait for initial layout to settle.
     */

    requestAnimationFrame(() => {
      scrollToSection(id, {
        smooth: false,
        updateHistory: false
      });
    });
  }


  /* ==========================================================
     15 / INITIALIZE
     ========================================================== */

  function init() {

    /* --------------------------------------------------------
       Anchor links
       -------------------------------------------------------- */

    navigationLinks.forEach(link => {
      link.addEventListener(
        "click",
        handleAnchorClick
      );
    });


    /* --------------------------------------------------------
       Scroll events
       -------------------------------------------------------- */

    scrollContainer.addEventListener(
      "scroll",
      () => {
        handleScroll();
        updateScrollProgress();
      },
      { passive: true }
    );


    /* --------------------------------------------------------
       Keyboard navigation
       -------------------------------------------------------- */

    document.addEventListener(
      "keydown",
      handleKeyboard
    );


    /* --------------------------------------------------------
       Browser history
       -------------------------------------------------------- */

    window.addEventListener(
      "popstate",
      handleHistoryNavigation
    );


    /* --------------------------------------------------------
       Resize
       -------------------------------------------------------- */

    window.addEventListener(
      "resize",
      () => {
        updateActiveSection();
        updateScrollProgress();
      },
      { passive: true }
    );


    /* --------------------------------------------------------
       Initial state
       -------------------------------------------------------- */

    handleInitialHash();

    updateActiveSection();
    updateScrollProgress();

    console.log(
      `Undergraduate brochure initialized: ${sections.length} sections.`
    );
  }


  /* ==========================================================
     16 / START
     ========================================================== */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
