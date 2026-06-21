
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PdfAnnotation, JobPrint, User, UserRole } from '../types.ts';
import { apiService } from '../services/apiService.ts';

// Use workerSrc (URL) so pdfjs manages its own Worker lifecycle.
// This is the standard approach: avoids shared-worker bad-state after errors
// and works without blob-URL CSP restrictions.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

type ToolType =
  | 'select' | 'pan'
  | 'pen' | 'highlighter'
  | 'text' | 'callout' | 'stamp'
  | 'arrow' | 'double_arrow' | 'line' | 'dashed_line' | 'dimension'
  | 'rectangle' | 'filled_rectangle' | 'circle' | 'filled_circle' | 'cloud'
  | 'scale';

const STAMP_TYPES = ['APPROVED', 'REVISED', 'FIELD CHANGE', 'AS BUILT', 'NOT APPROVED', 'VOID'] as const;
type StampType = typeof STAMP_TYPES[number];

const STAMP_COLORS: Record<StampType, string> = {
  'APPROVED':      '#22c55e',
  'REVISED':       '#f59e0b',
  'FIELD CHANGE':  '#3b82f6',
  'AS BUILT':      '#8b5cf6',
  'NOT APPROVED':  '#ef4444',
  'VOID':          '#6b7280',
};

interface AnyAnnotationData extends Record<string, unknown> {
  points?:    Array<{ x: number; y: number; pressure?: number }>;
  x?:         number;
  y?:         number;
  text?:      string;
  fontSize?:  number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
  opacity?:   number;
  stampType?: StampType;
  rotation?:  number;  // rotation in degrees (clockwise, 0 = no rotation)
}

interface ScaleInfo {
  unitsPerNormDist: number;  // real units per canonical normalized distance
  aspectRatio: number;       // canvas W/H (fixed for PDF page)
  unit: string;
}

interface PdfMarkupEditorProps {
  print: JobPrint;
  sessionUser: User;
  onClose: () => void;
  isDarkMode?: boolean;
}

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
  '#ffffff','#000000',
];
const STROKE_WIDTHS = [1, 2, 4, 6, 10];
const FONT_SIZES    = [10, 12, 14, 18, 24, 32, 48];
const RAINBOW_GRADIENT = 'conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#8b5cf6,#ec4899,#ef4444)';

// Thresholds are in normalized 0–1 canvas coordinates
const MAX_UNDO_STACK_SIZE       = 50;
const SELECTION_RADIUS_NORM     = 0.06;  // max distance to hit an annotation badge
const TAP_DISTANCE_NORM         = 0.015; // max movement to be treated as a tap (stamp)
const MIN_SHAPE_SIZE_NORM       = 0.005; // min drag distance to commit a shape
const HANDLE_HIT_RADIUS_NORM    = 0.06;  // tap radius to grab a control-point handle (larger = easier on touch)
const DEFAULT_FONT_SIZE         = 18;    // default font size for new text / callout annotations
const ROTATE_HANDLE_INDEX       = 100;   // reserved handle index for the rotation handle
const ROTATE_HANDLE_OFFSET_NORM = 0.055; // distance above bbox top (in normalised coords) for rotate handle
const EDGE_HANDLE_TOP           = 5;     // mid-top edge handle index
const EDGE_HANDLE_RIGHT         = 6;     // mid-right edge handle index
const EDGE_HANDLE_BOTTOM        = 7;     // mid-bottom edge handle index
const EDGE_HANDLE_LEFT          = 8;     // mid-left edge handle index

const generateTempId    = () => 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const isPendingAnnotation = (id: string) => id.startsWith('tmp-');

type ToolDef   = { id: ToolType; icon: React.ReactNode; title: string };
type ToolGroup = { label: string; tools: ToolDef[] };

const SvgIcon = (path: string) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path} />
  </svg>
);

const TOOL_GROUPS: ToolGroup[] = [
  { label: 'Navigate', tools: [
    { id: 'select',
      icon: SvgIcon('M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5'),
      title: 'Select (tap badge to select & delete)' },
    { id: 'pan',
      icon: SvgIcon('M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11'),
      title: 'Pan / Scroll (drag to navigate)' },
  ]},
  { label: 'Freehand', tools: [
    { id: 'pen',
      icon: SvgIcon('M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'),
      title: 'Freehand Pen' },
    { id: 'highlighter',
      icon: SvgIcon('M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'),
      title: 'Highlighter (semi-transparent)' },
  ]},
  { label: 'Text', tools: [
    { id: 'text',
      icon: <span className="text-sm font-black leading-none">T</span>,
      title: 'Text (tap to place)' },
    { id: 'callout',
      icon: SvgIcon('M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'),
      title: 'Callout (drag anchor to text box)' },
    { id: 'stamp',
      icon: SvgIcon('M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z'),
      title: 'Stamp (tap to place — pick type in properties)' },
  ]},
  { label: 'Lines', tools: [
    { id: 'line',         icon: SvgIcon('M4 20L20 4'),                                   title: 'Line' },
    { id: 'dashed_line',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" /></svg>, title: 'Dashed Line' },
    { id: 'arrow',        icon: SvgIcon('M14 5l7 7m0 0l-7 7m7-7H3'),                     title: 'Arrow' },
    { id: 'double_arrow', icon: SvgIcon('M7 16l-4-4m0 0l4-4m-4 4h18m0 0l-4 4m4-4l-4-4'), title: 'Double Arrow' },
    { id: 'dimension',    icon: SvgIcon('M8 9l4-4 4 4m0 6l-4 4-4-4'),                    title: 'Dimension / Measurement' },
  ]},
  { label: 'Shapes', tools: [
    { id: 'rectangle',
      icon: SvgIcon('M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z'),
      title: 'Rectangle' },
    { id: 'filled_rectangle',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>,
      title: 'Filled Rectangle' },
    { id: 'circle',
      icon: SvgIcon('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z'),
      title: 'Circle / Ellipse' },
    { id: 'filled_circle',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>,
      title: 'Filled Circle / Ellipse' },
    { id: 'cloud',
      icon: SvgIcon('M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z'),
      title: 'Revision Cloud' },
  ]},
  { label: 'Measure', tools: [
    { id: 'scale',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 17h18M8 7v2m0 6v2M12 5v4m0 6v4M16 7v2m0 6v2"/></svg>,
      title: 'Calibrate Scale (draw a reference line → enter its real-world distance)' },
  ]},
];

// ─────────────────────────────────────────────────────────────
// SVG rendering helpers
// ─────────────────────────────────────────────────────────────

const getCloudPath = (x: number, y: number, w: number, h: number): string => {
  const rx = Math.max(8, w / 9);
  const ry = Math.max(8, h / 9);
  const nx = Math.max(2, Math.round(w / (rx * 2.4)));
  const ny = Math.max(2, Math.round(h / (ry * 2.4)));
  const bw = w / nx, bh = h / ny;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < nx; i++) d += ` Q ${x + i * bw + bw / 2} ${y - ry} ${x + (i + 1) * bw} ${y}`;
  for (let i = 0; i < ny; i++) d += ` Q ${x + w + rx} ${y + i * bh + bh / 2} ${x + w} ${y + (i + 1) * bh}`;
  for (let i = nx - 1; i >= 0; i--) d += ` Q ${x + i * bw + bw / 2} ${y + h + ry} ${x + i * bw} ${y + h}`;
  for (let i = ny - 1; i >= 0; i--) d += ` Q ${x - rx} ${y + i * bh + bh / 2} ${x} ${y + i * bh}`;
  return d + ' Z';
};

const getRelativeCoords = (clientX: number, clientY: number, el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return { x: 0, y: 0 };
  return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
};

// Hit-test an annotation at normalized coordinates.
// Returns 0 when the tap is inside the padded bounding box, or the distance
// to the nearest edge when outside. Returns Infinity when no geometry is found.
const HIT_PAD_NORM = 0.03; // extra touch padding around annotation bounding box
const hitTestAnnotation = (ann: PdfAnnotation, coords: { x: number; y: number }): number => {
  const t = ann.toolType as ToolType;
  if (t === 'pen' || t === 'highlighter') {
    const anchor = getAnnotationAnchor(ann);
    return anchor ? Math.hypot(anchor.x - coords.x, anchor.y - coords.y) : Infinity;
  }
  const bbox = getAnnotationBBox(ann);
  if (!bbox) return Infinity;
  const x1 = bbox.x - HIT_PAD_NORM, y1 = bbox.y - HIT_PAD_NORM;
  const x2 = bbox.x + bbox.w + HIT_PAD_NORM, y2 = bbox.y + bbox.h + HIT_PAD_NORM;
  const dx = Math.max(x1 - coords.x, 0, coords.x - x2);
  const dy = Math.max(y1 - coords.y, 0, coords.y - y2);
  return Math.hypot(dx, dy);
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);

const renderAnnotationContent = (
  ann: { toolType: ToolType; color: string; strokeWidth: number; data: AnyAnnotationData },
  w: number, h: number, key: string,
  scaleInfo?: ScaleInfo | null,
): React.ReactElement | null => {
  const d  = ann.data;
  const c  = ann.color;
  const sw = ann.strokeWidth;
  const op = (d.opacity as number | undefined) ?? 1;
  const aid  = `ah-${key}`;
  const aid2 = `ah2-${key}`;

  switch (ann.toolType) {
    case 'pen': {
      if (!d.points || d.points.length < 2) return null;
      const pd = d.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
      return <path key={key} d={pd} stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
    }
    case 'highlighter': {
      if (!d.points || d.points.length < 2) return null;
      const pd = d.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
      return <path key={key} d={pd} stroke={c} strokeWidth={sw * 5}
        fill="none" strokeLinecap="square" strokeLinejoin="round" opacity={op * 0.35} />;
    }
    case 'text': {
      if (!d.text) return null;
      return (
        <text key={key} x={(d.x ?? 0) * w} y={(d.y ?? 0) * h}
          fill={c} fontSize={d.fontSize ?? DEFAULT_FONT_SIZE} fontFamily="Arial, sans-serif"
          fontWeight="bold" opacity={op} style={{ userSelect: 'none' }}>
          {d.text as string}
        </text>
      );
    }
    case 'callout': {
      if (d.x1 === undefined) return null;
      // x1,y1 = text-box center (draw start); x2,y2 = arrow tip (drag end)
      const bx = (d.x1 ?? 0) * w,  by = (d.y1 ?? 0) * h;
      const ax = (d.x2 ?? 0) * w,  ay = (d.y2 ?? 0) * h;
      // Scale box dimensions proportionally with canvas width so the callout looks
      // consistent at any zoom level (600 ≈ typical PDF page width at base zoom).
      const sf   = w / 600;
      const fs   = ((d.fontSize as number | undefined) ?? 14) * sf;
      const txt  = (d.text as string | undefined) ?? '';
      const estW = Math.max(80 * sf, txt.length * (fs * 0.62) + 24 * sf);
      const bx1  = bx - estW / 2, by1 = by - fs - 14 * sf, by2 = by + 10 * sf;
      return (
        <g key={key} opacity={op}>
          <defs>
            <marker id={aid} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={c} />
            </marker>
          </defs>
          <line x1={bx} y1={by2 - 2} x2={ax} y2={ay}
            stroke={c} strokeWidth={sw} markerEnd={`url(#${aid})`} />
          <rect x={bx1} y={by1} width={estW} height={by2 - by1}
            stroke={c} strokeWidth={sw} fill={c} fillOpacity={0.1} rx="4" />
          {txt && (
            <text x={bx1 + 10 * sf} y={by - 2} fill={c} fontSize={fs}
              fontFamily="Arial, sans-serif" fontWeight="bold">{txt}</text>
          )}
        </g>
      );
    }
    case 'stamp': {
      const st = (d.stampType as StampType | undefined) ?? 'APPROVED';
      const sc = STAMP_COLORS[st] ?? c;
      const sx = (d.x ?? 0) * w, sy = (d.y ?? 0) * h;
      const fs = 14, tw = st.length * (fs * 0.65) + 18, bh = 28;
      return (
        <g key={key} opacity={op} transform={`rotate(-12, ${sx + tw / 2}, ${sy - bh / 2})`}>
          <rect x={sx} y={sy - bh + 4} width={tw} height={bh}
            fill="none" stroke={sc} strokeWidth="3" rx="3" />
          <text x={sx + 9} y={sy - 3} fill={sc} fontSize={fs}
            fontFamily="Arial Narrow, Arial, sans-serif" fontWeight="900" letterSpacing="1.5">
            {st}
          </text>
        </g>
      );
    }
    case 'arrow': {
      if (d.x1 === undefined) return null;
      return (
        <g key={key} opacity={op}>
          <defs>
            <marker id={aid} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={c} />
            </marker>
          </defs>
          <line x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
            x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
            stroke={c} strokeWidth={sw} markerEnd={`url(#${aid})`} />
        </g>
      );
    }
    case 'double_arrow': {
      if (d.x1 === undefined) return null;
      return (
        <g key={key} opacity={op}>
          <defs>
            <marker id={aid}  markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={c} />
            </marker>
            <marker id={aid2} markerWidth="10" markerHeight="7" refX="1"  refY="3.5" orient="auto">
              <polygon points="10 0, 0 3.5, 10 7" fill={c} />
            </marker>
          </defs>
          <line x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
            x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
            stroke={c} strokeWidth={sw}
            markerStart={`url(#${aid2})`} markerEnd={`url(#${aid})`} />
        </g>
      );
    }
    case 'line': {
      if (d.x1 === undefined) return null;
      return <line key={key}
        x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
        x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
        stroke={c} strokeWidth={sw} strokeLinecap="round" opacity={op} />;
    }
    case 'dashed_line': {
      if (d.x1 === undefined) return null;
      return <line key={key}
        x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
        x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
        stroke={c} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${sw * 4} ${sw * 2}`} opacity={op} />;
    }
    case 'dimension': {
      if (d.x1 === undefined) return null;
      const lx1 = (d.x1 ?? 0) * w, ly1 = (d.y1 ?? 0) * h;
      const lx2 = (d.x2 ?? 0) * w, ly2 = (d.y2 ?? 0) * h;
      const len = Math.sqrt((lx2 - lx1) ** 2 + (ly2 - ly1) ** 2) || 1;
      const px  = (-(ly2 - ly1) / len) * 10;
      const py  = ((lx2 - lx1) / len) * 10;
      const midX = (lx1 + lx2) / 2;
      const midY = (ly1 + ly2) / 2;
      const angleDeg = Math.atan2(ly2 - ly1, lx2 - lx1) * 180 / Math.PI;
      let labelText: string;
      if (scaleInfo) {
        const dx = (d.x2 ?? 0) - (d.x1 ?? 0);
        const dy = (d.y2 ?? 0) - (d.y1 ?? 0);
        const ar = scaleInfo.aspectRatio;
        const normDist = Math.sqrt((dx * ar) ** 2 + dy ** 2);
        const realLen = normDist * scaleInfo.unitsPerNormDist;
        labelText = `${realLen.toFixed(2)} ${scaleInfo.unit}`;
      } else {
        labelText = `${Math.round(len)} px`;
      }
      const lblW = labelText.length * 6 + 10;
      return (
        <g key={key} opacity={op}>
          <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={c} strokeWidth={sw} />
          <line x1={lx1 + px} y1={ly1 + py} x2={lx1 - px} y2={ly1 - py}
            stroke={c} strokeWidth={sw} strokeLinecap="round" />
          <line x1={lx2 + px} y1={ly2 + py} x2={lx2 - px} y2={ly2 - py}
            stroke={c} strokeWidth={sw} strokeLinecap="round" />
          <g transform={`translate(${midX}, ${midY}) rotate(${angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg})`}>
            <rect x={-lblW / 2} y={-18} width={lblW} height={14} rx="3" fill="rgba(0,0,0,0.75)" />
            <text x={0} y={-7} textAnchor="middle" fill={c} fontSize="10" fontFamily="monospace" fontWeight="bold">{labelText}</text>
          </g>
        </g>
      );
    }
    case 'rectangle': {
      if (d.x1 === undefined) return null;
      const rx = Math.min(d.x1, d.x2 ?? 0) * w;
      const ry = Math.min(d.y1 ?? 0, d.y2 ?? 0) * h;
      const rw = Math.abs((d.x2 ?? 0) - d.x1) * w;
      const rh = Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h;
      return <rect key={key} x={rx} y={ry} width={rw} height={rh}
        stroke={c} strokeWidth={sw} fill="none" opacity={op} />;
    }
    case 'filled_rectangle': {
      if (d.x1 === undefined) return null;
      const rx = Math.min(d.x1, d.x2 ?? 0) * w;
      const ry = Math.min(d.y1 ?? 0, d.y2 ?? 0) * h;
      const rw = Math.abs((d.x2 ?? 0) - d.x1) * w;
      const rh = Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h;
      return <rect key={key} x={rx} y={ry} width={rw} height={rh}
        stroke={c} strokeWidth={sw} fill={c} fillOpacity={0.25} opacity={op} />;
    }
    case 'circle': {
      if (d.x1 === undefined) return null;
      const cx  = ((d.x1 + (d.x2 ?? 0)) / 2) * w;
      const cy  = (((d.y1 ?? 0) + (d.y2 ?? 0)) / 2) * h;
      const erx = (Math.abs((d.x2 ?? 0) - d.x1) / 2) * w;
      const ery = (Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) / 2) * h;
      return <ellipse key={key} cx={cx} cy={cy} rx={Math.max(erx, 1)} ry={Math.max(ery, 1)}
        stroke={c} strokeWidth={sw} fill="none" opacity={op} />;
    }
    case 'filled_circle': {
      if (d.x1 === undefined) return null;
      const cx  = ((d.x1 + (d.x2 ?? 0)) / 2) * w;
      const cy  = (((d.y1 ?? 0) + (d.y2 ?? 0)) / 2) * h;
      const erx = (Math.abs((d.x2 ?? 0) - d.x1) / 2) * w;
      const ery = (Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) / 2) * h;
      return <ellipse key={key} cx={cx} cy={cy} rx={Math.max(erx, 1)} ry={Math.max(ery, 1)}
        stroke={c} strokeWidth={sw} fill={c} fillOpacity={0.25} opacity={op} />;
    }
    case 'cloud': {
      if (d.x1 === undefined) return null;
      const cx1 = Math.min(d.x1, d.x2 ?? 0) * w;
      const cy1 = Math.min(d.y1 ?? 0, d.y2 ?? 0) * h;
      const cw  = Math.abs((d.x2 ?? 0) - d.x1) * w;
      const ch  = Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h;
      if (cw < 10 || ch < 10) return null;
      return <path key={key} d={getCloudPath(cx1, cy1, cw, ch)}
        stroke={c} strokeWidth={sw} fill="none" opacity={op} />;
    }
    default: return null;
  }
};

// Wraps renderAnnotationContent with an SVG rotation transform when the
// annotation's data.rotation field is set.
const renderAnnotationSvg = (
  ann: { toolType: ToolType; color: string; strokeWidth: number; data: AnyAnnotationData },
  w: number, h: number, key: string,
  scaleInfo?: ScaleInfo | null,
): React.ReactElement | null => {
  const rotation = ann.data.rotation ?? 0;
  const innerKey = rotation ? `${key}-c` : key;
  const content  = renderAnnotationContent(ann, w, h, innerKey, scaleInfo);
  if (!content) return null;
  if (!rotation) return content;
  const bbox = getAnnotationBBox(ann as unknown as PdfAnnotation);
  if (!bbox) return content;
  const cx = (bbox.x + bbox.w / 2) * w;
  const cy = (bbox.y + bbox.h / 2) * h;
  return <g key={key} transform={`rotate(${rotation}, ${cx}, ${cy})`}>{content}</g>;
};

const getAnnotationAnchor = (ann: PdfAnnotation): { x: number; y: number } | null => {
  const d = ann.data as AnyAnnotationData;
  if (ann.toolType === 'pen' || ann.toolType === 'highlighter')
    return d.points?.[0] ? { x: d.points[0].x, y: d.points[0].y } : null;
  if (ann.toolType === 'text' || ann.toolType === 'stamp')
    return d.x !== undefined ? { x: d.x ?? 0, y: d.y ?? 0 } : null;
  if (ann.toolType === 'callout')
    return d.x1 !== undefined ? { x: d.x1 ?? 0, y: d.y1 ?? 0 } : null;
  return d.x1 !== undefined ? { x: d.x1 ?? 0, y: d.y1 ?? 0 } : null;
};

// Returns the bounding box of an annotation in normalized (0–1) coordinates.
// Used to draw a selection rectangle around the selected annotation.
const BBOX_TEXT_HALF_W   = 0.09;  // estimated half-width for a text/stamp label
const BBOX_TEXT_HALF_H   = 0.03;  // estimated half-height for a text/stamp label
const BBOX_TEXT_OFFSET_Y = 0.03;  // offset above the anchor point to account for label baseline
const getAnnotationBBox = (ann: PdfAnnotation, data?: AnyAnnotationData): { x: number; y: number; w: number; h: number } | null => {
  const d = (data ?? ann.data) as AnyAnnotationData;
  const t = ann.toolType as ToolType;
  if (t === 'pen' || t === 'highlighter') {
    if (!d.points || d.points.length < 2) return null;
    const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
    const x1 = Math.min(...xs), y1 = Math.min(...ys);
    const x2 = Math.max(...xs), y2 = Math.max(...ys);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  if (t === 'text' || t === 'stamp') {
    const cx = d.x ?? 0, cy = d.y ?? 0;
    return { x: cx - BBOX_TEXT_HALF_W, y: cy - BBOX_TEXT_OFFSET_Y - BBOX_TEXT_HALF_H * 2, w: BBOX_TEXT_HALF_W * 2, h: BBOX_TEXT_HALF_H * 2 + BBOX_TEXT_OFFSET_Y };
  }
  if (d.x1 !== undefined) {
    const x1 = Math.min(d.x1 ?? 0, d.x2 ?? 0);
    const y1 = Math.min(d.y1 ?? 0, d.y2 ?? 0);
    const x2 = Math.max(d.x1 ?? 0, d.x2 ?? 0);
    const y2 = Math.max(d.y1 ?? 0, d.y2 ?? 0);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  return null;
};
type HandleDef = { nx: number; ny: number; index: number; isMoveHandle?: boolean; isRotateHandle?: boolean; isEdgeHandle?: boolean };
const getHandlesNorm = (ann: PdfAnnotation): HandleDef[] => {
  const d = ann.data as AnyAnnotationData;
  const t = ann.toolType as ToolType;
  let baseHandles: HandleDef[] = [];

  if (t === 'line' || t === 'dashed_line' || t === 'arrow' || t === 'double_arrow' || t === 'dimension' || t === 'callout') {
    if (d.x1 === undefined) return [];
    baseHandles = [
      { nx: d.x1 ?? 0, ny: d.y1 ?? 0, index: 0 },
      { nx: d.x2 ?? 0, ny: d.y2 ?? 0, index: 1 },
    ];
  } else if (t === 'rectangle' || t === 'filled_rectangle' || t === 'circle' || t === 'filled_circle' || t === 'cloud') {
    if (d.x1 === undefined) return [];
    const sx1 = d.x1 ?? 0, sy1 = d.y1 ?? 0, sx2 = d.x2 ?? 0, sy2 = d.y2 ?? 0;
    const scx = (sx1 + sx2) / 2, scy = (sy1 + sy2) / 2;
    baseHandles = [
      { nx: sx1, ny: sy1, index: 0 },
      { nx: sx2, ny: sy1, index: 1 },
      { nx: sx2, ny: sy2, index: 2 },
      { nx: sx1, ny: sy2, index: 3 },
      { nx: scx, ny: scy, index: 4, isMoveHandle: true },
      { nx: scx, ny: sy1, index: EDGE_HANDLE_TOP,    isEdgeHandle: true },
      { nx: sx2, ny: scy, index: EDGE_HANDLE_RIGHT,  isEdgeHandle: true },
      { nx: scx, ny: sy2, index: EDGE_HANDLE_BOTTOM, isEdgeHandle: true },
      { nx: sx1, ny: scy, index: EDGE_HANDLE_LEFT,   isEdgeHandle: true },
    ];
  } else if (t === 'text' || t === 'stamp') {
    if (d.x === undefined) return [];
    baseHandles = [{ nx: d.x ?? 0, ny: d.y ?? 0, index: 0, isMoveHandle: true }];
  } else if (t === 'pen' || t === 'highlighter') {
    if (!d.points || d.points.length < 2) return [];
    const xs = d.points.map(p => p.x);
    const ys = d.points.map(p => p.y);
    const bx1 = Math.min(...xs), by1 = Math.min(...ys);
    const bx2 = Math.max(...xs), by2 = Math.max(...ys);
    const pcx = (bx1 + bx2) / 2, pcy = (by1 + by2) / 2;
    baseHandles = [
      { nx: bx1, ny: by1, index: 0 },
      { nx: bx2, ny: by1, index: 1 },
      { nx: bx2, ny: by2, index: 2 },
      { nx: bx1, ny: by2, index: 3 },
      { nx: pcx, ny: pcy, index: 4, isMoveHandle: true },
      { nx: pcx, ny: by1, index: EDGE_HANDLE_TOP,    isEdgeHandle: true },
      { nx: bx2, ny: pcy, index: EDGE_HANDLE_RIGHT,  isEdgeHandle: true },
      { nx: pcx, ny: by2, index: EDGE_HANDLE_BOTTOM, isEdgeHandle: true },
      { nx: bx1, ny: pcy, index: EDGE_HANDLE_LEFT,   isEdgeHandle: true },
    ];
  }

  // Add rotation handle above the bounding box centre for all annotation types that have a meaningful bbox
  const bbox = getAnnotationBBox(ann);
  if (bbox && bbox.w > 0.005) {
    const rcx = bbox.x + bbox.w / 2;
    const rcy = bbox.y - ROTATE_HANDLE_OFFSET_NORM;
    baseHandles.push({ nx: rcx, ny: rcy, index: ROTATE_HANDLE_INDEX, isRotateHandle: true });
  }

  // Pre-rotate all handle positions by the annotation's stored rotation angle so that
  // hit-testing and visual display are both in the same rotated (screen) space.
  const rotation = d.rotation ?? 0;
  if (rotation && bbox) {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return baseHandles.map(h => {
      const dx = h.nx - cx, dy = h.ny - cy;
      return { ...h, nx: cx + dx * cos - dy * sin, ny: cy + dx * sin + dy * cos };
    });
  }

  return baseHandles;
};

// Rotates point (px, py) around (cx, cy) by -angleDeg (i.e. undoes a clockwise rotation).
const unrotatePoint = (cx: number, cy: number, angleDeg: number, px: number, py: number) => {
  const rad = (-angleDeg * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
};

// Applies a handle drag to annotation data and returns updated data.
const applyHandleDrag = (
  origData: AnyAnnotationData,
  toolType: ToolType,
  handleIndex: number,
  curNorm: { x: number; y: number },
  dragStartNorm: { x: number; y: number },
): AnyAnnotationData => {
  const rotation = origData.rotation ?? 0;

  // ── Rotation handle ────────────────────────────────────────────────────────
  if (handleIndex === ROTATE_HANDLE_INDEX) {
    const fakeAnn = { toolType, data: origData } as unknown as PdfAnnotation;
    const bbox = getAnnotationBBox(fakeAnn);
    if (!bbox) return origData;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const startAngle = Math.atan2(dragStartNorm.y - cy, dragStartNorm.x - cx);
    const curAngle   = Math.atan2(curNorm.y - cy, curNorm.x - cx);
    const delta = (curAngle - startAngle) * 180 / Math.PI;
    const newRotation = ((rotation + delta) % 360 + 360) % 360;
    return { ...origData, rotation: Math.round(newRotation) };
  }

  // For non-rotation handles on a rotated annotation, unrotate the cursor position
  // into the annotation's local (unrotated) coordinate space before applying geometry.
  let effectiveCur = curNorm;
  let effectiveDragStart = dragStartNorm;
  if (rotation) {
    const fakeAnn = { toolType, data: origData } as unknown as PdfAnnotation;
    const bbox = getAnnotationBBox(fakeAnn);
    if (bbox) {
      const cx = bbox.x + bbox.w / 2;
      const cy = bbox.y + bbox.h / 2;
      effectiveCur       = unrotatePoint(cx, cy, rotation, curNorm.x, curNorm.y);
      effectiveDragStart = unrotatePoint(cx, cy, rotation, dragStartNorm.x, dragStartNorm.y);
    }
  }

  // ── Line / arrow / callout endpoints ──────────────────────────────────────
  if (toolType === 'line' || toolType === 'dashed_line' || toolType === 'arrow' || toolType === 'double_arrow' || toolType === 'dimension' || toolType === 'callout') {
    return handleIndex === 0
      ? { ...origData, x1: effectiveCur.x, y1: effectiveCur.y }
      : { ...origData, x2: effectiveCur.x, y2: effectiveCur.y };
  }

  // ── Shape corner / edge / move handles ───────────────────────────────────────────
  if (toolType === 'rectangle' || toolType === 'filled_rectangle' || toolType === 'circle' || toolType === 'filled_circle' || toolType === 'cloud') {
    if (handleIndex === 4) {
      const dx = effectiveCur.x - effectiveDragStart.x;
      const dy = effectiveCur.y - effectiveDragStart.y;
      return { ...origData, x1: (origData.x1 ?? 0) + dx, y1: (origData.y1 ?? 0) + dy, x2: (origData.x2 ?? 0) + dx, y2: (origData.y2 ?? 0) + dy };
    }
    if (handleIndex === 0) return { ...origData, x1: effectiveCur.x, y1: effectiveCur.y };
    if (handleIndex === 1) return { ...origData, x2: effectiveCur.x, y1: effectiveCur.y };
    if (handleIndex === 2) return { ...origData, x2: effectiveCur.x, y2: effectiveCur.y };
    if (handleIndex === 3) return { ...origData, x1: effectiveCur.x, y2: effectiveCur.y };
    // Edge handles: constrain to a single axis
    if (handleIndex === EDGE_HANDLE_TOP)    return { ...origData, y1: effectiveCur.y };
    if (handleIndex === EDGE_HANDLE_RIGHT)  return { ...origData, x2: effectiveCur.x };
    if (handleIndex === EDGE_HANDLE_BOTTOM) return { ...origData, y2: effectiveCur.y };
    if (handleIndex === EDGE_HANDLE_LEFT)   return { ...origData, x1: effectiveCur.x };
  }

  // ── Text / stamp move handle ───────────────────────────────────────────────
  if (toolType === 'text' || toolType === 'stamp') {
    return { ...origData, x: effectiveCur.x, y: effectiveCur.y };
  }

  // ── Pen / highlighter: move, scale corner or edge handles ────────────────────────
  if (toolType === 'pen' || toolType === 'highlighter') {
    if (!origData.points || origData.points.length < 2) return origData;
    const pts = origData.points;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const origX1 = Math.min(...xs), origY1 = Math.min(...ys);
    const origX2 = Math.max(...xs), origY2 = Math.max(...ys);

    if (handleIndex === 4) {
      // Move: translate all points by the delta
      const dx = effectiveCur.x - effectiveDragStart.x;
      const dy = effectiveCur.y - effectiveDragStart.y;
      return { ...origData, points: pts.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    }

    // Edge handles: scale on a single axis, anchor at the opposite edge
    if (handleIndex === EDGE_HANDLE_TOP) {
      // Top edge: scale Y from bottom, X unchanged
      const scaleY = (origY2 - origY1) !== 0 ? (origY2 - effectiveCur.y) / (origY2 - origY1) : 1;
      return { ...origData, points: pts.map(p => ({ ...p, y: origY2 + (p.y - origY2) * scaleY })) };
    }
    if (handleIndex === EDGE_HANDLE_RIGHT) {
      // Right edge: scale X from left, Y unchanged
      const scaleX = (origX2 - origX1) !== 0 ? (effectiveCur.x - origX1) / (origX2 - origX1) : 1;
      return { ...origData, points: pts.map(p => ({ ...p, x: origX1 + (p.x - origX1) * scaleX })) };
    }
    if (handleIndex === EDGE_HANDLE_BOTTOM) {
      // Bottom edge: scale Y from top, X unchanged
      const scaleY = (origY2 - origY1) !== 0 ? (effectiveCur.y - origY1) / (origY2 - origY1) : 1;
      return { ...origData, points: pts.map(p => ({ ...p, y: origY1 + (p.y - origY1) * scaleY })) };
    }
    if (handleIndex === EDGE_HANDLE_LEFT) {
      // Left edge: scale X from right, Y unchanged
      const scaleX = (origX2 - origX1) !== 0 ? (origX2 - effectiveCur.x) / (origX2 - origX1) : 1;
      return { ...origData, points: pts.map(p => ({ ...p, x: origX2 + (p.x - origX2) * scaleX })) };
    }

    // Corner scale: compute anchor (opposite corner) and scale all points from it
    let anchorX: number, anchorY: number, origCornerX: number, origCornerY: number;
    if (handleIndex === 0) { anchorX = origX2; anchorY = origY2; origCornerX = origX1; origCornerY = origY1; }
    else if (handleIndex === 1) { anchorX = origX1; anchorY = origY2; origCornerX = origX2; origCornerY = origY1; }
    else if (handleIndex === 2) { anchorX = origX1; anchorY = origY1; origCornerX = origX2; origCornerY = origY2; }
    else if (handleIndex === 3) { anchorX = origX2; anchorY = origY1; origCornerX = origX1; origCornerY = origY2; }
    else return origData;

    const dOrigX = origCornerX - anchorX;
    const dOrigY = origCornerY - anchorY;
    const scaleX = dOrigX !== 0 ? (effectiveCur.x - anchorX) / dOrigX : 1;
    const scaleY = dOrigY !== 0 ? (effectiveCur.y - anchorY) / dOrigY : 1;
    return { ...origData, points: pts.map(p => ({ ...p, x: anchorX + (p.x - anchorX) * scaleX, y: anchorY + (p.y - anchorY) * scaleY })) };
  }

  return origData;
};

const nudgeAnnotationData = (data: AnyAnnotationData, toolType: ToolType, dx: number, dy: number): AnyAnnotationData => {
  if (toolType === 'text' || toolType === 'stamp')
    return { ...data, x: (data.x ?? 0) + dx, y: (data.y ?? 0) + dy };
  if (toolType === 'pen' || toolType === 'highlighter') {
    if (!data.points) return data;
    return { ...data, points: data.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  }
  if (data.x1 !== undefined)
    return { ...data, x1: (data.x1 ?? 0) + dx, y1: (data.y1 ?? 0) + dy, x2: (data.x2 ?? 0) + dx, y2: (data.y2 ?? 0) + dy };
  return data;
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const PdfMarkupEditor: React.FC<PdfMarkupEditorProps> = ({
  print, sessionUser, onClose,
}) => {
  const [currentTool, setCurrentTool]   = useState<ToolType>('pan');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth]   = useState(4);
  const [opacity, setOpacity]           = useState(1.0);
  const [fontSize, setFontSize]         = useState(DEFAULT_FONT_SIZE);
  const [stampType, setStampType]       = useState<StampType>('APPROVED');
  const [pageNumber, setPageNumber]     = useState(1);
  const [numPages, setNumPages]         = useState(0);
  const [zoomLevel, setZoomLevel]       = useState(1.0);
  // Rendered pixel dimensions of each page's canvas, keyed by 1-based page number.
  // Used to size the per-page SVG overlay and denormalize annotation coordinates.
  const [pageSizes, setPageSizes]       = useState<Map<number, { width: number; height: number }>>(new Map());
  const [isDrawing, setIsDrawing]       = useState(false);
  const [drawStart, setDrawStart]       = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints]       = useState<Array<{ x: number; y: number; pressure?: number }>>([]);
  const [previewData, setPreviewData]   = useState<AnyAnnotationData | null>(null);
  const [textInput, setTextInput]       = useState<{
    px: number; py: number; rx: number; ry: number; calloutData?: AnyAnnotationData;
  } | null>(null);
  const [textValue, setTextValue]       = useState('');
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [annotations, setAnnotations]   = useState<PdfAnnotation[]>([]);
  const [annLoadErr, setAnnLoadErr]     = useState<string | null>(null);
  const [actionErr, setActionErr]       = useState<string | null>(null);
  const [isSaving, setIsSaving]         = useState(false);
  const [showLog, setShowLog]           = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [pdfError, setPdfError]         = useState<string | null>(null);
  const [canUndo, setCanUndo]           = useState(false);
  const [canRedo, setCanRedo]           = useState(false);
  const [inputDevice, setInputDevice]   = useState('');
  const [liveEditData, setLiveEditData]   = useState<AnyAnnotationData | null>(null);
  const [pendingAnnotations, setPendingAnnotations] = useState<Array<PdfAnnotation>>([]);
  const [filterAuthorId, setFilterAuthorId] = useState<string | null>(null);
  const [scaleInfo, setScaleInfo] = useState<ScaleInfo | null>(null);
  const [scaleInput, setScaleInput] = useState<{ lineStart: { x: number; y: number }; lineEnd: { x: number; y: number } } | null>(null);
  const [scaleValue, setScaleValue] = useState('');
  const [scaleUnit, setScaleUnit] = useState('ft');
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);

  // Per-page DOM refs (continuous-scroll mode renders every page at once).
  const pageCanvasRefs    = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // The page the current pointer gesture is acting on — resolved at pointer-down
  // from the target page container's data-page attribute. Drives getCoords, new
  // annotation placement, and which page renders live drawing previews.
  const activePageRef = useRef(1);
  const mainRef       = useRef<HTMLDivElement>(null);
  const textFieldRef  = useRef<HTMLInputElement>(null);
  const scaleInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef     = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // Active pdf.js render tasks keyed by page number, so re-renders can cancel cleanly.
  const renderTasksRef = useRef<Map<number, pdfjsLib.RenderTask>>(new Map());
  // Monotonic token to discard results from superseded render passes (e.g. fast zooming).
  const renderTokenRef = useRef(0);
  const drawingPtrRef = useRef<number | null>(null);
  const touchPtsRef   = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isPinchRef    = useRef(false);
  const pinchDistRef  = useRef(0);
  const pinchZoomRef  = useRef(1.0);
  const panStartRef   = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const undoStackRef  = useRef<PdfAnnotation[]>([]);
  const redoStackRef  = useRef<Omit<PdfAnnotation, 'id' | 'createdAt'>[]>([]);
  // Ref for active handle drag (doesn't need to trigger renders by itself)
  const dragHandleRef = useRef<{ handleIndex: number; origData: AnyAnnotationData; dragStartNorm: { x: number; y: number } } | null>(null);
  // Stable ref to annotations list for use in callbacks without stale closures
  const annotationsRef = useRef<PdfAnnotation[]>([]);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  // Tracks whether Shift is held during drawing (for constrain behavior)
  const shiftPressedRef = useRef(false);
  // Stable ref to selectedAnnId for use in keyboard handler without stale closures
  const selectedAnnIdRef = useRef<string | null>(null);
  selectedAnnIdRef.current = selectedAnnId;
  // Stable ref to pendingAnnotations for use in close guard
  const pendingAnnotationsRef = useRef<PdfAnnotation[]>([]);
  pendingAnnotationsRef.current = pendingAnnotations;
  // Stable ref to currentTool for use in non-reactive callbacks (e.g., touch listeners)
  const currentToolRef = useRef<ToolType>(currentTool);
  currentToolRef.current = currentTool;

  // Load annotations
  useEffect(() => {
    apiService.getAnnotations(print.id)
      .then(setAnnotations)
      .catch((e: Error) => setAnnLoadErr(e.message || 'Failed to load annotations'));
  }, [print.id]);

  // Load PDF bytes — tries the authenticated Supabase storage client first
  // (works for both public and private buckets).  Falls back to a plain fetch
  // against the public URL in case the storage RLS SELECT policy is absent
  // (common when the bucket is configured as public in the Supabase dashboard).
  useEffect(() => {
    if (!print.storagePath) return;
    setIsLoadingPdf(true); setPdfError(null);
    let cancelled = false;

    const loadPdf = async () => {
      const path = print.storagePath;
      let buffer: ArrayBuffer | null = null;
      let primaryErr: string | null = null;
      try {
        buffer = await apiService.downloadJobPrint(path);
      } catch (e: unknown) {
        primaryErr = e instanceof Error ? e.message : String(e);
      }

      // Fallback: public-URL fetch (works when the bucket is public and the
      // authenticated endpoint is blocked by a missing storage RLS policy).
      if (!buffer && print.url) {
        try {
          const response = await fetch(print.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffer = await response.arrayBuffer();
        } catch (fallbackErr: unknown) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          primaryErr = primaryErr
            ? `${primaryErr}; fallback also failed: ${fallbackMsg}`
            : `Fallback download failed: ${fallbackMsg}`;
        }
      }

      if (cancelled) return;
      if (!buffer) {
        setPdfError(primaryErr ?? 'Failed to download PDF');
        setIsLoadingPdf(false);
        return;
      }
      try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (!cancelled) { pdfDocRef.current = pdf; setNumPages(pdf.numPages); setPageNumber(1); }
      } catch (e: unknown) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : 'Failed to parse PDF');
      } finally {
        if (!cancelled) setIsLoadingPdf(false);
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [print.storagePath, print.url]);

  // Render every page at the current zoom into its own stacked canvas.
  // Pages share a single column width so the document scrolls continuously.
  const renderAllPages = useCallback(async (zoom: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    const token = ++renderTokenRef.current;
    const main  = mainRef.current;

    // Preserve the scroll anchor across a zoom-driven re-render so the page the
    // user is looking at stays roughly in view after every canvas resizes.
    let ratioX = 0, ratioY = 0;
    if (main) {
      const scrollW = main.scrollWidth  - main.clientWidth;
      const scrollH = main.scrollHeight - main.clientHeight;
      ratioX = scrollW > 0 ? main.scrollLeft / scrollW : 0;
      ratioY = scrollH > 0 ? main.scrollTop  / scrollH : 0;
    }

    const avail = (main?.clientWidth ?? window.innerWidth) - 48;
    const sizes = new Map(pageSizes);
    for (let p = 1; p <= pdf.numPages; p++) {
      const canvas = pageCanvasRefs.current.get(p);
      if (!canvas) continue;
      const prev = renderTasksRef.current.get(p);
      if (prev) { prev.cancel(); renderTasksRef.current.delete(p); }
      try {
        const page  = await pdf.getPage(p);
        if (token !== renderTokenRef.current) return;
        const base  = page.getViewport({ scale: 1 });
        const scale = (Math.min(avail, 1400) / base.width) * zoom;
        const vp    = page.getViewport({ scale });
        canvas.width = vp.width; canvas.height = vp.height;
        sizes.set(p, { width: vp.width, height: vp.height });
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const task = page.render({ canvasContext: ctx, viewport: vp });
        renderTasksRef.current.set(p, task);
        await task.promise;
        renderTasksRef.current.delete(p);
      } catch { /* cancelled */ }
    }
    if (token !== renderTokenRef.current) return;
    setPageSizes(sizes);

    if (main) {
      requestAnimationFrame(() => {
        main.scrollLeft = ratioX * Math.max(0, main.scrollWidth  - main.clientWidth);
        main.scrollTop  = ratioY * Math.max(0, main.scrollHeight - main.clientHeight);
      });
    }
  // pageSizes intentionally omitted: it is seeded fresh each pass and including it
  // would re-create the callback on every render it performs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoadingPdf && pdfDocRef.current) renderAllPages(zoomLevel);
  }, [zoomLevel, isLoadingPdf, numPages, renderAllPages]);

  // Track the page most centered in the viewport so the header indicator stays accurate
  // as the user scrolls through the document.
  const handleScroll = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    const viewportCenter = main.scrollTop + main.clientHeight / 2;
    let best = 1, bestDist = Infinity;
    pageContainerRefs.current.forEach((el, p) => {
      const center = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < bestDist) { bestDist = dist; best = p; }
    });
    setPageNumber(prev => (prev === best ? prev : best));
  }, []);

  // Undo
  const handleUndo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const { id, createdAt: _c, ...rest } = entry;
    redoStackRef.current.push(rest);
    setCanUndo(undoStackRef.current.length > 0); setCanRedo(true);
    if (isPendingAnnotation(id)) {
      // Still staged — just remove locally, no API call needed
      setPendingAnnotations(prev => prev.filter(a => a.id !== id));
    } else {
      setAnnotations(prev => prev.filter(a => a.id !== id));
      try { await apiService.deleteAnnotation(id); } catch (e: unknown) {
        setActionErr('Undo failed: ' + (e instanceof Error ? e.message : 'unknown'));
      }
    }
  }, []);

  // Redo — re-stage instead of saving directly to DB
  const handleRedo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    setCanRedo(redoStackRef.current.length > 0);
    const staged: PdfAnnotation = { ...entry, id: generateTempId(), createdAt: Date.now() };
    setPendingAnnotations(prev => [...prev, staged]);
    undoStackRef.current.push(staged);
    setCanUndo(true);
  }, []);

  const getCoords = useCallback((clientX: number, clientY: number, pageNum?: number) => {
    // Map to the canvas of the page being interacted with so coordinates align
    // exactly with the rendered surface, regardless of which stacked page it is.
    const canvas = pageCanvasRefs.current.get(pageNum ?? activePageRef.current);
    if (!canvas) return { x: 0, y: 0 };
    return getRelativeCoords(clientX, clientY, canvas);
  }, []);

  // Stage annotation locally; persisted to DB only when the user clicks Save.
  // Returns the staged annotation so callers can auto-select it.
  const commitAnnotation = useCallback((data: AnyAnnotationData, toolOverride?: ToolType): PdfAnnotation => {
    const tool      = toolOverride ?? currentTool;
    const finalData = opacity < 1 ? { ...data, opacity } : data;
    const staged: PdfAnnotation = {
      id: generateTempId(), createdAt: Date.now(),
      printId: print.id, companyId: sessionUser.companyId,
      authorId: sessionUser.id, authorName: sessionUser.name,
      pageNumber: activePageRef.current, toolType: tool, color: currentColor, strokeWidth,
      data: finalData as Record<string, unknown>,
    };
    setPendingAnnotations(prev => [...prev, staged]);
    undoStackRef.current.push(staged);
    if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true); setCanRedo(false);
    return staged;
  }, [print.id, sessionUser, currentTool, currentColor, strokeWidth, opacity]);

  // Delete annotation — handle both staged (tmp-) and persisted items
  const handleDeleteAnnotation = useCallback(async (id: string) => {
    if (isPendingAnnotation(id)) {
      setPendingAnnotations(prev => prev.filter(a => a.id !== id));
      setSelectedAnnId(prev => prev === id ? null : prev);
      undoStackRef.current = undoStackRef.current.filter(a => a.id !== id);
      setCanUndo(undoStackRef.current.length > 0);
      return;
    }
    try {
      await apiService.deleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      setSelectedAnnId(prev => prev === id ? null : prev);
      undoStackRef.current = undoStackRef.current.filter(a => a.id !== id);
      setCanUndo(undoStackRef.current.length > 0);
    } catch (e: unknown) {
      setActionErr('Delete failed: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }, []);

  // Update annotation geometry after a handle drag.
  // Pending annotations are updated in-place; saved annotations are promoted to pending.
  const updateAnnotation = useCallback((id: string, newData: AnyAnnotationData) => {
    if (isPendingAnnotation(id)) {
      setPendingAnnotations(prev => prev.map(a =>
        a.id === id ? { ...a, data: newData as Record<string, unknown> } : a
      ));
      undoStackRef.current = undoStackRef.current.map(e =>
        e.id === id ? { ...e, data: newData as Record<string, unknown> } : e
      );
    } else {
      const target = annotationsRef.current.find(a => a.id === id);
      if (!target) return;
      const newId = generateTempId();
      const promoted: PdfAnnotation = { ...target, id: newId, data: newData as Record<string, unknown> };
      setAnnotations(prev => prev.filter(a => a.id !== id));
      setPendingAnnotations(prev => [...prev, promoted]);
      undoStackRef.current.push(promoted);
      if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true); setCanRedo(false);
      setSelectedAnnId(newId);
    }
  }, []);

  const updateStrokeWidth = useCallback((id: string, sw: number) => {
    if (isPendingAnnotation(id)) {
      setPendingAnnotations(prev => prev.map(a => a.id === id ? { ...a, strokeWidth: sw } : a));
      undoStackRef.current = undoStackRef.current.map(e => e.id === id ? { ...e, strokeWidth: sw } : e);
    } else {
      const target = annotationsRef.current.find(a => a.id === id);
      if (!target) return;
      const newId = generateTempId();
      const promoted: PdfAnnotation = { ...target, id: newId, strokeWidth: sw };
      setAnnotations(prev => prev.filter(a => a.id !== id));
      setPendingAnnotations(prev => [...prev, promoted]);
      undoStackRef.current.push(promoted);
      if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true); setCanRedo(false);
      setSelectedAnnId(newId);
    }
  }, []);

  const updateColor = useCallback((id: string, color: string) => {
    if (isPendingAnnotation(id)) {
      setPendingAnnotations(prev => prev.map(a => a.id === id ? { ...a, color } : a));
      undoStackRef.current = undoStackRef.current.map(e => e.id === id ? { ...e, color } : e);
    } else {
      const target = annotationsRef.current.find(a => a.id === id);
      if (!target) return;
      const newId = generateTempId();
      const promoted: PdfAnnotation = { ...target, id: newId, color };
      setAnnotations(prev => prev.filter(a => a.id !== id));
      setPendingAnnotations(prev => [...prev, promoted]);
      undoStackRef.current.push(promoted);
      if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true); setCanRedo(false);
      setSelectedAnnId(newId);
    }
  }, []);

  // Persist all staged annotations to DB in parallel
  const handleSave = useCallback(async () => {
    if (pendingAnnotations.length === 0) return;
    setIsSaving(true);
    const toSave = [...pendingAnnotations];
    const results = await Promise.allSettled(
      toSave.map(p => {
        const { id: _tid, createdAt: _c, ...rest } = p;
        return apiService.saveAnnotation(rest as Omit<PdfAnnotation, 'id' | 'createdAt'>);
      })
    );
    const savedItems: PdfAnnotation[] = [];
    const failedIds  = new Set<string>();
    const savedMap   = new Map<string, PdfAnnotation>();
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        savedItems.push(result.value);
        savedMap.set(toSave[i].id, result.value);
      } else {
        failedIds.add(toSave[i].id);
      }
    });
    // Drop successfully-saved staging entries; keep failed ones so the user can retry
    setPendingAnnotations(prev => prev.filter(p => failedIds.has(p.id)));
    setAnnotations(prev => [...prev, ...savedItems]);
    // Rebuild undo stack: replace temp IDs that saved successfully with real IDs
    undoStackRef.current = undoStackRef.current
      .map(entry => savedMap.get(entry.id) ?? entry)
      .filter(entry => !isPendingAnnotation(entry.id) || failedIds.has(entry.id));
    setCanUndo(undoStackRef.current.length > 0);
    if (failedIds.size > 0) {
      const firstRejection = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      const detail = (firstRejection?.reason as { message?: string } | undefined)?.message
        ?? String(firstRejection?.reason ?? '');
      setActionErr(`${failedIds.size} annotation(s) failed to save${detail ? ` — ${detail}` : ''}`);
    }
    setIsSaving(false);
  }, [pendingAnnotations]);

  const duplicateAnnotation = useCallback(() => {
    const selId = selectedAnnIdRef.current;
    if (!selId) return;
    const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
    const sel = allAnns.find(a => a.id === selId);
    if (!sel) return;
    const newData = nudgeAnnotationData(sel.data as AnyAnnotationData, sel.toolType as ToolType, 0.022, 0.022);
    const staged: PdfAnnotation = {
      id: generateTempId(), createdAt: Date.now(),
      printId: sel.printId, companyId: sel.companyId,
      authorId: sel.authorId, authorName: sel.authorName,
      pageNumber: sel.pageNumber, toolType: sel.toolType,
      color: sel.color, strokeWidth: sel.strokeWidth,
      data: newData as Record<string, unknown>,
    };
    setPendingAnnotations(prev => [...prev, staged]);
    undoStackRef.current.push(staged);
    if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift();
    redoStackRef.current = []; setCanUndo(true); setCanRedo(false);
    setSelectedAnnId(staged.id);
  }, []);

  // Keyboard shortcuts — placed after handleDeleteAnnotation to avoid forward reference
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Track Shift state for draw-constrain (check the specific key, not e.shiftKey on keyup)
      if (e.type === 'keydown') shiftPressedRef.current = e.shiftKey;
      if (e.type === 'keyup' && e.key === 'Shift') shiftPressedRef.current = false;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); handleRedo(); return; }

      // Intercept Ctrl/⌘ + Plus/Minus/0 browser zoom shortcuts and apply app zoom instead
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey)) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoomLevel(z => Math.min(4.0, z + 0.25)); return; }
        if (e.key === '-')                  { e.preventDefault(); setZoomLevel(z => Math.max(0.25, z - 0.25)); return; }
        if (e.key === '0')                  { e.preventDefault(); setZoomLevel(1.0); return; }
      }

      // Delete / Backspace → delete selected annotation (only when not typing in an input)
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        if (selectedAnnIdRef.current) {
          e.preventDefault();
          handleDeleteAnnotation(selectedAnnIdRef.current);
        }
        return;
      }

      // Arrow key nudge for selected annotation
      if (e.type === 'keydown' && !e.ctrlKey && !e.metaKey &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        const selId = selectedAnnIdRef.current;
        if (selId) {
          e.preventDefault();
          const NUDGE = e.shiftKey ? 0.01 : 0.002;
          const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
          const ann = allAnns.find(a => a.id === selId);
          if (ann) {
            const dx = e.key === 'ArrowLeft' ? -NUDGE : e.key === 'ArrowRight' ? NUDGE : 0;
            const dy = e.key === 'ArrowUp' ? -NUDGE : e.key === 'ArrowDown' ? NUDGE : 0;
            updateAnnotation(selId, nudgeAnnotationData(ann.data as AnyAnnotationData, ann.toolType as ToolType, dx, dy));
          }
        }
        return;
      }

      // Ctrl+D to duplicate
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateAnnotation();
        return;
      }

      // Escape → deselect / stop drawing / cancel text input
      if (e.key === 'Escape') {
        setSelectedAnnId(null);
        setTextInput(null); setTextValue('');
        setIsDrawing(false); setPenPoints([]); setPreviewData(null); setDrawStart(null);
        drawingPtrRef.current = null;
        dragHandleRef.current = null; setLiveEditData(null);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup',   onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, [handleUndo, handleRedo, handleDeleteAnnotation, updateAnnotation, duplicateAnnotation]);

  // Block browser-level pinch/scroll zoom (Ctrl+wheel) while the editor is open.
  // React's synthetic onWheel may be passive in some environments; a direct non-passive
  // window listener is the most reliable way to prevent the browser from intercepting
  // the gesture and resetting the viewport/scroll position.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // Touch-based pan for mobile: attach direct touch listeners on the canvas container.
  // iOS Safari can fire pointercancel instead of pointermove when setPointerCapture is
  // combined with touchAction:'none', making the pointer-event pan unreliable.
  // Single-finger touch ALWAYS scrolls regardless of the active tool — drawing only
  // happens via pen/stylus (pointerType==='pen') or mouse events.  Scroll is suppressed
  // only while a pen/mouse draw gesture is actively in progress (drawingPtrRef !== null).
  useEffect(() => {
    if (isLoadingPdf) return;
    const main = mainRef.current;
    if (!main) return;

    let startX = 0, startY = 0, startSL = 0, startST = 0, panning = false;

    const onTouchStart = (e: TouchEvent) => {
      // Only scroll for nav tools (pan/select). When a drawing tool is active, let
      // pointer events handle the gesture so the user can draw with their finger.
      const isNavTool = currentToolRef.current === 'pan' || currentToolRef.current === 'select';
      if (e.touches.length !== 1 || drawingPtrRef.current !== null || !isNavTool) return;
      panning = true;
      startX  = e.touches[0].clientX;
      startY  = e.touches[0].clientY;
      startSL = main.scrollLeft;
      startST = main.scrollTop;
    };

    const onTouchMove = (e: TouchEvent) => {
      // If a handle drag has claimed the pointer, stop scrolling and let pointer events handle it.
      if (!panning || e.touches.length !== 1 || drawingPtrRef.current !== null) { panning = false; return; }
      e.preventDefault();
      main.scrollLeft = startSL - (e.touches[0].clientX - startX);
      main.scrollTop  = startST - (e.touches[0].clientY - startY);
    };

    const onTouchEnd = () => { panning = false; };

    main.addEventListener('touchstart',  onTouchStart, { passive: false });
    main.addEventListener('touchmove',   onTouchMove,  { passive: false });
    main.addEventListener('touchend',    onTouchEnd,   { passive: true });
    main.addEventListener('touchcancel', onTouchEnd,   { passive: true });

    return () => {
      main.removeEventListener('touchstart',  onTouchStart);
      main.removeEventListener('touchmove',   onTouchMove);
      main.removeEventListener('touchend',    onTouchEnd);
      main.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isLoadingPdf]);

  // ── Pointer Events (Apple Pencil + palm rejection + pinch-to-zoom) ──
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setInputDevice(e.pointerType);
    touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Resolve which stacked page this gesture is acting on so coordinates,
    // previews, and new annotations all bind to the correct page.
    const pageNum = Number(e.currentTarget.dataset.page) || 1;
    activePageRef.current = pageNum;
    setPageNumber(pageNum);

    // Palm rejection: if pen is active, ignore new touch contacts
    if (drawingPtrRef.current !== null && e.pointerType === 'touch') return;

    // Two touch fingers → start pinch, cancel draw
    if (e.pointerType === 'touch' && touchPtsRef.current.size === 2) {
      if (drawingPtrRef.current !== null) {
        setIsDrawing(false); setPenPoints([]); setPreviewData(null); setDrawStart(null);
        drawingPtrRef.current = null;
      }
      return;
    }

    // Touch + pan always yields to the touch-scroll listener.
    if (e.pointerType === 'touch' && currentTool === 'pan') return;
    // Touch + select: annotation tap and handle selection are handled below.
    // We do NOT capture the pointer here (drawingPtrRef stays null) so the scroll
    // listener stays active for plain tap-to-select gestures.  It is set inside the
    // handle-drag branch below so pointer-move/up can track the drag.

    if (drawingPtrRef.current !== null && drawingPtrRef.current !== e.pointerId) return;
    // Only set pointer capture for pen/mouse, not touch: setPointerCapture + touchAction:none
    // causes iOS Safari to fire pointercancel, which would immediately abort the gesture.
    if (e.pointerType !== 'touch') e.currentTarget.setPointerCapture(e.pointerId);
    // For touch+select we defer claiming drawingPtrRef until we know a handle drag is starting.
    // Plain tap-to-select completes entirely inside the select block below and returns, so
    // drawingPtrRef never needs to be set, keeping the scroll listener free.
    if (!(e.pointerType === 'touch' && currentTool === 'select')) {
      drawingPtrRef.current = e.pointerId;
    }

    const coords = getCoords(e.clientX, e.clientY, pageNum);

    if (currentTool === 'pan') {
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        sl: mainRef.current?.scrollLeft ?? 0,
        st: mainRef.current?.scrollTop  ?? 0,
      };
      return;
    }

    if (currentTool === 'select') {
      const pageAnns = [...annotations, ...pendingAnnotations].filter(a => a.pageNumber === pageNum);
      // 1. Check if tapping a control-point handle on the selected annotation.
      //    Use selectedAnnIdRef (stable ref) so this callback never reads a stale closure value.
      //    Find the NEAREST handle (not the first) and only capture the event if the tap is NOT
      //    strictly inside another annotation's bounding box — this prevents the dense handle zones
      //    introduced by edge handles from swallowing clicks intended to select a different annotation.
      const currentSelId = selectedAnnIdRef.current;
      if (currentSelId) {
        const currentSelected = pageAnns.find(a => a.id === currentSelId);
        if (currentSelected) {
          let nearestHandle: HandleDef | null = null;
          let nearestHandleDist = HANDLE_HIT_RADIUS_NORM;
          for (const h of getHandlesNorm(currentSelected)) {
            const dist = Math.hypot(h.nx - coords.x, h.ny - coords.y);
            if (dist < nearestHandleDist) { nearestHandleDist = dist; nearestHandle = h; }
          }
          if (nearestHandle) {
            // Yield to selection only if the tap is clearly INSIDE another annotation's bounding
            // box (strict containment, no padding).  Using hitTestAnnotation distance < nearestHandleDist
            // was too broad — a nearby-but-non-overlapping annotation would suppress handle drags
            // even though the click was unambiguously on a handle of the selected annotation.
            const betterTargetExists = pageAnns
              .filter(a => a.id !== currentSelId)
              .some(a => {
                const abbox = getAnnotationBBox(a);
                if (!abbox) return false;
                return coords.x >= abbox.x && coords.x <= abbox.x + abbox.w &&
                       coords.y >= abbox.y && coords.y <= abbox.y + abbox.h;
              });
            if (!betterTargetExists) {
              dragHandleRef.current = { handleIndex: nearestHandle.index, origData: currentSelected.data as AnyAnnotationData, dragStartNorm: coords };
              setLiveEditData(currentSelected.data as AnyAnnotationData);
              // For touch: claim the pointer now so handlePointerMove/Up can track the drag.
              // This also signals onTouchMove to stop scrolling for the duration of the drag.
              if (e.pointerType === 'touch') drawingPtrRef.current = e.pointerId;
              return;
            }
          }
        }
      }
      // 2. Hit-test all annotations via bounding-box: tap anywhere on/near a shape to select it.
      //    Iterate in reverse so the most recently placed annotation wins when shapes fully overlap
      //    (both score 0 — inside bbox — the first found in reverse order wins since 0 < 0 is false
      //    and doesn't overwrite, so the most-recently-placed annotation is kept).
      //    For outside-bbox matches (score > 0) the loop continues to find the minimum distance.
      const MAX_HIT_DIST_NORM = 0.05; // max distance outside bbox to still register a tap
      let nearest: PdfAnnotation | null = null;
      let nearestScore = MAX_HIT_DIST_NORM + 0.001;
      for (const ann of [...pageAnns].reverse()) {
        const score = hitTestAnnotation(ann, coords);
        if (score < nearestScore) { nearestScore = score; nearest = ann; }
      }
      // Final fallback: if nothing matched via bbox, try legacy anchor-badge proximity
      if (!nearest) {
        let legacyD = SELECTION_RADIUS_NORM;
        for (const ann of pageAnns) {
          const anchor = getAnnotationAnchor(ann);
          if (!anchor) continue;
          const dist = Math.hypot(anchor.x - coords.x, anchor.y - coords.y);
          if (dist < legacyD) { legacyD = dist; nearest = ann; }
        }
      }
      setSelectedAnnId(nearest?.id ?? null);
      setLiveEditData(null);
      dragHandleRef.current = null;
      return;
    }

    if (currentTool === 'text') {
      const container = pageContainerRefs.current.get(pageNum);
      if (!container) return;
      const r = container.getBoundingClientRect();
      setTextInput({ px: e.clientX - r.left, py: e.clientY - r.top, rx: coords.x, ry: coords.y });
      setTextValue('');
      setTimeout(() => textFieldRef.current?.focus(), 30);
      return;
    }

    if (currentTool === 'scale') {
      setIsDrawing(true);
      setDrawStart(coords);
      return;
    }

    setIsDrawing(true);
    setDrawStart(coords);
    if (currentTool === 'pen' || currentTool === 'highlighter')
      setPenPoints([{ x: coords.x, y: coords.y, pressure: e.pressure }]);
  }, [currentTool, annotations, pendingAnnotations, getCoords]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    shiftPressedRef.current = e.shiftKey;

    // Pinch-to-zoom: two touch points
    if (touchPtsRef.current.size >= 2) {
      const [a, b] = [...touchPtsRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!isPinchRef.current) {
        isPinchRef.current = true; pinchDistRef.current = dist; pinchZoomRef.current = zoomLevel;
      } else {
        setZoomLevel(Math.max(0.25, Math.min(4.0, pinchZoomRef.current * (dist / (pinchDistRef.current || 1)))));
      }
      return;
    }
    isPinchRef.current = false;

    // Handle drag: update annotation geometry live while dragging a control point
    if (dragHandleRef.current && drawingPtrRef.current === e.pointerId) {
      const selId = selectedAnnIdRef.current;
      if (selId) {
        const allAnns = [...annotations, ...pendingAnnotations];
        const ann = allAnns.find(a => a.id === selId);
        if (ann) {
          const coords = getCoords(e.clientX, e.clientY);
          const newData = applyHandleDrag(
            dragHandleRef.current.origData, ann.toolType as ToolType,
            dragHandleRef.current.handleIndex, coords, dragHandleRef.current.dragStartNorm,
          );
          // Snap rotation to 15° increments when Shift is held while dragging the rotation handle
          if (shiftPressedRef.current && dragHandleRef.current.handleIndex === ROTATE_HANDLE_INDEX) {
            const snapped = Math.round((newData.rotation ?? 0) / 15) * 15;
            setLiveEditData({ ...newData, rotation: ((snapped % 360) + 360) % 360 });
          } else {
            setLiveEditData(newData);
          }
        }
      }
      return;
    }

    // Pan
    if (currentTool === 'pan' && panStartRef.current && drawingPtrRef.current === e.pointerId) {
      const m = mainRef.current;
      if (m) {
        m.scrollLeft = panStartRef.current.sl - (e.clientX - panStartRef.current.x);
        m.scrollTop  = panStartRef.current.st - (e.clientY - panStartRef.current.y);
      }
      return;
    }

    if (drawingPtrRef.current !== e.pointerId || !isDrawing || !drawStart) return;
    let coords = getCoords(e.clientX, e.clientY);

    // Shift-constrain: snap shapes to square, snap lines to 45° increments
    if (shiftPressedRef.current) {
      const dx = coords.x - drawStart.x;
      const dy = coords.y - drawStart.y;
      if (currentTool === 'rectangle' || currentTool === 'filled_rectangle' ||
          currentTool === 'circle'    || currentTool === 'filled_circle') {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        coords = { x: drawStart.x + Math.sign(dx) * side, y: drawStart.y + Math.sign(dy) * side };
      } else if (currentTool === 'line'   || currentTool === 'dashed_line' ||
                 currentTool === 'arrow'  || currentTool === 'double_arrow' ||
                 currentTool === 'dimension') {
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        coords = { x: drawStart.x + len * Math.cos(snapped), y: drawStart.y + len * Math.sin(snapped) };
      }
    }

    if (currentTool === 'pen' || currentTool === 'highlighter') {
      setPenPoints(prev => [...prev, { x: coords.x, y: coords.y, pressure: e.pressure }]);
    } else if (currentTool !== 'stamp' && currentTool !== 'select' && currentTool !== 'text') {
      setPreviewData({ x1: drawStart.x, y1: drawStart.y, x2: coords.x, y2: coords.y });
    }
  }, [currentTool, isDrawing, drawStart, getCoords, zoomLevel, annotations, pendingAnnotations]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    touchPtsRef.current.delete(e.pointerId);
    isPinchRef.current = false;
    if (drawingPtrRef.current !== e.pointerId) return;
    drawingPtrRef.current = null; panStartRef.current = null;

    // Commit handle drag — use ref for selectedAnnId to avoid stale closure
    if (dragHandleRef.current) {
      const selId = selectedAnnIdRef.current;
      if (liveEditData && selId) updateAnnotation(selId, liveEditData);
      dragHandleRef.current = null;
      setLiveEditData(null);
      return;
    }

    if (!isDrawing || !drawStart) return;
    setIsDrawing(false);
    let coords = getCoords(e.clientX, e.clientY);

    // Apply shift-constrain on final point (same logic as move)
    if (shiftPressedRef.current) {
      const dx = coords.x - drawStart.x;
      const dy = coords.y - drawStart.y;
      if (currentTool === 'rectangle' || currentTool === 'filled_rectangle' ||
          currentTool === 'circle'    || currentTool === 'filled_circle') {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        coords = { x: drawStart.x + Math.sign(dx) * side, y: drawStart.y + Math.sign(dy) * side };
      } else if (currentTool === 'line'   || currentTool === 'dashed_line' ||
                 currentTool === 'arrow'  || currentTool === 'double_arrow' ||
                 currentTool === 'dimension') {
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        coords = { x: drawStart.x + len * Math.cos(snapped), y: drawStart.y + len * Math.sin(snapped) };
      }
    }

    // Scale: draw reference line then show input dialog
    if (currentTool === 'scale') {
      setIsDrawing(false);
      if (Math.hypot(coords.x - drawStart.x, coords.y - drawStart.y) > MIN_SHAPE_SIZE_NORM) {
        setScaleInput({ lineStart: drawStart, lineEnd: coords });
        setTimeout(() => scaleInputRef.current?.focus(), 50);
      }
      setPreviewData(null); setDrawStart(null); return;
    }

    // Stamp: tap to place
    if (currentTool === 'stamp') {
      if (Math.hypot(coords.x - drawStart.x, coords.y - drawStart.y) < TAP_DISTANCE_NORM) {
        setPenPoints([]); setPreviewData(null); setDrawStart(null);
        const placed = commitAnnotation({ x: drawStart.x, y: drawStart.y, stampType }, 'stamp');
        setSelectedAnnId(placed.id);
      } else { setPenPoints([]); setPreviewData(null); setDrawStart(null); }
      return;
    }

    let data: AnyAnnotationData;
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      const pts = [...penPoints, { x: coords.x, y: coords.y, pressure: e.pressure }];
      if (pts.length < 2) { setPenPoints([]); setPreviewData(null); setDrawStart(null); return; }
      data = { points: pts };
    } else {
      if (Math.hypot(coords.x - drawStart.x, coords.y - drawStart.y) < MIN_SHAPE_SIZE_NORM) {
        setPreviewData(null); setDrawStart(null); return;
      }
      data = { x1: drawStart.x, y1: drawStart.y, x2: coords.x, y2: coords.y };
    }
    setPenPoints([]); setPreviewData(null);

    // Callout: show text input at the text-box location (draw start = x1,y1)
    if (currentTool === 'callout') {
      const container = pageContainerRefs.current.get(activePageRef.current);
      if (!container) { setDrawStart(null); return; }
      const r = container.getBoundingClientRect();
      setTextInput({ px: e.clientX - r.left, py: e.clientY - r.top, rx: drawStart.x, ry: drawStart.y, calloutData: data });
      setTextValue(''); setDrawStart(null);
      setTimeout(() => textFieldRef.current?.focus(), 30);
      return;
    }
    setDrawStart(null);
    const placed = commitAnnotation(data);
    // Keep the current drawing tool active so the user can draw another annotation.
    // Only select the just-placed item so its bounding box is visible.
    setSelectedAnnId(placed.id);
  }, [isDrawing, drawStart, currentTool, penPoints, getCoords, commitAnnotation, stampType, liveEditData, updateAnnotation]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    touchPtsRef.current.delete(e.pointerId);
    if (drawingPtrRef.current === e.pointerId) {
      drawingPtrRef.current = null;
      setIsDrawing(false); setPenPoints([]); setPreviewData(null); setDrawStart(null);
      isPinchRef.current = false; panStartRef.current = null;
      dragHandleRef.current = null; setLiveEditData(null);
    }
  }, []);

  // Ctrl+scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoomLevel(z => Math.max(0.25, Math.min(4.0, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);

  // Text / callout submit
  const handleTextSubmit = useCallback(() => {
    if (!textInput) return;
    setTextInput(null);
    if (!textValue.trim()) { setTextValue(''); setEditingAnnId(null); return; }

    if (editingAnnId) {
      const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
      const existing = allAnns.find(a => a.id === editingAnnId);
      if (existing) {
        updateAnnotation(editingAnnId, { ...(existing.data as AnyAnnotationData), text: textValue.trim() });
        setSelectedAnnId(editingAnnId);
      }
      setEditingAnnId(null); setTextValue(''); return;
    }

    let placed: PdfAnnotation;
    if (textInput.calloutData) {
      placed = commitAnnotation({ ...textInput.calloutData, text: textValue.trim(), fontSize }, 'callout');
    } else {
      placed = commitAnnotation({ x: textInput.rx, y: textInput.ry, text: textValue.trim(), fontSize }, 'text');
    }
    setTextValue('');
    setSelectedAnnId(placed.id);
    // After placing a callout, auto-switch to Select so handles are immediately visible and draggable
    if (textInput.calloutData) setCurrentTool('select');
  }, [textInput, textValue, fontSize, commitAnnotation, editingAnnId, updateAnnotation]);

  const handleScaleConfirm = useCallback(() => {
    if (!scaleInput || !scaleValue) { setScaleInput(null); return; }
    const inputVal = parseFloat(scaleValue);
    if (isNaN(inputVal) || inputVal <= 0) { setScaleInput(null); return; }
    const activeSize = pageSizes.get(activePageRef.current) ?? { width: 0, height: 0 };
    const ar = activeSize.width / (activeSize.height || 1);
    const dx = scaleInput.lineEnd.x - scaleInput.lineStart.x;
    const dy = scaleInput.lineEnd.y - scaleInput.lineStart.y;
    const normDist = Math.sqrt((dx * ar) ** 2 + dy ** 2);
    if (normDist < 0.001) { setScaleInput(null); return; }
    setScaleInfo({ unitsPerNormDist: inputVal / normDist, aspectRatio: ar, unit: scaleUnit });
    setScaleInput(null); setScaleValue(''); setCurrentTool('select');
  }, [scaleInput, scaleValue, scaleUnit, pageSizes]);

  const flipAnnotationH = useCallback(() => {
    const selId = selectedAnnIdRef.current;
    if (!selId) return;
    const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
    const ann = allAnns.find(a => a.id === selId);
    if (!ann) return;
    const d = ann.data as AnyAnnotationData;
    if (ann.toolType === 'pen' || ann.toolType === 'highlighter') {
      if (!d.points) return;
      const xs = d.points.map(p => p.x), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      updateAnnotation(selId, { ...d, points: d.points.map(p => ({ ...p, x: 2 * cx - p.x })) });
    } else if (d.x1 !== undefined) {
      updateAnnotation(selId, { ...d, x1: d.x2, x2: d.x1 });
    }
  }, [updateAnnotation]);

  const flipAnnotationV = useCallback(() => {
    const selId = selectedAnnIdRef.current;
    if (!selId) return;
    const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
    const ann = allAnns.find(a => a.id === selId);
    if (!ann) return;
    const d = ann.data as AnyAnnotationData;
    if (ann.toolType === 'pen' || ann.toolType === 'highlighter') {
      if (!d.points) return;
      const ys = d.points.map(p => p.y), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      updateAnnotation(selId, { ...d, points: d.points.map(p => ({ ...p, y: 2 * cy - p.y })) });
    } else if (d.y1 !== undefined) {
      updateAnnotation(selId, { ...d, y1: d.y2, y2: d.y1 });
    }
  }, [updateAnnotation]);

  const updateOpacity = useCallback((id: string, newOpacity: number) => {
    const allAnns = [...annotationsRef.current, ...pendingAnnotationsRef.current];
    const ann = allAnns.find(a => a.id === id);
    if (!ann) return;
    updateAnnotation(id, { ...(ann.data as AnyAnnotationData), opacity: newOpacity });
  }, [updateAnnotation]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (currentTool !== 'select') return;
    const pageNum = Number(e.currentTarget.dataset.page) || activePageRef.current;
    activePageRef.current = pageNum;
    const coords = getCoords(e.clientX, e.clientY, pageNum);
    const pageAnns = [...annotations, ...pendingAnnotations].filter(a => a.pageNumber === pageNum);
    let nearest: PdfAnnotation | null = null;
    let nearestScore = 0.06;
    for (const ann of [...pageAnns].reverse()) {
      if (ann.toolType !== 'text' && ann.toolType !== 'callout') continue;
      const score = hitTestAnnotation(ann, coords);
      if (score < nearestScore) { nearestScore = score; nearest = ann; }
    }
    if (!nearest) return;
    const container = pageContainerRefs.current.get(pageNum);
    if (!container) return;
    const r = container.getBoundingClientRect();
    const d = nearest.data as AnyAnnotationData;
    setEditingAnnId(nearest.id);
    setTextValue((d.text as string | undefined) ?? '');
    if (nearest.toolType === 'text') {
      setTextInput({ px: e.clientX - r.left, py: e.clientY - r.top, rx: d.x ?? coords.x, ry: d.y ?? coords.y });
    } else {
      setTextInput({ px: e.clientX - r.left, py: e.clientY - r.top, rx: d.x1 ?? coords.x, ry: d.y1 ?? coords.y, calloutData: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 } as AnyAnnotationData });
    }
    setTimeout(() => textFieldRef.current?.focus(), 30);
  }, [currentTool, annotations, pendingAnnotations, getCoords]);

  // Derived
  const allDisplayAnnotations = useMemo(
    () => [...annotations, ...pendingAnnotations],
    [annotations, pendingAnnotations]
  );
  const allAuthors = useMemo(
    () => Array.from(new Map(allDisplayAnnotations.map(a => [a.authorId, a.authorName])).entries())
      .map(([id, name]) => ({ id, name })),
    [allDisplayAnnotations]
  );
  // Pre-compute a stable first-seen color per author to avoid O(n*m) lookups in JSX
  const authorColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ann of allDisplayAnnotations) {
      if (!map.has(ann.authorId)) map.set(ann.authorId, ann.color);
    }
    return map;
  }, [allDisplayAnnotations]);
  // Selected annotation may live on any page; resolve it globally for the toolbar.
  const selectedAnn     = allDisplayAnnotations.find(a => a.id === selectedAnnId) ?? null;
  const canDeleteAnn = (ann: PdfAnnotation) =>
    ann.authorId === sessionUser.id || sessionUser.role === UserRole.ADMIN || sessionUser.role === UserRole.SUPER_ADMIN;
  const isNavTool  = currentTool === 'select' || currentTool === 'pan' || currentTool === 'scale';
  const toolCursor = liveEditData !== null ? 'cursor-grabbing'
    : currentTool === 'text' || currentTool === 'callout' ? 'cursor-text'
    : currentTool === 'pan'    ? 'cursor-grab'
    : currentTool === 'select' ? 'cursor-pointer'
    : 'cursor-crosshair';
  const selectTool = (id: ToolType) => {
    // Tapping the active drawing tool again deactivates it and returns to Pan.
    // Nav tools (select, pan) always activate directly.
    if (id !== 'select' && id !== 'pan' && id === currentTool) {
      setCurrentTool('pan'); setTextInput(null); setSelectedAnnId(null);
    } else {
      setCurrentTool(id); setTextInput(null); setSelectedAnnId(null);
    }
  };

  // Renders a single stacked page: its canvas + the SVG annotation overlay.
  // Live drawing previews and the text/scale inputs render only on the page the
  // current gesture is acting on (activePageRef); annotations render on every page.
  const renderPageLayer = (pageNum: number) => {
    const size = pageSizes.get(pageNum);
    const w = size?.width ?? 0;
    const h = size?.height ?? 0;
    const isActive = activePageRef.current === pageNum;
    const pageAnns = allDisplayAnnotations.filter(
      a => a.pageNumber === pageNum && (filterAuthorId === null || a.authorId === filterAuthorId)
    );
    const sel = selectedAnn && selectedAnn.pageNumber === pageNum ? selectedAnn : null;
    const penPreviewPath = isActive && (currentTool === 'pen' || currentTool === 'highlighter') && penPoints.length > 1 && isDrawing
      ? penPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ')
      : null;

    return (
      <div
        key={pageNum}
        data-page={pageNum}
        ref={el => { if (el) pageContainerRefs.current.set(pageNum, el); else pageContainerRefs.current.delete(pageNum); }}
        className={`relative shadow-2xl rounded-lg overflow-hidden shrink-0 ${toolCursor}`}
        style={{ width: w || '100%', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
      >
        <canvas
          ref={el => { if (el) pageCanvasRefs.current.set(pageNum, el); else pageCanvasRefs.current.delete(pageNum); }}
          className="block"
        />

        <svg className="absolute inset-0 pointer-events-none"
          width={w} height={h}
          viewBox={`0 0 ${w} ${h}`}>

          {pageAnns.map(ann => {
            const data = (ann.id === selectedAnnId && liveEditData !== null)
              ? liveEditData
              : ann.data as AnyAnnotationData;
            return renderAnnotationSvg({ ...ann, data }, w, h, ann.id, scaleInfo);
          })}

          {sel && currentTool === 'select' && (() => {
            const displayData = liveEditData ?? sel.data as AnyAnnotationData;
            const rotation    = (displayData.rotation as number | undefined) ?? 0;
            const handles     = getHandlesNorm({ ...sel, data: displayData });
            const bbox        = getAnnotationBBox(sel, displayData);
            const SELECTION_BOX_PADDING = 8;
            // Pixel coordinates of the bbox centre (used for the rotation transform)
            const bboxCxPx = bbox ? (bbox.x + bbox.w / 2) * w : 0;
            const bboxCyPx = bbox ? (bbox.y + bbox.h / 2) * h : 0;
            const rotateHandle = handles.find(hh => hh.isRotateHandle);
            return (
              <g>
                {/* Dashed bounding box — rotated with the annotation */}
                {bbox && bbox.w > 0.005 && (
                  <g transform={rotation ? `rotate(${rotation}, ${bboxCxPx}, ${bboxCyPx})` : undefined}>
                    <rect
                      x={bbox.x * w - SELECTION_BOX_PADDING}
                      y={bbox.y * h - SELECTION_BOX_PADDING}
                      width={bbox.w * w + SELECTION_BOX_PADDING * 2}
                      height={bbox.h * h + SELECTION_BOX_PADDING * 2}
                      fill="none" stroke="white" strokeWidth="1.5"
                      strokeDasharray="5 3" opacity="0.5" rx="3" />
                  </g>
                )}
                {/* Stem line from bbox top-centre to the rotate handle */}
                {bbox && bbox.w > 0.005 && rotateHandle && (() => {
                  // Compute the rotated top-centre of the bounding box
                  const stemBaseX = bbox.x * w + (bbox.w * w) / 2;
                  const stemBaseY = bbox.y * h - SELECTION_BOX_PADDING;
                  if (rotation) {
                    const rad = (rotation * Math.PI) / 180;
                    const cos = Math.cos(rad), sin = Math.sin(rad);
                    const dx = stemBaseX - bboxCxPx, dy = stemBaseY - bboxCyPx;
                    const rx = bboxCxPx + dx * cos - dy * sin;
                    const ry = bboxCyPx + dx * sin + dy * cos;
                    return <line x1={rx} y1={ry} x2={rotateHandle.nx * w} y2={rotateHandle.ny * h}
                      stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.35" />;
                  }
                  return <line x1={stemBaseX} y1={stemBaseY} x2={rotateHandle.nx * w} y2={rotateHandle.ny * h}
                    stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.35" />;
                })()}
                {handles.map(hh => {
                  const cx = hh.nx * w;
                  const cy = hh.ny * h;
                  const isCalloutArrowTip = sel.toolType === 'callout' && !hh.isMoveHandle && !hh.isRotateHandle && hh.index === 1;
                  const handleFill = hh.isRotateHandle ? '#22c55e'
                    : hh.isMoveHandle ? '#6366f1'
                    : hh.isEdgeHandle ? '#0ea5e9'
                    : isCalloutArrowTip ? '#f59e0b'
                    : '#3b82f6';
                  const edgeLabel = hh.index === EDGE_HANDLE_TOP ? 'top' : hh.index === EDGE_HANDLE_RIGHT ? 'right' : hh.index === EDGE_HANDLE_BOTTOM ? 'bottom' : 'left';
                  const handleTitle = hh.isRotateHandle
                    ? `Rotate — drag to rotate (${Math.round(rotation)}°), hold Shift for 15° snapping`
                    : hh.isMoveHandle
                      ? 'Move annotation'
                      : hh.isEdgeHandle
                        ? `Resize ${edgeLabel} edge — drag to resize on one axis`
                        : sel.toolType === 'callout'
                          ? hh.index === 0 ? 'Text box — drag to reposition' : 'Arrow tip — drag to repoint'
                          : sel.toolType === 'arrow' || sel.toolType === 'double_arrow'
                            ? hh.index === 0 ? 'Line start — drag to adjust' : 'Arrow head — drag to adjust'
                            : `Endpoint ${hh.index + 1} — drag to reshape`;
                  const r = hh.isRotateHandle || hh.isMoveHandle ? 9 : 8;
                  return (
                    <g key={`handle-${hh.index}`}>
                      {/* Hit-area circle (invisible, larger) */}
                      <circle cx={cx} cy={cy} r="18" fill="transparent">
                        <title>{handleTitle}</title>
                      </circle>
                      {/* Edge handles: diamond (rotated square) shape */}
                      {hh.isEdgeHandle ? (
                        <rect
                          x={cx - 6} y={cy - 6} width={12} height={12}
                          fill={handleFill} stroke="white" strokeWidth="2"
                          transform={`rotate(45, ${cx}, ${cy})`}
                        />
                      ) : (
                        /* Visible handle circle */
                        <circle cx={cx} cy={cy} r={r} fill={handleFill} stroke="white" strokeWidth="2.5" />
                      )}
                      {/* Rotate handle: circular-arrow icon */}
                      {hh.isRotateHandle && (
                        <g transform={`translate(${cx}, ${cy})`} stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none">
                          <path d="M -4 -3 A 5 5 0 1 1 3.5 -3.5" />
                          <polyline points="3.5,-3.5 5.5,-1.5 5.5,-5" />
                        </g>
                      )}
                      {/* Move handle: cross icon */}
                      {hh.isMoveHandle && (
                        <g stroke="white" strokeWidth="1.5" strokeLinecap="round">
                          <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} />
                          <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 4} />
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {pageAnns.map(ann => {
            const anchor = getAnnotationAnchor(ann);
            if (!anchor) return null;
            const initials  = getInitials(ann.authorName);
            const bw        = initials.length * 7 + 10;
            const bx        = anchor.x * w;
            const by        = anchor.y * h;
            const isPending = ann.id.startsWith('tmp-');
            return (
              <g key={`badge-${ann.id}`}>
                <rect x={bx} y={by - 17} width={bw} height={17} rx="3"
                  fill={ann.color} opacity={isPending ? 0.5 : 0.88}
                  stroke={isPending ? 'white' : 'none'} strokeWidth={isPending ? 1 : 0}
                  strokeDasharray={isPending ? '3 2' : undefined} />
                <text x={bx + 5} y={by - 3} fontSize="11" fontFamily="monospace" fontWeight="bold" fill="white">
                  {initials}
                </text>
              </g>
            );
          })}

          {penPreviewPath && (
            <path d={penPreviewPath} stroke={currentColor}
              strokeWidth={currentTool === 'highlighter' ? strokeWidth * 5 : strokeWidth}
              fill="none" strokeLinecap="round" strokeLinejoin="round"
              opacity={currentTool === 'highlighter' ? opacity * 0.35 : opacity * 0.75} />
          )}

          {isActive && previewData && currentTool !== 'pen' && currentTool !== 'highlighter' && currentTool !== 'scale' &&
            renderAnnotationSvg({ toolType: currentTool, color: currentColor, strokeWidth, data: previewData },
              w, h, 'preview', scaleInfo)
          }

          {isActive && isDrawing && currentTool === 'scale' && previewData && (
            <line
              x1={(previewData.x1 ?? 0) * w} y1={(previewData.y1 ?? 0) * h}
              x2={(previewData.x2 ?? 0) * w} y2={(previewData.y2 ?? 0) * h}
              stroke="#fbbf24" strokeWidth="2" strokeDasharray="6 3" strokeLinecap="round" opacity="0.9"
            />
          )}

          {isActive && scaleInput && (
            <line
              x1={scaleInput.lineStart.x * w} y1={scaleInput.lineStart.y * h}
              x2={scaleInput.lineEnd.x * w} y2={scaleInput.lineEnd.y * h}
              stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="6 3" strokeLinecap="round"
            />
          )}

          {/* Start-point crosshair while drawing lines / callout / shapes */}
          {isActive && isDrawing && drawStart && !['pen', 'highlighter', 'text', 'stamp', 'select', 'pan'].includes(currentTool) && (
            <g>
              <circle cx={drawStart.x * w} cy={drawStart.y * h}
                r="5" fill={currentColor} stroke="white" strokeWidth="2" opacity="0.9" />
              <line x1={drawStart.x * w - 10} y1={drawStart.y * h}
                x2={drawStart.x * w + 10} y2={drawStart.y * h}
                stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              <line x1={drawStart.x * w} y1={drawStart.y * h - 10}
                x2={drawStart.x * w} y2={drawStart.y * h + 10}
                stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            </g>
          )}

          {/* Angle badge for line-type tools while drawing */}
          {isActive && isDrawing && previewData && (
            currentTool === 'line' || currentTool === 'dashed_line' ||
            currentTool === 'arrow' || currentTool === 'double_arrow' ||
            currentTool === 'dimension' || currentTool === 'callout'
          ) && (() => {
            const x2px = (previewData.x2 ?? 0) * w;
            const y2px = (previewData.y2 ?? 0) * h;
            const dx = ((previewData.x2 ?? 0) - (previewData.x1 ?? 0)) * w;
            const dy = ((previewData.y2 ?? 0) - (previewData.y1 ?? 0)) * h;
            const angleDeg = ((Math.round(Math.atan2(dy, dx) * 180 / Math.PI) % 360) + 360) % 360;
            const bx = Math.min(x2px + 12, w - 52);
            const by = y2px > 20 ? y2px - 8 : y2px + 26;
            return (
              <g opacity="0.92">
                <rect x={bx} y={by - 13} width={44} height={16} rx="4" fill="rgba(0,0,0,0.72)" />
                <text x={bx + 5} y={by - 1} fontSize="11" fill="white" fontFamily="monospace" fontWeight="bold">
                  {angleDeg}°
                </text>
              </g>
            );
          })()}

          {/* Ghost callout preview while the text input is open */}
          {isActive && textInput && textInput.calloutData && (
            renderAnnotationSvg({
              toolType: 'callout', color: currentColor, strokeWidth,
              data: { ...textInput.calloutData, text: textValue.trim() || ' ', fontSize },
            }, w, h, 'callout-ghost')
          )}

          {/* Scale bar */}
          {scaleInfo && w > 0 && (() => {
            const targetPx = w * 0.15;
            const rawUnits = (targetPx / h) * scaleInfo.unitsPerNormDist;
            const nices = [0.25,0.5,1,2,5,10,20,25,50,100,200,500,1000];
            const nice = nices.reduce((a, b) => Math.abs(b - rawUnits) < Math.abs(a - rawUnits) ? b : a);
            const barPx = (nice / scaleInfo.unitsPerNormDist) * h;
            const barX = 16, barY = h - 16;
            const label = `${nice} ${scaleInfo.unit}`;
            const lblW = label.length * 6 + 12;
            return (
              <g opacity="0.9">
                <rect x={barX - 4} y={barY - 24} width={Math.max(barPx + 8, lblW + 8)} height={28} rx="4" fill="rgba(0,0,0,0.72)" />
                <line x1={barX} y1={barY - 10} x2={barX + barPx} y2={barY - 10} stroke="white" strokeWidth="2" />
                <line x1={barX} y1={barY - 16} x2={barX} y2={barY - 4} stroke="white" strokeWidth="2" />
                <line x1={barX + barPx} y1={barY - 16} x2={barX + barPx} y2={barY - 4} stroke="white" strokeWidth="2" />
                <text x={barX + barPx / 2} y={barY} textAnchor="middle" fill="white" fontSize="9" fontFamily="monospace" fontWeight="bold">{label}</text>
              </g>
            );
          })()}
        </svg>

        {isActive && scaleInput && (
          <div className="absolute bg-slate-900 border border-white/20 rounded-xl p-4 shadow-2xl z-20 w-60"
            style={{ left: Math.min(w - 248, Math.max(0, scaleInput.lineEnd.x * w - 120)),
                     top: Math.min(h - 120, Math.max(0, scaleInput.lineEnd.y * h + 16)) }}>
            <p className="text-[10px] text-brand font-black uppercase tracking-widest mb-3">Set Scale Reference</p>
            <p className="text-[9px] text-slate-400 mb-2">What length does this line represent?</p>
            <div className="flex gap-2 mb-3">
              <input ref={scaleInputRef} type="number" min="0.001" step="any" value={scaleValue}
                onChange={e => setScaleValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScaleConfirm(); if (e.key === 'Escape') setScaleInput(null); }}
                placeholder="Distance"
                className="flex-1 bg-slate-800 text-white rounded-lg px-2 py-1.5 text-sm border border-white/10 outline-none focus:border-brand min-w-0" />
              <select value={scaleUnit} onChange={e => setScaleUnit(e.target.value)}
                className="bg-slate-800 text-white rounded-lg px-2 text-sm border border-white/10 outline-none focus:border-brand shrink-0">
                <option value="ft">ft</option>
                <option value="in">in</option>
                <option value="yd">yd</option>
                <option value="m">m</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleScaleConfirm}
                className="flex-1 bg-brand text-slate-900 rounded-lg py-1.5 text-[11px] font-black hover:brightness-110 transition-all">
                Set Scale
              </button>
              <button onClick={() => { setScaleInput(null); setScaleValue(''); }}
                className="px-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg py-1.5 text-[11px] font-black transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {isActive && textInput && (
          <input
            ref={textFieldRef}
            type="text"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onBlur={handleTextSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') { setTextInput(null); setTextValue(''); }
            }}
            className="absolute bg-black/50 backdrop-blur rounded px-2 py-1 border border-dashed outline-none z-10 font-bold"
            style={{
              left: textInput.calloutData
                ? Math.min(w - 172, Math.max(4, textInput.rx * w - 80))
                : textInput.px,
              top: textInput.calloutData
                ? Math.min(h - 40, Math.max(4, textInput.ry * h - fontSize - 14))
                : textInput.py - 16,
              color: currentColor, borderColor: currentColor, fontSize: fontSize + 'px', minWidth: '160px',
            }}
            placeholder={textInput.calloutData ? 'Callout text, then Enter…' : 'Type, then Enter…'}
          />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950 flex flex-col select-none" onWheel={handleWheel}>

      {/* ── Row 1: Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-slate-900/90 backdrop-blur shrink-0 flex-wrap gap-y-1.5 min-h-[56px]">
        <button onClick={() => {
            if (pendingAnnotationsRef.current.length > 0 &&
                !window.confirm(`You have ${pendingAnnotationsRef.current.length} unsaved annotation(s). Close without saving?`)) return;
            onClose();
          }}
          className="p-2.5 bg-rose-600 text-white rounded-xl hover:scale-105 transition-all active:scale-95 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Close editor">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white text-sm font-black uppercase tracking-widest leading-tight">As-Built Markup</h2>
          <p className="text-brand text-xs font-black uppercase tracking-tighter truncate">{print.fileName}</p>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handleUndo} disabled={!canUndo}
            className="p-2.5 bg-slate-800 text-white rounded-xl disabled:opacity-40 hover:bg-slate-700 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Undo (Ctrl+Z)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={handleRedo} disabled={!canRedo}
            className="p-2.5 bg-slate-800 text-white rounded-xl disabled:opacity-40 hover:bg-slate-700 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Redo (Ctrl+Y)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setZoomLevel(z => Math.max(0.25, z - 0.25))}
            className="p-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Zoom out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button onClick={() => setZoomLevel(1.0)}
            className="px-2 bg-slate-800 text-white rounded-xl text-xs font-black hover:bg-slate-700 transition-all min-w-[52px] min-h-[44px] flex items-center justify-center"
            title="Reset zoom">
            {Math.round(zoomLevel * 100)}%
          </button>
          <button onClick={() => setZoomLevel(z => Math.min(4.0, z + 0.25))}
            className="p-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Zoom in">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
        </div>

        {/* Page indicator — pages scroll continuously; this reflects the page in view */}
        {numPages > 1 && (
          <div className="flex items-center gap-1.5 shrink-0 px-3 min-h-[44px] bg-slate-800 rounded-xl"
            title="Scroll to move through pages">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7M4 5v14" transform="rotate(90 12 12)" />
            </svg>
            <span className="text-white text-xs font-bold whitespace-nowrap">Page {pageNumber} / {numPages}</span>
          </div>
        )}

        {isSaving && <span className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse shrink-0">Saving…</span>}
        {!isSaving && pendingAnnotations.length > 0 && (
          <span className="text-[10px] text-amber-400 font-black uppercase tracking-widest shrink-0">
            {pendingAnnotations.length} unsaved
          </span>
        )}

        {/* Save button */}
        <button onClick={handleSave}
          disabled={isSaving || pendingAnnotations.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save all unsaved annotations to the database">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          {pendingAnnotations.length > 0 ? `Save (${pendingAnnotations.length})` : 'Save'}
        </button>

        {scaleInfo && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded-lg">
              Scale: {scaleInfo.unit}
            </span>
            <button onClick={() => setScaleInfo(null)}
              className="text-[9px] text-slate-500 hover:text-rose-400 font-black uppercase tracking-widest transition-colors px-1"
              title="Clear scale calibration">×</button>
          </div>
        )}

        {inputDevice === 'pen' && (
          <span className="text-[10px] text-brand font-black uppercase tracking-widest shrink-0 bg-brand/10 px-2 py-1 rounded-lg">
            ✐ Pencil
          </span>
        )}
        <button onClick={() => setShowLog(v => !v)}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${showLog ? 'bg-brand text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
          Log ({allDisplayAnnotations.length})
        </button>

        {/* Foreman filter */}
        {allAuthors.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest hidden sm:block">Filter</span>
            <button
              onClick={() => setFilterAuthorId(null)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black min-h-[36px] transition-all ${filterAuthorId === null ? 'bg-brand text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              title="Show all foremen">
              All
            </button>
            {allAuthors.map(a => {
              const color = authorColorMap.get(a.id) ?? '#6b7280';
              return (
                <button key={a.id}
                  onClick={() => setFilterAuthorId(prev => prev === a.id ? null : a.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black min-h-[36px] transition-all border ${filterAuthorId === a.id ? 'ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: color + '33', color, borderColor: color + '66' }}
                  title={`Filter: ${a.name}`}>
                  {getInitials(a.name)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Row 2: Tool groups ── */}
      <div className="flex items-start gap-1.5 px-3 py-2 border-b border-white/10 bg-slate-900/60 shrink-0 overflow-x-auto">
        {TOOL_GROUPS.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && <div className="w-px self-stretch bg-white/10 shrink-0 mx-0.5 my-1" />}
            <div className="flex flex-col gap-0.5 shrink-0">
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest px-1 leading-none mb-0.5">{group.label}</p>
              <div className="flex gap-0.5">
                {group.tools.map(tool => (
                  <button key={tool.id} onClick={() => selectTool(tool.id as ToolType)}
                    title={tool.title}
                    className={`w-11 h-11 rounded-xl font-black transition-all shrink-0 flex items-center justify-center ${
                      currentTool === tool.id ? 'bg-brand text-slate-900 shadow-lg' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:scale-105 active:scale-95'
                    }`}>
                    {tool.icon}
                  </button>
                ))}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── Row 3: Properties ── */}
      {!isNavTool && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10 bg-slate-900/40 shrink-0 overflow-x-auto min-h-[52px]">
          {/* Colors */}
          <div className="flex items-center gap-1 shrink-0">
            {COLORS.map(c => (
              <button key={c} onClick={() => setCurrentColor(c)} title={c}
                className={`w-7 h-7 rounded-full shrink-0 transition-transform hover:scale-110 active:scale-95 ${currentColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
                style={{ backgroundColor: c, border: (c === '#ffffff' || c === '#000000') ? '1px solid rgba(255,255,255,0.2)' : undefined }} />
            ))}
            <label
              className={`relative w-7 h-7 rounded-full shrink-0 overflow-hidden cursor-pointer transition-transform hover:scale-110 active:scale-95 ${!COLORS.includes(currentColor) ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
              title="Custom color"
              style={{ background: COLORS.includes(currentColor) ? RAINBOW_GRADIENT : currentColor, border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <input type="color" value={currentColor} onChange={e => setCurrentColor(e.target.value)}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
            </label>
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {/* Stroke widths */}
          <div className="flex items-center gap-1 shrink-0">
            {STROKE_WIDTHS.map(sw => (
              <button key={sw} onClick={() => setStrokeWidth(sw)} title={`Stroke ${sw}px`}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${strokeWidth === sw ? 'bg-brand' : 'bg-slate-800 hover:bg-slate-700'}`}>
                <div className="rounded-full bg-white" style={{ width: sw + 2, height: sw + 2 }} />
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {/* Opacity */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest whitespace-nowrap">Opacity</span>
            <input type="range" min="0.1" max="1" step="0.05" value={opacity}
              onChange={e => setOpacity(parseFloat(e.target.value))}
              className="w-20 accent-[var(--brand,#3b82f6)]" />
            <span className="text-[10px] text-slate-300 font-bold w-8 shrink-0">{Math.round(opacity * 100)}%</span>
          </div>

          {/* Font size (text / callout) */}
          {(currentTool === 'text' || currentTool === 'callout') && (
            <>
              <div className="w-px h-6 bg-white/10 shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest whitespace-nowrap">Size</span>
                {FONT_SIZES.map(fs => (
                  <button key={fs} onClick={() => setFontSize(fs)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all min-w-[30px] ${fontSize === fs ? 'bg-brand text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    {fs}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Stamp type */}
          {currentTool === 'stamp' && (
            <>
              <div className="w-px h-6 bg-white/10 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {STAMP_TYPES.map(st => (
                  <button key={st} onClick={() => setStampType(st)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shrink-0 border ${stampType === st ? 'ring-2 ring-white/40' : 'opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: STAMP_COLORS[st] + '22', color: STAMP_COLORS[st], borderColor: STAMP_COLORS[st] + '66' }}>
                    {st}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Row 3b: Select actions ── */}
      {currentTool === 'select' && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10 bg-slate-900/40 shrink-0 min-h-[52px] overflow-x-auto">
          {selectedAnn ? (
            <>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest shrink-0">
                {selectedAnn.toolType.replace(/_/g, ' ')} selected
                {selectedAnn.toolType === 'callout' && getHandlesNorm(selectedAnn).length >= 2
                  ? ' — drag amber dot to repoint arrow · blue dot to move text box · green dot to rotate'
                  : getHandlesNorm(selectedAnn).some(h => h.isRotateHandle) && getHandlesNorm(selectedAnn).some(h => !h.isMoveHandle && !h.isRotateHandle && !h.isEdgeHandle)
                    ? ' — blue corners to resize · sky diamonds for single-axis · purple dot to move · green dot to rotate (hold Shift for 15° snap)'
                    : getHandlesNorm(selectedAnn).some(h => h.isRotateHandle)
                      ? ' — drag purple dot to move · green dot to rotate (hold Shift for 15° snap)'
                      : ''}
              </span>

              {/* Color picker for selected annotation */}
              <div className="w-px h-6 bg-white/10 shrink-0" />
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest shrink-0">Color</span>
              <div className="flex items-center gap-1 shrink-0">
                {COLORS.map(c => (
                  <button key={c} onClick={() => { setCurrentColor(c); updateColor(selectedAnn.id, c); }} title={c}
                    className={`w-6 h-6 rounded-full shrink-0 transition-transform hover:scale-110 active:scale-95 ${selectedAnn.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
                    style={{ backgroundColor: c, border: (c === '#ffffff' || c === '#000000') ? '1px solid rgba(255,255,255,0.2)' : undefined }} />
                ))}
                <label
                  className={`relative w-6 h-6 rounded-full shrink-0 overflow-hidden cursor-pointer transition-transform hover:scale-110 active:scale-95 ${!COLORS.includes(selectedAnn.color) ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
                  title="Custom color"
                  style={{ background: COLORS.includes(selectedAnn.color) ? RAINBOW_GRADIENT : selectedAnn.color, border: '1.5px solid rgba(255,255,255,0.25)' }}>
                  <input type="color" value={selectedAnn.color}
                    onChange={e => { setCurrentColor(e.target.value); updateColor(selectedAnn.id, e.target.value); }}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                </label>
              </div>

              {/* Font size picker for selected text / callout annotations */}
              {(selectedAnn.toolType === 'text' || selectedAnn.toolType === 'callout') && (
                <>
                  <div className="w-px h-6 bg-white/10 shrink-0" />
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest shrink-0">Font Size</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {FONT_SIZES.map(fs => {
                      const currentFs = (selectedAnn.data as AnyAnnotationData).fontSize ?? DEFAULT_FONT_SIZE;
                      return (
                        <button key={fs} onClick={() => {
                          setFontSize(fs);
                          updateAnnotation(selectedAnn.id, { ...(selectedAnn.data as AnyAnnotationData), fontSize: fs });
                        }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all min-w-[30px] ${currentFs === fs ? 'bg-brand text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                          {fs}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Stroke width picker for selected line / shape / freehand annotations */}
              {selectedAnn.toolType !== 'text' && selectedAnn.toolType !== 'callout' && selectedAnn.toolType !== 'stamp' && (
                <>
                  <div className="w-px h-6 bg-white/10 shrink-0" />
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest shrink-0">Width</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {STROKE_WIDTHS.map(sw => (
                      <button key={sw}
                      onClick={() => {
                          // setStrokeWidth updates the toolbar default for the next new annotation.
                          // updateStrokeWidth patches the already-placed annotation's stored value.
                          setStrokeWidth(sw); updateStrokeWidth(selectedAnn.id, sw);
                        }}
                        title={`Stroke ${sw}px`}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${selectedAnn.strokeWidth === sw ? 'bg-brand' : 'bg-slate-800 hover:bg-slate-700'}`}>
                        <div className="rounded-full bg-white" style={{ width: sw + 2, height: sw + 2 }} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Rotation control for all annotations that have a bbox */}
              {getHandlesNorm(selectedAnn).some(h => h.isRotateHandle) && (
                <>
                  <div className="w-px h-6 bg-white/10 shrink-0" />
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest shrink-0">Rotate</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => {
                        const d = selectedAnn.data as AnyAnnotationData;
                        const newR = (((d.rotation ?? 0) - 90) % 360 + 360) % 360;
                        updateAnnotation(selectedAnn.id, { ...d, rotation: newR });
                      }}
                      title="Rotate -90°"
                      className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-black transition-all shrink-0 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l-4-4m0 0l4-4m-4 4h12a4 4 0 000-8h-1" />
                      </svg>
                    </button>
                    <input
                      type="number" step="1"
                      value={Math.round((selectedAnn.data as AnyAnnotationData).rotation ?? 0)}
                      onChange={e => {
                        const parsed = parseInt(e.target.value, 10);
                        const v = ((( isNaN(parsed) ? 0 : parsed) % 360) + 360) % 360;
                        updateAnnotation(selectedAnn.id, { ...(selectedAnn.data as AnyAnnotationData), rotation: v });
                      }}
                      onBlur={e => {
                        const parsed = parseInt(e.target.value, 10);
                        const v = (((isNaN(parsed) ? 0 : parsed) % 360) + 360) % 360;
                        updateAnnotation(selectedAnn.id, { ...(selectedAnn.data as AnyAnnotationData), rotation: v });
                      }}
                      className="w-12 h-8 bg-slate-800 text-white rounded-lg text-center text-[11px] font-black border border-white/10 outline-none focus:border-emerald-500 shrink-0"
                      title="Rotation in degrees"
                    />
                    <span className="text-[9px] text-slate-500 font-black shrink-0">°</span>
                    <button onClick={() => {
                        const d = selectedAnn.data as AnyAnnotationData;
                        const newR = ((d.rotation ?? 0) + 90) % 360;
                        updateAnnotation(selectedAnn.id, { ...d, rotation: newR });
                      }}
                      title="Rotate +90°"
                      className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-black transition-all shrink-0 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 14l4-4m0 0l-4-4m4 4H2a4 4 0 000 8h1" />
                      </svg>
                    </button>
                    {((selectedAnn.data as AnyAnnotationData).rotation ?? 0) !== 0 && (
                      <button onClick={() => updateAnnotation(selectedAnn.id, { ...(selectedAnn.data as AnyAnnotationData), rotation: 0 })}
                        title="Reset rotation to 0°"
                        className="px-2 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-[9px] font-black transition-all shrink-0">
                        Reset
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Duplicate */}
              <div className="w-px h-6 bg-white/10 shrink-0" />
              <button onClick={duplicateAnnotation}
                title="Duplicate annotation (Ctrl+D)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all min-h-[36px] shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Dup <span className="opacity-50 font-normal normal-case">^D</span>
              </button>

              {/* Flip H / V */}
              <button onClick={flipAnnotationH}
                title="Flip horizontal"
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all min-h-[36px] shrink-0">
                ↔ H
              </button>
              <button onClick={flipAnnotationV}
                title="Flip vertical"
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all min-h-[36px] shrink-0">
                ↕ V
              </button>

              {/* Opacity slider for selected annotation */}
              <div className="w-px h-6 bg-white/10 shrink-0" />
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest shrink-0">Opacity</span>
              <input type="range" min="0.05" max="1" step="0.05"
                value={(selectedAnn.data as AnyAnnotationData).opacity ?? 1}
                onChange={e => updateOpacity(selectedAnn.id, parseFloat(e.target.value))}
                className="w-20 accent-[var(--brand,#3b82f6)] shrink-0" />
              <span className="text-[10px] text-slate-300 font-bold w-8 shrink-0">
                {Math.round(((selectedAnn.data as AnyAnnotationData).opacity ?? 1) * 100)}%
              </span>

              {canDeleteAnn(selectedAnn) && (
                <button onClick={() => handleDeleteAnnotation(selectedAnn.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-rose-500 transition-all min-h-[36px] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete <span className="opacity-50 font-normal normal-case">⌫</span>
                </button>
              )}
            </>
          ) : (
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Tap any annotation to select it · Switch to Select to adjust handles · Esc to deselect</span>
          )}
        </div>
      )}

      {/* Hint bar when drawing line/shape tools */}
      {(!isNavTool || currentTool === 'scale') && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-white/5 bg-slate-950/40 shrink-0">
          <span className="text-[8px] text-brand/80 font-black uppercase tracking-widest shrink-0">{currentTool.replace(/_/g, ' ')}</span>
          <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">·</span>
          <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">
            {currentTool === 'callout'
              ? <>Press where the text box goes; drag to the arrow tip · tap tool to deactivate</>
              : currentTool === 'scale'
                ? <>Draw a line on the document along a known distance, then enter the real-world length</>
                : currentTool !== 'pen' && currentTool !== 'highlighter' && currentTool !== 'text' && currentTool !== 'stamp'
                  ? <>Tap again to deactivate · Hold <kbd className="text-slate-500 font-mono">⇧ Shift</kbd> to constrain / snap to 45°</>
                  : <>Tap the tool icon again to stop drawing</>
            }
          </span>
        </div>
      )}

      {/* ── Canvas area ── */}
      <div ref={mainRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-auto flex flex-col items-center p-4 gap-4">

        {annLoadErr && (
          <div className="w-full max-w-3xl flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl shrink-0">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-amber-300 text-xs font-bold flex-1">Could not load existing annotations: {annLoadErr}</p>
            <button onClick={() => setAnnLoadErr(null)} className="text-amber-400 hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {actionErr && (
          <div className="w-full max-w-3xl flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl shrink-0">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-rose-300 text-xs font-bold flex-1">{actionErr}</p>
            <button onClick={() => setActionErr(null)} className="text-rose-400 hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {isLoadingPdf && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Loading PDF…</p>
          </div>
        )}

        {!isLoadingPdf && pdfError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <p className="text-rose-400 text-sm font-black uppercase">Failed to load PDF</p>
            <p className="text-slate-500 text-xs max-w-sm text-center">{pdfError}</p>
          </div>
        )}

        {!isLoadingPdf && !pdfError &&
          Array.from({ length: numPages }, (_, i) => renderPageLayer(i + 1))}

        {showLog && (
          <div className="w-full max-w-3xl bg-slate-900/80 border border-white/10 rounded-2xl p-4 shrink-0">
            <h3 className="text-white text-xs font-black uppercase tracking-widest mb-3">Markup Log — All Pages</h3>
            {allDisplayAnnotations.length === 0 ? (
              <p className="text-slate-500 text-xs">No annotations yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {[...allDisplayAnnotations].reverse().map(ann => {
                  const isPending = ann.id.startsWith('tmp-');
                  return (
                    <div key={ann.id}
                      className={`flex items-center gap-3 p-2.5 rounded-xl group transition-all ${ann.id === selectedAnnId ? 'bg-brand/15 border border-brand/30' : isPending ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/60'}`}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ann.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white text-xs font-bold truncate">{ann.authorName}</p>
                          {isPending && (
                            <span className="text-[8px] text-amber-400 font-black uppercase tracking-widest bg-amber-500/15 px-1 py-0.5 rounded shrink-0">Unsaved</span>
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] capitalize">
                          {ann.toolType.replace(/_/g, ' ')} · Pg {ann.pageNumber} · {new Date(ann.createdAt).toLocaleString()}
                          {(ann.toolType === 'text' || ann.toolType === 'callout') && (ann.data as AnyAnnotationData).text && (
                            <> · &quot;<span className="text-slate-300">{(ann.data as AnyAnnotationData).text as string}</span>&quot;</>
                          )}
                          {ann.toolType === 'stamp' && (ann.data as AnyAnnotationData).stampType && (
                            <> · <span className="text-slate-300">{(ann.data as AnyAnnotationData).stampType as string}</span></>
                          )}
                        </p>
                      </div>
                      {canDeleteAnn(ann) && (
                        <button onClick={() => handleDeleteAnnotation(ann.id)}
                          title="Delete annotation"
                          className="p-1.5 rounded-lg text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfMarkupEditor;
