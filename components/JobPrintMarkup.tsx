
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Job, JobPrint, PrintMarker, DigTicket, TicketStatus } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { getTicketStatus, getStatusDotColor } from '../utils/dateUtils.ts';
import * as pdfjs from 'pdfjs-dist';

// Use a more robust worker URL for mobile compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface JobPrintMarkupProps {
  job: Job;
  tickets: DigTicket[];
  onClose: () => void;
  onViewTicket: (url: string) => void;
  isDarkMode?: boolean;
}

export const JobPrintMarkup: React.FC<JobPrintMarkupProps> = ({ job, tickets, onClose, onViewTicket, isDarkMode }) => {
  const [print, setPrint] = useState<JobPrint | null>(null);
  const [markers, setMarkers] = useState<PrintMarker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  
  // Document Dimensions
  const [docDims, setDocDims] = useState({ width: 0, height: 0 });
  
  // PDF Multi-page State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const currentRenderTask = useRef<any>(null);

  // Navigation State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.1 });
  const [isPinMode, setIsPinMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const dragThresholdMet = useRef(false);
  
  // Tooltip/Marker State
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>('');

  // Placement State
  const [newMarkerPos, setNewMarkerPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPdfFile = (url?: string) => url?.toLowerCase().split('?')[0].endsWith('.pdf');

  // 1. Initial Load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const prints = await apiService.getJobPrints(job.jobNumber);
        const activePrint = prints.find(p => p.isPinned) || prints[0] || null;
        setPrint(activePrint);
        
        if (activePrint) {
          const m = await apiService.getPrintMarkers(activePrint.id);
          setMarkers(m);
        }
      } catch (err) {
        console.error("Failed to load blueprint data", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, [job.jobNumber]);

  // 2. Auto-Fit Logic
  const performAutoFit = useCallback(() => {
    if (!viewportRef.current || docDims.width === 0) return;
    
    const vRect = viewportRef.current.getBoundingClientRect();
    const padding = 20; 
    const availableWidth = vRect.width - (padding * 2);
    const availableHeight = vRect.height - (padding * 2);
    
    const scale = Math.min(availableWidth / docDims.width, availableHeight / docDims.height);
    
    setTransform({
      x: (vRect.width - docDims.width * scale) / 2,
      y: (vRect.height - docDims.height * scale) / 2,
      scale: scale
    });
    setIsMapReady(true);
  }, [docDims]);

  // 3. Document Rendering (PDF or Image)
  useEffect(() => {
    if (!print) return;

    if (!isPdfFile(print.url)) {
      return;
    }

    let isCancelled = false;
    const renderPdf = async () => {
      setIsRenderingPage(true);
      try {
        // Cancel existing render if any
        if (currentRenderTask.current) {
          currentRenderTask.current.cancel();
        }

        if (!pdfDocRef.current || pdfDocRef.current.loadingTask.docId !== print.id) {
          const loadingTask = pdfjs.getDocument(print.url!);
          const pdf = await loadingTask.promise;
          if (isCancelled) return;
          pdfDocRef.current = pdf;
          setTotalPages(pdf.numPages);
        }
        
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        // SAFE SCALE CALCULATION FOR MOBILE
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const maxDimLimit = isMobile ? 3000 : 5000;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const renderScale = Math.min(maxDimLimit / unscaledViewport.width, maxDimLimit / unscaledViewport.height, 2.0);
        
        const viewport = page.getViewport({ scale: renderScale }); 
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        
        // Clear canvas before resizing to save memory
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderTask = page.render({
          canvasContext: context!,
          viewport: viewport,
          canvas: canvas
        } as any);

        currentRenderTask.current = renderTask;
        await renderTask.promise;
        
        if (!isCancelled) {
          setDocDims({ width: canvas.width, height: canvas.height });
          setIsRenderingPage(false);
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("PDF Render Error:", err);
        }
      }
    };

    renderPdf();
    return () => { isCancelled = true; };
  }, [print, currentPage]);

  useEffect(() => {
    if (docDims.width > 0) {
      performAutoFit();
    }
  }, [docDims, performAutoFit]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPinMode) return;
    if ((e.target as HTMLElement).closest('.ui-isolation')) return;

    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    dragThresholdMet.current = false;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const dxTotal = Math.abs(e.clientX - pointerDownPos.current.x);
    const dyTotal = Math.abs(e.clientY - pointerDownPos.current.y);
    
    if (!dragThresholdMet.current && (dxTotal > 3 || dyTotal > 3)) {
      dragThresholdMet.current = true;
    }

    if (dragThresholdMet.current) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!viewportRef.current) return;
    const vRect = viewportRef.current.getBoundingClientRect();

    const zoomSpeed = 0.001;
    const scaleFactor = Math.exp(-e.deltaY * zoomSpeed);
    const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.005), 40);

    const mouseX = e.clientX - vRect.left;
    const mouseY = e.clientY - vRect.top;
    const contentX = (mouseX - transform.x) / transform.scale;
    const contentY = (mouseY - transform.y) / transform.scale;
    const nextX = mouseX - contentX * newScale;
    const nextY = mouseY - contentY * newScale;

    setTransform({ x: nextX, y: nextY, scale: newScale });
  };

  const handleViewportClick = (e: React.MouseEvent) => {
    if (dragThresholdMet.current) return;
    if (!isPinMode || !contentWrapperRef.current) return;
    
    const rect = contentWrapperRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100) {
      setNewMarkerPos({ x: xPct, y: yPct });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setIsMapReady(false);
    try {
      const newPrint = await apiService.uploadJobPrint(job.jobNumber, file);
      setPrint(newPrint);
      setMarkers([]);
      setNewMarkerPos(null);
      setCurrentPage(1);
      pdfDocRef.current = null;
      if (!isPdfFile(newPrint.url)) {
        setDocDims({ width: 0, height: 0 });
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const purgeMap = async () => {
    if (!confirm("Remove all pins and reset workspace?")) return;
    setIsLoading(true);
    try {
        for (const m of markers) await apiService.deletePrintMarker(m.id);
        setMarkers([]);
        setPrint(null);
        setIsMapReady(false);
        setDocDims({ width: 0, height: 0 });
        pdfDocRef.current = null;
    } catch (err) {
        alert("Purge failed.");
    } finally {
        setIsLoading(false);
    }
  };

  const deleteMarker = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete marker?")) return;
    try {
      await apiService.deletePrintMarker(id);
      setMarkers(prev => prev.filter(m => m.id !== id));
      setSelectedMarkerId('');
    } catch (err) {
      alert("Delete failed.");
    }
  };

  const saveMarker = async () => {
    if (!print || !newMarkerPos || !selectedTicketId) return;
    const ticket = tickets.find(t => t.id === selectedTicketId);
    try {
      const saved = await apiService.savePrintMarker({
        printId: print.id,
        ticketId: selectedTicketId,
        xPercent: newMarkerPos.x,
        yPercent: newMarkerPos.y,
        pageNumber: currentPage,
        label: ticket?.ticketNo
      });
      setMarkers(prev => [...prev, saved]);
      setNewMarkerPos(null);
      setSelectedTicketId('');
      setIsPinMode(false);
    } catch (err: any) {
      console.error("Marker Save Error Details:", err);
      alert(`Save failed: ${err.message || 'Database error occurred while placing pin.'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950/90 z-[200] flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Loading Assets...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] flex flex-col overflow-hidden touch-none select-none animate-in fade-in duration-300">
      {/* HEADER: Simplified for Mobile */}
      <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between z-50 bg-slate-950/80 backdrop-blur-md gap-4">
        <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
          <div className="p-2.5 bg-brand/10 rounded-xl shrink-0 hidden sm:block shadow-inner">
             <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A2 2 0 013 15.483V4.517a2 2 0 011.553-1.943l7.19-1.438a2 2 0 011.514 0l7.19 1.438A2 2 0 0122 4.517v10.966a2 2 0 01-1.553 1.943L15 20l-3-3-3 3z" /></svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] sm:text-sm font-black text-white uppercase tracking-[0.2em] truncate">Job #{job.jobNumber} Assets</h2>
            <p className="text-[8px] sm:text-[9px] font-black text-brand uppercase tracking-widest mt-0.5 truncate">Coordinate Control Map</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button onClick={() => fileInputRef.current?.click()} className="hidden sm:block px-4 py-3 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">
            {isUploading ? 'Syncing...' : 'Update Print'}
          </button>
          
          {print && (
             <button onClick={purgeMap} className="p-3 bg-white/5 border border-white/10 rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-90">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </button>
          )}
          
          <button onClick={onClose} className="p-3 bg-white/10 rounded-2xl text-white hover:bg-rose-500 transition-all active:scale-90 shadow-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div 
        ref={viewportRef}
        className={`flex-1 overflow-hidden bg-slate-900 relative ${isPinMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleViewportClick}
      >
        {/* Rendering Overlay */}
        {isRenderingPage && (
          <div className="absolute inset-0 z-[60] bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center transition-opacity">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mb-3 shadow-xl" />
            <span className="text-[9px] font-black text-white uppercase tracking-[0.2em] drop-shadow-lg">Rendering Page {currentPage}...</span>
          </div>
        )}

        {print ? (
          <div 
            ref={contentWrapperRef}
            className={`absolute origin-top-left bg-white shadow-[0_0_120px_rgba(0,0,0,0.6)] transition-opacity duration-500 ${isMapReady ? 'opacity-100' : 'opacity-0'}`}
            style={{ 
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: docDims.width || 1200,
              height: docDims.height || 'auto'
            }}
          >
            {isPdfFile(print.url) ? (
              <canvas 
                ref={canvasRef} 
                className="block w-full h-auto" 
                style={{ imageRendering: '-webkit-optimize-contrast' }}
              />
            ) : (
              <img 
                src={print.url} 
                className="block w-full h-auto" 
                alt="Blueprint" 
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDocDims({ width: img.naturalWidth, height: img.naturalHeight });
                }} 
              />
            )}

            <div className="absolute inset-0 pointer-events-none">
              {markers.filter(m => (m.pageNumber || 1) === currentPage).map(m => {
                const ticket = tickets.find(t => t.id === m.ticketId);
                const colorClass = getStatusDotColor(ticket ? getTicketStatus(ticket) : TicketStatus.OTHER);
                const isSelected = selectedMarkerId === m.id;
                const isVisible = (isSelected || hoveredMarkerId === m.id) && !isDragging;

                return (
                  <div key={m.id} className="absolute z-20 pointer-events-auto" style={{ left: `${m.xPercent}%`, top: `${m.yPercent}%` }}>
                    <div 
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setSelectedMarkerId(isSelected ? '' : m.id); }}
                      onMouseEnter={() => setHoveredMarkerId(m.id)}
                      onMouseLeave={() => setHoveredMarkerId(null)}
                      className={`w-10 h-10 rounded-full border-4 border-white shadow-2xl cursor-pointer flex items-center justify-center transition-all hover:scale-125 -translate-x-1/2 -translate-y-1/2 ${colorClass} ${isSelected ? 'ring-8 ring-white/30 scale-125' : ''}`}
                      style={{ transform: `translate(-50%, -50%) scale(${1 / Math.sqrt(transform.scale)})` }}
                    >
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>

                    {isVisible && (
                      <div 
                        className="ui-isolation absolute bottom-full left-1/2 -translate-x-1/2 mb-6 z-50 pointer-events-auto"
                        style={{ transform: `scale(${1 / transform.scale})`, transformOrigin: 'bottom center' }}
                        onPointerDown={(e) => e.stopPropagation()} 
                      >
                        <div className={`p-6 rounded-[2.5rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] min-w-[280px] backdrop-blur-2xl ${isDarkMode ? 'bg-slate-900/95 text-white' : 'bg-white/95 text-slate-900'}`}>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Ticket Entry</p>
                                <p className="text-sm font-black font-mono">#{m.label}</p>
                            </div>
                            <button onClick={() => setSelectedMarkerId('')} className="p-2 opacity-40 hover:opacity-100 transition-opacity bg-black/5 rounded-xl">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <p className="text-[11px] font-bold truncate mb-6 opacity-60 uppercase tracking-tight">{ticket?.street || 'No Location Defined'}</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); ticket?.documentUrl && window.open(ticket.documentUrl, '_blank'); }}
                              className="flex-1 py-4 bg-brand text-slate-900 rounded-[1.2rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-brand/20 transition-all hover:scale-105 active:scale-95"
                            >
                              View Ticket
                            </button>
                            <button 
                              onClick={(e) => deleteMarker(m.id, e)} 
                              className="px-4 py-4 bg-rose-500/10 text-rose-500 rounded-[1.2rem] hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center border border-rose-500/10 active:scale-90"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                        <div className={`w-6 h-6 mx-auto -mt-3 rotate-45 border-r border-b border-white/10 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`} />
                      </div>
                    )}
                  </div>
                );
              })}
              {newMarkerPos && (
                <div 
                  className="absolute z-40 w-10 h-10 rounded-full bg-brand border-4 border-white animate-pulse shadow-2xl -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${newMarkerPos.x}%`, top: `${newMarkerPos.y}%`, transform: `translate(-50%, -50%) scale(${1 / Math.sqrt(transform.scale)})` }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-24 h-24 bg-white/5 rounded-[3rem] border-2 border-dashed border-white/10 flex items-center justify-center mb-10 animate-pulse">
              <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">Map Engine Ready</h3>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-4 mb-10 max-w-xs leading-relaxed">Upload a site blueprint (PDF or Image) to begin pinning asset locations.</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-12 py-5 bg-brand text-slate-900 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-brand/20 transition-all hover:scale-105 active:scale-95">Load Workspace Print</button>
          </div>
        )}
      </div>

      {/* FLOATING CONTROLS: Moved Page Nav for Mobile visibility */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-4 w-full max-w-md px-4 pointer-events-none">
        
        {/* Page Switcher Pill - Floating above the main bar */}
        {totalPages > 1 && (
          <div className="flex items-center gap-4 bg-slate-950/80 backdrop-blur-2xl border border-white/10 px-6 py-3 rounded-full shadow-2xl pointer-events-auto animate-in slide-in-from-bottom-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage <= 1 || isRenderingPage} 
              className="p-2 text-white hover:text-brand disabled:opacity-20 transition-all active:scale-75"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Document</span>
              <span className="text-xs font-black text-white">{currentPage} / {totalPages}</span>
            </div>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage >= totalPages || isRenderingPage} 
              className="p-2 text-white hover:text-brand disabled:opacity-20 transition-all active:scale-75"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {newMarkerPos && (
          <div className="bg-slate-950/95 border border-white/10 p-8 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] w-full animate-in slide-in-from-bottom-4 pointer-events-auto backdrop-blur-2xl ui-isolation">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Pin Asset to Site</h4>
              <button onClick={() => setNewMarkerPos(null)} className="text-[10px] font-black uppercase text-slate-500 hover:text-white">Discard</button>
            </div>
            <select 
              className={`w-full p-5 rounded-2xl text-xs font-bold mb-8 outline-none border focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200'}`}
              value={selectedTicketId}
              onChange={(e) => setSelectedTicketId(e.target.value)}
            >
              <option value="">Select Ticket Record...</option>
              {tickets.filter(t => !t.isArchived).map(t => (
                <option key={t.id} value={t.id}>#{t.ticketNo} • {t.street.substring(0, 20)}</option>
              ))}
            </select>
            <div className="flex gap-4">
              <button onClick={saveMarker} disabled={!selectedTicketId} className="flex-1 bg-brand text-slate-900 py-5 rounded-[1.2rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-brand/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30">Lock Position</button>
              <button onClick={() => setNewMarkerPos(null)} className="flex-1 bg-white/5 text-slate-400 py-5 rounded-[1.2rem] font-black text-[10px] uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 bg-slate-950/80 backdrop-blur-2xl border border-white/10 p-3 rounded-[2.2rem] shadow-2xl pointer-events-auto ui-isolation">
          <div className="flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
             <button onClick={() => setTransform(prev => ({ ...prev, scale: prev.scale * 1.5 }))} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all active:scale-90">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
             </button>
             <button onClick={() => setTransform(prev => ({ ...prev, scale: prev.scale / 1.5 }))} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all active:scale-90">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4" /></svg>
             </button>
             <button onClick={performAutoFit} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all active:scale-90" title="Reset Fit">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
             </button>
          </div>
          
          <button 
            onClick={() => { setIsPinMode(!isPinMode); setNewMarkerPos(null); }}
            className={`flex items-center gap-4 px-10 py-4 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl ${isPinMode ? 'bg-brand text-slate-900 scale-105 ring-4 ring-brand/30' : 'bg-white/5 text-slate-400 hover:text-white'}`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            {isPinMode ? 'Placing' : 'Pin Drop'}
          </button>
        </div>
      </div>

      <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
    </div>
  );
};
