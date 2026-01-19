
import React, { useState, useEffect, useRef } from 'react';
import { DigTicket, UserRecord, Job } from '../types.ts';
import { parseTicketData } from '../services/geminiService.ts';
import { apiService } from '../services/apiService.ts';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>, archiveOld: boolean) => Promise<void>;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
  jobs: Job[];
  isDarkMode?: boolean;
  onJobCreated?: (job: Job) => void;
  onProcessingChange?: (isProcessing: boolean) => void;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], jobs = [], isDarkMode, onJobCreated, onProcessingChange }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch' | 'pdf'>('manual');
  const [archiveOld, setArchiveOld] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', street: '', extent: '', county: '', city: '', state: '',
    callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: ''
  });

  const [batchInput, setBatchInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber || '',
        ticketNo: initialData.ticketNo || '',
        street: initialData.street || '',
        extent: initialData.extent || '',
        county: initialData.county || '',
        city: initialData.city || '',
        state: initialData.state || '',
        callInDate: initialData.callInDate || '',
        workDate: initialData.workDate || '',
        expires: initialData.expires || '',
        siteContact: initialData.siteContact || '',
        documentUrl: initialData.documentUrl || ''
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
    
    setIsParsing(true);
    onProcessingChange?.(true);
    setProgressPercent(0);
    const file = files[0]; // Plan: focused single-file review workflow

    try {
      // Step 1: Read binary for AI
      setScanStatus(`Reading ${file.name}...`);
      setProgressPercent(10);
      const base64Data = await blobToBase64(file);
      
      // Step 2: Upload to Vault (Ticket_Images bucket)
      setScanStatus(`Uploading to Secure Vault...`);
      setProgressPercent(30);
      // We need a job number for the path. We'll try to extract one from AI first, 
      // or use "PENDING" if we can't wait. 
      // Refined plan: AI parse first to get job number, then upload.
      
      // Step 3: AI Analysis
      setScanStatus(`AI Analyzing Ticket Data...`);
      setProgressPercent(50);
      const parsed = await parseTicketData({
        data: base64Data,
        mimeType: file.type
      }) as any;
      
      setProgressPercent(80);
      
      let targetJobNumber = (parsed && parsed.jobNumber) || 'UNASSIGNED';
      
      // Step 4: Final Archive Upload
      setScanStatus(`Archiving Original Document...`);
      const docUrl = await apiService.addTicketFile(targetJobNumber, file);
      
      // Step 5: Populate Form & Switch
      const cleanData = Object.fromEntries(
        Object.entries(parsed || {}).filter(([_, v]) => v !== null && v !== '')
      ) as any;

      setFormData(prev => ({ 
        ...prev, 
        ...cleanData, 
        documentUrl: docUrl,
        jobNumber: targetJobNumber
      }));

      setProgressPercent(100);
      setScanStatus("Data extracted. Please review and save.");
      
      // Give the user a moment to see the 100% then switch
      setTimeout(() => {
        setIsParsing(false);
        onProcessingChange?.(false);
        setActiveTab('manual');
      }, 800);

    } catch (err: any) {
      console.error(`Failed to process ${file.name}:`, err);
      setScanStatus(`Error: ${err.message}`);
      setIsParsing(false);
      onProcessingChange?.(false);
    }
  };

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    onProcessingChange?.(true);
    setProgressPercent(20);
    setScanStatus("Parsing text block...");
    try {
      const parsed = await parseTicketData(batchInput) as any;
      setProgressPercent(80);
      const cleanData = Object.fromEntries(
        Object.entries(parsed).filter(([_, v]) => v !== null && v !== '')
      );
      setFormData(prev => ({ ...prev, ...cleanData }));
      setProgressPercent(100);
      setTimeout(() => {
        setIsParsing(false);
        onProcessingChange?.(false);
        setActiveTab('manual');
      }, 500);
    } catch (err: any) {
      alert("Extraction failed: " + err.message);
      setIsParsing(false);
      onProcessingChange?.(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData, archiveOld);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[150] flex justify-center items-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5">
          <div className="flex flex-col">
            <h2 className={`text-sm font-black uppercase tracking-widest ${isParsing ? 'text-purple-500' : ''}`}>
              {isParsing ? 'AI Processing Active' : initialData ? 'Update Ticket' : 'Import Locate Ticket'}
            </h2>
            {!isParsing && !initialData && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Review required before save</p>}
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Progress Bar Header */}
        {isParsing && (
          <div className="h-1.5 w-full bg-black/10 overflow-hidden relative">
            <div 
              className="absolute inset-y-0 left-0 bg-purple-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(168,85,247,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {!initialData && !isParsing && (
          <div className="flex p-1.5 gap-1 bg-black/5 mx-6 mt-4 rounded-xl">
            {['manual', 'pdf', 'batch'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab ? 'bg-brand text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {tab === 'pdf' ? 'Upload PDF/Image' : tab === 'batch' ? 'Paste Text' : 'Manual Entry'}
              </button>
            ))}
          </div>
        )}

        <div className="p-6">
          {activeTab === 'manual' || isParsing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {isParsing && (
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-purple-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-purple-500">{scanStatus || 'Analyzing Document...'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[8px] font-bold text-slate-500 uppercase">Extraction Pipeline</p>
                      <p className="text-[8px] font-black text-purple-500">{Math.round(progressPercent)}%</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Job #</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Ticket</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Street</label>
                <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Extent</label>
                <textarea rows={2} className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.extent} onChange={e => setFormData({...formData, extent: e.target.value})} placeholder="Describe the work area boundaries..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Work Date</label>
                  <input type="date" required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.workDate} onChange={e => setFormData({...formData, workDate: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Expires</label>
                  <input type="date" required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.expires} onChange={e => setFormData({...formData, expires: e.target.value})} />
                </div>
              </div>

              {formData.documentUrl && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-black/5">
                  <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="text-[9px] font-black text-slate-500 uppercase truncate flex-1">Attached: Original Ticket Document</span>
                </div>
              )}

              <button type="submit" disabled={isParsing} className={`w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg mt-2 transition-all active:scale-[0.98] ${isParsing ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-brand text-[#0f172a] shadow-brand/10'}`}>
                {isParsing ? 'Processing AI Data...' : 'Verify & Save Ticket Record'}
              </button>
            </form>
          ) : activeTab === 'batch' ? (
            <div className="space-y-4">
              <textarea rows={8} className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} placeholder="Paste the full text of the ticket email or PDF here..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <button onClick={handleAiParse} disabled={isParsing || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 flex items-center justify-center gap-2 transition-all">
                {isParsing ? <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Run AI Extraction'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
               <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative h-[240px] rounded-[2.5rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 overflow-hidden group cursor-pointer ${
                  isDragging ? 'bg-brand/10 border-brand scale-[0.98]' : 'bg-black/5 border-slate-200 hover:border-brand/40'
                } ${isParsing ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <div className={`p-4 rounded-full transition-all ${isDragging ? 'bg-brand text-white scale-110' : 'bg-white/10 text-slate-400 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                  {isParsing ? (
                    <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11v6m3-3H9" /></svg>
                  )}
                </div>
                <div className="text-center px-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {isParsing ? 'AI Parsing Ticket...' : isDragging ? 'Release to Start' : 'Drop Ticket PDF or Image'}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-60">
                    Automatic upload & data extraction
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
