
import React, { useState, useEffect } from 'react';
import { Job } from '../types.ts';

interface JobFormProps {
  onSave: (job: Omit<Job, 'id' | 'createdAt' | 'isComplete'>) => Promise<void> | void;
  onClose: () => void;
  initialData?: Job;
  isDarkMode?: boolean;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onClose, initialData, isDarkMode }) => {
  const [formData, setFormData] = useState({
    jobNumber: '', customer: '', address: '', city: '', state: '', county: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber,
        customer: initialData.customer,
        address: initialData.address,
        city: initialData.city,
        state: initialData.state,
        county: initialData.county,
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5">
          <h2 className="text-sm font-black uppercase tracking-widest">
            {initialData ? 'Update Job Profile' : 'Register New Job'}
          </h2>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">Job #</label>
              <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. 25-001" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">Customer</label>
              <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} placeholder="Client Name" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-400">Base Address</label>
            <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">City</label>
              <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">ST</label>
              <input required maxLength={2} className={`w-full px-3 py-2 border rounded-lg text-xs font-bold text-center uppercase outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">County</label>
              <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.county} onChange={e => setFormData({...formData, county: e.target.value})} />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-brand text-[#0f172a] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 mt-2 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'Syncing Vault...' : initialData ? 'Commit Changes' : 'Finalize Job Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JobForm;
