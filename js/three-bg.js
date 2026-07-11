/**
 * PaintLead Pro v3 — Premium Organic Bokeh Particle Background
 * Soft, slow-drifting light motes that respond dynamically to mouse movement.
 * Replaces the cyber-grid wave and wireframes with a clean, luxury aesthetic.
 * 
 * Loaded as ES module: <script type="module" src="js/three-bg.js"></script>
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

class ParticleBackground {
  constructor() {
    this.canvas = document.getElementById('three-canvas');
    if (!this.canvas) return;

    this.theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.isVisible = false;
    this.frameCount = 0;
    this.performanceMode = false;

    this.particleCount = this._getParticleCount();
    this._init();
    this._setupVisibilityObserver();
    this._setupMouseTracking();
    this._animate();

    // Fade in canvas
    requestAnimationFrame(() => {
      this.canvas.classList.add('loaded');
    });
  }

  _getParticleCount() {
    const isLowEnd = navigator.hardwareConcurrency <= 2 ||
                     (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                     window.innerWidth < 768;

    if (isLowEnd) {
      this.performanceMode = true;
      return 120;
    }

    if (this.theme === 'light') return 200;
    return 350; // Gentle density for high-end look
  }

  _init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !this.performanceMode,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Scene
    this.scene = new THREE.Scene();

    // Camera - wide view for depth
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.z = 40;

    // Generate ultra-soft radial glow texture
    const size = 32;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = size;
    glowCanvas.height = size;
    const glowContext = glowCanvas.getContext('2d');
    const glowGradient = glowContext.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    glowGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glowGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    glowGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, size, size);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);

    // Warm elegant colors matching the brand identity
    const isDark = this.theme === 'dark';
    const baseColor = isDark ? 0xFFD036 : 0xF5A623; // Warm Amber / Gold
    const particleOpacity = isDark ? 0.35 : 0.22;

    // Create random particles scattered in a 3D volume
    this.particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const randomSpeeds = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      // Spread across screen
      positions[i3] = (Math.random() - 0.5) * 80;
      positions[i3 + 1] = (Math.random() - 0.5) * 50;
      positions[i3 + 2] = -Math.random() * 60; // Deep Z space

      // Slow drift velocity components
      randomSpeeds[i3] = (Math.random() - 0.5) * 0.015; // X drift
      randomSpeeds[i3 + 1] = (Math.random() * 0.01) + 0.005; // Gentle upward drift
      randomSpeeds[i3 + 2] = (Math.random() - 0.5) * 0.01; // Z drift

      sizes[i] = Math.random() * 1.8 + 0.6; // Soft variable sizes
    }

    this.particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.randomSpeeds = randomSpeeds;

    this.particlesMaterial = new THREE.PointsMaterial({
      color: baseColor,
      size: 1.5,
      map: glowTexture,
      transparent: true,
      opacity: particleOpacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(this.particlesGeometry, this.particlesMaterial);
    this.scene.add(this.particles);

    // Resize Handler
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  _setupVisibilityObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        this.isVisible = entries[0].isIntersecting;
      },
      { threshold: 0 }
    );
    observer.observe(this.canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.isVisible = false;
    });
  }

  _setupMouseTracking() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    if (!this.isVisible) return;

    this.frameCount++;

    if (this.performanceMode && this.frameCount % 2 !== 0) return;

    // Smooth mouse interpolation
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.03;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.03;

    // Tilt camera gently with mouse
    this.camera.rotation.y = this.mouse.x * 0.08;
    this.camera.rotation.x = -this.mouse.y * 0.06;

    const positions = this.particlesGeometry.attributes.position.array;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Update positions based on drift speed
      positions[i3] += this.randomSpeeds[i3] + this.mouse.x * 0.02; // mouse horizontal wind
      positions[i3 + 1] += this.randomSpeeds[i3 + 1] - this.mouse.y * 0.01; // mouse vertical wind
      positions[i3 + 2] += this.randomSpeeds[i3 + 2];

      // Recycle particles if they go off-screen
      if (positions[i3 + 1] > 30) {
        positions[i3 + 1] = -30;
        positions[i3] = (Math.random() - 0.5) * 80;
      }
      if (positions[i3] > 50) {
        positions[i3] = -50;
      } else if (positions[i3] < -50) {
        positions[i3] = 50;
      }
    }

    this.particlesGeometry.attributes.position.needsUpdate = true;

    // Slow rotation of entire particle space
    this.particles.rotation.y = this.frameCount * 0.0004;

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.particlesGeometry.dispose();
    this.particlesMaterial.dispose();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ParticleBackground());
} else {
  new ParticleBackground();
}
