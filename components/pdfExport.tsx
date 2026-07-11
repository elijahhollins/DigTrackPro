import React, { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import { Download } from 'lucide-react';
import { JobPrint } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import {
  renderAnnotationSvg, ScaleInfo, AnyAnnotationData, ToolType,
} from './PdfMarkupEditor.tsx';

// ─────────────────────────────────────────────────────────────
// PDF download helpers — original file, or a copy with the saved
// markup annotations burned into each page.
// ─────────────────────────────────────────────────────────────

// Cap the longest rendered page edge so huge plan sheets don't blow out memory.
const MAX_RENDER_EDGE_PX = 4000;
const RENDER_SCALE = 2; // oversample for crisp line work

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const triggerDownload = (href: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  if (isMobile()) {
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
  } else {
    link.click();
  }
};

// Download the print exactly as it was uploaded (no annotations).
export const downloadPrintOriginal = (print: JobPrint) => {
  if (!print.url) return;
  const baseUrl = print.url.split('?')[0];
  triggerDownload(`${baseUrl}?download=${encodeURIComponent(print.fileName)}`, print.fileName);
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

const svgToImage = (markup: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to rasterize annotations')); };
    img.src = url;
  });

// Build a new PDF with every page rendered and the saved annotations drawn on
// top, using the exact same SVG renderer the markup editor displays.
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
    const d = latestScale.data as Record<string, unknown>;
    if (typeof d.unitsPerNormDist === 'number' && typeof d.aspectRatio === 'number' && typeof d.unit === 'string') {
      scaleInfo = { unitsPerNormDist: d.unitsPerNormDist, aspectRatio: d.aspectRatio, unit: d.unit };
    }
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    let doc: jsPDF | null = null;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(RENDER_SCALE, MAX_RENDER_EDGE_PX / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D not available');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const pageAnnotations = annotations.filter(a => a.pageNumber === pageNum);
      if (pageAnnotations.length > 0) {
        const markup = renderToStaticMarkup(
          <svg xmlns="http://www.w3.org/2000/svg" width={vp.width} height={vp.height}
            viewBox={`0 0 ${vp.width} ${vp.height}`}>
            {pageAnnotations.map(a => renderAnnotationSvg(
              { toolType: a.toolType as ToolType, color: a.color, strokeWidth: a.strokeWidth, data: a.data as AnyAnnotationData },
              vp.width, vp.height, a.id, scaleInfo,
            ))}
          </svg>,
        );
        const overlay = await svgToImage(markup);
        ctx.drawImage(overlay, 0, 0, vp.width, vp.height);
      }

      const orientation = base.width >= base.height ? 'landscape' : 'portrait';
      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'pt', format: [base.width, base.height] });
      } else {
        doc.addPage([base.width, base.height], orientation);
      }
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, base.width, base.height);
    }
    if (!doc) throw new Error('PDF has no pages');
    return doc.output('blob');
  } finally {
    pdf.destroy();
  }
};

const annotatedFileName = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${stem} (markup).pdf`;
};

export const downloadPrintWithMarkup = async (print: JobPrint) => {
  const blob = await buildAnnotatedPdfBlob(print);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, annotatedFileName(print.fileName));
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

// ─────────────────────────────────────────────────────────────
// PrintDownloadMenu — a Download button with an "Original PDF /
// With Markup" chooser, shared by Job Hub and the prints overlay.
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
    setExporting(true);
    try {
      await downloadPrintWithMarkup(print);
    } catch (e: unknown) {
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
        title="Download this PDF"
      >
        <Download size={iconSize} className="shrink-0" />
        {exporting ? 'Preparing…' : label}
      </button>
      {open && (
        <div className={`absolute right-0 bottom-full mb-1 z-30 min-w-[180px] rounded-xl border shadow-xl overflow-hidden ${
          isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'
        }`}>
          <button onClick={() => { setOpen(false); downloadPrintOriginal(print); }} className={itemClass}>
            Original PDF
          </button>
          <button onClick={handleWithMarkup} className={`${itemClass} border-t ${isDarkMode ? 'border-white/10' : 'border-slate-100'}`}>
            With Markup
          </button>
        </div>
      )}
    </div>
  );
};
