
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
  
  // Placement State
  const [newMarkerPos, setNewMarkerPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPdf = (url?: string) => url?.toLowerCase().split('?')[0].endsWith('.pdf');

  useEffect(() => {
    loadData();
  }, [job.jobNumber]);

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

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !print) return;
    
    // Calculate click % relative to the container
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setNewMarkerPos({ x, y });
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
    } catch (err) {
      alert("Failed to save marker.");
    }
  };

  const deleteMarker = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove this marker?")) return;
    try {
      await apiService.deletePrintMarker(id);
      setMarkers(markers.filter(m => m.id !== id));
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
    <div className="fixed inset-0 bg-slate-950/98 z-[200] flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Job #{job.jobNumber} Blueprint Markup</h2>
          <p className="text-[9px] font-black text-brand uppercase tracking-widest mt-0.5">Place & Track Ticket Assets Graphically</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          >
            {isUploading ? 'Uploading...' : 'Replace Print'}
          </button>
          <button onClick={onClose} className="p-3 bg-white/10 rounded-2xl text-white hover:bg-rose-500 transition-all active:scale-95">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Main Print Area */}
      <div className="flex-1 overflow-auto bg-slate-900/50 p-10 flex items-center justify-center">
        {print ? (
          <div 
            ref={containerRef}
            onClick={handleContainerClick}
            className="relative shadow-2xl rounded-sm border border-white/10 cursor-crosshair group bg-white overflow-hidden"
            style={{ minWidth: '800px', maxWidth: '100%', aspectRatio: 'auto' }}
          >
            {isPdf(print.url) ? (
              <div className="relative w-full h-full">
                <iframe src={print.url} className="w-full min-h-[70vh] border-none" />
                {/* Click interceptor overlay for PDFs since iframe content handles its own events */}
                <div className="absolute inset-0 z-0 bg-transparent" />
              </div>
            ) : (
              <img src={print.url} className="w-full h-auto block" alt="Job Blueprint" />
            )}
            
            {/* Markers */}
            {markers.map(m => {
              const ticket = tickets.find(t => t.id === m.ticketId);
              const status = ticket ? getTicketStatus(ticket) : TicketStatus.OTHER;
              const colorClass = getStatusDotColor(status);

              return (
                <div 
                  key={m.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group/marker z-10"
                  style={{ left: `${m.xPercent}%`, top: `${m.yPercent}%` }}
                >
                  <div 
                    onClick={(e) => { e.stopPropagation(); ticket?.documentUrl && onViewTicket(ticket.documentUrl); }}
                    className={`w-6 h-6 rounded-full border-2 border-white shadow-lg cursor-pointer flex items-center justify-center transition-all hover:scale-125 ${colorClass}`}
                  >
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/marker:block z-20 pointer-events-none">
                     <div className="bg-slate-950/90 text-white p-3 rounded-xl border border-white/10 shadow-2xl min-w-[140px]">
                        <p className="text-[10px] font-black uppercase mb-1">TKT: {m.label}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter truncate">{ticket?.street}</p>
                        <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                          <span className="text-[8px] font-black uppercase text-brand">View PDF</span>
                          <button onClick={(e) => deleteMarker(m.id, e as any)} className="pointer-events-auto text-rose-500 hover:text-rose-400">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                     </div>
                  </div>
                </div>
              );
            })}

            {/* Placement Tooltip */}
            {newMarkerPos && (
               <div 
                className="absolute z-40 bg-slate-950/95 border border-white/10 p-5 rounded-3xl shadow-2xl w-64 -translate-x-1/2 -translate-y-[110%]"
                style={{ left: `${newMarkerPos.x}%`, top: `${newMarkerPos.y}%` }}
                onClick={(e) => e.stopPropagation()}
               >
                 <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Link Ticket to Pin</h4>
                 <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold text-white mb-4 outline-none focus:border-brand"
                    value={selectedTicketId}
                    onChange={(e) => setSelectedTicketId(e.target.value)}
                 >
                   <option value="">Select Asset...</option>
                   {tickets.filter(t => !t.isArchived).map(t => (
                     <option key={t.id} value={t.id}>{t.ticketNo} - {t.street.substring(0, 15)}...</option>
                   ))}
                 </select>
                 <div className="flex gap-2">
                   <button onClick={saveMarker} className="flex-1 bg-brand text-slate-900 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all">Save Pin</button>
                   <button onClick={() => setNewMarkerPos(null)} className="flex-1 bg-white/5 text-slate-400 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white">Cancel</button>
                 </div>
               </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center max-w-sm">
            <div className="w-24 h-24 bg-white/5 rounded-[3rem] border-2 border-dashed border-white/10 flex items-center justify-center mb-8">
              <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">No Project Print</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 mb-8 leading-relaxed">Upload a job blueprint image or PDF to start pinning your locate assets onto the site map.</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-10 py-4 bg-brand text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-brand/20 hover:scale-105 active:scale-95 transition-all">Upload Blueprint</button>
          </div>
        )}
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
    </div>
  );
};
