import React, { forwardRef, useRef } from 'react';
import {
  TSHIRT_COLORS,
  TSHIRT_MAX_LONG_MM,
  TSHIRT_MAX_SHORT_MM,
  TSHIRT_MIN_MM,
  TshirtColor,
  TshirtDesign,
  TshirtSide,
} from '../../utils/tshirtPricing';

/** Opdruk met de afbeelding die erbij hoort (url = data-URL of serveradres). */
export interface PlacedDesign extends TshirtDesign {
  url?: string;
}

/** SVG-eenheden per mm: het lijf (200 eenheden breed) staat voor een shirt van ca. 52 cm breed en 73 cm lang. */
export const UNITS_PER_MM = 200 / 520;
const CENTER_X = 200;
const COLLAR_Y = 30;
/** Grenzen van het shirt (incl. mouwen) in mm, voor het midden van een opdruk. */
const BOUNDS = { minX: (28 - CENTER_X) / UNITS_PER_MM, maxX: (372 - CENTER_X) / UNITS_PER_MM, minY: 0, maxY: (310 - COLLAR_Y) / UNITS_PER_MM };

export const toSvgX = (xMm: number) => CENTER_X + xMm * UNITS_PER_MM;
export const toSvgY = (yMm: number) => COLLAR_Y + yMm * UNITS_PER_MM;

const SHIRT_PATH = {
  voor: 'M150 30 C168 52 232 52 250 30 L306 46 L372 112 L334 146 L300 120 L300 308 Q200 318 100 308 L100 120 L66 146 L28 112 L94 46 Z',
  achter: 'M150 30 C172 40 228 40 250 30 L306 46 L372 112 L334 146 L300 120 L300 308 Q200 318 100 308 L100 120 L66 146 L28 112 L94 46 Z',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Begrenst de maat zodat de opdruk binnen A3 blijft en niet kleiner wordt dan 2 cm. */
export function clampScale(widthMm: number, heightMm: number, factor: number) {
  const long = Math.max(widthMm, heightMm);
  const short = Math.min(widthMm, heightMm);
  const maxFactor = Math.min(TSHIRT_MAX_LONG_MM / long, TSHIRT_MAX_SHORT_MM / short);
  const minFactor = TSHIRT_MIN_MM / long;
  return clamp(factor, minFactor, maxFactor);
}

export function clampPosition<T extends { xMm: number; yMm: number }>(design: T): T {
  return { ...design, xMm: clamp(design.xMm, BOUNDS.minX, BOUNDS.maxX), yMm: clamp(design.yMm, BOUNDS.minY, BOUNDS.maxY) };
}

type DragState =
  | { mode: 'move'; id: string; startX: number; startY: number; start: PlacedDesign }
  | { mode: 'resize'; id: string; sx: -1 | 0 | 1; sy: -1 | 0 | 1; start: PlacedDesign };

const HANDLES: Array<{ sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }> = [
  { sx: -1, sy: -1, cursor: 'nwse-resize' }, { sx: 0, sy: -1, cursor: 'ns-resize' }, { sx: 1, sy: -1, cursor: 'nesw-resize' },
  { sx: 1, sy: 0, cursor: 'ew-resize' }, { sx: 1, sy: 1, cursor: 'nwse-resize' }, { sx: 0, sy: 1, cursor: 'ns-resize' },
  { sx: -1, sy: 1, cursor: 'nesw-resize' }, { sx: -1, sy: 0, cursor: 'ew-resize' },
];

/**
 * Shirt met opdrukken. Opdrukken kunnen overal op het shirt staan: slepen om te verplaatsen,
 * aan een hoek of zijkant trekken om groter of kleiner te maken (verhouding blijft gelijk).
 */
export const TshirtCanvas = forwardRef<SVGSVGElement, {
  color: TshirtColor;
  side: TshirtSide;
  designs: PlacedDesign[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (design: PlacedDesign) => void;
  emptyHint?: boolean;
  className?: string;
}>(function TshirtCanvas({ color, side, designs, selectedId = null, onSelect, onChange, emptyHint = false, className = '' }, forwardedRef) {
  const localRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const dark = color === 'zwart';
  const fill = TSHIRT_COLORS[color].hex;
  const stroke = dark ? '#3a3d45' : '#cbd5e1';
  const editable = Boolean(onChange);
  const clipId = `clip-${color}-${side}-${editable ? 'edit' : 'view'}`;
  const gradientId = `shade-${color}-${side}-${editable ? 'edit' : 'view'}`;

  const setRef = (node: SVGSVGElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  /** Schermpositie → mm op het shirt. */
  const toMm = (event: React.PointerEvent) => {
    const svg = localRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: (local.x - CENTER_X) / UNITS_PER_MM, y: (local.y - COLLAR_Y) / UNITS_PER_MM };
  };

  const begin = (event: React.PointerEvent, state: DragState) => {
    event.stopPropagation();
    event.preventDefault();
    localRef.current?.setPointerCapture?.(event.pointerId);
    drag.current = state;
    onSelect?.(state.id);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || !onChange) return;
    const pointer = toMm(event);
    const start = state.start;
    if (state.mode === 'move') {
      onChange(clampPosition({ ...start, xMm: start.xMm + pointer.x - state.startX, yMm: start.yMm + pointer.y - state.startY }));
      return;
    }
    // Schalen vanaf de tegenoverliggende hoek of zijde; de verhouding blijft gelijk.
    const anchorX = start.xMm - state.sx * start.widthMm / 2;
    const anchorY = start.yMm - state.sy * start.heightMm / 2;
    const ratioX = state.sx ? Math.abs(pointer.x - anchorX) / start.widthMm : 0;
    const ratioY = state.sy ? Math.abs(pointer.y - anchorY) / start.heightMm : 0;
    const factor = clampScale(start.widthMm, start.heightMm, Math.max(ratioX, ratioY) || 1);
    const widthMm = start.widthMm * factor;
    const heightMm = start.heightMm * factor;
    onChange(clampPosition({
      ...start,
      widthMm,
      heightMm,
      xMm: state.sx ? anchorX + state.sx * widthMm / 2 : start.xMm,
      yMm: state.sy ? anchorY + state.sy * heightMm / 2 : start.yMm,
    }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const selected = designs.find((design) => design.id === selectedId);
  const handleSize = 9;

  return (
    <svg
      ref={setRef}
      viewBox="0 0 400 340"
      role="img"
      aria-label={`T-shirt ${TSHIRT_COLORS[color].name.toLowerCase()}, ${side === 'voor' ? 'voorkant' : 'achterkant'}`}
      className={`touch-none select-none ${className}`}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => onSelect?.(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity={dark ? 0.35 : 0.18} />
          <stop offset="0.18" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity="0" />
          <stop offset="0.82" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity="0" />
          <stop offset="1" stopColor={dark ? '#000' : '#94a3b8'} stopOpacity={dark ? 0.35 : 0.18} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={SHIRT_PATH[side]} />
        </clipPath>
      </defs>
      <path d={SHIRT_PATH[side]} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d={SHIRT_PATH[side]} fill={`url(#${gradientId})`} />
      {side === 'voor'
        ? <path d="M150 30 C168 52 232 52 250 30" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" opacity="0.8" />
        : <path d="M150 30 C172 40 228 40 250 30" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" opacity="0.8" />}
      <path d="M100 120 L94 46 M300 120 L306 46" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.6" />
      <path d="M44 128 L80 98 M356 128 L320 98" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.6" />

      {designs.length === 0 && emptyHint && (
        <g pointerEvents="none">
          <rect x={toSvgX(-105)} y={toSvgY(80)} width={210 * UNITS_PER_MM} height={300 * UNITS_PER_MM} fill={dark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.10)'} stroke={dark ? '#94a3b8' : '#64748b'} strokeWidth="1.2" strokeDasharray="5 4" />
          <text x={CENTER_X} y={toSvgY(230)} textAnchor="middle" fontSize="11" fontWeight="600" fill={dark ? '#cbd5e1' : '#475569'}>
            <tspan x={CENTER_X} dy="-0.6em">Plaats hier</tspan>
            <tspan x={CENTER_X} dy="1.2em">je ontwerp</tspan>
          </text>
        </g>
      )}

      <g clipPath={`url(#${clipId})`}>
        {designs.map((design) => (
          design.url ? (
            <image
              key={design.id}
              href={design.url}
              x={toSvgX(design.xMm - design.widthMm / 2)}
              y={toSvgY(design.yMm - design.heightMm / 2)}
              width={design.widthMm * UNITS_PER_MM}
              height={design.heightMm * UNITS_PER_MM}
              preserveAspectRatio="none"
              style={{ cursor: editable ? 'move' : 'default' }}
              onPointerDown={editable ? (event) => { const point = toMm(event); begin(event, { mode: 'move', id: design.id, startX: point.x, startY: point.y, start: design }); } : undefined}
            />
          ) : (
            <rect key={design.id} x={toSvgX(design.xMm - design.widthMm / 2)} y={toSvgY(design.yMm - design.heightMm / 2)} width={design.widthMm * UNITS_PER_MM} height={design.heightMm * UNITS_PER_MM} fill="rgba(148,163,184,0.35)" />
          )
        ))}
      </g>

      {editable && selected && (() => {
        const x = toSvgX(selected.xMm - selected.widthMm / 2);
        const y = toSvgY(selected.yMm - selected.heightMm / 2);
        const width = selected.widthMm * UNITS_PER_MM;
        const height = selected.heightMm * UNITS_PER_MM;
        return (
          <g>
            <rect x={x} y={y} width={width} height={height} fill="none" stroke="#0369a1" strokeWidth="1.2" strokeDasharray="4 3" pointerEvents="none" />
            {HANDLES.map((handle) => (
              <rect
                key={`${handle.sx}${handle.sy}`}
                x={x + (handle.sx + 1) / 2 * width - handleSize / 2}
                y={y + (handle.sy + 1) / 2 * height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                rx="2"
                fill="#fff"
                stroke="#0369a1"
                strokeWidth="1.5"
                style={{ cursor: handle.cursor }}
                onPointerDown={(event) => begin(event, { mode: 'resize', id: selected.id, sx: handle.sx, sy: handle.sy, start: selected })}
              />
            ))}
          </g>
        );
      })()}
    </svg>
  );
});
