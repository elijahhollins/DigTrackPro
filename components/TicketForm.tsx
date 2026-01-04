
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

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], isDarkMode }) => {
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

  const [batchInput, setBatchInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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
    }
  }, [initialData]);

  // CRITICAL FIX: Robust filtering to prevent crash when typing in Site Contact
  const crewSuggestions = useMemo(() => {
    const query = (formData.siteContact || '').toLowerCase().trim();
    if (!query || query.length < 1) return [];
    
    return (users || []).filter(u => {
      if (!u) return false;
      const name = (u.name || '').toLowerCase();
      const email = (u.username || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    }).slice(0, 5);
  }, [formData.siteContact, users]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    try {
      const parsed = await parseTicketData(batchInput);
      setFormData(prev => ({
        ...prev,
        ...parsed,
        // Ensure date strings are compatible with input[type="date"]
        callInDate: parsed.callInDate ? new Date(parsed.callInDate).toISOString().split('T')[0] : prev.callInDate,
        digStart: parsed.digStart ? new Date(parsed.digStart).toISOString().split('T')[0] : prev.digStart,
        expirationDate: parsed.expirationDate ? new Date(parsed.expirationDate).toISOString().split('T')[0] : prev.expirationDate,
      }));
      setActiveTab('manual');
    } catch (err: any) {
      alert(`AI Parsing failed: ${err.message || 'Check your ticket text format.'}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] overflow-y-auto pt-6 pb-20 px-4 flex justify-center items-start">
      <div className={`w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className={`p-8 border-b flex justify-between items-center ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
          <div>
            <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {initialData ? 'Update Ticket' : 'Register Locate Ticket'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Construction Safety Protocol</p>
          </div>
          <button onClick={onClose} className={`p-3 rounded-full shadow-sm transition-all border ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white border-white/5' : 'bg-white text-slate-400 hover:text-rose-500 border-slate-200'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        {!initialData && (
          <div className="flex p-2 gap-2 bg-slate-500/5 mx-8 mt-6 rounded-2xl">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'manual' ? (isDarkMode ? 'bg-white text-slate-900 shadow-lg' : 'bg-white text-slate-900 shadow-md') : 'text-slate-500 hover:text-slate-700'}`}
            >
              Manual Form
            </button>
            <button 
              onClick={() => setActiveTab('batch')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'batch' ? (isDarkMode ? 'bg-white text-slate-900 shadow-lg' : 'bg-white text-slate-900 shadow-md') : 'text-slate-500 hover:text-slate-700'}`}
            >
              AI Magic Scan
            </button>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'batch' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Paste Ticket Text</label>
                <textarea 
                  rows={10}
                  className={`w-full px-5 py-4 border rounded-[1.5rem] text-sm font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-950 placeholder:text-slate-400'}`}
                  placeholder="Paste the full email or text from your 811 ticket here..."
                  value={batchInput}
                  onChange={e => setBatchInput(e.target.value)}
                />
              </div>
              <button 
                onClick={handleAiParse}
                disabled={isParsing || !batchInput.trim()}
                className="w-full bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:brightness-110 hover:scale-[1.01] transition-all shadow-xl shadow-brand/20 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isParsing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" />
                    Analyzing Data...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Extract Ticket Details
                  </>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Job Number</label>
                  <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. 25-001" />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Ticket Number</label>
                  <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-black font-mono outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} placeholder="e.g. 240123456" />
                </div>
              </div>

              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Specific Address / Site Description</label>
                <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="123 Main St, Lot 5" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>City</label>
                  <input className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>State</label>
                  <input maxLength={2} className={`w-full px-5 py-4 border rounded-xl text-sm font-bold text-center uppercase outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>County</label>
                  <input className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.county} onChange={e => setFormData({...formData, county: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Call Date</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.callInDate} onChange={e => setFormData({...formData, callInDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Dig Start</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Expiration</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2 relative" ref={suggestionsRef}>
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Site Contact / Crew Lead</label>
                <input 
                  autoComplete="off"
                  className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                  value={formData.siteContact} 
                  onFocus={() => setShowSuggestions(true)}
                  onChange={e => {
                    setFormData({...formData, siteContact: e.target.value});
                    setShowSuggestions(true);
                  }} 
                  placeholder="Type to search crew members..."
                />
                
                {showSuggestions && crewSuggestions.length > 0 && (
                  <div className={`absolute bottom-full left-0 right-0 mb-2 rounded-2xl shadow-2xl border overflow-hidden animate-in slide-in-from-bottom-2 duration-200 z-[100] ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Crew Registry Suggestions</span>
                    </div>
                    {crewSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setFormData({...formData, siteContact: user.name});
                          setShowSuggestions(false);
                        }}
                        className={`w-full px-5 py-3.5 text-left text-sm font-bold flex items-center gap-3 transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-slate-50 text-slate-900'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${isDarkMode ? 'bg-white/10 text-brand' : 'bg-slate-100 text-slate-600'}`}>
                          {(user.name || 'U').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span>{user.name}</span>
                          <span className="text-[10px] text-slate-500 font-medium">@{user.username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 flex flex-col sm:flex-row gap-4">
                <button type="submit" className="flex-1 bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:brightness-110 hover:scale-[1.02] transition-all shadow-xl shadow-brand/20">
                  {initialData ? 'Update Record' : 'Register Ticket'}
                </button>
                <button type="button" onClick={onClose} className={`px-8 py-5 border rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
