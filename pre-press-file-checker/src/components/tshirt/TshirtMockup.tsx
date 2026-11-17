import React, { useRef } from 'react';
import { TSHIRT_COLORS, TSHIRT_FORMATS, TshirtColor, TshirtFormat, TshirtSide } from '../../utils/tshirtPricing';

/** Plaats van het ontwerp binnen het printvak: schaal (0,2–1) en positie in de vrije ruimte (0–1). */
export interface DesignPlacement {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_PLACEMENT: DesignPlacement = { scale: 1, offsetX: 0.5, offsetY: 0 };

/** SVG-eenheden per mm: het lijf (200 eenheden breed) staat voor een shirt van ca. 52 cm. */
const UNITS_PER_MM = 200 / 520;

/** Printvak op het shirt in SVG-eenheden. */
export function printArea(side: TshirtSide, format: TshirtFormat) {
  const spec = TSHIRT_FORMATS[format];
  const width = spec.widthMm * UNITS_PER_MM;
  const height = spec.heightMm * UNITS_PER_MM;
  if (side === 'voor' && format === 'klein') {
    // Klein logo links op de borst (voor de drager), dus rechts in beeld.
    return { x: 248 - width / 2, y: 92, width, height };
  }
  return { x: 200 - width / 2, y: side === 'voor' ? 84 : 72, width, height };
}

/** Afmeting van het ontwerp binnen het vak (contain), in fracties van het vak. */
export function fittedSize(imageWidth: number, imageHeight: number, format: TshirtFormat) {
  const spec = TSHIRT_FORMATS[format];
  const imageRatio = imageWidth / imageHeight;
  const areaRatio = spec.widthMm / spec.heightMm;
  return imageRatio > areaRatio
    ? { widthMm: spec.widthMm, heightMm: spec.widthMm / imageRatio }
    : { widthMm: spec.heightMm * imageRatio, heightMm: spec.heightMm };
}

/** Werkelijke printmaat in mm na schalen. */
export function printedSizeMm(imageWidth: number, imageHeight: number, format: TshirtFormat, scale: number) {
  const fitted = fittedSize(imageWidth, imageHeight, format);
  return { widthMm: fitted.widthMm * scale, heightMm: fitted.heightMm * scale };
}

const SHIRT_PATH = {
  voor: 'M150 40 C168 62 232 62 250 40 L306 58 L372 128 L332 162 L300 136 L300 410 Q200 424 100 410 L100 136 L68 162 L28 128 L94 58 Z',
  achter: 'M150 40 C172 50 228 50 250 40 L306 58 L372 128 L332 162 L300 136 L300 410 Q200 424 100 410 L100 136 L68 162 L28 128 L94 58 Z',
};

export function TshirtMockup({
  color,
  side,
  format,
  imageUrl,
  imageWidth,
  imageHeight,
  placement = DEFAULT_PLACEMENT,
  onPlacementChange,
  showGuide = true,
  className = '',
}: {
  color: TshirtColor;
  side: TshirtSide;
  format: TshirtFormat | null;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  placement?: DesignPlacement;
  onPlacementChange?: (placement: DesignPlacement) => void;
  showGuide?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ startX: number; startY: number; start: DesignPlacement; freeX: number; freeY: number } | null>(null);
  const dark = color === 'zwart';
  const fill = TSHIRT_COLORS[color].hex;
  const stroke = dark ? '#3a3d45' : '#cbd5e1';
  const area = format ? printArea(side, format) : null;

  let design: { x: number; y: number; width: number; height: number; freeX: number; freeY: number } | null = null;
  if (area && format && imageUrl && imageWidth && imageHeight) {
    const fitted = fittedSize(imageWidth, imageHeight, format);
    const width = fitted.widthMm * UNITS_PER_MM * placement.scale;
    const height = fitted.heightMm * UNITS_PER_MM * placement.scale;
    const freeX = area.width - width;
    const freeY = area.height - height;
    design = { x: area.x + freeX * placement.offsetX, y: area.y + freeY * placement.offsetY, width, height, freeX, freeY };
  }

  const toSvgUnits = (clientDelta: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    return clientDelta * (400 / svg.getBoundingClientRect().width);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!onPlacementChange || !design) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, start: placement, freeX: design.freeX, freeY: design.freeY };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || !onPlacementChange) return;
    const dx = toSvgUnits(event.clientX - current.startX);
    const dy = toSvgUnits(event.clientY - current.startY);
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    onPlacementChange({
      ...current.start,
      offsetX: current.freeX > 0.5 ? clamp(current.start.offsetX + dx / current.freeX) : 0.5,
      offsetY: current.freeY > 0.5 ? clamp(current.start.offsetY + dy / current.freeY) : 0,
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const gradientId = `shade-${color}-${side}`;
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 440"
      role="img"
      aria-label={`T-shirt ${TSHIRT_COLORS[color].name.toLowerCase()}, ${side === 'voor' ? 'voorkant' : 'achterkant'}`}
      className={`touch-none select-none ${className}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity={dark ? 0.35 : 0.18} />
          <stop offset="0.18" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity="0" />
          <stop offset="0.82" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity="0" />
          <stop offset="1" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity={dark ? 0.35 : 0.18} />
        </linearGradient>
        <clipPath id={`clip-${color}-${side}`}>
          <path d={SHIRT_PATH[side]} />
        </clipPath>
      </defs>
      <path d={SHIRT_PATH[side]} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d={SHIRT_PATH[side]} fill={`url(#${gradientId})`} />
      {/* Kraag en naden */}
      {side === 'voor'
        ? <path d="M150 40 C168 62 232 62 250 40" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" opacity="0.8" />
        : <path d="M150 40 C172 50 228 50 250 40" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" opacity="0.8" />}
      <path d="M100 136 L94 58 M300 136 L306 58" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.6" />
      <path d="M44 144 L80 112 M356 144 L320 112" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.6" />

      {design && imageUrl && (
        <g clipPath={`url(#clip-${color}-${side})`}>
          <image
            href={imageUrl}
            x={design.x}
            y={design.y}
            width={design.width}
            height={design.height}
            preserveAspectRatio="xMidYMid meet"
            style={{ cursor: onPlacementChange ? 'move' : 'default' }}
            onPointerDown={onPointerDown}
          />
        </g>
      )}

      {area && showGuide && (
        <g pointerEvents="none">
          <rect x={area.x} y={area.y} width={area.width} height={area.height} fill={design ? 'none' : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.10)')} stroke={dark ? '#94a3b8' : '#64748b'} strokeWidth="1.2" strokeDasharray="5 4" />
          {!design && (
            <text x={area.x + area.width / 2} y={area.y + area.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={format === 'klein' ? 7 : 12} fontWeight="600" fill={dark ? '#cbd5e1' : '#475569'}>
              <tspan x={area.x + area.width / 2} dy="-0.6em">Plaats hier</tspan>
              <tspan x={area.x + area.width / 2} dy="1.2em">je ontwerp</tspan>
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
