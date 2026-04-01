"use client";
import React, { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";

export function TextHoverEffect({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });

  useEffect(() => {
    if (svgRef.current && hovered) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const cxPercent = ((cursor.x - svgRect.left) / svgRect.width) * 100;
      const cyPercent = ((cursor.y - svgRect.top) / svgRect.height) * 100;
      setMaskPosition({
        cx: `${cxPercent}%`,
        cy: `${cyPercent}%`,
      });
    }
  }, [cursor, hovered]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 700 150"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      className={className}
    >
      <defs>
        {/* Gradient that follows cursor */}
        <radialGradient
          id="textRevealGradient"
          cx={maskPosition.cx}
          cy={maskPosition.cy}
          r="30%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>

        {/* Animated stroke gradient */}
        <linearGradient id="textStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="25%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="75%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>

        {/* Hover fill gradient */}
        <linearGradient id="textFillGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="30%" stopColor="#818cf8" />
          <stop offset="60%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        <mask id="textRevealMask">
          <rect x="0" y="0" width="100%" height="100%" fill="url(#textRevealGradient)" />
        </mask>
      </defs>

      {/* Base text — subtle outline */}
      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        strokeWidth="1"
        className="fill-transparent"
        style={{ stroke: "rgba(156, 163, 175, 0.15)", fontSize: "120px", fontWeight: 900, fontFamily: "system-ui, sans-serif" }}
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        animate={{ strokeDashoffset: 0, strokeDasharray: 1000 }}
        transition={{ duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>

      {/* Animated stroke gradient text */}
      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        strokeWidth="1.5"
        className="fill-transparent"
        style={{ stroke: "url(#textStrokeGradient)", fontSize: "120px", fontWeight: 900, fontFamily: "system-ui, sans-serif" }}
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        animate={{ strokeDashoffset: 0, strokeDasharray: 1000 }}
        transition={{ duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>

      {/* Hover reveal — gradient fill follows mouse */}
      {hovered && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          strokeWidth="0"
          style={{ fill: "url(#textFillGradient)", mask: "url(#textRevealMask)", fontSize: "120px", fontWeight: 900, fontFamily: "system-ui, sans-serif" }}
        >
          {text}
        </text>
      )}
    </svg>
  );
}
