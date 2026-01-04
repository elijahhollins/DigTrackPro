
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigTicket, UserRecord, UserRole } from '../types.ts';
import { parseTicketData } from '../services/geminiService.ts';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
  isDarkMode?: boolean;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users, isDarkMode }) => {
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
        ? "AI Quota Exceeded. Please wait a moment before trying again." 
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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] flex items-start justify-center p-4 overflow-y-auto pt-10 pb-10">
      <div className={`w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className={`p-8 border-b flex justify-between items-center ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
          <div>
            <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {isEditing ? 'Modify Ticket' : 'Create New Tickets'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Construction Locates</p>
          </div>
          <button onClick={onClose} className={`p-3 rounded-full shadow-sm transition-all border ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white border-white/5' : 'bg-white text-slate-400 hover:text-rose-500 border-slate-200'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!isEditing && (
          <div className={`flex px-8 pt-6 gap-6 border-b ${isDarkMode ? 'bg-black/10 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
            <button 
              onClick={() => setActiveTab('manual')}
              className={`pb-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === 'manual' ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Manual Input
            </button>
            <button 
              onClick={() => setActiveTab('batch')}
              className={`pb-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === 'batch' ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              AI Smart Scan
            </button>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'batch' && !isEditing ? (
            <div className="space-y-8 pb-4">
              <div className={`border-4 border-dashed rounded-[2rem] p-12 text-center relative group transition-all ${isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-brand/5 border-brand/20 hover:bg-brand/10'}`}>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf"
                  onChange={handleBatchUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isParsing}
                />
                <div className="flex flex-col items-center">
                  <div className={`p-6 rounded-[1.5rem] shadow-xl mb-6 group-hover:scale-110 transition-transform ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white border border-brand/10'}`}>
                    <svg className="w-10 h-10 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <h3 className={`text-lg font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Upload Documents</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-[320px] mx-auto leading-relaxed font-bold uppercase tracking-tighter">Images, PDFs or Screenshots</p>
                </div>
              </div>

              {batchResults.length > 0 && (
                <div className="space-y-4">
                  <h4 className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Processing Queue</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {batchResults.map((res, i) => (
                      <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${res.status === 'success' ? 'bg-emerald-500' : res.status === 'error' ? 'bg-rose-500' : 'bg-brand animate-pulse'}`}></div>
                          <span className={`text-xs font-black truncate max-w-[150px] uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{res.name}</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${res.status === 'success' ? 'text-emerald-500' : res.status === 'error' ? 'text-rose-500' : 'text-brand'}`}>
                          {res.errorMsg || res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {!isEditing && (
                <div className={`p-6 border rounded-[2rem] ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-brand/5 border-brand/20'}`}>
                  <label className={`block text-[10px] font-black mb-3 uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-brand'}`}>Quick Paste Import</label>
                  <div className="flex gap-3">
                    <textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Paste locate email text here..."
                      className={`flex-1 text-sm p-4 border rounded-2xl outline-none resize-none h-24 font-black transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white placeholder:text-slate-700' : 'bg-white border-slate-200 text-slate-950 placeholder:text-slate-400'}`}
                    />
                    <button
                      type="button"
                      onClick={handleAiParse}
                      disabled={isParsing}
                      className="bg-brand text-[#0f172a] px-8 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:brightness-110 disabled:opacity-50 flex items-center justify-center transition-all shadow-xl shadow-brand/20"
                    >
                      {isParsing ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#0f172a]/30 border-t-[#0f172a]" /> : "Scan AI"}
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pb-6">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Job Number</label>
                  <input required type="text" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Ticket Number</label>
                  <input required type="text" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Work Site Address</label>
                  <input required type="text" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Location</label>
                  <div className="flex gap-3">
                    <input type="text" placeholder="City" className={`flex-1 px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                    <input type="text" placeholder="ST" className={`w-20 px-5 py-4 border rounded-[1.25rem] text-sm font-black text-center uppercase outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} />
                  </div>
                </div>

                <div className="space-y-2 relative" ref={suggestionRef}>
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Site Contact</label>
                  <input 
                    required 
                    type="text" 
                    className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} 
                    value={formData.siteContact} 
                    onFocus={() => setShowSuggestions(true)}
                    onChange={e => {
                      setFormData({...formData, siteContact: e.target.value});
                      setShowSuggestions(true);
                    }} 
                  />
                  {showSuggestions && crewSuggestions.length > 0 && (
                    <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl border z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 ${isDarkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}>
                      {crewSuggestions.map(user => (
                        <button
                          key={user.id}
                          type="button"
                          className={`w-full px-4 py-3 text-left flex items-center justify-between transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                          onClick={() => {
                            setFormData({...formData, siteContact: user.username});
                            setShowSuggestions(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">@{user.username}</span>
                          </div>
                          <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Call In</label>
                  <input required type="date" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.callInDate} onChange={e => setFormData({...formData, callInDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Dig Start</label>
                  <input required type="datetime-local" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Expiration Date</label>
                  <input required type="date" className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
                
                <div className="md:col-span-2 pt-8 flex flex-col sm:flex-row gap-4 mb-4">
                  <button type="submit" className="flex-1 bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:brightness-110 hover:scale-[1.02] transition-all shadow-xl shadow-brand/20">
                    {isEditing ? 'Save Changes' : 'Confirm Registration'}
                  </button>
                  <button type="button" onClick={onClose} className={`px-8 py-5 border rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    Dismiss
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
