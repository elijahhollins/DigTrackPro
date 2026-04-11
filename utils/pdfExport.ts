
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { PdfAnnotation } from '../types.ts';

// ─── Stamp constants ────────────────────────────────────────────────────────

const STAMP_COLORS: Record<string, string> = {
  'APPROVED':      '#22c55e',
  'REVISED':       '#f59e0b',
  'FIELD CHANGE':  '#3b82f6',
  'AS BUILT':      '#8b5cf6',
  'NOT APPROVED':  '#ef4444',
  'VOID':          '#6b7280',
};

const DEFAULT_FONT_SIZE = 18;

// ─── Cloud path helper ───────────────────────────────────────────────────────

function getCloudPath(x: number, y: number, w: number, h: number): string {
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
}

// ─── Annotation → SVG string ─────────────────────────────────────────────────

function annotationToSvgElements(ann: PdfAnnotation, w: number, h: number): string {
  const d = ann.data as Record<string, unknown>;
  const c = ann.color;
  const sw = ann.strokeWidth;
  const op = (d.opacity as number | undefined) ?? 1;
  const id = ann.id.replace(/[^a-zA-Z0-9]/g, '');
  const aid  = `ah-${id}`;
  const aid2 = `ah2-${id}`;

  let content = '';

  switch (ann.toolType) {
    case 'pen': {
      const pts = d.points as Array<{ x: number; y: number }> | undefined;
      if (!pts || pts.length < 2) return '';
      const pd = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
      content = `<path d="${pd}" stroke="${c}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${op}" />`;
      break;
    }
    case 'highlighter': {
      const pts = d.points as Array<{ x: number; y: number }> | undefined;
      if (!pts || pts.length < 2) return '';
      const pd = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
      content = `<path d="${pd}" stroke="${c}" stroke-width="${sw * 5}" fill="none" stroke-linecap="square" stroke-linejoin="round" opacity="${op * 0.35}" />`;
      break;
    }
    case 'text': {
      if (!d.text) return '';
      const fs = (d.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE;
      const txt = escapeXml(String(d.text));
      content = `<text x="${(d.x as number ?? 0) * w}" y="${(d.y as number ?? 0) * h}" fill="${c}" font-size="${fs}" font-family="Arial, sans-serif" font-weight="bold" opacity="${op}">${txt}</text>`;
      break;
    }
    case 'callout': {
      if (d.x1 === undefined) return '';
      const bx = (d.x1 as number) * w, by = (d.y1 as number ?? 0) * h;
      const ax = (d.x2 as number ?? 0) * w, ay = (d.y2 as number ?? 0) * h;
      const sf = w / 600;
      const fs = ((d.fontSize as number | undefined) ?? 14) * sf;
      const txt = escapeXml(String((d.text as string | undefined) ?? ''));
      const estW = Math.max(80 * sf, txt.length * (fs * 0.62) + 24 * sf);
      const bx1 = bx - estW / 2, by1 = by - fs - 14 * sf, by2 = by + 10 * sf;
      content = `<g opacity="${op}">
        <defs>
          <marker id="${aid}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="${c}" />
          </marker>
        </defs>
        <line x1="${bx}" y1="${by2 - 2}" x2="${ax}" y2="${ay}" stroke="${c}" stroke-width="${sw}" marker-end="url(#${aid})" />
        <rect x="${bx1}" y="${by1}" width="${estW}" height="${by2 - by1}" stroke="${c}" stroke-width="${sw}" fill="${c}" fill-opacity="0.1" rx="4" />
        ${txt ? `<text x="${bx1 + 10 * sf}" y="${by - 2}" fill="${c}" font-size="${fs}" font-family="Arial, sans-serif" font-weight="bold">${txt}</text>` : ''}
      </g>`;
      break;
    }
    case 'stamp': {
      const st = (d.stampType as string | undefined) ?? 'APPROVED';
      const sc = STAMP_COLORS[st] ?? c;
      const sx = (d.x as number ?? 0) * w, sy = (d.y as number ?? 0) * h;
      const fs = 14, tw = st.length * (fs * 0.65) + 18, bh = 28;
      content = `<g opacity="${op}" transform="rotate(-12, ${sx + tw / 2}, ${sy - bh / 2})">
        <rect x="${sx}" y="${sy - bh + 4}" width="${tw}" height="${bh}" fill="none" stroke="${sc}" stroke-width="3" rx="3" />
        <text x="${sx + 9}" y="${sy - 3}" fill="${sc}" font-size="${fs}" font-family="Arial Narrow, Arial, sans-serif" font-weight="900" letter-spacing="1.5">${escapeXml(st)}</text>
      </g>`;
      break;
    }
    case 'arrow': {
      if (d.x1 === undefined) return '';
      content = `<g opacity="${op}">
        <defs>
          <marker id="${aid}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${c}" />
          </marker>
        </defs>
        <line x1="${(d.x1 as number) * w}" y1="${(d.y1 as number ?? 0) * h}" x2="${(d.x2 as number ?? 0) * w}" y2="${(d.y2 as number ?? 0) * h}" stroke="${c}" stroke-width="${sw}" marker-end="url(#${aid})" />
      </g>`;
      break;
    }
    case 'double_arrow': {
      if (d.x1 === undefined) return '';
      content = `<g opacity="${op}">
        <defs>
          <marker id="${aid}"  markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${c}" />
          </marker>
          <marker id="${aid2}" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto">
            <polygon points="10 0, 0 3.5, 10 7" fill="${c}" />
          </marker>
        </defs>
        <line x1="${(d.x1 as number) * w}" y1="${(d.y1 as number ?? 0) * h}" x2="${(d.x2 as number ?? 0) * w}" y2="${(d.y2 as number ?? 0) * h}" stroke="${c}" stroke-width="${sw}" marker-start="url(#${aid2})" marker-end="url(#${aid})" />
      </g>`;
      break;
    }
    case 'line': {
      if (d.x1 === undefined) return '';
      content = `<line x1="${(d.x1 as number) * w}" y1="${(d.y1 as number ?? 0) * h}" x2="${(d.x2 as number ?? 0) * w}" y2="${(d.y2 as number ?? 0) * h}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}" />`;
      break;
    }
    case 'dashed_line': {
      if (d.x1 === undefined) return '';
      content = `<line x1="${(d.x1 as number) * w}" y1="${(d.y1 as number ?? 0) * h}" x2="${(d.x2 as number ?? 0) * w}" y2="${(d.y2 as number ?? 0) * h}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${sw * 4} ${sw * 2}" opacity="${op}" />`;
      break;
    }
    case 'dimension': {
      if (d.x1 === undefined) return '';
      const lx1 = (d.x1 as number) * w, ly1 = (d.y1 as number ?? 0) * h;
      const lx2 = (d.x2 as number ?? 0) * w, ly2 = (d.y2 as number ?? 0) * h;
      const len = Math.sqrt((lx2 - lx1) ** 2 + (ly2 - ly1) ** 2) || 1;
      const px = (-(ly2 - ly1) / len) * 10;
      const py = ((lx2 - lx1) / len) * 10;
      content = `<g opacity="${op}">
        <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${c}" stroke-width="${sw}" />
        <line x1="${lx1 + px}" y1="${ly1 + py}" x2="${lx1 - px}" y2="${ly1 - py}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" />
        <line x1="${lx2 + px}" y1="${ly2 + py}" x2="${lx2 - px}" y2="${ly2 - py}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" />
      </g>`;
      break;
    }
    case 'rectangle': {
      if (d.x1 === undefined) return '';
      const rx = Math.min(d.x1 as number, d.x2 as number ?? 0) * w;
      const ry = Math.min(d.y1 as number ?? 0, d.y2 as number ?? 0) * h;
      const rw = Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) * w;
      const rh = Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) * h;
      content = `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" stroke="${c}" stroke-width="${sw}" fill="none" opacity="${op}" />`;
      break;
    }
    case 'filled_rectangle': {
      if (d.x1 === undefined) return '';
      const rx = Math.min(d.x1 as number, d.x2 as number ?? 0) * w;
      const ry = Math.min(d.y1 as number ?? 0, d.y2 as number ?? 0) * h;
      const rw = Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) * w;
      const rh = Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) * h;
      content = `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" stroke="${c}" stroke-width="${sw}" fill="${c}" fill-opacity="0.25" opacity="${op}" />`;
      break;
    }
    case 'circle': {
      if (d.x1 === undefined) return '';
      const ecx = ((d.x1 as number + (d.x2 as number ?? 0)) / 2) * w;
      const ecy = (((d.y1 as number ?? 0) + (d.y2 as number ?? 0)) / 2) * h;
      const erx = (Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) / 2) * w;
      const ery = (Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) / 2) * h;
      content = `<ellipse cx="${ecx}" cy="${ecy}" rx="${Math.max(erx, 1)}" ry="${Math.max(ery, 1)}" stroke="${c}" stroke-width="${sw}" fill="none" opacity="${op}" />`;
      break;
    }
    case 'filled_circle': {
      if (d.x1 === undefined) return '';
      const ecx = ((d.x1 as number + (d.x2 as number ?? 0)) / 2) * w;
      const ecy = (((d.y1 as number ?? 0) + (d.y2 as number ?? 0)) / 2) * h;
      const erx = (Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) / 2) * w;
      const ery = (Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) / 2) * h;
      content = `<ellipse cx="${ecx}" cy="${ecy}" rx="${Math.max(erx, 1)}" ry="${Math.max(ery, 1)}" stroke="${c}" stroke-width="${sw}" fill="${c}" fill-opacity="0.25" opacity="${op}" />`;
      break;
    }
    case 'cloud': {
      if (d.x1 === undefined) return '';
      const cx1 = Math.min(d.x1 as number, d.x2 as number ?? 0) * w;
      const cy1 = Math.min(d.y1 as number ?? 0, d.y2 as number ?? 0) * h;
      const cw  = Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) * w;
      const ch  = Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) * h;
      if (cw < 10 || ch < 10) return '';
      content = `<path d="${getCloudPath(cx1, cy1, cw, ch)}" stroke="${c}" stroke-width="${sw}" fill="none" opacity="${op}" />`;
      break;
    }
    default:
      return '';
  }

  if (!content) return '';

  const rotation = (d.rotation as number | undefined) ?? 0;
  if (!rotation) return content;

  // Wrap in rotation transform — compute bbox centre for pivot
  const bbox = getAnnotationBBoxForExport(ann, w, h);
  if (!bbox) return content;
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  return `<g transform="rotate(${rotation}, ${cx}, ${cy})">${content}</g>`;
}

// ─── BBox helper (mirrors PdfMarkupEditor.getAnnotationBBox, pixel coords) ────

function getAnnotationBBoxForExport(
  ann: PdfAnnotation,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  const d = ann.data as Record<string, unknown>;
  switch (ann.toolType) {
    case 'pen':
    case 'highlighter': {
      const pts = d.points as Array<{ x: number; y: number }> | undefined;
      if (!pts || pts.length === 0) return null;
      const xs = pts.map(p => p.x * w), ys = pts.map(p => p.y * h);
      const x1 = Math.min(...xs), y1 = Math.min(...ys);
      return { x: x1, y: y1, w: Math.max(...xs) - x1, h: Math.max(...ys) - y1 };
    }
    case 'text':
    case 'stamp':
      return { x: (d.x as number ?? 0) * w, y: (d.y as number ?? 0) * h, w: 60, h: 20 };
    default: {
      if (d.x1 === undefined) return null;
      const x1 = Math.min(d.x1 as number, d.x2 as number ?? 0) * w;
      const y1 = Math.min(d.y1 as number ?? 0, d.y2 as number ?? 0) * h;
      return {
        x: x1, y: y1,
        w: Math.abs((d.x2 as number ?? 0) - (d.x1 as number)) * w,
        h: Math.abs((d.y2 as number ?? 0) - (d.y1 as number ?? 0)) * h,
      };
    }
  }
}

// ─── Draw annotations onto a canvas context ─────────────────────────────────

async function drawAnnotationsOnCanvas(
  canvas: HTMLCanvasElement,
  annotations: PdfAnnotation[],
  pageNumber: number,
): Promise<void> {
  const pageAnns = annotations.filter(a => a.pageNumber === pageNumber);
  if (pageAnns.length === 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const svgContent = pageAnns.map(a => annotationToSvgElements(a, w, h)).join('\n');

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgContent}</svg>`;
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render annotation SVG'));
    };
    img.src = url;
  });
}

// ─── Minimal JPEG-based PDF encoder ─────────────────────────────────────────
// Each page is a full-page JPEG image embedded as a PDF XObject.

function buildPdfFromJpegs(
  pages: Array<{ jpegData: Uint8Array; width: number; height: number }>,
): Uint8Array {
  const enc = new TextEncoder();
  const e = (s: string) => enc.encode(s);

  const objs: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const addObj = (n: number, dict: string, streamData?: Uint8Array) => {
    const header = `${n} 0 obj\n${dict}\n`;
    let bytes: Uint8Array;
    if (streamData) {
      const before = e(header + 'stream\n');
      const after = e('\nendstream\nendobj\n');
      bytes = concat(before, streamData, after);
    } else {
      bytes = e(header + 'endobj\n');
    }
    offsets[n] = offset;
    objs.push(bytes);
    offset += bytes.byteLength;
  };

  // Object 1 = Catalog, 2 = Pages — filled after we know kid refs
  // Reserve obj slots: 1=catalog, 2=pages, then pairs [page, img] for each page
  const numPages = pages.length;
  const kidRefs = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');

  addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  addObj(2, `<< /Type /Pages /Count ${numPages} /Kids [${kidRefs}] >>`);

  for (let i = 0; i < numPages; i++) {
    const { jpegData, width, height } = pages[i];
    const pageObjN = 3 + i * 2;
    const imgObjN  = 4 + i * 2;
    const imgName  = `Img${i}`;

    // We embed content inline in page via stream to keep it simple
    const contentN = 3 + numPages * 2 + i;

    addObj(pageObjN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentN} 0 R /Resources << /XObject << /${imgName} ${imgObjN} 0 R >> >> >>`);
    addObj(imgObjN, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegData.byteLength} >>`, jpegData);
  }

  // Content streams
  for (let i = 0; i < numPages; i++) {
    const { width, height } = pages[i];
    const imgName = `Img${i}`;
    const contentStr = `q ${width} 0 0 ${height} 0 0 cm /${imgName} Do Q`;
    const contentBytes = e(contentStr);
    const n = 3 + numPages * 2 + i;
    addObj(n, `<< /Length ${contentBytes.byteLength} >>`, contentBytes);
  }

  // xref table
  const totalObjs = 3 + numPages * 3; // 1 catalog + 1 pages + 2*N (page+img) + N (content)
  const headerStr = '%PDF-1.4\n';
  const header = e(headerStr);
  const xrefOffset = offset + header.byteLength;

  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjs - 1; n++) {
    const off = offsets[n] !== undefined ? offsets[n] + header.byteLength : 0;
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const allParts: Uint8Array[] = [header, ...objs, e(xref)];
  return concat(...allParts);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.byteLength; }
  return out;
}

// ─── Main export function ────────────────────────────────────────────────────

export async function exportPdfWithAnnotations(
  pdfUrl: string,
  annotations: PdfAnnotation[],
  onProgress?: (page: number, total: number) => void,
): Promise<Blob> {
  // Spin up a dedicated Web Worker and wrap it in a PDFWorker so we can pass
  // it via the `worker:` option of getDocument().  This guarantees the export
  // never touches GlobalWorkerOptions.workerPort (the markup editor's worker).
  const workerInstance = new PdfWorker();
  const pdfWorker = pdfjsLib.PDFWorker.fromPort({ port: workerInstance });

  // Declared outside try so the finally block can call pdf.destroy().
  let pdf: pdfjsLib.PDFDocumentProxy | undefined;

  try {
    // Fetch PDF as binary (CORS-safe via fetch)
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error('Failed to fetch PDF');
    const buffer = await response.arrayBuffer();

    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), worker: pdfWorker }).promise;
    const numPages = pdf.numPages;

    const pages: Array<{ jpegData: Uint8Array; width: number; height: number }> = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress?.(pageNum, numPages);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); // 1.5× balances quality and GPU memory
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport }).promise;

      await drawAnnotationsOnCanvas(canvas, annotations, pageNum);

      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to blob failed')), 'image/jpeg', 0.92);
      });
      const jpegData = new Uint8Array(await jpegBlob.arrayBuffer());
      pages.push({ jpegData, width: Math.round(viewport.width), height: Math.round(viewport.height) });

      // Resize the canvas to 0×0 to release the GPU-backed memory immediately.
      // On iOS Safari the canvas memory pool is limited; without explicit
      // release, a multi-page export can exhaust it and cause the markup
      // editor's canvas.getContext('2d') to return null on the next open.
      canvas.width = 0;
      canvas.height = 0;
    }

    const pdfBytes = buildPdfFromJpegs(pages);
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  } finally {
    // pdf.destroy() sends "Terminate" through transport.messageHandler whose
    // comObj is exportWorkerInstance (set when getDocument resolved with
    // worker: pdfWorker).  The "Terminate" therefore goes to the export worker,
    // not to GlobalWorkerOptions.workerPort (the markup editor's shared worker).
    // After the transport is torn down, pdfWorker.destroy() removes
    // exportWorkerInstance from the internal #workerPorts WeakMap, and
    // workerInstance.terminate() hard-kills the export thread.
    try { await pdf?.destroy(); } catch { /* ignore cleanup errors */ }
    pdfWorker.destroy();
    workerInstance.terminate();
  }
}

// ─── XML escape helper ───────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
