// Export a marked-up copy of a PDF: the original pages are kept intact (vector,
// selectable text) and a crisp annotation layer is overlaid on each page that has
// markups. The annotation layer is rendered with the *exact* same SVG renderer the
// editor uses on screen, so the download matches what the user sees.

import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDocument, degrees } from 'pdf-lib';
import { renderAnnotationSvg, type AnyAnnotationData, type ScaleInfo, type ToolType } from './PdfMarkupEditor.tsx';
import type { PdfAnnotation } from '../types.ts';

export interface ExportOptions {
  pdfBytes: ArrayBuffer;
  annotations: PdfAnnotation[];
  scaleInfo?: ScaleInfo | null;
  /** Called with 0–1 as each page is processed. */
  onProgress?: (fraction: number) => void;
}

// Rasterize a single page's annotations to a transparent PNG at the given pixel size.
async function rasterizeAnnotations(
  anns: PdfAnnotation[],
  pxW: number,
  pxH: number,
  scaleInfo?: ScaleInfo | null,
): Promise<Uint8Array | null> {
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={pxW}
      height={pxH}
      viewBox={`0 0 ${pxW} ${pxH}`}
    >
      {anns.map(a =>
        renderAnnotationSvg(
          { toolType: a.toolType as ToolType, color: a.color, strokeWidth: a.strokeWidth, data: a.data as AnyAnnotationData },
          pxW, pxH, a.id, scaleInfo,
        ),
      )}
    </svg>
  );

  const markup = renderToStaticMarkup(svg);
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, pxW, pxH);
    const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize annotation layer'));
    img.src = src;
  });
}

// Draw a full-page overlay image, compensating for the page's own rotation so the
// markup stays aligned (the editor draws annotations on the visually-rotated page).
function drawFullPageOverlay(
  page: ReturnType<PDFDocument['getPages']>[number],
  img: Parameters<ReturnType<PDFDocument['getPages']>[number]['drawImage']>[0],
  rotation: number,
) {
  const { width, height } = page.getSize();
  if (rotation === 90) {
    page.drawImage(img, { x: width, y: 0, width: height, height: width, rotate: degrees(90) });
  } else if (rotation === 180) {
    page.drawImage(img, { x: width, y: height, width, height, rotate: degrees(180) });
  } else if (rotation === 270) {
    page.drawImage(img, { x: 0, y: height, width: height, height: width, rotate: degrees(270) });
  } else {
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
}

export async function buildMarkedUpPdf(opts: ExportOptions): Promise<Uint8Array> {
  const { pdfBytes, annotations, scaleInfo, onProgress } = opts;
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // Group annotations by 1-based page number, dropping the scale-calibration row.
  const byPage = new Map<number, PdfAnnotation[]>();
  for (const a of annotations) {
    if ((a.toolType as ToolType) === 'scale') continue;
    const list = byPage.get(a.pageNumber);
    if (list) list.push(a); else byPage.set(a.pageNumber, [a]);
  }

  // Resolution multiplier for the raster overlay (≈ retina). Capped so a single
  // page can't produce an enormous PNG.
  const OVERSAMPLE = 2;
  const MAX_SIDE = 4096;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const anns = byPage.get(i + 1);
    if (anns && anns.length) {
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;
      const { width, height } = page.getSize();
      // Displayed (visual) dimensions account for 90/270 rotation.
      const dispW = rotation === 90 || rotation === 270 ? height : width;
      const dispH = rotation === 90 || rotation === 270 ? width : height;
      let pxW = Math.round(dispW * OVERSAMPLE);
      let pxH = Math.round(dispH * OVERSAMPLE);
      const over = Math.max(pxW / MAX_SIDE, pxH / MAX_SIDE, 1);
      pxW = Math.round(pxW / over);
      pxH = Math.round(pxH / over);

      const png = await rasterizeAnnotations(anns, pxW, pxH, scaleInfo);
      if (png) {
        const embedded = await pdfDoc.embedPng(png);
        drawFullPageOverlay(page, embedded, rotation);
      }
    }
    onProgress?.((i + 1) / pages.length);
    // Yield so the progress UI can paint between pages.
    await new Promise(r => setTimeout(r, 0));
  }

  return pdfDoc.save();
}
