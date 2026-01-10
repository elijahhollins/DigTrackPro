
import React, { useState, useEffect, useRef } from 'react';
import { DigTicket, UserRecord } from '../types.ts';
import { parseTicketData } from '../services/geminiService.ts';
import { apiService } from '../services/apiService.ts';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>, archiveOld: boolean) => Promise<void>;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
  isDarkMode?: boolean;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], isDarkMode }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch' | 'pdf'>('manual');
  const [archiveOld, setArchiveOld] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', address: '', county: '', city: '', state: '',
    callInDate: '', digStart: '', expirationDate: '', siteContact: '',
  });

  const [batchInput, setBatchInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber || '',
        ticketNo: initialData.ticketNo || '',
        address: initialData.address || '',
        county: initialData.county || '',
        city: initialData.city || '',
        state: initialData.state || '',
        callInDate: initialData.callInDate || '',
        digStart: initialData.digStart || '',
        expirationDate: initialData.expirationDate || '',
        siteContact: initialData.siteContact || '',
      });
      setArchiveOld(true);
    }
  }, [initialData]);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Accept PDF and common image types
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      alert("Please upload a PDF or Image of the ticket.");
      return;
    }

    setIsParsing(true);
    try {
      console.log(`Starting AI extraction for ${file.name} (${file.type})...`);
      const base64Data = await blobToBase64(file);
      
      const parsed = await parseTicketData({
        data: base64Data,
        mimeType: file.type
      });
      
      if (!parsed || Object.keys(parsed).length === 0) {
        throw new Error("AI returned empty results for this document.");
      }

      const newFormData = { 
        ...formData, 
        ...parsed,
        // Ensure values are strings and not null
        jobNumber: parsed.jobNumber || formData.jobNumber,
        ticketNo: parsed.ticketNo || formData.ticketNo,
        address: parsed.address || formData.address,
      };
      setFormData(newFormData);

      const finalJobNumber = newFormData.jobNumber;
      if (finalJobNumber) {
        console.log(`Saving ticket file to Job #${finalJobNumber}...`);
        await apiService.addTicketFile(finalJobNumber, file);
      }

      setActiveTab('manual');
    } catch (err: any) {
      console.error("AI Analysis failed:", err);
      alert(`AI Analysis failed: ${err.message || 'Check document clarity and try again.'}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    try {
      const parsed = await parseTicketData(batchInput);
      setFormData(prev => ({ ...prev, ...parsed }));
      setActiveTab('manual');
    } catch (err: any) {
      alert("AI Analysis failed. Please check the text format.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData, archiveOld);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[150] flex justify-center items-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5">
          <h2 className="text-sm font-black uppercase tracking-widest">
            {initialData ? 'Update Ticket' : 'Import Ticket'}
          </h2>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!initialData && (
          <div className="flex p-1.5 gap-1 bg-black/5 mx-6 mt-4 rounded-xl">
            {['manual', 'batch', 'pdf'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab ? 'bg-brand text-slate-900 shadow-sm' : 'text-slate-500'}`}>{tab}</button>
            ))}
          </div>
        )}

        <div className="p-6">
          {activeTab === 'manual' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Job #</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Ticket #</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Address / Location</label>
                <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Start Date</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Expiration</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
              </div>

              {initialData && (
                <div className="flex items-center gap-2 p-3 bg-black/5 rounded-xl border border-white/5">
                  <input
                    type="checkbox"
                    id="archiveOld"
                    className="w-4 h-4 rounded text-brand focus:ring-brand/20"
                    checked={archiveOld}
                    onChange={e => setArchiveOld(e.target.checked)}
                  />
                  <label htmlFor="archiveOld" className="text-[10px] font-black uppercase text-slate-400 cursor-pointer">
                    Keep previous version as history
                  </label>
                </div>
              )}

              <button type="submit" className="w-full bg-brand text-[#0f172a] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 mt-2 transition-all hover:scale-[1.01]">Save Ticket</button>
            </form>
          ) : activeTab === 'batch' ? (
            <div className="space-y-4">
              <textarea rows={8} className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} placeholder="Paste ticket text here for AI extraction..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <button onClick={handleAiParse} disabled={isParsing || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 flex items-center justify-center gap-2">
                {isParsing ? <div className="w-3 h-3 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Run AI Analysis'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
               <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative h-[220px] rounded-[2rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 overflow-hidden group cursor-pointer ${
                  isDragging ? 'bg-brand/10 border-brand scale-[0.98]' : 'bg-black/5 border-slate-200 hover:border-brand/40'
                } ${isParsing ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <div className={`p-5 rounded-full transition-all ${isDragging ? 'bg-brand text-white scale-110' : 'bg-white/10 text-slate-400 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                  {isParsing ? (
                    <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11v6m3-3H9" /></svg>
                  )}
                </div>
                <div className="text-center px-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {isParsing ? 'AI Extracting Data...' : isDragging ? 'Release to Scan PDF' : 'Drop Ticket PDF or Click to Select'}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-60">
                    Supports PDFs and Scanned Images
                  </p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="application/pdf,image/*" 
                  onChange={(e) => handleFileUpload(e.target.files)} 
                />
              </div>
              <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                 <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <p className="text-[9px] font-bold text-blue-800 leading-tight">
                   Uploaded PDFs are automatically filed in the <span className="font-black uppercase tracking-tighter">Job/Tickets/</span> storage directory for permanent record.
                 </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
