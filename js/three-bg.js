/**
 * PaintLead Pro v3 — Three.js Animated Background
 * Particle field + wireframe geometry with theme-aware coloring
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

    // Detect low-end devices
    this.particleCount = this._getParticleCount();
    this.wireframeCount = this.theme === 'light' ? 2 : 3;

    this._init();
    this._setupVisibilityObserver();
    this._setupMouseTracking();
    this._animate();

    // Mark loaded after short delay for fade-in
    requestAnimationFrame(() => {
      this.canvas.classList.add('loaded');
    });
  }

  _getParticleCount() {
    // Check for low-end device indicators
    const isLowEnd = navigator.hardwareConcurrency <= 2 ||
                     (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                     window.innerWidth < 768;

    if (isLowEnd) {
      this.performanceMode = true;
      return 300;
    }

    // Reduced density for light theme (subtler effect)
    if (this.theme === 'light') return 500;

    // Dashboard gets fewer particles
    if (document.body.classList.contains('dashboard-page')) return 350;

    return 800;
  }

  _init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !this.performanceMode,
      powerPreference: this.performanceMode ? 'low-power' : 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 50;

    // Colors based on theme
    const isDark = this.theme === 'dark';
    const particleColor = isDark ? 0xffffff : 0x64748b;
    const particleOpacity = isDark ? 0.15 : 0.06;
    const wireColor = isDark ? 0xFFD036 : 0xF5A623;
    const wireOpacity = isDark ? 0.06 : 0.04;

    // ── Particles ──
    this.particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);
    const opacities = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 120;
      positions[i3 + 1] = (Math.random() - 0.5) * 80;
      positions[i3 + 2] = (Math.random() - 0.5) * 60;
      sizes[i] = Math.random() * 1.5 + 0.5;
      opacities[i] = Math.random() * 0.5 + 0.3;
    }

    this.particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particlesMaterial = new THREE.PointsMaterial({
      color: particleColor,
      size: 1.2,
      transparent: true,
      opacity: particleOpacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(this.particlesGeometry, this.particlesMaterial);
    this.scene.add(this.particles);

    // ── Wireframe Shapes ──
    this.wireframes = [];
    const geometries = [
      new THREE.IcosahedronGeometry(6, 1),
      new THREE.OctahedronGeometry(5, 0),
      new THREE.TetrahedronGeometry(4, 0)
    ];

    for (let i = 0; i < this.wireframeCount; i++) {
      const geo = geometries[i % geometries.length];
      const edges = new THREE.EdgesGeometry(geo);
      const material = new THREE.LineBasicMaterial({
        color: wireColor,
        transparent: true,
        opacity: wireOpacity,
        depthWrite: false
      });
      const wireframe = new THREE.LineSegments(edges, material);

      // Position in deep background
      wireframe.position.set(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 40,
        -20 - Math.random() * 20
      );

      wireframe.userData = {
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.003,
          y: (Math.random() - 0.5) * 0.003,
          z: (Math.random() - 0.5) * 0.002
        },
        floatSpeed: Math.random() * 0.5 + 0.3,
        floatOffset: Math.random() * Math.PI * 2,
        baseY: wireframe.position.y
      };

      this.wireframes.push(wireframe);
      this.scene.add(wireframe);
    }

    // ── Resize Handler ──
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  _setupVisibilityObserver() {
    // Only animate when canvas is visible
    const observer = new IntersectionObserver(
      (entries) => {
        this.isVisible = entries[0].isIntersecting;
      },
      { threshold: 0 }
    );
    observer.observe(this.canvas);

    // Also pause when tab is hidden
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

    // Skip frames in performance mode
    if (this.performanceMode && this.frameCount % 2 !== 0) return;

    const time = this.frameCount * 0.01;

    // Smooth mouse follow
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.02;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.02;

    // Camera subtle rotation following mouse
    this.camera.rotation.y = this.mouse.x * 0.03;
    this.camera.rotation.x = -this.mouse.y * 0.02;

    // Particle field drift
    this.particles.rotation.y = time * 0.02;
    this.particles.rotation.x = Math.sin(time * 0.3) * 0.01;

    // Wireframe animations
    for (const wf of this.wireframes) {
      const { rotSpeed, floatSpeed, floatOffset, baseY } = wf.userData;
      wf.rotation.x += rotSpeed.x;
      wf.rotation.y += rotSpeed.y;
      wf.rotation.z += rotSpeed.z;
      wf.position.y = baseY + Math.sin(time * floatSpeed + floatOffset) * 2;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.particlesGeometry.dispose();
    this.particlesMaterial.dispose();
    for (const wf of this.wireframes) {
      wf.geometry.dispose();
      wf.material.dispose();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ParticleBackground());
} else {
  new ParticleBackground();
}
