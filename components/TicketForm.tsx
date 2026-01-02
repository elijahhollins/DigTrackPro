
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigTicket, UserRecord, UserRole } from '../types';
import { parseTicketData } from '../services/geminiService';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch'>('manual');
  const [formData, setFormData] = useState({
    jobNumber: '',
    ticketNo: '',
    address: '',
    county: '',
    city: '',
    state: '',
    callInDate: '',
    digStart: '',
    expirationDate: '',
    siteContact: '',
  });

  const [aiInput, setAiInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [batchResults, setBatchResults] = useState<{name: string, status: 'pending' | 'success' | 'error', errorMsg?: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber,
        ticketNo: initialData.ticketNo,
        address: initialData.address,
        county: initialData.county || '',
        city: initialData.city || '',
        state: initialData.state || '',
        callInDate: initialData.callInDate,
        digStart: initialData.digStart,
        expirationDate: initialData.expirationDate,
        siteContact: initialData.siteContact,
      });
    }
  }, [initialData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const crewSuggestions = useMemo(() => {
    const query = formData.siteContact.toLowerCase();
    return users
      .filter(u => u.role === UserRole.CREW)
      .filter(u => u.username.toLowerCase().includes(query) || u.name.toLowerCase().includes(query));
  }, [users, formData.siteContact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  const handleAiParse = async () => {
    if (!aiInput.trim()) return;
    setIsParsing(true);
    try {
      const parsed = await parseTicketData(aiInput);
      setFormData(prev => ({ ...prev, ...parsed }));
      setAiInput('');
    } catch (err: any) {
      const isQuota = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
      alert(isQuota 
        ? "AI Quota Exceeded. Please wait a moment before trying again or use manual input." 
        : "AI failed to parse. Please input manually.");
    } finally {
      setIsParsing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const initialBatch = Array.from(files).map((f) => ({ name: (f as File).name, status: 'pending' as const }));
    setBatchResults(initialBatch);
    setIsParsing(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await fileToBase64(file);
        const parsed = await parseTicketData({ data: base64, mimeType: file.type });
        
        onAdd({
          jobNumber: parsed.jobNumber || 'PENDING',
          ticketNo: parsed.ticketNo || 'NEW-TICKET',
          address: parsed.address || '',
          county: parsed.county || '',
          city: parsed.city || '',
          state: parsed.state || '',
          callInDate: parsed.callInDate || new Date().toISOString().split('T')[0],
          digStart: parsed.digStart || new Date().toISOString().substring(0, 16),
          expirationDate: parsed.expirationDate || new Date().toISOString().split('T')[0],
          siteContact: parsed.siteContact || '',
        });

        setBatchResults(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'success' } : item));
      } catch (err: any) {
        const isQuota = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
        setBatchResults(prev => prev.map((item, idx) => idx === i ? { 
          ...item, 
          status: 'error', 
          errorMsg: isQuota ? "Quota Reached" : "Parse Failed" 
        } : item));
      }
    }
    setIsParsing(false);
  };

  const isEditing = !!initialData;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-300 border border-slate-100">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              {isEditing ? 'Modify Ticket' : 'Create New Tickets'}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">Construction Locates</p>
          </div>
          <button onClick={onClose} className="p-3 bg-white rounded-full shadow-sm text-slate-300 hover:text-rose-500 transition-all border border-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!isEditing && (
          <div className="flex px-8 pt-6 gap-6 border-b border-slate-50">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`pb-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'manual' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-300 hover:text-slate-500'}`}
            >
              Manual Input
            </button>
            <button 
              onClick={() => setActiveTab('batch')}
              className={`pb-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'batch' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-300 hover:text-slate-500'}`}
            >
              AI Smart Scan
            </button>
          </div>
        )}

        <div className="p-8 overflow-y-auto flex-1">
          {activeTab === 'batch' && !isEditing ? (
            <div className="space-y-8 pb-8">
              <div className="bg-orange-50/30 border-2 border-dashed border-orange-100 rounded-[2rem] p-12 text-center relative group hover:bg-orange-50/50 transition-all">
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf"
                  onChange={handleBatchUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isParsing}
                />
                <div className="flex flex-col items-center">
                  <div className="bg-white p-5 rounded-[1.5rem] shadow-xl shadow-orange-100/50 mb-6 group-hover:scale-110 transition-transform">
                    <svg className="w-10 h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Upload Locate Documents</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-[320px] mx-auto leading-relaxed">Select PDF or Photos. Our AI will automatically extract job details for you.</p>
                </div>
              </div>

              {batchResults.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Processing Queue</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {batchResults.map((res, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${res.status === 'success' ? 'bg-emerald-400' : res.status === 'error' ? 'bg-rose-400' : 'bg-orange-400 animate-pulse'}`}></div>
                          <span className="text-xs font-bold text-slate-600 truncate max-w-[150px]">{res.name}</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${res.status === 'success' ? 'text-emerald-500' : res.status === 'error' ? 'text-rose-500' : 'text-orange-500'}`}>
                          {res.errorMsg || res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8 pb-12">
              {!isEditing && (
                <div className="p-6 bg-orange-50/50 border border-orange-100 rounded-[2rem]">
                  <label className="block text-[10px] font-black text-orange-600 mb-3 uppercase tracking-[0.2em]">Quick Paste Import</label>
                  <div className="flex gap-3">
                    <textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Paste locate email text here..."
                      className="flex-1 text-xs p-4 border border-orange-100 rounded-2xl focus:ring-4 focus:ring-orange-100/50 focus:border-orange-400 transition-all outline-none resize-none h-20 bg-white shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={handleAiParse}
                      disabled={isParsing}
                      className="bg-orange-600 text-white px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg shadow-orange-100"
                    >
                      {isParsing ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" /> : "AI Parse"}
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Job Site ID</label>
                  <input required type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold focus:ring-4 focus:ring-orange-100/50 focus:bg-white outline-none transition-all" value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ticket Number</label>
                  <input required type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold focus:ring-4 focus:ring-orange-100/50 focus:bg-white outline-none transition-all" value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Site Address</label>
                  <input required type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold focus:ring-4 focus:ring-orange-100/50 focus:bg-white outline-none transition-all" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location Details</label>
                  <div className="flex gap-3">
                    <input type="text" placeholder="City" className="flex-1 px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                    <input type="text" placeholder="ST" className="w-20 px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold text-center uppercase outline-none" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} />
                  </div>
                </div>

                <div className="space-y-2 relative" ref={suggestionRef}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Site Contact</label>
                  <input 
                    required 
                    type="text" 
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-100/50 focus:bg-white transition-all" 
                    value={formData.siteContact} 
                    onFocus={() => setShowSuggestions(true)}
                    onChange={e => {
                      setFormData({...formData, siteContact: e.target.value});
                      setShowSuggestions(true);
                    }} 
                  />
                  {showSuggestions && crewSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 border-b border-slate-50 bg-slate-50/50">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Crew Suggestions</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {crewSuggestions.map(user => (
                          <button
                            key={user.id}
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-orange-50 flex items-center justify-between transition-colors group"
                            onClick={() => {
                              setFormData({...formData, siteContact: user.username});
                              setShowSuggestions(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-700">{user.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">@{user.username}</span>
                            </div>
                            <svg className="w-4 h-4 text-orange-200 group-hover:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Call In Date</label>
                  <input required type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none" value={formData.callInDate} onChange={e => setFormData({...formData, callInDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dig Start</label>
                  <input required type="datetime-local" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none" value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hard Expiration Date</label>
                  <input required type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none" value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
                
                <div className="md:col-span-2 pt-8 flex gap-4">
                  <button type="submit" className="flex-1 bg-orange-600 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-orange-700 hover:scale-[1.01] transition-all shadow-xl shadow-orange-100">
                    {isEditing ? 'Commit Changes' : 'Finalize & Save'}
                  </button>
                  <button type="button" onClick={onClose} className="px-8 py-5 border-2 border-slate-50 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                    Discard
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
