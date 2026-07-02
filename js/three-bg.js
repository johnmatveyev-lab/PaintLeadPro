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
    const particleOpacity = isDark ? 0.45 : 0.35; // increased slightly for premium visibility
    const wireColor = isDark ? 0xFFD036 : 0xF5A623;
    const wireOpacity = isDark ? 0.08 : 0.06;

    // Set colors for vertex-color gradients
    // Dark: Emerald (0.06, 0.73, 0.48) at bottom, Gold (1.0, 0.81, 0.21) at top
    // Light: Emerald (0.02, 0.58, 0.41) at bottom, Orange (0.96, 0.65, 0.14) at top
    this.colorPeak = isDark ? { r: 1.0, g: 0.81, b: 0.21 } : { r: 0.96, g: 0.65, b: 0.14 };
    this.colorBase = isDark ? { r: 0.06, g: 0.73, b: 0.48 } : { r: 0.02, g: 0.58, b: 0.41 };

    // ── Particles ──
    this.particlesGeometry = new THREE.BufferGeometry();
    
    // Set up particles on an XZ grid for wave and swarm effects
    const amountX = Math.round(Math.sqrt(this.particleCount * 1.8));
    const amountZ = Math.round(this.particleCount / amountX);
    this.particleCount = amountX * amountZ; // Align to exact grid count
    
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
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
      
      sizes[i] = Math.random() * 0.9 + 0.4;

      // Initialize base colors
      colors[i3] = this.colorBase.r;
      colors[i3 + 1] = this.colorBase.g;
      colors[i3 + 2] = this.colorBase.b;
    }

    this.particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particlesMaterial = new THREE.PointsMaterial({
      vertexColors: true, // Enable multi-color gradient based on height
      size: 1.3, // Slightly larger glowing particles
      map: glowTexture,
      transparent: true,
      opacity: particleOpacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(this.particlesGeometry, this.particlesMaterial);
    this.scene.add(this.particles);

    // ── Wireframe Shapes with Orbital Rings ──
    this.wireframes = [];
    this.orbits = [];
    const geometries = [
      new THREE.IcosahedronGeometry(5, 1),
      new THREE.OctahedronGeometry(4, 0),
      new THREE.TetrahedronGeometry(3, 0)
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

      // Create an orbital torus ring around the wireframe
      const ringGeo = new THREE.TorusGeometry(8, 0.05, 8, 48);
      const ringMat = new THREE.LineBasicMaterial({
        color: wireColor,
        transparent: true,
        opacity: wireOpacity * 1.5,
        depthWrite: false
      });
      const orbitRing = new THREE.LineLoop(ringGeo, ringMat);
      // Random tilt on the ring
      orbitRing.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      wireframe.add(orbitRing);

      // Position in deep background
      wireframe.position.set(
        (Math.random() - 0.5) * 70,
        (Math.random() - 0.5) * 45,
        -25 - Math.random() * 25
      );

      wireframe.userData = {
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.004,
          y: (Math.random() - 0.5) * 0.004,
          z: (Math.random() - 0.5) * 0.003
        },
        orbitSpeed: (Math.random() * 0.005 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        floatSpeed: Math.random() * 0.4 + 0.2,
        floatOffset: Math.random() * Math.PI * 2,
        baseY: wireframe.position.y
      };

      this.wireframes.push(wireframe);
      this.orbits.push(orbitRing);
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
    this.camera.rotation.y = this.mouse.x * 0.04;
    this.camera.rotation.x = -this.mouse.y * 0.03;

    // Map 2D mouse position to estimated XZ coordinate grid workspace
    const mouseWorldX = this.mouse.x * 35;
    const mouseWorldZ = this.mouse.y * 25 - 20;

    // Particle wave + interactive repulsion + height-based colors
    const positions = this.particlesGeometry.attributes.position.array;
    const colors = this.particlesGeometry.attributes.color.array;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const z = positions[i3 + 2];
      
      // Beautiful complex wave base formula
      let baseHeight = Math.sin((x * 0.04) + (z * 0.04) + (time * 1.5)) * 4.5 +
                         Math.sin((x * 0.08) - (z * 0.06) + (time * 0.9)) * 2.0;

      // Mouse repulsion: push down wave peaks locally near cursor position
      const dx = x - mouseWorldX;
      const dz = z - mouseWorldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 14) {
        const force = (14 - dist) / 14;
        baseHeight -= force * 5.0; // dynamic mouse ripple dent
      }

      positions[i3 + 1] = baseHeight;

      // Height color gradient mapping: map baseHeight [-6.5, 6.5] to [0, 1] t-value
      const t = Math.max(0, Math.min(1, (baseHeight + 6.5) / 13));
      
      colors[i3] = this.colorBase.r + (this.colorPeak.r - this.colorBase.r) * t;
      colors[i3 + 1] = this.colorBase.g + (this.colorPeak.g - this.colorBase.g) * t;
      colors[i3 + 2] = this.colorBase.b + (this.colorPeak.b - this.colorBase.b) * t;
    }
    this.particlesGeometry.attributes.position.needsUpdate = true;
    this.particlesGeometry.attributes.color.needsUpdate = true;

    // Subtle drift and tilt to show wave depth
    this.particles.rotation.y = Math.sin(time * 0.06) * 0.03;
    this.particles.rotation.x = -0.55 + Math.cos(time * 0.04) * 0.02;

    // Wireframe & orbit ring animations
    for (let i = 0; i < this.wireframes.length; i++) {
      const wf = this.wireframes[i];
      const orbit = this.orbits[i];
      const { rotSpeed, orbitSpeed, floatSpeed, floatOffset, baseY } = wf.userData;

      wf.rotation.x += rotSpeed.x;
      wf.rotation.y += rotSpeed.y;
      wf.rotation.z += rotSpeed.z;
      wf.position.y = baseY + Math.sin(time * floatSpeed + floatOffset) * 2;

      // Orbit ring spin independent from main geometry rotation
      if (orbit) {
        orbit.rotation.z += orbitSpeed;
        orbit.rotation.x += orbitSpeed * 0.5;
      }
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
    for (const orbit of this.orbits) {
      orbit.geometry.dispose();
      orbit.material.dispose();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ParticleBackground());
} else {
  new ParticleBackground();
}
