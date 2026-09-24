import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function ThreeCanvas({ activeMode = 'van', onSelectStory }) {
  const mountRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [telemetry, setTelemetry] = useState({
    speed: 28,
    temp: 2.8,
    progress: 74,
    battery: 89,
    eta: '6 mins'
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        speed: 26 + Math.floor(Math.sin(Date.now() / 2000) * 5),
        temp: +(2.8 + Math.sin(Date.now() / 4000) * 0.2).toFixed(1),
        progress: Math.min(99, +(prev.progress + 0.05).toFixed(1))
      }));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(7, 5, 8);
    camera.lookAt(0, 0.5, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(8, 12, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x2b60ec, 3, 20);
    blueLight.position.set(-4, 3, -3);
    scene.add(blueLight);

    const mintLight = new THREE.PointLight(0x10b981, 2.5, 15);
    mintLight.position.set(4, 2, 4);
    scene.add(mintLight);

    // Group for van & scene
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Base Circular Pedestal / Grid Platform
    const pedestalGeo = new THREE.CylinderGeometry(4.2, 4.5, 0.3, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.15;
    pedestal.receiveShadow = true;
    mainGroup.add(pedestal);

    // Inner Glow Ring
    const ringGeo = new THREE.RingGeometry(3.6, 3.8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2b60ec,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    mainGroup.add(ring);

    // Second Accent Ring (Emerald)
    const ring2Geo = new THREE.RingGeometry(2.8, 2.9, 48);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.015;
    mainGroup.add(ring2);

    // BUILD 3D COURIER ELECTRIC VAN
    const vanGroup = new THREE.Group();

    // Van Body (Lower chassis)
    const bodyGeo = new THREE.BoxGeometry(3.6, 1.4, 1.8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.15
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    body.receiveShadow = true;
    vanGroup.add(body);

    // Van Cabin (Front windshield & roof)
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.9, 1.76);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x2b60ec,
      roughness: 0.1,
      metalness: 0.4
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(1.1, 1.6, 0);
    cabin.castShadow = true;
    vanGroup.add(cabin);

    // Windshield Glass
    const glassGeo = new THREE.BoxGeometry(0.8, 0.6, 1.6);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.85
    });
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.position.set(1.42, 1.65, 0);
    vanGroup.add(windshield);

    // Van Livery Side Stripe (Stitch Cobalt Blue & Emerald Green)
    const stripeGeo = new THREE.BoxGeometry(3.62, 0.25, 1.82);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x2b60ec });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.9;
    vanGroup.add(stripe);

    const stripe2Geo = new THREE.BoxGeometry(3.63, 0.08, 1.83);
    const stripe2Mat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const stripe2 = new THREE.Mesh(stripe2Geo, stripe2Mat);
    stripe2.position.y = 0.72;
    vanGroup.add(stripe2);

    // Van Headlights (Glowing LEDs)
    const lightGeo = new THREE.BoxGeometry(0.1, 0.2, 0.35);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x6cf8bb });
    const hlLeft = new THREE.Mesh(lightGeo, lightMat);
    hlLeft.position.set(1.81, 0.9, 0.6);
    const hlRight = hlLeft.clone();
    hlRight.position.set(1.81, 0.9, -0.6);
    vanGroup.add(hlLeft, hlRight);

    // Tail Lights (Red LED)
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const tlLeft = new THREE.Mesh(lightGeo, tlMat);
    tlLeft.position.set(-1.81, 0.9, 0.65);
    const tlRight = tlLeft.clone();
    tlRight.position.set(-1.81, 0.9, -0.65);
    vanGroup.add(tlLeft, tlRight);

    // Wheels (4 cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 24);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.2
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.2
    });

    const wheelPos = [
      [1.1, 0.42, 0.9],
      [1.1, 0.42, -0.9],
      [-1.1, 0.42, 0.9],
      [-1.1, 0.42, -0.9]
    ];

    wheelPos.forEach(([x, y, z]) => {
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.position.set(x, y, z);
      tire.castShadow = true;

      const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 16);
      hubGeo.rotateX(Math.PI / 2);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      tire.add(hub);

      vanGroup.add(tire);
    });

    // Roof Solar Recharging Grid
    const solarGeo = new THREE.BoxGeometry(1.6, 0.05, 1.4);
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.2,
      metalness: 0.7
    });
    const solar = new THREE.Mesh(solarGeo, solarMat);
    solar.position.set(-0.6, 1.73, 0);
    vanGroup.add(solar);

    // Cargo Crates Stored (Simulated insulated containers)
    const crateGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    const crateMat1 = new THREE.MeshStandardMaterial({ color: 0x2b60ec, roughness: 0.3 });
    const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
    const crateMat3 = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });

    const crate1 = new THREE.Mesh(crateGeo, crateMat1);
    crate1.position.set(-2.6, 0.33, 1.2);
    crate1.castShadow = true;
    const crate2 = new THREE.Mesh(crateGeo, crateMat2);
    crate2.position.set(-2.3, 0.33, 1.9);
    crate2.castShadow = true;
    const crate3 = new THREE.Mesh(crateGeo, crateMat3);
    crate3.position.set(-2.5, 0.95, 1.5);
    crate3.castShadow = true;
    mainGroup.add(crate1, crate2, crate3);

    // Waypoint Pin Markers around the pedestal
    const pinGroup = new THREE.Group();
    const pinGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: 0x2b60ec,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });

    const pinCoords = [
      [2.2, 0.6, 2.2],
      [-2.4, 0.6, -1.8],
      [1.5, 0.6, -2.5]
    ];

    pinCoords.forEach(([x, y, z]) => {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(x, y, z);
      const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, y, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(x, y / 2, z);
      pinGroup.add(pin, stem);
    });

    mainGroup.add(pinGroup);
    mainGroup.add(vanGroup);

    // Floating Particles for Ambient 3D Depth
    const particleCount = 45;
    const particleGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 12;
      posArray[i + 1] = Math.random() * 6;
      posArray[i + 2] = (Math.random() - 0.5) * 12;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x2b60ec,
      transparent: true,
      opacity: 0.5
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse Interaction / Drag to Orbit
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };
    let targetRotationY = 0.5;
    let targetRotationX = 0;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      targetRotationY += deltaX * 0.008;
      targetRotationX += deltaY * 0.005;
      targetRotationX = Math.max(-0.4, Math.min(0.4, targetRotationX));
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('pointerdown', onMouseDown);
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);

    // Touch Support
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMousePos.x;
      const deltaY = e.touches[0].clientY - prevMousePos.y;
      targetRotationY += deltaX * 0.01;
      targetRotationX += deltaY * 0.008;
      targetRotationX = Math.max(-0.4, Math.min(0.4, targetRotationX));
      prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);

    // Animation Loop
    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Idle auto-rotation
      if (!isDragging) {
        targetRotationY += 0.0035;
      }

      // Smooth damping
      mainGroup.rotation.y += (targetRotationY - mainGroup.rotation.y) * 0.08;
      mainGroup.rotation.x += (targetRotationX - mainGroup.rotation.x) * 0.08;

      // Gentle floating animation
      vanGroup.position.y = Math.sin(elapsedTime * 2.2) * 0.06;
      crate3.position.y = 0.95 + Math.sin(elapsedTime * 2.5 + 1) * 0.03;

      // Pulse rings
      ringMat.opacity = 0.35 + Math.sin(elapsedTime * 3) * 0.15;
      ring2Mat.opacity = 0.45 + Math.cos(elapsedTime * 3) * 0.15;

      // Floating pins
      pinGroup.children.forEach((child, i) => {
        if (child.isMesh && child.geometry.type === 'SphereGeometry') {
          child.position.y = 0.6 + Math.sin(elapsedTime * 3 + i) * 0.08;
        }
      });

      // Ambient particles slow drift
      particles.rotation.y = elapsedTime * 0.04;

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      domElement.removeEventListener('pointerdown', onMouseDown);
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      domElement.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
      if (domElement.parentNode) {
        domElement.parentNode.removeChild(domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className="three-canvas-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="three-mount" />

      {/* Floating Pill Badge 1 (Top Left) */}
      <div className="floating-badge badge-top-left">
        <span className="badge-dot dot-green"></span>
        <div className="badge-content">
          <span className="badge-label">High Priority Shelter</span>
          <span className="badge-value">Eastside Care • 420 hot meals</span>
        </div>
      </div>

      {/* Floating Pill Badge 2 (Bottom Right) */}
      <div className="floating-badge badge-bottom-right">
        <span className="badge-dot dot-blue"></span>
        <div className="badge-content">
          <span className="badge-label">Allocated Courier Van</span>
          <span className="badge-value">FastTrack Van #04 - All hygiene & crates</span>
        </div>
        <span className="badge-pill-tag">Live GPS</span>
      </div>

      {/* Interactive Helper Cue */}
      <div className="interactive-cue-tag">
        <svg className="cue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <span>Explore Van • 3D Rotatable</span>
      </div>

      {/* Telemetry HUD Bar on Tracking Mode */}
      {activeMode === 'tracking' && (
        <div className="tracking-hud-overlay">
          <div className="hud-metric">
            <span className="hud-label">COURIER SPEED</span>
            <span className="hud-val">{telemetry.speed} mph</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">COLD CHAIN</span>
            <span className="hud-val text-emerald">{telemetry.temp}°C</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">DISPATCH ROUTE</span>
            <span className="hud-val">{telemetry.progress}% ETA {telemetry.eta}</span>
          </div>
        </div>
      )}
    </div>
  );
}
