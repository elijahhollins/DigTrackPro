
import React, { useState, useEffect } from 'react';
import { Job } from '../types.ts';

interface JobFormProps {
  onSave: (job: Omit<Job, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialData?: Job;
  isDarkMode?: boolean;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onClose, initialData, isDarkMode }) => {
  const [formData, setFormData] = useState({
    jobNumber: '',
    customer: '',
    address: '',
    city: '',
    state: '',
    county: '',
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[160] overflow-y-auto pt-6 pb-20 scroll-smooth">
      <div className="flex items-start justify-center min-h-[120vh] px-4 pt-10 pb-60">
        <div className={`w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
          <div className={`p-8 border-b flex justify-between items-center ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
            <div>
              <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {initialData ? 'Update Job' : 'Register New Job'}
              </h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Project Management</p>
            </div>
            <button onClick={onClose} className={`p-3 rounded-full shadow-sm transition-all border ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white border-white/5' : 'bg-white text-slate-400 hover:text-rose-500 border-slate-200'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Job Number</label>
                <input 
                  required 
                  type="text" 
                  className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-950 placeholder:text-slate-400'}`} 
                  value={formData.jobNumber} 
                  onChange={e => setFormData({...formData, jobNumber: e.target.value})} 
                  placeholder="e.g. 25-001"
                />
              </div>
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Customer</label>
                <input 
                  required 
                  type="text" 
                  className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-950 placeholder:text-slate-400'}`} 
                  value={formData.customer} 
                  onChange={e => setFormData({...formData, customer: e.target.value})} 
                  placeholder="Client Name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>Base Address</label>
              <input 
                required 
                type="text" 
                className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-1">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>City</label>
                <input 
                  required 
                  type="text" 
                  className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} 
                  value={formData.city} 
                  onChange={e => setFormData({...formData, city: e.target.value})} 
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>State</label>
                <input 
                  required 
                  type="text" 
                  maxLength={2}
                  className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all text-center uppercase shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} 
                  value={formData.state} 
                  onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} 
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>County</label>
                <input 
                  required 
                  type="text" 
                  className={`w-full px-5 py-4 border rounded-[1.25rem] text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 transition-all shadow-sm ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`} 
                  value={formData.county} 
                  onChange={e => setFormData({...formData, county: e.target.value})} 
                />
              </div>
            </div>

            <div className="pt-6 pb-20 flex flex-col sm:flex-row gap-4">
              <button type="submit" className="flex-1 bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:brightness-110 hover:scale-[1.02] transition-all shadow-xl shadow-brand/20">
                {initialData ? 'Apply Changes' : 'Finalize Job'}
              </button>
              <button type="button" onClick={onClose} className={`px-8 py-5 border rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default JobForm;
