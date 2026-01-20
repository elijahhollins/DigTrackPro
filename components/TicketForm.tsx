
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface QueueItem {
  file: File;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error?: string;
  extractedData?: any;
  progress: number;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], jobs = [], isDarkMode, onJobCreated, onProcessingChange }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch' | 'pdf'>('manual');
  const [archiveOld, setArchiveOld] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', street: '', crossStreet: '', place: '', extent: '', county: '', city: '', state: '',
    callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: ''
  });

  const [batchInput, setBatchInput] = useState('');
  const [isParsingBatch, setIsParsingBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advanced Queue State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Track which queue indices have already populated the form to prevent overwriting user edits
  const populatedIndices = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber || '',
        ticketNo: initialData.ticketNo || '',
        street: initialData.street || '',
        crossStreet: initialData.crossStreet || '',
        place: initialData.place || '',
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

  const updateQueueItem = useCallback((index: number, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  }, []);

  const processFileInBackground = useCallback(async (index: number) => {
    const item = queue[index];
    if (!item || item.status !== 'pending') return;

    updateQueueItem(index, { status: 'processing', progress: 10 });

    try {
      const base64Data = await blobToBase64(item.file);
      updateQueueItem(index, { progress: 30 });

      const parsed = await parseTicketData({
        data: base64Data,
        mimeType: item.file.type
      }) as any;
      updateQueueItem(index, { progress: 60 });

      let targetJobNumber = (parsed && parsed.jobNumber) || 'UNASSIGNED';
      const docUrl = await apiService.addTicketFile(targetJobNumber, item.file);
      
      const cleanData = Object.fromEntries(
        Object.entries(parsed || {}).filter(([_, v]) => v !== null && v !== '')
      ) as any;

      const finalData = {
        ...cleanData,
        jobNumber: targetJobNumber,
        documentUrl: docUrl
      };

      updateQueueItem(index, { 
        status: 'ready', 
        progress: 100, 
        extractedData: finalData 
      });

    } catch (err: any) {
      console.error(`Queue error at index ${index}:`, err);
      updateQueueItem(index, { status: 'error', error: err.message });
    }
  }, [queue, updateQueueItem]);

  // Background Processing Loop - Manages parallel processing with a limit of 3 concurrent tasks
  useEffect(() => {
    const activeProcessing = queue.filter(item => item.status === 'processing').length;
    const maxConcurrency = 3;
    
    if (activeProcessing < maxConcurrency) {
      const nextPendingIndex = queue.findIndex(item => item.status === 'pending');
      if (nextPendingIndex !== -1) {
        processFileInBackground(nextPendingIndex);
      }
    }
    
    // Manage processing state for parent theme colors/loaders
    const globalProcessing = queue.some(item => item.status === 'processing');
    onProcessingChange?.(globalProcessing);
  }, [queue, processFileInBackground, onProcessingChange]);

  // Handle populating form only once per index
  useEffect(() => {
    const currentItem = queue[currentIndex];
    if (currentItem?.status === 'ready' && currentItem.extractedData && !populatedIndices.current.has(currentIndex)) {
      populatedIndices.current.add(currentIndex);
      setFormData(prev => ({
        ...prev,
        ...currentItem.extractedData
      }));
    }
  }, [currentIndex, queue]);

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: QueueItem[] = Array.from(files).map(file => ({
      file,
      status: 'pending',
      progress: 0
    }));
    setQueue(prev => [...prev, ...newItems]);
    setActiveTab('manual');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAdd(formData, archiveOld);
    
    if (currentIndex < queue.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      // Reset form for next item. If next item is already ready, 
      // the useEffect will handle the initial population.
      setFormData({
        jobNumber: '', ticketNo: '', street: '', crossStreet: '', place: '', extent: '', county: '', city: '', state: '',
        callInDate: '', workDate: '', expires: '', siteContact: '', documentUrl: ''
      });
    } else {
      onClose();
    }
  };

  const handleSkip = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handleAiParseText = async () => {
    if (!batchInput.trim()) return;
    setIsParsingBatch(true);
    try {
      const parsed = await parseTicketData(batchInput) as any;
      const cleanData = Object.fromEntries(
        Object.entries(parsed).filter(([_, v]) => v !== null && v !== '')
      );
      setFormData(prev => ({ ...prev, ...cleanData }));
      setActiveTab('manual');
    } catch (err: any) {
      alert("Extraction failed: " + err.message);
    } finally {
      setIsParsingBatch(false);
    }
  };

  const currentItem = queue[currentIndex];
  const isQueueActive = queue.length > 0;
  const processingCount = queue.filter(q => q.status === 'processing').length;
  const readyCount = queue.filter(q => q.status === 'ready').length;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[150] flex justify-center items-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-in flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              {isQueueActive ? (
                <>
                  <span className="text-brand">Reviewing {currentIndex + 1} of {queue.length}</span>
                  {processingCount > 0 && (
                    <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
                  )}
                </>
              ) : initialData ? 'Update Ticket' : 'Import Locate Ticket'}
            </h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
              {isQueueActive 
                ? `${readyCount} analyzed, ${processingCount} in background` 
                : 'Upload or manually enter ticket details'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Tabs - Only if not in active queue */}
          {!initialData && !isQueueActive && (
            <div className="flex p-1.5 gap-1 bg-black/5 mx-6 mt-4 rounded-xl">
              {['manual', 'pdf', 'batch'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab ? 'bg-brand text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  {tab === 'pdf' ? 'Upload PDF/Image' : tab === 'batch' ? 'Paste Text' : 'Manual Entry'}
                </button>
              ))}
            </div>
          )}

          <div className="p-6">
            {activeTab === 'manual' || isQueueActive ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {currentItem?.status === 'processing' && (
                  <div className="p-4 bg-brand/10 border border-brand/20 rounded-2xl flex items-center gap-4 animate-in">
                    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand">Current Ticket is Analyzing...</p>
                      <div className="w-full h-1 bg-brand/10 rounded-full mt-1.5 overflow-hidden">
                         <div className="h-full bg-brand transition-all duration-500" style={{ width: `${currentItem.progress}%` }} />
                      </div>
                    </div>
                  </div>
                )}

                {currentItem?.status === 'error' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Analysis Failed</p>
                    <p className="text-[9px] font-bold text-rose-400">{currentItem.error}</p>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Street</label>
                    <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Cross St</label>
                    <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.crossStreet} onChange={e => setFormData({...formData, crossStreet: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Place</label>
                    <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.place} onChange={e => setFormData({...formData, place: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">County</label>
                    <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.county} onChange={e => setFormData({...formData, county: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">City</label>
                    <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">State</label>
                    <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Extent</label>
                  <textarea rows={2} className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.extent} onChange={e => setFormData({...formData, extent: e.target.value})} placeholder="Describe boundaries..." />
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
                    <span className="text-[9px] font-black text-slate-500 uppercase truncate flex-1">Attached Document Ready</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {isQueueActive && (
                    <button type="button" onClick={handleSkip} className="flex-1 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                      Skip
                    </button>
                  )}
                  <button 
                    type="submit" 
                    disabled={currentItem?.status === 'processing'}
                    className={`flex-[2] py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-[0.98] ${currentItem?.status === 'processing' ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-brand text-[#0f172a] shadow-brand/10'}`}
                  >
                    {currentItem?.status === 'processing' ? 'Wait for AI...' : isQueueActive ? (currentIndex === queue.length - 1 ? 'Finalize Batch' : 'Verify & Next') : 'Save Ticket'}
                  </button>
                </div>

                {/* Background Queue Monitor */}
                {isQueueActive && queue.length > 1 && (
                  <div className="mt-8 border-t border-black/5 pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Background Pipeline Status</p>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-brand/10 text-brand">PARALLEL PROCESSING</span>
                    </div>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1">
                      {queue.map((item, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => idx !== currentIndex && setCurrentIndex(idx)}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            idx === currentIndex 
                              ? 'bg-brand/5 border-brand' 
                              : isDarkMode ? 'bg-white/2 border-white/5 hover:bg-white/5' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              item.status === 'ready' ? 'bg-emerald-500 text-white' : 
                              item.status === 'processing' ? 'bg-brand text-slate-900' : 'bg-slate-200 text-slate-400'
                            }`}>
                              {item.status === 'processing' ? (
                                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                              ) : item.status === 'ready' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              )}
                            </div>
                            {item.status === 'processing' && (
                              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand rounded-full border-2 border-white flex items-center justify-center">
                                <div className="w-1 h-1 bg-slate-900 rounded-full animate-pulse" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-black uppercase truncate ${idx === currentIndex ? 'text-brand' : 'text-slate-400'}`}>
                              {idx + 1}. {item.file.name}
                            </p>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">
                                {item.status === 'processing' ? `Analyzing (${item.progress}%)` : item.status.toUpperCase()}
                              </span>
                              {item.status === 'ready' && <span className="text-[8px] font-black text-emerald-500">READY</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            ) : activeTab === 'batch' ? (
              <div className="space-y-4">
                <textarea rows={8} className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} placeholder="Paste ticket email or PDF text..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
                <button onClick={handleAiParseText} disabled={isParsingBatch || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 flex items-center justify-center gap-2 transition-all">
                  {isParsingBatch ? <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Run AI Extraction'}
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
                  }`}
                >
                  <div className={`p-4 rounded-full transition-all ${isDragging ? 'bg-brand text-white scale-110' : 'bg-white/10 text-slate-400 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11v6m3-3H9" /></svg>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {isDragging ? 'Release to Start' : 'Drop Multiple Ticket Files'}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-60">
                      AI will process up to 3 tickets in parallel
                    </p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    multiple
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
    </div>
  );
};

export default TicketForm;
