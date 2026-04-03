
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfAnnotation, JobPrint, User, UserRole } from '../types.ts';
import { apiService } from '../services/apiService.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type ToolType = 'pen' | 'text' | 'arrow' | 'rectangle' | 'circle' | 'line';

interface AnyAnnotationData extends Record<string, unknown> {
  points?: Array<{ x: number; y: number }>;
  x?: number;
  y?: number;
  text?: string;
  fontSize?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface PdfMarkupEditorProps {
  print: JobPrint;
  sessionUser: User;
  onClose: () => void;
  isDarkMode?: boolean;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff', '#000000'];
const STROKE_WIDTHS = [2, 4, 6, 10];

const TOOLS: { id: ToolType; label: string; title: string }[] = [
  { id: 'pen',       label: '✏',  title: 'Freehand Pen' },
  { id: 'text',      label: 'T',  title: 'Text' },
  { id: 'arrow',     label: '→',  title: 'Arrow' },
  { id: 'rectangle', label: '▭',  title: 'Rectangle' },
  { id: 'circle',    label: '○',  title: 'Circle / Ellipse' },
  { id: 'line',      label: '/',  title: 'Line' },
];

const getRelativeCoords = (clientX: number, clientY: number, el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return {
    x: (clientX - r.left) / r.width,
    y: (clientY - r.top) / r.height,
  };
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);

const renderAnnotationSvgElement = (
  ann: { toolType: ToolType; color: string; strokeWidth: number; data: AnyAnnotationData },
  w: number,
  h: number,
  key: string
): React.ReactElement | null => {
  const d = ann.data as AnyAnnotationData;
  const color = ann.color;
  const sw = ann.strokeWidth;
  const arrowMarkerId = `arrowhead-${key}`;

  switch (ann.toolType) {
    case 'pen': {
      if (!d.points || d.points.length < 2) return null;
      const pathD = d.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
      return (
        <path key={key} d={pathD} stroke={color} strokeWidth={sw}
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      );
    }
    case 'text': {
      if (!d.text) return null;
      return (
        <text key={key} x={(d.x ?? 0) * w} y={(d.y ?? 0) * h}
          fill={color} fontSize={d.fontSize ?? 18} fontFamily="Arial, sans-serif"
          fontWeight="bold" style={{ userSelect: 'none' }}>
          {d.text}
        </text>
      );
    }
    case 'arrow': {
      if (d.x1 === undefined) return null;
      return (
        <g key={key}>
          <defs>
            <marker id={arrowMarkerId} markerWidth="10" markerHeight="7"
              refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={color} />
            </marker>
          </defs>
          <line
            x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
            x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
            stroke={color} strokeWidth={sw}
            markerEnd={`url(#${arrowMarkerId})`} />
        </g>
      );
    }
    case 'rectangle': {
      if (d.x1 === undefined) return null;
      const rx = Math.min(d.x1, d.x2 ?? 0) * w;
      const ry = Math.min(d.y1 ?? 0, d.y2 ?? 0) * h;
      const rw = Math.abs((d.x2 ?? 0) - d.x1) * w;
      const rh = Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) * h;
      return (
        <rect key={key} x={rx} y={ry} width={rw} height={rh}
          stroke={color} strokeWidth={sw} fill="none" />
      );
    }
    case 'circle': {
      if (d.x1 === undefined) return null;
      const cx = ((d.x1 + (d.x2 ?? 0)) / 2) * w;
      const cy = (((d.y1 ?? 0) + (d.y2 ?? 0)) / 2) * h;
      const rx2 = (Math.abs((d.x2 ?? 0) - d.x1) / 2) * w;
      const ry2 = (Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) / 2) * h;
      return (
        <ellipse key={key} cx={cx} cy={cy} rx={Math.max(rx2, 1)} ry={Math.max(ry2, 1)}
          stroke={color} strokeWidth={sw} fill="none" />
      );
    }
    case 'line': {
      if (d.x1 === undefined) return null;
      return (
        <line key={key}
          x1={(d.x1 ?? 0) * w} y1={(d.y1 ?? 0) * h}
          x2={(d.x2 ?? 0) * w} y2={(d.y2 ?? 0) * h}
          stroke={color} strokeWidth={sw} strokeLinecap="round" />
      );
    }
    default: return null;
  }
};

const getAnnotationLabelPos = (ann: PdfAnnotation, w: number, h: number): { x: number; y: number } | null => {
  const d = ann.data as AnyAnnotationData;
  switch (ann.toolType) {
    case 'pen':
      return d.points?.[0] ? { x: d.points[0].x * w, y: d.points[0].y * h } : null;
    case 'text':
      return d.x !== undefined ? { x: d.x * w, y: (d.y ?? 0) * h - 22 } : null;
    default:
      return d.x1 !== undefined ? { x: d.x1 * w, y: (d.y1 ?? 0) * h } : null;
  }
};

export const PdfMarkupEditor: React.FC<PdfMarkupEditorProps> = ({
  print,
  sessionUser,
  onClose,
}) => {
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [annotationLoadError, setAnnotationLoadError] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [previewData, setPreviewData] = useState<AnyAnnotationData | null>(null);
  const [textInput, setTextInput] = useState<{ px: number; py: number; rx: number; ry: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    apiService.getAnnotations(print.id)
      .then(setAnnotations)
      .catch((err: Error) => setAnnotationLoadError(err.message || 'Failed to load annotations'));
  }, [print.id]);

  useEffect(() => {
    if (!print.url) return;
    setIsLoadingPdf(true);
    setPdfError(null);
    let cancelled = false;
    pdfjsLib.getDocument(print.url).promise
      .then(pdf => {
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setPageNumber(1);
      })
      .catch((err: Error) => {
        if (!cancelled) setPdfError(err.message || 'Failed to load PDF');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPdf(false);
      });
    return () => { cancelled = true; };
  }, [print.url]);

  const renderCurrentPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const availWidth = (mainRef.current?.clientWidth ?? window.innerWidth) - 48;
      const targetWidth = Math.min(availWidth, 1400);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch {
      // Cancelled render tasks are expected on page change
    }
  }, []);

  useEffect(() => {
    if (!isLoadingPdf && pdfDocRef.current) {
      renderCurrentPage(pageNumber);
    }
  }, [pageNumber, isLoadingPdf, renderCurrentPage]);

  const getCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    return getRelativeCoords(clientX, clientY, containerRef.current);
  }, []);

  const handlePointerDown = useCallback((clientX: number, clientY: number) => {
    if (textInput) return;
    const coords = getCoords(clientX, clientY);
    if (currentTool === 'text') {
      const container = containerRef.current;
      if (!container) return;
      const r = container.getBoundingClientRect();
      setTextInput({ px: clientX - r.left, py: clientY - r.top, rx: coords.x, ry: coords.y });
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 30);
      return;
    }
    setIsDrawing(true);
    setDrawStart(coords);
    if (currentTool === 'pen') setPenPoints([coords]);
  }, [currentTool, textInput, getCoords]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!isDrawing || !drawStart) return;
    const coords = getCoords(clientX, clientY);
    if (currentTool === 'pen') {
      setPenPoints(prev => [...prev, coords]);
    } else {
      setPreviewData({ x1: drawStart.x, y1: drawStart.y, x2: coords.x, y2: coords.y });
    }
  }, [isDrawing, drawStart, currentTool, getCoords]);

  const commitAnnotation = useCallback(async (data: AnyAnnotationData) => {
    const newAnn: Omit<PdfAnnotation, 'id' | 'createdAt'> = {
      printId: print.id,
      companyId: sessionUser.companyId,
      authorId: sessionUser.id,
      authorName: sessionUser.name,
      pageNumber,
      toolType: currentTool,
      color: currentColor,
      strokeWidth,
      data: data as Record<string, unknown>,
    };
    setIsSaving(true);
    try {
      const saved = await apiService.saveAnnotation(newAnn);
      setAnnotations(prev => [...prev, saved]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setActionError('Failed to save annotation: ' + msg);
    } finally {
      setIsSaving(false);
    }
  }, [print.id, sessionUser, pageNumber, currentTool, currentColor, strokeWidth]);

  const handlePointerUp = useCallback(async (clientX: number, clientY: number) => {
    if (!isDrawing || !drawStart) return;
    setIsDrawing(false);
    const coords = getCoords(clientX, clientY);
    let data: AnyAnnotationData;
    if (currentTool === 'pen') {
      const finalPoints = [...penPoints, coords];
      if (finalPoints.length < 2) { setPenPoints([]); setPreviewData(null); return; }
      data = { points: finalPoints };
    } else {
      const dx = Math.abs(coords.x - drawStart.x);
      const dy = Math.abs(coords.y - drawStart.y);
      if (dx < 0.005 && dy < 0.005) { setPreviewData(null); setDrawStart(null); return; }
      data = { x1: drawStart.x, y1: drawStart.y, x2: coords.x, y2: coords.y };
    }
    setPenPoints([]);
    setPreviewData(null);
    setDrawStart(null);
    await commitAnnotation(data);
  }, [isDrawing, drawStart, currentTool, penPoints, getCoords, commitAnnotation]);

  const handleTextSubmit = useCallback(async () => {
    if (!textInput) return;
    setTextInput(null);
    if (!textValue.trim()) { setTextValue(''); return; }
    const data: AnyAnnotationData = { x: textInput.rx, y: textInput.ry, text: textValue.trim(), fontSize: 18 };
    setTextValue('');
    await commitAnnotation(data);
  }, [textInput, textValue, commitAnnotation]);

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await apiService.deleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setActionError('Failed to delete annotation: ' + msg);
    }
  };

  const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber);

  const penPreviewPath = currentTool === 'pen' && penPoints.length > 1 && isDrawing
    ? penPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * canvasSize.width} ${p.y * canvasSize.height}`).join(' ')
    : null;

  const canDelete = (ann: PdfAnnotation) =>
    ann.authorId === sessionUser.id ||
    sessionUser.role === UserRole.ADMIN ||
    sessionUser.role === UserRole.SUPER_ADMIN;

  const toolCursor = currentTool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950 flex flex-col select-none">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-slate-900/80 backdrop-blur shrink-0 flex-wrap gap-y-2">
        <button
          onClick={onClose}
          className="p-2 bg-rose-600 text-white rounded-lg hover:scale-105 transition-all active:scale-95 shrink-0"
          title="Close editor"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-white text-sm font-black uppercase tracking-widest leading-tight">As-Built Markup</h2>
          <p className="text-brand text-xs font-black uppercase tracking-tighter truncate">{print.fileName}</p>
        </div>

        {numPages > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="p-1.5 bg-slate-800 text-white rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-white text-xs font-bold min-w-[3rem] text-center">{pageNumber}/{numPages}</span>
            <button
              onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              className="p-1.5 bg-slate-800 text-white rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {isSaving && (
          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse shrink-0">Saving…</span>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 bg-slate-900/60 shrink-0 overflow-x-auto">
        {/* Drawing tools */}
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => { setCurrentTool(tool.id); setTextInput(null); }}
            title={tool.title}
            className={`px-3 py-1.5 rounded-lg text-sm font-black uppercase tracking-wider transition-all shrink-0 ${
              currentTool === tool.id
                ? 'bg-brand text-slate-900 shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tool.label}
          </button>
        ))}

        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />

        {/* Color swatches */}
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setCurrentColor(c)}
            title={c}
            className={`w-6 h-6 rounded-full shrink-0 transition-transform hover:scale-110 ${
              currentColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''
            }`}
            style={{
              backgroundColor: c,
              border: c === '#000000' ? '1px solid rgba(255,255,255,0.2)' : undefined,
            }}
          />
        ))}

        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />

        {/* Stroke widths */}
        {STROKE_WIDTHS.map(w => (
          <button
            key={w}
            onClick={() => setStrokeWidth(w)}
            title={`Stroke width ${w}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              strokeWidth === w ? 'bg-brand' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <div
              className="rounded-full bg-white"
              style={{ width: Math.max(w, 2) + 2, height: Math.max(w, 2) + 2 }}
            />
          </button>
        ))}

        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />

        {/* Log toggle */}
        <button
          onClick={() => setShowLog(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ${
            showLog ? 'bg-brand text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          Log ({annotations.length})
        </button>
      </div>

      {/* ── Main canvas area ── */}
      <div ref={mainRef} className="flex-1 overflow-auto flex flex-col items-center p-4 gap-4">

        {/* Annotation load error */}
        {annotationLoadError && (
          <div className="w-full max-w-2xl flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-amber-300 text-xs font-bold flex-1">Could not load existing annotations: {annotationLoadError}</p>
            <button onClick={() => setAnnotationLoadError(null)} className="text-amber-400 hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Action error (save/delete failures) */}
        {actionError && (
          <div className="w-full max-w-2xl flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-rose-300 text-xs font-bold flex-1">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white transition-colors">
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

        {!isLoadingPdf && !pdfError && (
          <div
            ref={containerRef}
            className={`relative shadow-2xl rounded-lg overflow-hidden ${toolCursor}`}
            style={{ width: canvasSize.width || '100%', touchAction: 'none' }}
            onMouseDown={e => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={e => handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={e => handlePointerUp(e.clientX, e.clientY)}
            onMouseLeave={() => {
              if (isDrawing) {
                setIsDrawing(false);
                setPenPoints([]);
                setPreviewData(null);
                setDrawStart(null);
              }
            }}
            onTouchStart={e => {
              e.preventDefault();
              const t = e.touches[0];
              handlePointerDown(t.clientX, t.clientY);
            }}
            onTouchMove={e => {
              e.preventDefault();
              const t = e.touches[0];
              handlePointerMove(t.clientX, t.clientY);
            }}
            onTouchEnd={e => {
              e.preventDefault();
              const t = e.changedTouches[0];
              handlePointerUp(t.clientX, t.clientY);
            }}
          >
            {/* PDF canvas */}
            <canvas ref={canvasRef} className="block" />

            {/* Annotation SVG overlay */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            >
              {/* Saved annotations for current page */}
              {pageAnnotations.map(ann =>
                renderAnnotationSvgElement(
                  { ...ann, data: ann.data as AnyAnnotationData },
                  canvasSize.width, canvasSize.height, ann.id
                )
              )}

              {/* Author-initials badge near each annotation's anchor point */}
              {pageAnnotations.map(ann => {
                const pos = getAnnotationLabelPos(ann, canvasSize.width, canvasSize.height);
                if (!pos) return null;
                const initials = getInitials(ann.authorName);
                const badgeW = initials.length * 7 + 10;
                return (
                  <g key={`badge-${ann.id}`}>
                    <rect
                      x={pos.x} y={pos.y - 15}
                      width={badgeW} height={17}
                      rx="3" fill={ann.color} opacity="0.88"
                    />
                    <text
                      x={pos.x + 5} y={pos.y - 2}
                      fontSize="11" fontFamily="monospace" fontWeight="bold" fill="white"
                    >
                      {initials}
                    </text>
                  </g>
                );
              })}

              {/* Freehand pen preview */}
              {penPreviewPath && (
                <path
                  d={penPreviewPath}
                  stroke={currentColor} strokeWidth={strokeWidth}
                  fill="none" strokeLinecap="round" strokeLinejoin="round"
                  opacity="0.75"
                />
              )}

              {/* Shape preview while dragging */}
              {previewData && currentTool !== 'pen' && renderAnnotationSvgElement(
                { toolType: currentTool, color: currentColor, strokeWidth, data: previewData },
                canvasSize.width, canvasSize.height, 'preview'
              )}
            </svg>

            {/* Floating text input for text tool */}
            {textInput && (
              <input
                ref={textInputRef}
                type="text"
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onBlur={handleTextSubmit}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTextSubmit();
                  if (e.key === 'Escape') { setTextInput(null); setTextValue(''); }
                }}
                className="absolute bg-black/40 backdrop-blur rounded px-2 py-0.5 border border-dashed outline-none z-10 font-bold"
                style={{
                  left: textInput.px,
                  top: textInput.py - 14,
                  color: currentColor,
                  borderColor: currentColor,
                  fontSize: '18px',
                  minWidth: '140px',
                }}
                placeholder="Type then Enter…"
              />
            )}
          </div>
        )}

        {/* ── Annotation Log panel ── */}
        {showLog && (
          <div className="w-full max-w-2xl bg-slate-900/80 border border-white/10 rounded-2xl p-4">
            <h3 className="text-white text-xs font-black uppercase tracking-widest mb-3">
              Markup Log — All Pages
            </h3>
            {annotations.length === 0 ? (
              <p className="text-slate-500 text-xs">No annotations yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {annotations.map(ann => (
                  <div
                    key={ann.id}
                    className="flex items-center gap-3 p-2.5 bg-slate-800/60 rounded-xl group"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: ann.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-bold truncate">{ann.authorName}</p>
                      <p className="text-slate-400 text-[10px] capitalize">
                        {ann.toolType} · Page {ann.pageNumber} · {new Date(ann.createdAt).toLocaleString()}
                        {ann.toolType === 'text' && (ann.data as AnyAnnotationData).text && (
                          <> · "<span className="text-slate-300">{(ann.data as AnyAnnotationData).text}</span>"</>
                        )}
                      </p>
                    </div>
                    {canDelete(ann) && (
                      <button
                        onClick={() => handleDeleteAnnotation(ann.id)}
                        title="Delete annotation"
                        className="p-1.5 rounded-lg bg-rose-500/0 text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfMarkupEditor;
