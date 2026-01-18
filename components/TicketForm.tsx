
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
  const [showSuccessGlow, setShowSuccessGlow] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', street: '', extent: '', county: '', city: '', state: '',
    callInDate: '', workDate: '', expires: '', siteContact: '',
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
    let successCount = 0;
    const fileArray = Array.from(files);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setScanStatus(`Analyzing File ${i + 1}/${fileArray.length}...`);
      
      try {
        const base64Data = await blobToBase64(file);
        const parsed = await parseTicketData({
          data: base64Data,
          mimeType: file.type
        });
        
        if (!parsed) continue;

        const cleanData = Object.fromEntries(
          Object.entries(parsed).filter(([_, v]) => v !== null && v !== '')
        ) as any;

        let targetJobNumber = cleanData.jobNumber || 'UNASSIGNED';
        let existingJob = jobs.find(j => j.jobNumber === targetJobNumber);
        
        if (!existingJob && targetJobNumber !== 'UNASSIGNED') {
          const newJob: Job = {
            id: crypto.randomUUID(),
            jobNumber: targetJobNumber,
            customer: '',
            address: cleanData.street || '',
            city: cleanData.city || '',
            state: cleanData.state || '',
            county: cleanData.county || '',
            createdAt: Date.now(),
            isComplete: false
          };
          const savedJob = await apiService.saveJob(newJob);
          onJobCreated?.(savedJob);
        }

        const ticketToSave: Omit<DigTicket, 'id' | 'createdAt'> = {
          jobNumber: targetJobNumber,
          ticketNo: cleanData.ticketNo || `AI-${Date.now()}`,
          street: cleanData.street || '',
          extent: cleanData.extent || '',
          county: cleanData.county || '',
          city: cleanData.city || '',
          state: cleanData.state || '',
          callInDate: cleanData.callInDate || new Date().toISOString().split('T')[0],
          workDate: cleanData.workDate || '',
          expires: cleanData.expires || '',
          siteContact: cleanData.siteContact || '',
          isArchived: false,
          refreshRequested: false,
          noShowRequested: false
        };

        await onAdd(ticketToSave, false);
        setFormData(prev => ({ ...prev, ...cleanData }));
        successCount++;
      } catch (err: any) {
        console.error(`AI Error for ${file.name}:`, err);
        setScanStatus(`Error: ${err.message}`);
      }
    }

    if (successCount > 0) {
      setScanStatus(`Success! Imported ${successCount} tickets.`);
      setShowSuccessGlow(true);
      setTimeout(() => {
        setIsParsing(false);
        onProcessingChange?.(false);
        onClose();
      }, 1500);
    } else {
      setIsParsing(false);
      onProcessingChange?.(false);
      alert("AI extraction failed. Please ensure the files are clear and readable.");
    }
  };

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    onProcessingChange?.(true);
    setScanStatus('Running Neural Analysis...');
    try {
      const parsed = await parseTicketData(batchInput) as any;
      const cleanData = Object.fromEntries(
        Object.entries(parsed).filter(([_, v]) => v !== null && v !== '')
      );
      setFormData(prev => ({ ...prev, ...cleanData }));
      setScanStatus('Success! Metadata mapped.');
      setShowSuccessGlow(true);
      setTimeout(() => {
        setActiveTab('manual');
        setIsParsing(false);
        onProcessingChange?.(false);
        setShowSuccessGlow(false);
      }, 1000);
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
    <div className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[150] flex justify-center items-center p-4 transition-all duration-500 ${showSuccessGlow ? 'bg-emerald-500/20' : ''}`}>
      <div className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border animate-in transition-all duration-500 ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'} ${showSuccessGlow ? 'border-emerald-500 ring-4 ring-emerald-500/20' : ''}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5">
          <h2 className={`text-sm font-black uppercase tracking-widest transition-colors ${isParsing ? 'text-purple-500' : showSuccessGlow ? 'text-emerald-500' : ''}`}>
            {isParsing ? 'AI Extraction Active' : showSuccessGlow ? 'Analysis Complete' : initialData ? 'Update Record' : 'Site Manifest Import'}
          </h2>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!initialData && !isParsing && !showSuccessGlow && (
          <div className="flex p-1.5 gap-1 bg-black/5 mx-6 mt-4 rounded-xl">
            {['manual', 'batch', 'pdf'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab ? 'bg-brand text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {tab === 'pdf' ? 'Batch Scan' : tab}
              </button>
            ))}
          </div>
        )}

        <div className="p-6">
          {activeTab === 'manual' || isParsing || showSuccessGlow ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {(isParsing || showSuccessGlow) && (
                <div className={`p-4 border rounded-2xl flex items-center gap-4 transition-all ${showSuccessGlow ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-purple-500/10 border-purple-500/20 animate-pulse'}`}>
                  <div className={`w-10 h-10 border-4 rounded-full shrink-0 flex items-center justify-center ${showSuccessGlow ? 'bg-emerald-500 border-emerald-500 text-white scale-110' : 'border-purple-500 border-t-transparent animate-spin'}`}>
                    {showSuccessGlow && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${showSuccessGlow ? 'text-emerald-500' : 'text-purple-500'}`}>{scanStatus || 'Parsing Construction Log...'}</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Automated Document Intelligence</p>
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
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Location Street</label>
                <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Work Extent / Boundaries</label>
                <textarea rows={2} className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.extent} onChange={e => setFormData({...formData, extent: e.target.value})} placeholder="Area description..." />
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

              <button type="submit" disabled={isParsing || showSuccessGlow} className={`w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg mt-2 transition-all active:scale-[0.98] ${isParsing ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : showSuccessGlow ? 'bg-emerald-500 text-white cursor-default' : 'bg-brand text-[#0f172a] shadow-brand/10'}`}>
                {isParsing ? 'Processing...' : showSuccessGlow ? 'Syncing...' : 'Save Ticket Record'}
              </button>
            </form>
          ) : activeTab === 'batch' ? (
            <div className="space-y-4">
              <textarea rows={8} className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} placeholder="Paste raw ticket text here..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <button onClick={handleAiParse} disabled={isParsing || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 flex items-center justify-center gap-2 transition-all">
                {isParsing ? <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Run Neural Extraction'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
               <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
                onClick={() => !isParsing && fileInputRef.current?.click()}
                className={`relative h-[240px] rounded-[2.5rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 overflow-hidden group cursor-pointer ${
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
                    {isParsing ? 'AI Parsing Tickets...' : isDragging ? 'Release to Start' : 'Select PDFs / Photos'}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-60">
                    Neural engine processes multiple logs
                  </p>
                </div>
                <input 
                  type="file" 
                  multiple
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
