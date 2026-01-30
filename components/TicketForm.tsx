
import React, { useState, useEffect, useRef } from 'react';
import { DigTicket } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { parseTicketData } from '../services/geminiService.ts';
import { getEnv } from '../lib/supabaseClient.ts';

interface IngestionItem {
  id: string;
  file: File;
  status: 'pending' | 'analyzing' | 'uploading' | 'ready' | 'error' | 'duplicate' | 'saved';
  extractedData?: any;
  documentUrl?: string;
  error?: string;
  matchedTicket?: DigTicket;
}

interface TicketFormProps {
  onSave: (data: Omit<DigTicket, 'id' | 'createdAt'>, archiveOld?: boolean) => Promise<void>;
  onClose: () => void;
  initialData?: DigTicket | null;
  isDarkMode?: boolean;
  existingTickets?: DigTicket[];
}

/**
 * Normalizes YYYY-MM-DD or YYYY/MM/DD into a stable comparable format
 */
const normalizeDateStr = (date: string) => {
  if (!date) return "";
  return date.replace(/\//g, '-').split('-').map(s => s.trim().padStart(2, '0')).join('-');
};

/**
 * Robust helper to get mime type, especially for mobile browsers that might report empty type
 */
const getSafeMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default: return 'application/octet-stream';
  }
};

/**
 * TicketForm Component
 * Supports both standard manual entry and advanced AI-powered batch ingestion.
 */
export const TicketForm: React.FC<TicketFormProps> = ({ onSave, onClose, initialData, isDarkMode, existingTickets }) => {
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(() => {
    const key = getEnv('API_KEY');
    return !!(key && key.length > 10);
  });
  
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', street: '', crossStreet: '', place: '', extent: '', county: '', city: '', state: '', callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: '',
  });
  
  const [queue, setQueue] = useState<IngestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data for single-edit mode
  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber,
        ticketNo: initialData.ticketNo,
        street: initialData.street,
        crossStreet: initialData.crossStreet || '',
        place: initialData.place || '',
        extent: initialData.extent || '',
        county: initialData.county,
        city: initialData.city,
        state: initialData.state,
        callInDate: initialData.callInDate,
        workDate: initialData.workDate,
        expires: initialData.expires,
        siteContact: initialData.siteContact,
        documentUrl: initialData.documentUrl || '',
      });
      setIsBatchMode(false);
    }
  }, [initialData]);

  // Sync form with currently selected queue item in batch mode
  useEffect(() => {
    if (isBatchMode) {
      const activeItem = queue[activeIndex];
      if (activeItem?.status === 'ready' && activeItem.extractedData) {
        setFormData({
          jobNumber: activeItem.extractedData.jobNumber || '',
          ticketNo: activeItem.extractedData.ticketNo || '',
          street: activeItem.extractedData.street || '',
          crossStreet: activeItem.extractedData.crossStreet || '',
          place: activeItem.extractedData.place || '',
          extent: activeItem.extractedData.extent || '',
          county: activeItem.extractedData.county || '',
          city: activeItem.extractedData.city || '',
          state: activeItem.extractedData.state || '',
          callInDate: activeItem.extractedData.callInDate || '',
          workDate: activeItem.extractedData.workDate || '',
          expires: activeItem.extractedData.expires || '',
          siteContact: activeItem.extractedData.siteContact || '',
          documentUrl: activeItem.documentUrl || '',
        });
      }
    }
  }, [activeIndex, queue, isBatchMode]);

  const handleOpenSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      // Brief delay and potential reload to ensure process.env is refreshed
      setTimeout(() => window.location.reload(), 150);
    }
  };

  /**
   * Background Task: Process a single file
   */
  const processFile = async (id: string, file: File) => {
    try {
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'analyzing' } : item));

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsDataURL(file);
      });
      
      const base64Data = await base64Promise;
      const mimeType = getSafeMimeType(file);

      const extracted = await parseTicketData({ data: base64Data, mimeType });

      if (existingTickets && extracted.ticketNo) {
        const matched = existingTickets.find(t => 
          !t.isArchived &&
          t.ticketNo.trim().toUpperCase() === (extracted.ticketNo || "").trim().toUpperCase() &&
          t.jobNumber.trim().toUpperCase() === (extracted.jobNumber || "").trim().toUpperCase() &&
          normalizeDateStr(t.workDate) === normalizeDateStr(extracted.workDate)
        );

        if (matched) {
          setQueue(prev => prev.map(item => item.id === id ? { 
            ...item, 
            status: 'duplicate', 
            matchedTicket: matched,
            extractedData: extracted 
          } : item));
          return;
        }
      }

      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'uploading' } : item));
      const targetJobNumber = extracted.jobNumber || 'unassigned';
      const publicUrl = await apiService.addTicketFile(targetJobNumber, file);

      setQueue(prev => prev.map(item => item.id === id ? { 
        ...item, 
        status: 'ready', 
        extractedData: extracted, 
        documentUrl: publicUrl 
      } : item));

    } catch (err: any) {
      console.error("Process error:", err);
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: err.message } : item));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: File[] = [];
    if ('files' in e.target && e.target.files) {
      files = Array.from(e.target.files);
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      files = Array.from(e.dataTransfer.files);
    }

    if (files.length === 0) return;

    // Switch to batch mode if not already
    if (!isBatchMode) setIsBatchMode(true);

    const newItems: IngestionItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'pending'
    }));

    setQueue(prev => [...prev, ...newItems]);
    newItems.forEach(item => processFile(item.id, item.file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const moveToNext = () => {
    const nextUnsaved = queue.findIndex((item, idx) => idx > activeIndex && item.status !== 'saved');
    if (nextUnsaved !== -1) {
      setActiveIndex(nextUnsaved);
    } else {
      const priorUnsaved = queue.findIndex((item) => item.status !== 'saved' && (item.status === 'ready' || item.status === 'duplicate' || item.status === 'error'));
      if (priorUnsaved !== -1) {
        setActiveIndex(priorUnsaved);
      } else {
        const allDone = queue.every(i => i.status === 'saved');
        if (allDone) onClose();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBatchMode) {
      const currentId = queue[activeIndex]?.id;
      await onSave(formData);
      if (currentId) {
        setQueue(prev => prev.map(item => item.id === currentId ? { ...item, status: 'saved' } : item));
      }
      moveToNext();
    } else {
      setIsSubmittingManual(true);
      try {
        await onSave(formData);
        onClose();
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsSubmittingManual(false);
      }
    }
  };

  const removeFromQueue = (index: number) => {
    const nextQueue = queue.filter((_, i) => i !== index);
    if (nextQueue.length === 0) {
      setIsBatchMode(false);
      setQueue([]);
    } else {
      setQueue(nextQueue);
      if (activeIndex >= index) {
        setActiveIndex(prev => Math.max(0, prev - 1));
      }
    }
  };

  const currentItem = queue[activeIndex];
  const processingCount = queue.filter(i => i.status === 'analyzing' || i.status === 'uploading' || i.status === 'pending').length;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e as any); }}
        className={`w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border transition-all duration-300 ${isDragging ? 'scale-105 ring-4 ring-brand/50' : ''} ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}
      >
        
        {/* HEADER AREA */}
        <div className="px-10 py-6 border-b flex justify-between items-center bg-black/5">
          <div className="flex-1">
            <h2 className="text-base font-black uppercase tracking-[0.2em] text-brand">
              {initialData ? 'Update Record' : isBatchMode ? 'Review & Confirm' : 'Ticket Entry'}
            </h2>
            
            {/* MODE SELECTOR */}
            {!initialData && (
              <div className="flex gap-4 mt-2">
                <button 
                  onClick={() => setIsBatchMode(false)}
                  className={`text-[9px] font-black uppercase tracking-widest transition-colors ${!isBatchMode ? 'text-brand underline underline-offset-4' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  Manual Entry
                </button>
                <button 
                  onClick={() => {
                    setIsBatchMode(true);
                    if (queue.length === 0) fileInputRef.current?.click();
                  }}
                  className={`text-[9px] font-black uppercase tracking-widest transition-colors ${isBatchMode ? 'text-brand underline underline-offset-4' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  AI Batch Scan
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
             {isBatchMode && processingCount > 0 && (
               <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-brand/10 rounded-full border border-brand/20">
                 <div className="w-2 h-2 bg-brand rounded-full animate-ping" />
                 <span className="text-[8px] font-black uppercase tracking-widest text-brand">{processingCount} Processing</span>
               </div>
             )}
             <button onClick={onClose} className="p-3 bg-black/10 rounded-2xl opacity-50 hover:opacity-100 transition-all">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>
        </div>

        {/* BATCH STATUS STRIP */}
        {isBatchMode && queue.length > 0 && (
          <div className="px-10 py-4 bg-black/20 border-b border-white/5 flex items-center gap-3 overflow-x-auto no-scrollbar">
            {queue.map((item, idx) => (
              <div 
                key={item.id}
                onClick={() => setActiveIndex(idx)}
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer group relative ${
                  idx === activeIndex 
                    ? 'bg-brand text-slate-900 ring-2 ring-brand/50 scale-110' 
                    : item.status === 'saved'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 opacity-60'
                      : item.status === 'error'
                        ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        : isDarkMode ? 'bg-white/5 text-slate-500' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {item.status === 'analyzing' || item.status === 'uploading' ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : item.status === 'saved' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                ) : item.status === 'error' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                ) : (
                  <span className="text-[9px] font-black">{idx + 1}</span>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6" /></svg>
                </button>
              </div>
            ))}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={`flex-shrink-0 w-10 h-10 rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${isDarkMode ? 'border-white/10 text-slate-500 hover:border-brand hover:text-brand' : 'border-slate-200 text-slate-400 hover:border-brand hover:text-brand'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
          {isBatchMode && queue.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="p-24 flex flex-col items-center justify-center text-center cursor-pointer group"
            >
              <div className="w-24 h-24 bg-brand/5 border-2 border-dashed border-brand/20 rounded-[3rem] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                <svg className="w-12 h-12 text-brand/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-lg font-black uppercase tracking-[0.1em]">AI Batch Processing</h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-3 max-w-xs leading-relaxed">
                Drag & drop PDFs here. Gemini AI will handle the extraction while you review and confirm each record.
              </p>
              {!hasApiKey && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleOpenSelectKey(); }}
                  className="mt-10 px-8 py-4 bg-brand text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand/20 animate-pulse active:scale-95"
                >
                  ⚠️ Connect AI Service to Begin
                </button>
              )}
            </div>
          ) : isBatchMode && (currentItem?.status === 'analyzing' || currentItem?.status === 'uploading') ? (
            <div className="p-32 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 border-4 border-brand border-t-transparent rounded-full animate-spin mb-8" />
              <h3 className="text-base font-black uppercase tracking-widest">AI Document Scan</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 animate-pulse">Processing {currentItem.file.name}...</p>
            </div>
          ) : isBatchMode && currentItem?.status === 'error' ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-rose-500/10 text-rose-500 rounded-[3rem] flex items-center justify-center mb-8 border-2 border-rose-500/20 shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-lg font-black uppercase tracking-widest text-rose-500">Scan Failed</h3>
              <p className="text-xs font-bold text-slate-400 mt-2">{currentItem.error}</p>
              
              {currentItem.error?.toLowerCase().includes('api key') && (
                 <button 
                   onClick={handleOpenSelectKey}
                   className="mt-6 px-8 py-3 bg-brand text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95"
                 >
                   Reconnect AI Service
                 </button>
              )}

              <div className="flex gap-3 mt-10 w-full max-w-sm">
                 <button onClick={() => removeFromQueue(activeIndex)} className="flex-1 py-5 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Discard</button>
                 <button onClick={moveToNext} className="flex-1 py-5 bg-white/5 text-slate-500 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest">Retry Next</button>
              </div>
            </div>
          ) : isBatchMode && currentItem?.status === 'saved' ? (
            <div className="p-32 flex flex-col items-center justify-center text-center">
               <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-[3rem] flex items-center justify-center mb-8 border-2 border-emerald-500/20 shadow-xl">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
               </div>
               <h3 className="text-lg font-black uppercase tracking-widest text-emerald-500">Record Saved</h3>
               <button onClick={moveToNext} className="mt-8 px-10 py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95">Review Next</button>
            </div>
          ) : isBatchMode && currentItem?.status === 'duplicate' ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-amber-500/10 text-amber-500 rounded-[3rem] flex items-center justify-center mb-8 border-2 border-amber-500/20 shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-lg font-black uppercase tracking-widest text-amber-500">Duplicate Blocked</h3>
              <div className={`mt-6 p-6 rounded-[2rem] border text-left w-full max-w-sm mx-auto ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                 <p className="text-sm font-black font-mono">TKT: {currentItem.extractedData?.ticketNo || currentItem.matchedTicket?.ticketNo}</p>
                 <p className="text-[11px] font-bold mt-1">Found in Project: {currentItem.extractedData?.jobNumber || currentItem.matchedTicket?.jobNumber}</p>
              </div>
              <div className="flex gap-3 mt-10 w-full max-w-sm">
                 <button onClick={() => removeFromQueue(activeIndex)} className="flex-1 py-5 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Discard</button>
                 <button onClick={moveToNext} className="flex-1 py-5 bg-white/5 text-slate-500 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest">Skip</button>
              </div>
            </div>
          ) : (
            /* MAIN FORM (Used for both Manual and Batch Review) */
            <form onSubmit={handleSubmit} className="p-10 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Job Reference</label>
                  <input required className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. 25-001" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Locate Ticket #</label>
                  <input required className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Primary Street</label>
                  <input required className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Cross Street</label>
                  <input className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.crossStreet} onChange={e => setFormData({...formData, crossStreet: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">City</label>
                  <input className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">ST</label>
                  <input maxLength={2} className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold text-center uppercase outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">County</label>
                  <input className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.county} onChange={e => setFormData({...formData, county: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Work Start Date</label>
                  <input type="date" required className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.workDate} onChange={e => setFormData({...formData, workDate: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Expires Date</label>
                  <input type="date" required className={`w-full px-5 py-4 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.expires} onChange={e => setFormData({...formData, expires: e.target.value})} />
                </div>
              </div>

              <div className="pt-6">
                <button 
                  type="submit" 
                  disabled={isSubmittingManual}
                  className="w-full bg-brand text-slate-900 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-brand/20 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3"
                >
                  {isSubmittingManual ? (
                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  )}
                  {initialData ? 'Commit Record Changes' : isBatchMode ? 'Confirm & Sync Vault' : 'Finalize Ticket Entry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/*" multiple onChange={handleFileUpload} />
    </div>
  );
};

export default TicketForm;
