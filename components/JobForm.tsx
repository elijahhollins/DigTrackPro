import React, { useState, useEffect } from 'react';
import { Job } from '../types';

interface JobFormProps {
  onSave: (job: Omit<Job, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialData?: Job;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onClose, initialData }) => {
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in zoom-in duration-300 border border-slate-300">
        <div className="p-8 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {initialData ? 'Update Job' : 'Register New Job'}
            </h2>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] mt-1.5">Project Management</p>
          </div>
          <button onClick={onClose} className="p-3 bg-white rounded-full shadow-sm text-slate-400 hover:text-rose-500 transition-all border border-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">Job Number</label>
              <input 
                required 
                type="text" 
                className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all placeholder:text-slate-400 shadow-sm" 
                value={formData.jobNumber} 
                onChange={e => setFormData({...formData, jobNumber: e.target.value})} 
                placeholder="e.g. 25-001"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">Customer</label>
              <input 
                required 
                type="text" 
                className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all placeholder:text-slate-400 shadow-sm" 
                value={formData.customer} 
                onChange={e => setFormData({...formData, customer: e.target.value})} 
                placeholder="Client Name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">Base Address</label>
            <input 
              required 
              type="text" 
              className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all placeholder:text-slate-400 shadow-sm" 
              value={formData.address} 
              onChange={e => setFormData({...formData, address: e.target.value})} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-1">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">City</label>
              <input 
                required 
                type="text" 
                className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all placeholder:text-slate-400 shadow-sm" 
                value={formData.city} 
                onChange={e => setFormData({...formData, city: e.target.value})} 
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">State</label>
              <input 
                required 
                type="text" 
                maxLength={2}
                className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all text-center uppercase placeholder:text-slate-400 shadow-sm" 
                value={formData.state} 
                onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} 
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">County</label>
              <input 
                required 
                type="text" 
                className="w-full px-5 py-4 bg-white border-2 border-slate-300 rounded-[1.25rem] text-sm font-black text-slate-950 outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all placeholder:text-slate-400 shadow-sm" 
                value={formData.county} 
                onChange={e => setFormData({...formData, county: e.target.value})} 
              />
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button type="submit" className="flex-1 bg-slate-950 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-black hover:scale-[1.02] transition-all shadow-xl shadow-slate-200">
              {initialData ? 'Apply Changes' : 'Finalize Job'}
            </button>
            <button type="button" onClick={onClose} className="px-8 py-5 border-2 border-slate-300 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest text-slate-900 hover:bg-slate-100 hover:border-slate-400 transition-all">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JobForm;