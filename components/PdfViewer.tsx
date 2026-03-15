
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

interface Props {
  url: string;
}

const PdfViewer: React.FC<Props> = ({ url }) => {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const renderPage = useCallback(async (
    pdf: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
  ) => {
    const container = containerRef.current;
    if (!container) return;

    renderTaskRef.current?.cancel();

    const page = await pdf.getPage(pageNum);

    // Scale the page to fit the container width
    const containerWidth = container.clientWidth || 800;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    // Build a fresh page wrapper each render
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: relative;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      margin: 0 auto;
    `;

    // --- Canvas layer (visual rendering) ---
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = `
      display: block;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
    `;
    wrapper.appendChild(canvas);

    // --- Text layer (transparent, selectable) ---
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'pdf-text-layer';
    textLayerDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      overflow: hidden;
      line-height: 1;
    `;
    wrapper.appendChild(textLayerDiv);
    container.appendChild(wrapper);

    // Render canvas
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return;
    const renderTask = page.render({ canvasContext, viewport });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
    } catch (e: unknown) {
      if ((e as Error)?.name === 'RenderingCancelledException') return;
      throw e;
    }

    // Render text layer on top of the canvas
    const textContent = await page.getTextContent();
    const textRenderTask = pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
      textDivs: [],
    });
    await textRenderTask.promise;
  }, []);

  // Load PDF whenever the URL changes
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setHasError(false);
      setCurrentPage(1);

      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        await renderPage(pdf, 1);
      } catch {
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [url, renderPage]);

  // Re-render when the user navigates pages
  useEffect(() => {
    if (pdfRef.current && !isLoading) {
      renderPage(pdfRef.current, currentPage);
    }
  }, [currentPage, renderPage]);

  const goToPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage(p => Math.min(numPages, p + 1));

  return (
    <div className="flex flex-col h-full bg-slate-800">
      {/* Navigation bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/10 shrink-0">
        <button
          onClick={goToPrev}
          disabled={currentPage <= 1 || isLoading}
          className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-white/70 text-sm font-medium select-none">
          {isLoading ? 'Loading…' : hasError ? 'Failed to load PDF' : `Page ${currentPage} of ${numPages}`}
        </span>

        <button
          onClick={goToNext}
          disabled={currentPage >= numPages || isLoading}
          className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
          aria-label="Next page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* PDF canvas + text layer */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-white/40">
            <svg className="w-8 h-8 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm font-medium">Loading PDF…</span>
          </div>
        )}
        {hasError && (
          <div className="flex items-center justify-center h-full text-white/40">
            <span className="text-sm font-medium">Failed to load PDF. Please try again.</span>
          </div>
        )}
        <div ref={containerRef} className={isLoading || hasError ? 'hidden' : ''} />
      </div>
    </div>
  );
};

export default PdfViewer;
