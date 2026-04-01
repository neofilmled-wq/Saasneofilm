'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ── Vertical streaming particle cylinder (Vexel-style) ── */
function StreamingCylinder() {
  const groupRef = useRef<THREE.Group>(null);
  const linesCount = 120;
  const particlesPerLine = 40;
  const totalParticles = linesCount * particlesPerLine;

  const [positions, speeds, basePositions] = useMemo(() => {
    const pos = new Float32Array(totalParticles * 3);
    const spd = new Float32Array(totalParticles);
    const base = new Float32Array(totalParticles * 3);

    for (let line = 0; line < linesCount; line++) {
      const angle = (line / linesCount) * Math.PI * 2;
      // Elliptical radius — wider horizontally to frame dashboard
      const radiusX = 5.5 + (Math.random() - 0.5) * 1.8;
      const radiusZ = 3.5 + (Math.random() - 0.5) * 1.2;
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ - 2;

      for (let p = 0; p < particlesPerLine; p++) {
        const idx = (line * particlesPerLine + p) * 3;
        const y = (p / particlesPerLine) * 10 - 5 + (Math.random() - 0.5) * 0.3;
        pos[idx] = x + (Math.random() - 0.5) * 0.15;
        pos[idx + 1] = y;
        pos[idx + 2] = z + (Math.random() - 0.5) * 0.15;
        base[idx] = pos[idx];
        base[idx + 1] = pos[idx + 1];
        base[idx + 2] = pos[idx + 2];
        spd[line * particlesPerLine + p] = 0.3 + Math.random() * 0.7;
      }
    }
    return [pos, spd, base];
  }, [totalParticles]);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (!pointsRef.current || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;

    // Animate particles flowing downward
    for (let i = 0; i < totalParticles; i++) {
      const idx = i * 3;
      arr[idx + 1] = basePositions[idx + 1] - ((t * speeds[i]) % 10);
      // Wrap around when below threshold
      if (arr[idx + 1] < -5) {
        arr[idx + 1] += 10;
      }
    }
    posAttr.needsUpdate = true;

    // Slow rotation of entire cylinder
    groupRef.current.rotation.y = t * 0.04;
  });

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={totalParticles}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#38bdf8"
          transparent
          opacity={0.7}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/* ── Inner glow particles (smaller, denser, different color) ── */
function InnerGlow() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 600;

  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 3;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = Math.sin(angle) * (r * 0.7) - 2;
      spd[i] = 0.1 + Math.random() * 0.4;
    }
    return [pos, spd];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speeds[i] * 0.02;
      if (arr[i * 3 + 1] < -4) arr[i * 3 + 1] = 4;
    }
    posAttr.needsUpdate = true;
    pointsRef.current.rotation.y = t * 0.015;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color="#2563EB"
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Ambient floating particles ── */
function AmbientDust() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 200;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 3;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.005;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#60a5fa"
        transparent
        opacity={0.3}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Canvas wrapper ── */
export function HeroCanvas() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 1.5, 8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <StreamingCylinder />
        <InnerGlow />
        <AmbientDust />
      </Canvas>
    </div>
  );
}
