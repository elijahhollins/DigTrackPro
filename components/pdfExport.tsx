import React, { useEffect, useRef, useState } from 'react';
import {
  PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, LineCapStyle,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
} from 'pdf-lib';
import { Download } from 'lucide-react';
import { JobPrint, PdfAnnotation } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import {
  ScaleInfo, AnyAnnotationData, ToolType, STAMP_COLORS, getAnnotationBBox,
} from './PdfMarkupEditor.tsx';

// ─────────────────────────────────────────────────────────────
// PDF open/view helpers — open the original file, or a flattened
// copy with the saved markup drawn into each page as vector
// graphics, in a new browser tab. The original page content (text,
// line work) is left untouched, so the flattened copy stays
// searchable and crisp at any zoom.
// ─────────────────────────────────────────────────────────────

// Direct download fallback for when a new tab can't be opened (popup blocked).
const triggerDownload = (href: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 100);
};

// Open the print exactly as it was uploaded (no annotations) in a new tab.
export const openPrintOriginal = (print: JobPrint) => {
  if (!print.url) return;
  const baseUrl = print.url.split('?')[0];
  const win = window.open(baseUrl, '_blank', 'noopener,noreferrer');
  // Popup blocked — fall back to a direct download so the file isn't lost.
  if (!win) triggerDownload(`${baseUrl}?download=${encodeURIComponent(print.fileName)}`, print.fileName);
};

// Same dual-path loading the markup editor uses: authenticated storage
// download first, plain public-URL fetch as a fallback.
const loadPrintBytes = async (print: JobPrint): Promise<ArrayBuffer> => {
  let primaryErr: string | null = null;
  try {
    return await apiService.downloadJobPrint(print.storagePath);
  } catch (e: unknown) {
    primaryErr = e instanceof Error ? e.message : String(e);
  }
  if (print.url) {
    const response = await fetch(print.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }
  throw new Error(primaryErr ?? 'Failed to download PDF');
};

// ─────────────────────────────────────────────────────────────
// Vector annotation drawing.
//
// All geometry below works in "display space": the page as the markup
// editor shows it — origin top-left, y down, unit = PDF points — exactly
// the coordinate system the on-screen SVG overlay uses. A single CTM
// pushed per page maps display space into the page's native space
// (flipping y and undoing any /Rotate), so the drawing code is a direct
// port of the editor's SVG renderer.
// ─────────────────────────────────────────────────────────────

interface DrawCtx {
  page: PDFPage;
  w: number;              // display-space width in pt
  h: number;              // display-space height in pt
  helvBold: PDFFont;
  courierBold: PDFFont;
}

const hexColor = (hex: string) => {
  let s = hex.replace('#', '');
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// display→page CTM for each /Rotate value (all include the y flip).
const pageTransform = (page: PDFPage): { m: [number, number, number, number, number, number]; dw: number; dh: number } => {
  const { width: W, height: H } = page.getSize();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  switch (rot) {
    case 90:  return { m: [0, 1, 1, 0, 0, 0], dw: H, dh: W };
    case 180: return { m: [-1, 0, 0, 1, W, 0], dw: W, dh: H };
    case 270: return { m: [0, -1, -1, 0, W, H], dw: H, dh: W };
    default:  return { m: [1, 0, 0, -1, 0, H], dw: W, dh: H };
  }
};

// SVG-style rotate(θ, cx, cy) as a PDF cm matrix (display-space convention).
const rotateOps = (deg: number, cx: number, cy: number) => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return concatTransformationMatrix(cos, sin, -sin, cos,
    cx - cos * cx + sin * cy, cy - sin * cx - cos * cy);
};

// Text glyphs are defined y-up; under the display-space CTM (y-down) they
// would come out mirrored. A local flip at the baseline keeps them upright.
const drawTextAt = (
  ctx: DrawCtx, text: string, x: number, y: number,
  size: number, font: PDFFont, color: string, opacity: number,
) => {
  ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, x, y));
  ctx.page.drawText(text, { x: 0, y: 0, size, font, color: hexColor(color), opacity });
  ctx.page.pushOperators(popGraphicsState());
};

// Stroke-only SVG path. drawSvgPath negates y internally (it expects
// top-left SVG coordinates), so paths built here pre-negate y to land
// back in display space.
const strokePath = (
  ctx: DrawCtx, d: string, color: string, width: number, opacity: number,
  cap: LineCapStyle = LineCapStyle.Round,
) => {
  ctx.page.drawSvgPath(d, {
    x: 0, y: 0,
    borderColor: hexColor(color), borderWidth: width,
    borderOpacity: opacity, borderLineCap: cap,
  });
};

const fillPath = (ctx: DrawCtx, d: string, color: string, opacity: number) => {
  ctx.page.drawSvgPath(d, { x: 0, y: 0, color: hexColor(color), opacity });
};

const polylinePath = (pts: Array<{ x: number; y: number }>, w: number, h: number) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${r2(p.x * w)} ${r2(-p.y * h)}`).join(' ');

const line = (ctx: DrawCtx, x1: number, y1: number, x2: number, y2: number,
  color: string, thickness: number, opacity: number, dashArray?: number[]) => {
  ctx.page.drawLine({
    start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
    thickness, color: hexColor(color), opacity,
    lineCap: LineCapStyle.Round, dashArray,
  });
};

// SVG marker arrowheads scale with stroke width (markerUnits=strokeWidth);
// `len`/`half` mirror the marker geometry in the editor.
const arrowHead = (ctx: DrawCtx, fromX: number, fromY: number, tipX: number, tipY: number,
  sw: number, color: string, opacity: number, len = 10, half = 3.5) => {
  const dx = tipX - fromX, dy = tipY - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const bx = tipX - ux * len * sw, by = tipY - uy * len * sw;
  const px = -uy * half * sw, py = ux * half * sw;
  fillPath(ctx,
    `M ${r2(tipX)} ${r2(-tipY)} L ${r2(bx + px)} ${r2(-(by + py))} L ${r2(bx - px)} ${r2(-(by - py))} Z`,
    color, opacity);
};

// Revision-cloud outline: same bump layout as the editor's getCloudPath,
// emitted as cubics (drawSvgPath handles C reliably; Q is converted here).
const cloudPath = (x: number, y: number, w: number, h: number): string => {
  const rx = Math.max(8, w / 9);
  const ry = Math.max(8, h / 9);
  const nx = Math.max(2, Math.round(w / (rx * 2.4)));
  const ny = Math.max(2, Math.round(h / (ry * 2.4)));
  const bw = w / nx, bh = h / ny;
  let px = x, py = y;
  let d = `M ${r2(x)} ${r2(-y)}`;
  const quad = (cx: number, cy: number, ex: number, ey: number) => {
    const c1x = px + (2 / 3) * (cx - px), c1y = py + (2 / 3) * (cy - py);
    const c2x = ex + (2 / 3) * (cx - ex), c2y = ey + (2 / 3) * (cy - ey);
    d += ` C ${r2(c1x)} ${r2(-c1y)} ${r2(c2x)} ${r2(-c2y)} ${r2(ex)} ${r2(-ey)}`;
    px = ex; py = ey;
  };
  for (let i = 0; i < nx; i++) quad(x + i * bw + bw / 2, y - ry, x + (i + 1) * bw, y);
  for (let i = 0; i < ny; i++) quad(x + w + rx, y + i * bh + bh / 2, x + w, y + (i + 1) * bh);
  for (let i = nx - 1; i >= 0; i--) quad(x + i * bw + bw / 2, y + h + ry, x + i * bw, y + h);
  for (let i = ny - 1; i >= 0; i--) quad(x - rx, y + i * bh + bh / 2, x, y + i * bh);
  return d + ' Z';
};

// Direct port of the editor's renderAnnotationContent, case by case.
const drawAnnotation = (ctx: DrawCtx, ann: PdfAnnotation, scaleInfo: ScaleInfo | null) => {
  const { w, h } = ctx;
  const d = ann.data as AnyAnnotationData;
  const c = ann.color;
  const sw = ann.strokeWidth;
  const op = (d.opacity as number | undefined) ?? 1;

  switch (ann.toolType as ToolType) {
    case 'pen': {
      if (!d.points || d.points.length < 2) return;
      strokePath(ctx, polylinePath(d.points, w, h), c, sw, op);
      return;
    }
    case 'highlighter': {
      if (!d.points || d.points.length < 2) return;
      strokePath(ctx, polylinePath(d.points, w, h), c, sw * 5, op * 0.35, LineCapStyle.Projecting);
      return;
    }
    case 'text': {
      if (!d.text) return;
      drawTextAt(ctx, d.text as string, (d.x ?? 0) * w, (d.y ?? 0) * h,
        d.fontSize ?? 18, ctx.helvBold, c, op);
      return;
    }
    case 'callout': {
      if (d.x1 === undefined) return;
      const bx = (d.x1 ?? 0) * w, by = (d.y1 ?? 0) * h;
      const ax = (d.x2 ?? 0) * w, ay = (d.y2 ?? 0) * h;
      const sf = w / 600;
      const fs = ((d.fontSize as number | undefined) ?? 14) * sf;
      const txt = (d.text as string | undefined) ?? '';
      const estW = Math.max(80 * sf, txt.length * (fs * 0.62) + 24 * sf);
      const bx1 = bx - estW / 2, by1 = by - fs - 14 * sf, by2 = by + 10 * sf;
      line(ctx, bx, by2 - 2, ax, ay, c, sw, op);
      arrowHead(ctx, bx, by2 - 2, ax, ay, sw, c, op, 8, 3);
      ctx.page.drawRectangle({
        x: bx1, y: by1, width: estW, height: by2 - by1,
        borderColor: hexColor(c), borderWidth: sw, borderOpacity: op,
        color: hexColor(c), opacity: 0.1 * op,
      });
      if (txt) drawTextAt(ctx, txt, bx1 + 10 * sf, by - 2, fs, ctx.helvBold, c, op);
      return;
    }
    case 'stamp': {
      const st = ((d.stampType as string | undefined) ?? 'APPROVED') as keyof typeof STAMP_COLORS;
      const sc = STAMP_COLORS[st] ?? c;
      const sx = (d.x ?? 0) * w, sy = (d.y ?? 0) * h;
      const fs = 14, tw = st.length * (fs * 0.65) + 18, bh = 28;
      ctx.page.pushOperators(pushGraphicsState(), rotateOps(-12, sx + tw / 2, sy - bh / 2));
      ctx.page.drawRectangle({
        x: sx, y: sy - bh + 4, width: tw, height: bh,
        borderColor: hexColor(sc), borderWidth: 3, borderOpacity: op,
      });
      drawTextAt(ctx, st, sx + 9, sy - 3, fs, ctx.helvBold, sc, op);
      ctx.page.pushOperators(popGraphicsState());
      return;
    }
    case 'arrow': {
      if (d.x1 === undefined) return;
      const x1 = (d.x1 ?? 0) * w, y1 = (d.y1 ?? 0) * h;
      const x2 = (d.x2 ?? 0) * w, y2 = (d.y2 ?? 0) * h;
      line(ctx, x1, y1, x2, y2, c, sw, op);
      arrowHead(ctx, x1, y1, x2, y2, sw, c, op);
      return;
    }
    case 'double_arrow': {
      if (d.x1 === undefined) return;
      const x1 = (d.x1 ?? 0) * w, y1 = (d.y1 ?? 0) * h;
      const x2 = (d.x2 ?? 0) * w, y2 = (d.y2 ?? 0) * h;
      line(ctx, x1, y1, x2, y2, c, sw, op);
      arrowHead(ctx, x1, y1, x2, y2, sw, c, op);
      arrowHead(ctx, x2, y2, x1, y1, sw, c, op);
      return;
    }
    case 'line':
    case 'dashed_line': {
      if (d.x1 === undefined) return;
      line(ctx, (d.x1 ?? 0) * w, (d.y1 ?? 0) * h, (d.x2 ?? 0) * w, (d.y2 ?? 0) * h,
        c, sw, op, ann.toolType === 'dashed_line' ? [sw * 4, sw * 2] : undefined);
      return;
    }
    case 'dimension': {
      if (d.x1 === undefined) return;
      const lx1 = (d.x1 ?? 0) * w, ly1 = (d.y1 ?? 0) * h;
      const lx2 = (d.x2 ?? 0) * w, ly2 = (d.y2 ?? 0) * h;
      const len = Math.hypot(lx2 - lx1, ly2 - ly1) || 1;
      const px = (-(ly2 - ly1) / len) * 10;
      const py = ((lx2 - lx1) / len) * 10;
      const midX = (lx1 + lx2) / 2, midY = (ly1 + ly2) / 2;
      const angleDeg = Math.atan2(ly2 - ly1, lx2 - lx1) * 180 / Math.PI;
      let labelText: string;
      if (scaleInfo) {
        const dx = (d.x2 ?? 0) - (d.x1 ?? 0);
        const dy = (d.y2 ?? 0) - (d.y1 ?? 0);
        const ar = scaleInfo.aspectRatio;
        const normDist = Math.sqrt((dx * ar) ** 2 + dy ** 2);
        labelText = `${(normDist * scaleInfo.unitsPerNormDist).toFixed(2)} ${scaleInfo.unit}`;
      } else {
        labelText = `${Math.round(len)} px`;
      }
      const lblW = labelText.length * 6 + 10;
      line(ctx, lx1, ly1, lx2, ly2, c, sw, op);
      line(ctx, lx1 + px, ly1 + py, lx1 - px, ly1 - py, c, sw, op);
      line(ctx, lx2 + px, ly2 + py, lx2 - px, ly2 - py, c, sw, op);
      const lblAngle = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
      ctx.page.pushOperators(pushGraphicsState(), rotateOps(lblAngle, midX, midY));
      ctx.page.drawRectangle({
        x: midX - lblW / 2, y: midY - 18, width: lblW, height: 14,
        color: rgb(0, 0, 0), opacity: 0.75 * op,
      });
      const tW = ctx.courierBold.widthOfTextAtSize(labelText, 10);
      drawTextAt(ctx, labelText, midX - tW / 2, midY - 7, 10, ctx.courierBold, c, op);
      ctx.page.pushOperators(popGraphicsState());
      return;
    }
    case 'rectangle':
    case 'filled_rectangle': {
      if (d.x1 === undefined) return;
      const filled = ann.toolType === 'filled_rectangle';
      ctx.page.drawRectangle({
        x: Math.min(d.x1, d.x2 ?? 0) * w,
        y: Math.min(d.y1 ?? 0, d.y2 ?? 0) * h,
        width: Math.abs((d.x2 ?? 0) - d.x1) * w,
        height: Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h,
        borderColor: hexColor(c), borderWidth: sw, borderOpacity: op,
        ...(filled ? { color: hexColor(c), opacity: 0.25 * op } : {}),
      });
      return;
    }
    case 'circle':
    case 'filled_circle': {
      if (d.x1 === undefined) return;
      const filled = ann.toolType === 'filled_circle';
      ctx.page.drawEllipse({
        x: ((d.x1 + (d.x2 ?? 0)) / 2) * w,
        y: (((d.y1 ?? 0) + (d.y2 ?? 0)) / 2) * h,
        xScale: Math.max((Math.abs((d.x2 ?? 0) - d.x1) / 2) * w, 1),
        yScale: Math.max((Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) / 2) * h, 1),
        borderColor: hexColor(c), borderWidth: sw, borderOpacity: op,
        ...(filled ? { color: hexColor(c), opacity: 0.25 * op } : {}),
      });
      return;
    }
    case 'cloud': {
      if (d.x1 === undefined) return;
      const cx1 = Math.min(d.x1, d.x2 ?? 0) * w;
      const cy1 = Math.min(d.y1 ?? 0, d.y2 ?? 0) * h;
      const cw = Math.abs((d.x2 ?? 0) - d.x1) * w;
      const ch = Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h;
      if (cw < 10 || ch < 10) return;
      strokePath(ctx, cloudPath(cx1, cy1, cw, ch), c, sw, op);
      return;
    }
    default: return;
  }
};

// Flatten the given annotations into a copy of the PDF as vector drawing
// operations. The original content stream is kept as-is underneath. Takes
// already-loaded bytes + annotations so the markup editor can export its
// in-memory state (including unsaved pending markups) without a refetch.
export const flattenAnnotationsIntoPdf = async (
  buffer: ArrayBuffer,
  annotations: PdfAnnotation[],
  scaleInfo: ScaleInfo | null,
): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const courierBold = await doc.embedFont(StandardFonts.CourierBold);
  const pages = doc.getPages();

  pages.forEach((page, idx) => {
    const pageAnnotations = annotations.filter(a => a.pageNumber === idx + 1);
    if (pageAnnotations.length === 0) return;
    const { m, dw, dh } = pageTransform(page);
    const ctx: DrawCtx = { page, w: dw, h: dh, helvBold, courierBold };
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
    for (const ann of pageAnnotations) {
      const rotation = ((ann.data as AnyAnnotationData).rotation as number | undefined) ?? 0;
      const bbox = rotation ? getAnnotationBBox(ann) : null;
      if (rotation && bbox) {
        page.pushOperators(pushGraphicsState(),
          rotateOps(rotation, (bbox.x + bbox.w / 2) * dw, (bbox.y + bbox.h / 2) * dh));
      }
      drawAnnotation(ctx, ann, scaleInfo);
      if (rotation && bbox) page.pushOperators(popGraphicsState());
    }
    page.pushOperators(popGraphicsState());
  });

  return doc.save();
};

// Build a copy of the print with the saved annotations flattened into each
// page, fetching both the file and its annotations from storage.
export const buildAnnotatedPdfBlob = async (print: JobPrint): Promise<Blob> => {
  const [buffer, allAnnotations] = await Promise.all([
    loadPrintBytes(print),
    apiService.getAnnotations(print.id),
  ]);

  // Scale calibration is stored as a special 'scale' row — it feeds the
  // dimension labels but must not render as a visible markup itself.
  const scaleRows = allAnnotations.filter(a => a.toolType === 'scale');
  const annotations = allAnnotations.filter(a => a.toolType !== 'scale');
  let scaleInfo: ScaleInfo | null = null;
  const latestScale = scaleRows[scaleRows.length - 1];
  if (latestScale) {
    const s = latestScale.data as Record<string, unknown>;
    if (typeof s.unitsPerNormDist === 'number' && typeof s.aspectRatio === 'number' && typeof s.unit === 'string') {
      scaleInfo = { unitsPerNormDist: s.unitsPerNormDist, aspectRatio: s.aspectRatio, unit: s.unit };
    }
  }

  const bytes = await flattenAnnotationsIntoPdf(buffer, annotations, scaleInfo);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
};

const annotatedFileName = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${stem} (markup).pdf`;
};

// Open a flattened copy (markup burned in) in a new tab. The caller opens the
// tab synchronously inside the click handler and passes it in, so the popup
// isn't blocked while the blob is being built.
export const openPrintWithMarkup = async (print: JobPrint, targetWindow?: Window | null) => {
  const win = targetWindow ?? window.open('', '_blank');
  try {
    const blob = await buildAnnotatedPdfBlob(print);
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else {
      // Popup blocked — fall back to a direct download.
      triggerDownload(url, annotatedFileName(print.fileName));
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    if (win) win.close();
    throw e;
  }
};

// ─────────────────────────────────────────────────────────────
// PrintDownloadMenu — a Download button with an "Original PDF /
// Flattened + Markup" chooser, shared by Job Hub and the prints
// overlay.
// ─────────────────────────────────────────────────────────────

interface PrintDownloadMenuProps {
  print: JobPrint;
  isDarkMode?: boolean;
  // Match the host's button styling (Job Hub cards vs. dark overlay).
  buttonClassName: string;
  iconSize?: number;
  label?: string;
}

export const PrintDownloadMenu: React.FC<PrintDownloadMenuProps> = ({
  print, isDarkMode, buttonClassName, iconSize = 12, label = 'Download',
}) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const handleWithMarkup = async () => {
    setOpen(false);
    // Open the tab synchronously (inside the click) so the popup isn't blocked.
    const win = window.open('', '_blank');
    setExporting(true);
    try {
      await openPrintWithMarkup(print, win);
    } catch (e: unknown) {
      if (win) win.close();
      alert('Export failed: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const itemClass = `w-full text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
    isDarkMode ? 'text-slate-200 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'
  }`;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={exporting || !print.url}
        className={buttonClassName}
        title="Open this PDF in a new tab"
      >
        <Download size={iconSize} className="shrink-0" />
        {exporting ? 'Preparing…' : label}
      </button>
      {open && (
        <div className={`absolute right-0 bottom-full mb-1 z-30 min-w-[190px] rounded-xl border shadow-xl overflow-hidden ${
          isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'
        }`}>
          <button onClick={() => { setOpen(false); openPrintOriginal(print); }} className={itemClass}>
            Original PDF
          </button>
          <button onClick={handleWithMarkup} className={`${itemClass} border-t ${isDarkMode ? 'border-white/10' : 'border-slate-100'}`}>
            Flattened + Markup
          </button>
        </div>
      )}
    </div>
  );
};
