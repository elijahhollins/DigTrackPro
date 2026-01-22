
import React, { useState, useEffect, useRef } from 'react';
import { DigTicket } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { parseTicketData } from '../services/geminiService.ts';

interface IngestionItem {
  id: string;
  file: File;
  status: 'pending' | 'analyzing' | 'uploading' | 'ready' | 'error' | 'duplicate';
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
 * TicketForm Component
 * Handles adding and editing 811 locate tickets.
 * Includes batch AI-powered data extraction and intelligent duplicate prevention.
 */
export const TicketForm: React.FC<TicketFormProps> = ({ onSave, onClose, initialData, isDarkMode, existingTickets }) => {
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', street: '', crossStreet: '', place: '', extent: '', county: '', city: '', state: '', callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: '',
  });
  
  const [queue, setQueue] = useState<IngestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }
  }, [initialData]);

  useEffect(() => {
    const activeItem = queue[activeIndex];
    if (activeItem?.status === 'ready' && activeItem.extractedData) {
      setFormData({
        ...activeItem.extractedData,
        documentUrl: activeItem.documentUrl || '',
      });
    }
  }, [activeIndex, queue]);

  const processFile = async (id: string, file: File) => {
    try {
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'analyzing' } : item));

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      const extracted = await parseTicketData({ data: base64Data, mimeType: file.type });

      // Proactive Duplicate Check
      if (existingTickets) {
        const matched = existingTickets.find(t => 
          !t.isArchived &&
          t.ticketNo.trim().toUpperCase() === extracted.ticketNo?.trim().toUpperCase() &&
          t.jobNumber.trim().toUpperCase() === extracted.jobNumber?.trim().toUpperCase() &&
          normalizeDateStr(t.workDate) === normalizeDateStr(extracted.workDate) &&
          normalizeDateStr(t.expires) === normalizeDateStr(extracted.expires)
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
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: err.message } : item));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: IngestionItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending'
    }));

    setQueue(prev => [...prev, ...newItems]);
    newItems.forEach(item => processFile(item.id, item.file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const moveToNext = () => {
    const nextIndex = activeIndex + 1;
    if (nextIndex < queue.length) {
      setActiveIndex(nextIndex);
      const nextItem = queue[nextIndex];
      if (nextItem.status === 'ready') {
        setFormData({
          ...nextItem.extractedData,
          documentUrl: nextItem.documentUrl || '',
        });
      } else {
        setFormData({
          jobNumber: '', ticketNo: '', street: '', crossStreet: '', place: '', extent: '', county: '', city: '', state: '', callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: '',
        });
      }
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
    moveToNext();
  };

  const removeFromQueue = (index: number) => {
    const nextQueue = queue.filter((_, i) => i !== index);
    setQueue(nextQueue);
    if (nextQueue.length === 0) {
      onClose();
    } else if (activeIndex >= index) {
      setActiveIndex(prev => Math.max(0, prev - 1));
    }
  };

  const discardAllDuplicates = () => {
    const nextQueue = queue.filter(item => item.status !== 'duplicate');
    setQueue(nextQueue);
    if (nextQueue.length === 0) {
      onClose();
    } else {
      setActiveIndex(0);
    }
  };

  const currentItem = queue[activeIndex];
  const isBulk = queue.length > 1;
  const hasDuplicates = queue.some(item => item.status === 'duplicate');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        
        {isBulk && (
          <div className="px-6 py-4 bg-black/10 border-b border-white/5 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-3">
              {queue.map((item, idx) => (
                <div 
                  key={item.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                    idx === activeIndex 
                      ? 'bg-brand text-slate-900 ring-4 ring-brand/20 scale-110 z-10' 
                      : isDarkMode ? 'bg-white/5 text-slate-500' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {item.status === 'analyzing' || item.status === 'uploading' ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : item.status === 'ready' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  ) : item.status === 'duplicate' ? (
                    <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  ) : item.status === 'error' ? (
                    <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <span className="text-[10px] font-black">{idx + 1}</span>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {hasDuplicates && (
              <button 
                onClick={discardAllDuplicates}
                className="px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all whitespace-nowrap"
              >
                Clear Duplicates
              </button>
            )}
          </div>
        )}

        <div className="px-8 py-5 border-b flex justify-between items-center">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">
              {initialData ? 'Update Archive' : isBulk ? `Batch Review: ${activeIndex + 1}/${queue.length}` : 'New Ticket Ingestion'}
            </h2>
            {currentItem && (
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[200px]">
                {currentItem.status === 'duplicate' ? 'Redundant Asset Detected' : `File: ${currentItem.file.name}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {currentItem?.status === 'analyzing' || currentItem?.status === 'uploading' ? (
          <div className="p-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 border-4 border-brand border-t-transparent rounded-full animate-spin mb-6" />
            <h3 className="text-sm font-black uppercase tracking-widest">{currentItem.status === 'analyzing' ? 'Decoding Assets...' : 'Syncing to Job Folder...'}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-2">Gemini AI is scanning the document for locate data</p>
          </div>
        ) : currentItem?.status === 'duplicate' ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-[2rem] flex items-center justify-center mb-6 border-2 border-amber-500/20 shadow-xl shadow-amber-500/5">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-amber-500">Duplicate Blocked</h3>
            <div className={`mt-4 p-4 rounded-2xl border ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'} space-y-1`}>
               <p className="text-[10px] font-black uppercase text-slate-500">Already in Vault</p>
               <p className="text-xs font-bold font-mono">#{currentItem.extractedData?.ticketNo || currentItem.matchedTicket?.ticketNo}</p>
               <p className="text-[9px] font-bold opacity-60">Job: {currentItem.extractedData?.jobNumber || currentItem.matchedTicket?.jobNumber}</p>
            </div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-4 max-w-[240px]">This ticket matches an existing record with the same job number, ticket number, and work/expiry dates.</p>
            <div className="flex gap-2 mt-8 w-full">
               <button onClick={() => removeFromQueue(activeIndex)} className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all">Discard Duplicate</button>
               {isBulk && <button onClick={() => moveToNext()} className="flex-1 py-4 bg-white/5 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 hover:text-white transition-all">Skip for Now</button>}
            </div>
          </div>
        ) : currentItem?.status === 'error' ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 bg-rose-500/10 text-rose-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-rose-500">Analysis Failed</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mt-2 max-w-xs">{currentItem.error || 'The document structure was not recognized by the AI.'}</p>
            <div className="flex gap-2 mt-6">
               <button onClick={() => processFile(currentItem.id, currentItem.file)} className="px-6 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase">Retry Process</button>
               <button onClick={() => removeFromQueue(activeIndex)} className="px-6 py-2 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase">Discard Item</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Project Reference</label>
                <input required className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. JOB #001" />
              </div>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Locate Ticket</label>
                <input required className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} placeholder="TKT #..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Street</label>
                <input required className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Cross Street</label>
                <input className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.crossStreet} onChange={e => setFormData({...formData, crossStreet: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>City</label>
                <input className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>County</label>
                <input className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.county} onChange={e => setFormData({...formData, county: e.target.value})} />
              </div>
            </div>

            <div className="space-y-1">
              <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Dig Extent / Work Description</label>
              <textarea rows={3} className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.extent} onChange={e => setFormData({...formData, extent: e.target.value})} placeholder="Area description..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Start Date</label>
                <input type="date" required className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.workDate} onChange={e => setFormData({...formData, workDate: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Expiration</label>
                <input type="date" required className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'}`} value={formData.expires} onChange={e => setFormData({...formData, expires: e.target.value})} />
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <button type="submit" className="w-full bg-brand text-[#0f172a] py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand/20 transition-all hover:scale-[1.01] active:scale-95">
                {isBulk ? `Finalize & Next Ticket (${activeIndex + 1}/${queue.length})` : initialData ? 'Update Archive Entry' : 'Inject Ticket into Vault'}
              </button>
            </div>
          </form>
        )}
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/*" multiple onChange={handleFileUpload} />
    </div>
  );
};

export default TicketForm;
