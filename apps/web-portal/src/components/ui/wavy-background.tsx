"use client";
import React, { useEffect, useRef, useCallback } from "react";

function createNoise(seed = 0) {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];

  function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a: number, b: number, t: number) { return a + t * (b - a); }
  function grad(hash: number, x: number) { return hash & 1 ? -x : x; }

  return function noise1D(x: number) {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = fade(x);
    return lerp(grad(p[X], x), grad(p[X + 1], x - 1), u);
  };
}

export function WavyBackground({
  className,
  containerRef,
  colors,
  waveWidth,
  blur = 10,
  speed = "fast",
  waveOpacity = 0.5,
}: {
  className?: string;
  containerRef: React.RefObject<HTMLElement | null>;
  colors?: string[];
  waveWidth?: number;
  blur?: number;
  speed?: "slow" | "fast";
  waveOpacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationId = useRef<number>(0);
  const noiseRef = useRef(createNoise(42));

  const waveColors = colors ?? [
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#2563eb",
  ];

  const speedVal = speed === "slow" ? 0.001 : 0.002;

  const drawWave = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, nt: number) => {
    const noise = noiseRef.current;
    const bandHeight = waveWidth || 80;

    for (let i = 0; i < waveColors.length; i++) {
      ctx.beginPath();
      ctx.globalAlpha = waveOpacity;

      // Draw top edge of wave band
      for (let x = 0; x <= w; x += 4) {
        const y = noise(x / 800 + i * 0.4 + nt) * 100 + h * (0.25 + i * 0.12);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Draw bottom edge (offset down by bandHeight) going back
      for (let x = w; x >= 0; x -= 4) {
        const y = noise(x / 800 + i * 0.4 + nt) * 100 + h * (0.25 + i * 0.12) + bandHeight;
        ctx.lineTo(x, y);
      }

      ctx.closePath();

      // Create gradient fill for each band
      const centerY = h * (0.25 + i * 0.12) + bandHeight / 2;
      const gradient = ctx.createLinearGradient(0, centerY - bandHeight, 0, centerY + bandHeight);
      gradient.addColorStop(0, waveColors[i] + "00");
      gradient.addColorStop(0.3, waveColors[i]);
      gradient.addColorStop(0.7, waveColors[i]);
      gradient.addColorStop(1, waveColors[i] + "00");

      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, [waveColors, waveOpacity, waveWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let nt = 0;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncSize();
    window.addEventListener("resize", syncSize);

    const render = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nt += speedVal;
      drawWave(ctx, w, h, nt);
      animationId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId.current);
      window.removeEventListener("resize", syncSize);
    };
  }, [containerRef, speedVal, drawWave]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        style={{ filter: `blur(${blur}px)` }}
      />
    </div>
  );
}
