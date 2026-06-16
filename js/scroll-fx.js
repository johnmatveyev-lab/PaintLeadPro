/**
 * PaintLead Pro v3 — Scroll Effects & 3D Tilt Controller
 * - IntersectionObserver fallback for scroll reveal animations
 * - Pointer-tracking 3D tilt on .tilt-card elements
 * - Counter animations for stat numbers
 * - Navbar scroll state tracking
 */

(function () {
  'use strict';

  // ── 1. Scroll Reveal Fallback (for browsers without scroll-driven animations) ──
  function initScrollReveal() {
    const supportsScrollDriven = CSS.supports(
      '(animation-timeline: view()) and (animation-range: entry)'
    );

    // If native scroll-driven animations are supported, the CSS handles it
    if (supportsScrollDriven) return;

    const revealSelectors = [
      '.reveal-up',
      '.reveal-left',
      '.reveal-right',
      '.reveal-scale',
      '.reveal-fade'
    ];

    const elements = document.querySelectorAll(revealSelectors.join(','));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Apply stagger delay if inside a stagger group
            const parent = entry.target.closest('.stagger-group');
            if (parent) {
              const siblings = Array.from(
                parent.querySelectorAll('.stagger-item')
              );
              const index = siblings.indexOf(entry.target);
              if (index > 0) {
                entry.target.style.transitionDelay = `${index * 80}ms`;
              }
            }

            entry.target.classList.add('revealed');
            observer.unobserve(entry.target); // Only animate once
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -60px 0px'
      }
    );

    elements.forEach((el) => observer.observe(el));
  }

  // ── 2. 3D Tilt Card Effect ──
  function initTiltCards() {
    const cards = document.querySelectorAll('.tilt-card');
    if (!cards.length) return;

    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    cards.forEach((card) => {
      let bounds;
      let rafId;

      function onMouseEnter() {
        bounds = card.getBoundingClientRect();
      }

      function onMouseMove(e) {
        if (!bounds) return;
        if (rafId) cancelAnimationFrame(rafId);

        rafId = requestAnimationFrame(() => {
          const mouseX = e.clientX - bounds.left;
          const mouseY = e.clientY - bounds.top;
          const centerX = bounds.width / 2;
          const centerY = bounds.height / 2;

          // Max tilt of ±6 degrees
          const tiltX = ((mouseY - centerY) / centerY) * -6;
          const tiltY = ((mouseX - centerX) / centerX) * 6;

          card.style.setProperty('--tilt-x', `${tiltX}deg`);
          card.style.setProperty('--tilt-y', `${tiltY}deg`);
        });
      }

      function onMouseLeave() {
        if (rafId) cancelAnimationFrame(rafId);
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
        bounds = null;
      }

      card.addEventListener('mouseenter', onMouseEnter, { passive: true });
      card.addEventListener('mousemove', onMouseMove, { passive: true });
      card.addEventListener('mouseleave', onMouseLeave, { passive: true });
    });
  }

  // ── 3. Counter Animations ──
  function initCounterAnimations() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-counter'), 10);
    const suffix = el.getAttribute('data-counter-suffix') || '';
    const prefix = el.getAttribute('data-counter-prefix') || '';
    const duration = 1500; // ms
    const start = performance.now();
    const initial = 0;

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(initial + (target - initial) * eased);

      el.textContent = prefix + current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ── 4. Navbar Scroll State ──
  function initNavbarScroll() {
    const navbar = document.querySelector('.glass-navbar');
    if (!navbar) return;

    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
          } else {
            navbar.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // Initial check
  }

  // ── 5. Smooth Section Scrolling ──
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  // ── 6. Active Nav Link Highlighting ──
  function initActiveNavLinks() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    if (!sections.length || !navLinks.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach((link) => {
              const href = link.getAttribute('href');
              if (href === `#${id}`) {
                link.classList.add('active');
              } else {
                link.classList.remove('active');
              }
            });
          }
        });
      },
      { threshold: 0.3, rootMargin: '-80px 0px -50% 0px' }
    );

    sections.forEach((section) => observer.observe(section));
  }

  // ── Initialize Everything ──
  function init() {
    initScrollReveal();
    initTiltCards();
    initCounterAnimations();
    initNavbarScroll();
    initSmoothScroll();
    initActiveNavLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
