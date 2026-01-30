
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
  const loadedPrintIdRef = useRef<string | null>(null);
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

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isPdfFile = (url?: string) => url?.toLowerCase().split('?')[0].endsWith('.pdf');

  // 1. Initial Data Load
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
      setIsMapReady(true);
      return;
    }

    let isCancelled = false;
    const renderPdf = async () => {
      setIsRenderingPage(true);
      
      if (loadedPrintIdRef.current !== print.id) {
        setIsMapReady(false);
      }

      try {
        if (currentRenderTask.current) {
          currentRenderTask.current.cancel();
        }

        if (!pdfDocRef.current || loadedPrintIdRef.current !== print.id) {
          const loadingTask = pdfjs.getDocument(print.url!);
          const pdf = await loadingTask.promise;
          if (isCancelled) return;
          pdfDocRef.current = pdf;
          loadedPrintIdRef.current = print.id;
          setTotalPages(pdf.numPages);
        }
        
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        // CRITICAL STABILITY LIMIT: Mobile browser canvases are restricted by memory.
        const maxDimLimit = isMobile ? 1600 : 4096;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const renderScale = Math.min(maxDimLimit / unscaledViewport.width, maxDimLimit / unscaledViewport.height, 1.5);
        
        const viewport = page.getViewport({ scale: renderScale }); 
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d', { alpha: false });
        if (context) {
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        
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
          setIsMapReady(true);
          
          page.cleanup();
          pdfDocRef.current?.cleanup();
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("PDF Render Error:", err);
          setIsRenderingPage(false);
          setIsMapReady(true);
        }
      }
    };

    renderPdf();
    return () => { isCancelled = true; };
  }, [print, currentPage, isMobile]);

  useEffect(() => {
    if (docDims.width > 0) {
      performAutoFit();
    }
  }, [docDims, performAutoFit]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPinMode) return;
    // Check if the click is on a UI element that should not trigger pan/zoom
    if ((e.target as HTMLElement).closest('.ui-isolation')) {
      e.stopPropagation();
      return;
    }

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
      loadedPrintIdRef.current = null;
      if (!isPdfFile(newPrint.url)) {
        setDocDims({ width: 0, height: 0 });
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const saveMarker = async () => {
    if (!newMarkerPos || !selectedTicketId || !print) return;
    try {
      const ticket = tickets.find(t => t.id === selectedTicketId);
      const label = ticket ? ticket.ticketNo : 'TKT';
      const marker = await apiService.savePrintMarker({
        printId: print.id,
        ticketId: selectedTicketId,
        xPercent: newMarkerPos.x,
        yPercent: newMarkerPos.y,
        pageNumber: currentPage,
        label
      });
      setMarkers(prev => [...prev, marker]);
      setNewMarkerPos(null);
      setSelectedTicketId('');
    } catch (err: any) {
      alert("Failed to save marker: " + err.message);
    }
  };

  const deleteMarker = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this pin?")) return;
    try {
      await apiService.deletePrintMarker(id);
      setMarkers(prev => prev.filter(m => m.id !== id));
      setHoveredMarkerId(null);
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  // Filter markers for the current page
  const visibleMarkers = markers.filter(m => (m.pageNumber || 1) === currentPage);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-3">
             <div className="w-8 h-8 bg-brand rounded-xl flex items-center justify-center text-slate-900 shadow-lg shadow-brand/20">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </div>
             <div>
               <h3 className="text-white text-xs font-black uppercase tracking-widest">{print?.fileName || 'Blueprint Vault'}</h3>
               <p className="text-brand text-[8px] font-black uppercase tracking-tighter">Job #{job.jobNumber} Markup</p>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={() => setIsPinMode(!isPinMode)}
            className={`p-3 rounded-2xl border transition-all ${isPinMode ? 'bg-brand text-slate-900 border-brand shadow-lg shadow-brand/20' : 'bg-slate-900/80 text-white border-white/10 backdrop-blur-md'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-900/80 text-white border border-white/10 backdrop-blur-md rounded-2xl shadow-2xl transition-all active:scale-95"
            title="Upload New Version"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </button>
          <button 
            onClick={onClose}
            className="p-3 bg-rose-600 text-white rounded-2xl shadow-2xl transition-all active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Viewport - Main Surface */}
      <div 
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleViewportClick}
      >
        {!isMapReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-20">
            <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading High-Res Vector...</p>
          </div>
        )}

        <div 
          ref={contentWrapperRef}
          className="absolute origin-top-left transition-transform duration-75"
          style={{ 
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            width: docDims.width || '100%',
            height: docDims.height || '100%'
          }}
        >
          {print ? (
             isPdfFile(print.url) ? (
               <canvas ref={canvasRef} className="shadow-2xl bg-white" />
             ) : (
               <img 
                 src={print.url} 
                 className="shadow-2xl bg-white" 
                 onLoad={(e) => {
                    const img = e.currentTarget;
                    setDocDims({ width: img.naturalWidth, height: img.naturalHeight });
                 }}
               />
             )
          ) : (
            <div className="flex flex-col items-center justify-center h-screen w-screen text-slate-500">
               <svg className="w-20 h-20 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               <p className="text-sm font-black uppercase tracking-widest">No Documents In Vault</p>
            </div>
          )}

          {/* Markers Layer */}
          {visibleMarkers.map(m => {
            const ticket = tickets.find(t => t.id === m.ticketId);
            const status = ticket ? getTicketStatus(ticket) : TicketStatus.OTHER;
            const isHovered = hoveredMarkerId === m.id;

            return (
              <div 
                key={m.id}
                className="absolute z-30 transition-transform ui-isolation"
                style={{ left: `${m.xPercent}%`, top: `${m.yPercent}%`, transform: 'translate(-50%, -50%)' }}
                onMouseEnter={() => !isMobile && setHoveredMarkerId(m.id)}
                onMouseLeave={() => setHoveredMarkerId(null)}
                onClick={(e) => {
                   e.stopPropagation();
                   if (isMobile) setHoveredMarkerId(hoveredMarkerId === m.id ? null : m.id);
                }}
              >
                <div className={`relative flex flex-col items-center group`}>
                   <div className={`w-8 h-8 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all ${getStatusDotColor(status)} ${isHovered ? 'scale-125' : 'scale-100'}`}>
                      <span className="text-[10px] font-black text-white">{m.label?.slice(-2)}</span>
                   </div>
                   
                   {(isHovered || isMobile && hoveredMarkerId === m.id) && (
                     <div className="absolute bottom-full mb-3 bg-slate-900 border border-white/20 p-4 rounded-2xl shadow-2xl min-w-[200px] animate-in zoom-in-95 duration-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Vault Record</p>
                        <p className="text-sm font-black text-white mb-2">TKT: {m.label}</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                           <span className="text-[10px] font-bold text-slate-300 truncate max-w-full">Loc: {ticket?.street}</span>
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={(e) => { e.stopPropagation(); if (ticket?.documentUrl) onViewTicket(ticket.documentUrl); }}
                             className="flex-1 py-2 bg-brand text-slate-900 rounded-lg text-[9px] font-black uppercase tracking-widest"
                           >
                             View Doc
                           </button>
                           <button 
                             onClick={(e) => deleteMarker(m.id, e)}
                             className="p-2 bg-rose-500/10 text-rose-500 rounded-lg"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                           </button>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-slate-900" />
                     </div>
                   )}
                </div>
              </div>
            );
          })}

          {/* New Placement Marker */}
          {newMarkerPos && (
            <div 
              className="absolute z-40 animate-bounce transition-transform"
              style={{ left: `${newMarkerPos.x}%`, top: `${newMarkerPos.y}%`, transform: 'translate(-50%, -50%)' }}
            >
               <div className="w-10 h-10 rounded-full bg-brand border-4 border-white shadow-2xl flex items-center justify-center animate-pulse">
                  <div className="w-2 h-2 bg-slate-900 rounded-full" />
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none px-4">
        <div className="flex flex-col gap-4 items-center w-full max-w-lg">
           {/* Placement Interface */}
           {newMarkerPos && (
             <div className="ui-isolation pointer-events-auto bg-slate-900/95 backdrop-blur-xl border border-white/20 p-6 rounded-[2.5rem] shadow-2xl w-full animate-in slide-in-from-bottom duration-300">
               <div className="flex items-center justify-between mb-4">
                 <h4 className="text-white font-black uppercase tracking-widest text-xs">Assign Pin to Ticket</h4>
                 <button onClick={() => setNewMarkerPos(null)} className="text-slate-500 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
               </div>
               
               <div className="space-y-4">
                 <select 
                   className="w-full bg-slate-800 text-white px-4 py-3 rounded-2xl border border-white/10 text-xs font-bold outline-none focus:ring-4 focus:ring-brand/20"
                   value={selectedTicketId}
                   onChange={e => setSelectedTicketId(e.target.value)}
                 >
                   <option value="">Select Locate Asset...</option>
                   {tickets.filter(t => !t.isArchived).map(t => (
                     <option key={t.id} value={t.id}>{t.ticketNo} - {t.street}</option>
                   ))}
                 </select>
                 
                 <div className="flex gap-2">
                    <button 
                      onClick={saveMarker}
                      disabled={!selectedTicketId}
                      className="flex-1 bg-brand text-slate-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-brand/20 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      Confirm Pin Assignment
                    </button>
                 </div>
               </div>
             </div>
           )}

           {/* PDF Pagination & Navigation Controls */}
           {totalPages > 1 && (
             <div 
               className="ui-isolation pointer-events-auto flex items-center bg-slate-800/90 backdrop-blur px-4 py-2 rounded-2xl border border-white/10 shadow-2xl gap-4"
               onPointerDown={(e) => e.stopPropagation()} // Prevent pan start
             >
               <button 
                 disabled={currentPage <= 1 || isRenderingPage}
                 onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage(prev => Math.max(1, prev - 1));
                 }}
                 className="p-3 text-white hover:bg-white/10 rounded-xl disabled:opacity-20 transition-all active:scale-90"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
               </button>
               
               <div className="flex flex-col items-center min-w-[80px]">
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">Page</span>
                 <span className="text-xs font-black text-brand">{currentPage} / {totalPages}</span>
               </div>
               
               <button 
                 disabled={currentPage >= totalPages || isRenderingPage}
                 onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPage(prev => Math.min(totalPages, prev + 1));
                 }}
                 className="p-3 text-white hover:bg-white/10 rounded-xl disabled:opacity-20 transition-all active:scale-90"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
               </button>
             </div>
           )}

           {/* Toolbar */}
           <div className="ui-isolation pointer-events-auto bg-slate-900/90 backdrop-blur-xl px-6 py-4 rounded-[2.5rem] border border-white/10 shadow-2xl flex items-center gap-6">
              <div className="flex items-center gap-2 pr-4 border-r border-white/10">
                 <button onClick={() => setTransform(prev => ({ ...prev, scale: prev.scale * 1.5 }))} className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                 </button>
                 <button onClick={() => setTransform(prev => ({ ...prev, scale: prev.scale / 1.5 }))} className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4" /></svg>
                 </button>
              </div>
              <button 
                onClick={performAutoFit}
                className="flex flex-col items-center text-slate-400 hover:text-brand transition-colors"
              >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                 <span className="text-[8px] font-black uppercase mt-1">Reset</span>
              </button>
              <div className="w-px h-8 bg-white/10 mx-2" />
              <div className="flex flex-col items-end">
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">{markers.length} Pins</span>
                 <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Markup Density</span>
              </div>
           </div>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/*" onChange={handleFileUpload} />
    </div>
  );
};

export default JobPrintMarkup;
