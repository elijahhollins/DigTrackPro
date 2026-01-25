import React, { useState, useEffect, useRef } from 'react';
import { Job, JobPrint, PrintMarker, DigTicket, TicketStatus } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { getTicketStatus, getStatusDotColor } from '../utils/dateUtils.ts';

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
  const [isUploading, setIsUploading] = useState(false);
  
  // Navigation State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPinMode, setIsPinMode] = useState(false);
  
  // Tooltip/Marker State
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>('');
  const tooltipTimeoutRef = useRef<number | null>(null);

  // Placement State
  const [newMarkerPos, setNewMarkerPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPdf = (url?: string) => url?.toLowerCase().split('?')[0].endsWith('.pdf');

  // Load Data
  useEffect(() => {
    loadData();
  }, [job.jobNumber]);

  // Initial Centering Logic
  useEffect(() => {
    if (print && viewportRef.current && !isLoading) {
      const vRect = viewportRef.current.getBoundingClientRect();
      const contentWidth = 1200; 
      const contentHeight = isPdf(print.url) ? 3600 : 800;
      
      const initialScale = Math.min((vRect.width * 0.9) / contentWidth, (vRect.height * 0.6) / (isPdf(print.url) ? 1200 : contentHeight), 1);
      const initialX = (vRect.width - contentWidth * initialScale) / 2;
      const initialY = 40;
      
      setTransform({ x: initialX, y: initialY, scale: initialScale });
    }
  }, [print, isLoading]);

  const loadData = async () => {
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploaded = await apiService.uploadJobPrint(job.jobNumber, file);
      setPrint(uploaded);
      setMarkers([]);
    } catch (err) {
      alert("Blueprint upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const getEventCoords = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as any).clientX, y: (e as any).clientY };
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (newMarkerPos) return;
    // Allow standard scrolling inside if we're not scaling the container, 
    // but usually in this layout we want to zoom the whole canvas.
    // If the user wants native controls, we might want to let them scroll the iframe.
    // However, if we zoom, it might conflict.
    // To satisfy "Native controls", we'll let the user scroll the iframe if they aren't interacting with the canvas background.
  };

  const handleContentClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart' && isPinMode) e.preventDefault();
    
    if (!isPinMode) {
      setSelectedMarkerId('');
      setHoveredMarkerId(null);
      return;
    }

    if (!contentRef.current || !print || newMarkerPos) return;
    
    const { x: clientX, y: clientY } = getEventCoords(e);
    const rect = contentRef.current.getBoundingClientRect();
    
    const xPct = ((clientX - rect.left) / rect.width) * 100;
    const yPct = ((clientY - rect.top) / rect.height) * 100;

    if (xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100) {
      setNewMarkerPos({ x: xPct, y: yPct });
    }
  };

  const zoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 20) }));
  };

  const zoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.02) }));
  };

  const resetZoom = () => {
    if (viewportRef.current && print) {
      const vRect = viewportRef.current.getBoundingClientRect();
      const contentWidth = 1200;
      const contentHeight = isPdf(print.url) ? 3600 : 800;
      const scale = Math.min((vRect.width * 0.8) / contentWidth, (vRect.height * 0.8) / (isPdf(print.url) ? 1200 : contentHeight), 1);
      setTransform({
        x: (vRect.width - contentWidth * scale) / 2,
        y: 40,
        scale: scale
      });
    }
  };

  const handleMarkerEnter = (id: string) => {
    if (tooltipTimeoutRef.current) window.clearTimeout(tooltipTimeoutRef.current);
    setHoveredMarkerId(id);
  };

  const handleMarkerLeave = () => {
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setHoveredMarkerId(null);
    }, 400);
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
        label: ticket?.ticketNo
      });
      setMarkers([...markers, saved]);
      setNewMarkerPos(null);
      setSelectedTicketId('');
      setIsPinMode(false);
    } catch (err) {
      alert("Failed to save marker.");
    }
  };

  const deleteMarker = async (id: string, e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Remove this marker?")) return;
    try {
      await apiService.deletePrintMarker(id);
      setMarkers(prev => prev.filter(m => m.id !== id));
      setHoveredMarkerId(null);
      setSelectedMarkerId('');
    } catch (err) {
      alert("Delete failed.");
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950/90 z-[200] flex flex-col items-center justify-center text-white p-10">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Loading Site Blueprint...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/98 z-[200] flex flex-col animate-in fade-in duration-300 overflow-hidden touch-none">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between z-50 bg-slate-950/80 backdrop-blur-md">
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Job #{job.jobNumber} Assets Map</h2>
          <p className="text-[9px] font-black text-brand uppercase tracking-widest mt-0.5">Navigation & Markup Engine</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          >
            {isUploading ? 'Uploading...' : 'Replace Print'}
          </button>
          <button onClick={onClose} className="p-2 sm:p-3 bg-white/10 rounded-2xl text-white hover:bg-rose-500 transition-all active:scale-95">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div 
        ref={viewportRef}
        className={`flex-1 overflow-auto bg-slate-900/50 relative transition-all ${isPinMode ? 'cursor-crosshair' : 'cursor-default'}`}
        onWheel={handleWheel}
      >
        {print ? (
          <div 
            ref={contentRef}
            onClick={handleContentClick}
            className="absolute shadow-2xl bg-white origin-top-left will-change-transform"
            style={{ 
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: '1200px', 
              height: isPdf(print.url) ? '3600px' : '800px',
            }}
          >
            {isPdf(print.url) ? (
              <div className="absolute inset-0">
                <iframe 
                  src={`${print.url}#toolbar=1&view=FitH`} 
                  className="w-full h-full border-none bg-white opacity-100 pointer-events-auto" 
                />
              </div>
            ) : (
              <img src={print.url} className="w-full h-full object-contain block pointer-events-none" alt="Job Blueprint" />
            )}
            
            {/* Markers */}
            {markers.map(m => {
              const ticket = tickets.find(t => t.id === m.ticketId);
              const status = ticket ? getTicketStatus(ticket) : TicketStatus.OTHER;
              const colorClass = getStatusDotColor(status);
              const isShown = (hoveredMarkerId === m.id || selectedMarkerId === m.id);

              return (
                <div 
                  key={m.id}
                  className="absolute group/marker z-10"
                  style={{ 
                    left: `${m.xPercent}%`, 
                    top: `${m.yPercent}%`,
                    transform: 'translate(-50%, -50%)' 
                  }}
                  onMouseEnter={() => handleMarkerEnter(m.id)}
                  onMouseLeave={handleMarkerLeave}
                >
                  <div 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedMarkerId(selectedMarkerId === m.id ? '' : m.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`w-6 h-6 rounded-full border-2 border-white shadow-lg cursor-pointer flex items-center justify-center transition-all hover:scale-125 ${colorClass} ${selectedMarkerId === m.id ? 'ring-4 ring-white' : ''}`}
                  >
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  </div>
                  
                  {/* Tooltip */}
                  {isShown && (
                    <div 
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-auto"
                      style={{ transform: `scale(${1/transform.scale})`, transformOrigin: 'bottom center' }}
                      onMouseEnter={() => tooltipTimeoutRef.current && window.clearTimeout(tooltipTimeoutRef.current)}
                      onMouseLeave={handleMarkerLeave}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                       <div className={`p-4 rounded-xl border border-white/10 shadow-2xl min-w-[200px] backdrop-blur-md ${isDarkMode ? 'bg-slate-900/95 text-white' : 'bg-white/95 text-slate-900'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-[10px] font-black uppercase tracking-widest">TKT: {m.label}</p>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedMarkerId(''); }} className="opacity-40 hover:opacity-100 transition-opacity">
                               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <p className={`text-[8px] font-bold uppercase tracking-tighter truncate mb-3 opacity-60`}>{ticket?.street}</p>
                          <div className="flex gap-2">
                            <button 
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); ticket?.documentUrl && onViewTicket(ticket.documentUrl); }}
                              className="flex-1 py-1.5 bg-brand text-slate-900 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all active:scale-95"
                            >
                              View PDF
                            </button>
                            <button 
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => deleteMarker(m.id, e)} 
                              className="px-2 py-1.5 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
                            >
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Placement indicator */}
            {newMarkerPos && (
               <div 
                className="absolute z-10 w-6 h-6 rounded-full bg-brand border-2 border-white -translate-x-1/2 -translate-y-1/2 animate-pulse"
                style={{ left: `${newMarkerPos.x}%`, top: `${newMarkerPos.y}%` }}
               />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto mt-20">
            <div className="w-24 h-24 bg-white/5 rounded-[3rem] border-2 border-dashed border-white/10 flex items-center justify-center mb-8 mx-auto">
              <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">No Project Print</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 mb-8 leading-relaxed">Upload a job blueprint image or PDF to start pinning your locate assets onto the site map.</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-10 py-4 bg-brand text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-brand/20 hover:scale-105 active:scale-95 transition-all">Upload Blueprint</button>
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-4 w-full max-w-md px-4 pointer-events-none">
        {/* Ticket Link Picker */}
        {newMarkerPos && (
          <div className="bg-slate-950/95 border border-white/10 p-5 rounded-3xl shadow-2xl w-full animate-in slide-in-from-bottom-4 pointer-events-auto">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Link Ticket to Pin</h4>
              <button onClick={() => setNewMarkerPos(null)} className="text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors">Close</button>
            </div>
            <select 
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-4 text-xs font-bold text-white mb-4 outline-none focus:border-brand"
              value={selectedTicketId}
              onChange={(e) => setSelectedTicketId(e.target.value)}
            >
              <option value="">Select Asset...</option>
              {tickets.filter(t => !t.isArchived).map(t => (
                <option key={t.id} value={t.id}>{t.ticketNo} - {t.street.substring(0, 15)}...</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button 
                onClick={saveMarker} 
                disabled={!selectedTicketId}
                className="flex-1 bg-brand text-slate-900 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
              >
                Save Pin
              </button>
              <button onClick={() => setNewMarkerPos(null)} className="flex-1 bg-white/5 text-slate-400 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white">Cancel</button>
            </div>
          </div>
        )}

        {/* Floating Controls */}
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-xl border border-white/10 p-2 rounded-3xl shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-1 border-r border-white/5 pr-2 mr-1">
             <button onClick={zoomIn} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
             </button>
             <button onClick={zoomOut} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4" /></svg>
             </button>
             <button onClick={resetZoom} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all" title="Reset & Recenter">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" /></svg>
             </button>
          </div>
          
          <button 
            onClick={() => { setIsPinMode(!isPinMode); setNewMarkerPos(null); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isPinMode ? 'bg-brand text-slate-900 shadow-lg shadow-brand/20' : 'bg-white/5 text-slate-400 hover:text-white'}`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            {isPinMode ? 'Exit Pin' : 'Pin Drop'}
          </button>
        </div>
        
        {isPinMode && !newMarkerPos && (
          <div className="bg-brand text-slate-900 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest animate-bounce">
            Tap map to drop pin
          </div>
        )}
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
    </div>
  );
};
