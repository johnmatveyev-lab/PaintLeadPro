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
      return 450;
    }

    // Reduced density for light theme (subtler effect)
    if (this.theme === 'light') return 800;

    // Dashboard gets fewer particles
    if (document.body.classList.contains('dashboard-page')) return 600;

    return 1200;
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

    // Generate soft circular glow texture
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 16;
    glowCanvas.height = 16;
    const glowContext = glowCanvas.getContext('2d');
    const glowGradient = glowContext.createRadialGradient(8, 8, 0, 8, 8, 8);
    glowGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glowGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.7)');
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 16, 16);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);

    // Colors based on theme (Greenish glowing particles)
    const isDark = this.theme === 'dark';
    const particleColor = isDark ? 0x10B981 : 0x059669;
    const particleOpacity = isDark ? 0.35 : 0.25;
    const wireColor = isDark ? 0xFFD036 : 0xF5A623;
    const wireOpacity = isDark ? 0.06 : 0.04;

    // ── Particles ──
    this.particlesGeometry = new THREE.BufferGeometry();
    
    // Set up particles on an XZ grid for wave and swarm effects
    const amountX = Math.round(Math.sqrt(this.particleCount * 1.8));
    const amountZ = Math.round(this.particleCount / amountX);
    this.particleCount = amountX * amountZ; // Align to exact grid count
    
    const positions = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);

    const spacingX = 3.6;
    const spacingZ = 3.6;
    const offsetX = (amountX * spacingX) / 2;
    const offsetZ = (amountZ * spacingZ) / 2;

    for (let i = 0; i < this.particleCount; i++) {
      const ix = i % amountX;
      const iz = Math.floor(i / amountX);
      const i3 = i * 3;
      
      // X and Z coordinates on a grid, jittered slightly for an organic swarm look
      positions[i3] = ix * spacingX - offsetX + (Math.random() - 0.5) * 1.5;
      positions[i3 + 1] = 0; // Y coordinate (starts flat, animated via wave formula)
      positions[i3 + 2] = iz * spacingZ - offsetZ - 15 + (Math.random() - 0.5) * 1.5;
      
      sizes[i] = Math.random() * 0.8 + 0.4;
    }

    this.particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particlesMaterial = new THREE.PointsMaterial({
      color: particleColor,
      size: 1.0, // Smaller particles for a unified swarm look (was 2.2)
      map: glowTexture,
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

    // Particle wave animation
    const positions = this.particlesGeometry.attributes.position.array;
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const z = positions[i3 + 2];
      
      // Beautiful complex wave formula
      positions[i3 + 1] = Math.sin((x * 0.04) + (z * 0.04) + (time * 1.6)) * 4.5 +
                          Math.sin((x * 0.08) - (z * 0.06) + (time * 1.0)) * 2.0;
    }
    this.particlesGeometry.attributes.position.needsUpdate = true;

    // Subtle drift and tilt to show wave depth
    this.particles.rotation.y = Math.sin(time * 0.08) * 0.04;
    this.particles.rotation.x = -0.55 + Math.cos(time * 0.05) * 0.02;

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
