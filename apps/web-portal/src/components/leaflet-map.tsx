'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';

interface Pin {
  id: number;
  lat: number;
  lng: number;
  label: string;
  type: string;
}

interface LeafletMapProps {
  pins: Pin[];
  selectedPins: number[];
  onTogglePin: (id: number) => void;
  phase: string;
}

function createPinIcon(selected: boolean, diffusing: boolean) {
  const done = diffusing;

  const glowRing = selected && !done
    ? `<div class="neo-pulse-ring"></div><div class="neo-pulse-ring neo-pulse-ring-2"></div>`
    : '';

  const doneWave = done
    ? `<div class="neo-done-wave"></div><div class="neo-done-wave neo-done-wave-2"></div>`
    : '';

  const ambientColor = done ? '34,197,94' : selected ? '59,130,246' : '59,130,246';
  const ambientOpacity = done ? 0.5 : selected ? 0.35 : 0.15;
  const ambientSize = done ? 48 : selected ? 44 : 32;

  const bgColor = done ? '#22c55e' : selected ? '#3b82f6' : 'rgba(15,23,42,0.85)';
  const borderColor = done ? '#86efac' : selected ? '#93c5fd' : 'rgba(148,163,184,0.3)';

  return L.divIcon({
    className: 'neofilm-pin',
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -50],
    html: `
      <div style="position:relative;width:40px;height:48px;cursor:pointer;">
        ${glowRing}${doneWave}
        <div style="
          position:absolute;bottom:4px;left:50%;transform:translateX(-50%);
          width:${ambientSize}px;height:${ambientSize / 2}px;
          background:radial-gradient(ellipse, rgba(${ambientColor},${ambientOpacity}) 0%, transparent 70%);
          filter:blur(4px);pointer-events:none;
        "></div>
        <div style="
          position:relative;z-index:2;
          width:36px;height:36px;border-radius:50%;margin:0 auto;
          background:${bgColor};
          border:1.5px solid ${borderColor};
          box-shadow:
            0 0 ${selected || done ? '20' : '8'}px rgba(${ambientColor},${selected || done ? 0.4 : 0.1}),
            0 4px 12px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,${done ? 0.2 : selected ? 0.15 : 0.05});
          display:flex;align-items:center;justify-content:center;
          transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
          backdrop-filter:blur(8px);
        ">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:${selected || done ? 1 : 0.7}">
            ${done
              ? '<polyline points="20 6 9 17 4 12"/>'
              : selected
                ? '<polyline points="20 6 9 17 4 12"/>'
                : '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>'
            }
          </svg>
        </div>
        <div style="
          position:absolute;bottom:2px;left:50%;transform:translateX(-50%) rotate(45deg);
          width:10px;height:10px;z-index:1;
          background:${bgColor};
          border-right:1.5px solid ${borderColor};
          border-bottom:1.5px solid ${borderColor};
          box-shadow:4px 4px 8px rgba(0,0,0,0.2);
        "></div>
      </div>
    `,
  });
}

export default function LeafletMap({ pins, selectedPins, onTogglePin, phase }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const onTogglePinRef = useRef(onTogglePin);
  onTogglePinRef.current = onTogglePin;
  const selectedPinsRef = useRef(selectedPins);
  selectedPinsRef.current = selectedPins;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [46.8, 2.8],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstance.current = map;

    // Force Leaflet to recalculate container size (fixes grey/blank tiles)
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    // Also watch for resize
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapRef.current);

    pins.forEach((pin, i) => {
      setTimeout(() => {
        if (!mapInstance.current) return;
        const isSelected = selectedPinsRef.current.includes(pin.id);
        const isDiffusing = (phaseRef.current === 'diffusing' || phaseRef.current === 'done') && isSelected;
        const marker = L.marker([pin.lat, pin.lng], {
          icon: createPinIcon(isSelected, isDiffusing),
        }).addTo(mapInstance.current);

        marker.bindTooltip(pin.label, {
          direction: 'top',
          offset: [0, -50],
          className: 'neofilm-tooltip',
        });

        marker.on('click', () => onTogglePinRef.current(pin.id));
        markersRef.current.set(pin.id, marker);
      }, 100 + i * 15);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapInstance.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update only the pins that changed (performance: avoid re-rendering all 100)
  const prevSelectedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const prevSet = prevSelectedRef.current;
    const newSet = new Set(selectedPins);

    markersRef.current.forEach((marker, id) => {
      const wasSelected = prevSet.has(id);
      const isSelected = newSet.has(id);
      if (wasSelected === isSelected && phase !== 'diffusing' && phase !== 'done') return;

      const isDiffusing = (phase === 'diffusing' || phase === 'done') && isSelected;
      marker.setIcon(createPinIcon(isSelected, isDiffusing));

      // Bounce only newly selected pins
      if (isSelected && !wasSelected) {
        const el = marker.getElement();
        if (el) {
          el.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
          el.style.transform = 'scale(1.2)';
          setTimeout(() => { el.style.transform = 'scale(1)'; }, 250);
        }
      }
    });

    prevSelectedRef.current = newSet;
  }, [selectedPins, phase]);

  return (
    <>
      <style>{`
        /* ── Leaflet core CSS (inlined to avoid import issues with Next.js) ── */
        .leaflet-pane,
        .leaflet-tile,
        .leaflet-marker-icon,
        .leaflet-marker-shadow,
        .leaflet-tile-container,
        .leaflet-pane > svg,
        .leaflet-pane > canvas,
        .leaflet-zoom-box,
        .leaflet-image-layer,
        .leaflet-layer { position: absolute; left: 0; top: 0; }
        .leaflet-container { overflow: hidden !important; clip-path: inset(0) !important; }
        .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow { user-select: none; -webkit-user-select: none; }
        .leaflet-tile::selection { background: transparent; }
        .leaflet-safari .leaflet-tile { image-rendering: -webkit-optimize-contrast; }
        .leaflet-safari .leaflet-tile-container { width: 1600px; height: 1600px; -webkit-transform-origin: 0 0; }
        .leaflet-marker-icon, .leaflet-marker-shadow { display: block; }
        .leaflet-container .leaflet-overlay-pane svg { max-width: none !important; max-height: none !important; }
        .leaflet-container .leaflet-marker-pane img,
        .leaflet-container .leaflet-shadow-pane img,
        .leaflet-container .leaflet-tile-pane img,
        .leaflet-container img.leaflet-image-layer,
        .leaflet-container .leaflet-tile { max-width: none !important; max-height: none !important; width: auto; padding: 0; }
        .leaflet-container.leaflet-touch-zoom { touch-action: pan-x pan-y; }
        .leaflet-container.leaflet-touch-drag { touch-action: none; touch-action: pinch-zoom; }
        .leaflet-container.leaflet-touch-drag.leaflet-touch-zoom { touch-action: none; }
        .leaflet-container { -webkit-tap-highlight-color: transparent; }
        .leaflet-tile { filter: inherit; visibility: hidden; }
        .leaflet-tile-loaded { visibility: inherit; }
        .leaflet-zoom-box { width: 0; height: 0; box-sizing: border-box; z-index: 800; }
        .leaflet-overlay-pane svg { -moz-user-select: none; }
        .leaflet-pane { z-index: 400; }
        .leaflet-tile-pane { z-index: 200; }
        .leaflet-overlay-pane { z-index: 400; }
        .leaflet-shadow-pane { z-index: 500; }
        .leaflet-marker-pane { z-index: 600; }
        .leaflet-tooltip-pane { z-index: 650; }
        .leaflet-popup-pane { z-index: 700; }
        .leaflet-map-pane canvas { z-index: 100; }
        .leaflet-map-pane svg { z-index: 200; }
        .leaflet-control { position: relative; z-index: 800; pointer-events: visiblePainted; pointer-events: auto; }
        .leaflet-top, .leaflet-bottom { position: absolute; z-index: 1000; pointer-events: none; }
        .leaflet-top { top: 0; }
        .leaflet-right { right: 0; }
        .leaflet-bottom { bottom: 0; }
        .leaflet-left { left: 0; }
        .leaflet-control { float: left; clear: both; }
        .leaflet-right .leaflet-control { float: right; }
        .leaflet-top .leaflet-control { margin-top: 10px; }
        .leaflet-bottom .leaflet-control { margin-bottom: 10px; }
        .leaflet-left .leaflet-control { margin-left: 10px; }
        .leaflet-right .leaflet-control { margin-right: 10px; }
        .leaflet-fade-anim .leaflet-popup { opacity: 0; transition: opacity 0.2s linear; }
        .leaflet-fade-anim .leaflet-map-pane .leaflet-popup { opacity: 1; }
        .leaflet-zoom-animated { transform-origin: 0 0; }
        .leaflet-zoom-anim .leaflet-zoom-animated { will-change: transform; transition: transform 0.25s cubic-bezier(0,0,0.25,1); }
        .leaflet-zoom-anim .leaflet-tile, .leaflet-pan-anim .leaflet-tile { transition: none; }
        .leaflet-interactive { cursor: pointer; }
        .leaflet-grab { cursor: grab; }
        .leaflet-crosshair, .leaflet-crosshair .leaflet-interactive { cursor: crosshair; }
        .leaflet-control-zoom a { width: 30px; height: 30px; line-height: 30px; display: block; text-align: center; text-decoration: none; font: bold 18px 'Lucida Console', Monaco, monospace; }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out { font: bold 18px 'Lucida Console', Monaco, monospace; text-indent: 1px; }
        .leaflet-touch .leaflet-control-zoom-in, .leaflet-touch .leaflet-control-zoom-out { font-size: 22px; }

        /* ── Tooltip ── */
        .leaflet-tooltip { position: absolute; padding: 6px 12px; background: rgba(15,23,42,0.95); border: 1px solid rgba(148,163,184,0.2); border-radius: 8px; color: #f1f5f9; font-size: 11px; font-weight: 500; white-space: nowrap; pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,0.4); backdrop-filter: blur(8px); letter-spacing: 0.01em; }
        .leaflet-tooltip-top::before { position: absolute; content: ''; border: 6px solid transparent; border-top-color: rgba(15,23,42,0.95); bottom: -12px; left: 50%; margin-left: -6px; }
        .leaflet-tooltip-bottom::before { border-bottom-color: rgba(15,23,42,0.95); top: -12px; left: 50%; margin-left: -6px; }
        .leaflet-tooltip-left::before { border-left-color: rgba(15,23,42,0.95); right: -12px; top: 50%; margin-top: -6px; }
        .leaflet-tooltip-right::before { border-right-color: rgba(15,23,42,0.95); left: -12px; top: 50%; margin-top: -6px; }

        /* ── Custom NeoFilm styles ── */
        .neofilm-pin { background: none !important; border: none !important; overflow: visible !important; }

        .neo-pulse-ring {
          position: absolute; top: 18px; left: 50%;
          width: 36px; height: 36px; border-radius: 50%;
          border: 1.5px solid rgba(59,130,246,0.5);
          transform: translate(-50%, -50%);
          animation: neo-ping 2s cubic-bezier(0,0,0.2,1) infinite;
          pointer-events: none;
        }
        .neo-pulse-ring-2 { animation-delay: 0.6s; }

        @keyframes neo-ping {
          0% { width: 36px; height: 36px; opacity: 0.8; }
          100% { width: 72px; height: 72px; opacity: 0; }
        }

        .neo-done-wave {
          position: absolute; top: 18px; left: 50%;
          width: 36px; height: 36px; border-radius: 50%;
          border: 2px solid rgba(34,197,94,0.6);
          transform: translate(-50%, -50%);
          animation: neo-wave 1.5s ease-out forwards;
          pointer-events: none;
        }
        .neo-done-wave-2 { animation-delay: 0.3s; }

        @keyframes neo-wave {
          0% { width: 36px; height: 36px; opacity: 0.9; }
          100% { width: 100px; height: 100px; opacity: 0; }
        }

        .neo-line-animate { animation: neo-dash 1s linear infinite; }
        @keyframes neo-dash { to { stroke-dashoffset: -20; } }

        /* Dark zoom controls */
        .leaflet-control-zoom { border: 1px solid rgba(148,163,184,0.15) !important; border-radius: 8px !important; overflow: hidden; }
        .leaflet-control-zoom a {
          background: rgba(15,23,42,0.8) !important;
          color: #94a3b8 !important;
          border-color: rgba(148,163,184,0.15) !important;
          backdrop-filter: blur(8px);
          width: 32px !important; height: 32px !important; line-height: 32px !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(30,41,59,0.9) !important;
          color: #e2e8f0 !important;
        }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', clipPath: 'inset(0)', overflow: 'hidden' }} />
    </>
  );
}
