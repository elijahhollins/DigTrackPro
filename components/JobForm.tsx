
import React, { useState, useEffect } from 'react';
import { Job } from '../types.ts';
import { CostCode } from '../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../services/timeTrackingService.ts';

interface JobFormProps {
  // Fixed: Prop type onSave now omits companyId to allow parent handleNavigate/initApp logic to manage multitenancy
  onSave: (job: Omit<Job, 'id' | 'createdAt' | 'isComplete' | 'companyId'>) => Promise<void> | void;
  onClose: () => void;
  initialData?: Job;
  isDarkMode?: boolean;
  // Cost-code assignment (Time Tracker). When the company has time tracking and
  // we're editing an existing job, the form offers an "Assign cost codes" panel.
  companyId?: string;
  timeTrackingEnabled?: boolean;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onClose, initialData, isDarkMode, companyId, timeTrackingEnabled }) => {
  const [formData, setFormData] = useState({
    jobNumber: '', jobName: '', customer: '', siteContact: '', address: '', city: '', state: '', county: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Cost-code assignment state ──────────────────────────────────────────────
  const canAssignCodes = Boolean(timeTrackingEnabled && companyId && initialData);
  const [showCostCodes, setShowCostCodes] = useState(false);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  // codeId -> assignment row id, so we can unassign by id.
  const [assigned, setAssigned] = useState<Map<number, number>>(new Map());
  const [ccLoading, setCcLoading] = useState(false);
  const [ccBusy, setCcBusy] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber,
        jobName: initialData.jobName || '',
        customer: initialData.customer || '',
        siteContact: initialData.siteContact || '',
        address: initialData.address,
        city: initialData.city,
        state: initialData.state,
        county: initialData.county,
      });
    }
  }, [initialData]);

  const loadCostCodes = async () => {
    if (!initialData) return;
    setCcLoading(true);
    try {
      const [codes, assignments] = await Promise.all([
        timeTrackingService.getCostCodes(),
        timeTrackingService.getAssignments(),
      ]);
      setCostCodes(codes.filter(c => c.isActive));
      const m = new Map<number, number>();
      assignments
        .filter(a => a.jobKind === 'dig' && a.jobRef === initialData.id)
        .forEach(a => m.set(a.costCodeId, a.id));
      setAssigned(m);
    } catch (err) {
      console.error('Failed to load cost codes:', err);
    } finally {
      setCcLoading(false);
    }
  };

  const toggleCostCodes = async () => {
    const next = !showCostCodes;
    setShowCostCodes(next);
    if (next && costCodes.length === 0) await loadCostCodes();
  };

  const toggleAssign = async (code: CostCode) => {
    if (!initialData || !companyId) return;
    setCcBusy(true);
    try {
      const existing = assigned.get(code.id);
      if (existing) {
        await timeTrackingService.unassignCostCode(existing);
        setAssigned(prev => { const m = new Map(prev); m.delete(code.id); return m; });
      } else {
        const a = await timeTrackingService.assignCostCode(companyId, 'dig', initialData.id, code.id);
        setAssigned(prev => new Map(prev).set(code.id, a.id));
      }
    } catch (err) {
      console.error('Failed to update cost-code assignment:', err);
    } finally {
      setCcBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Fixed: handleSubmit now correctly passes formData which matches the updated prop signature (Omit Job 'id' | 'createdAt' | 'isComplete' | 'companyId')
      await onSave(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
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
              <label className="text-[9px] font-black uppercase text-slate-400">Job Name</label>
              <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobName} onChange={e => setFormData({...formData, jobName: e.target.value})} placeholder="e.g. Prairie Ridge Phase 2" />
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

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-400">Site Contact</label>
            <input className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.siteContact} onChange={e => setFormData({...formData, siteContact: e.target.value})} placeholder="On-site contact name / phone" />
          </div>

          {canAssignCodes && (
            <div className={`rounded-xl border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              <button
                type="button"
                onClick={toggleCostCodes}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                  Assign Cost Codes
                  {assigned.size > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-brand/15 text-brand text-[9px] font-black">{assigned.size}</span>
                  )}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${showCostCodes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
              </button>

              {showCostCodes && (
                <div className="px-4 pb-4">
                  {ccLoading ? (
                    <p className="text-[11px] text-slate-500 py-2">Loading cost codes…</p>
                  ) : costCodes.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-2">No active cost codes yet. Add them in the Time Tracker.</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                        {assigned.size === 0
                          ? 'No codes assigned — the crew can clock into the full active list for this job.'
                          : 'The crew can only clock into the checked codes for this job.'}
                      </p>
                      <ul className="space-y-1 max-h-56 overflow-y-auto">
                        {costCodes.map(c => (
                          <li key={c.id}>
                            <label className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white'}`}>
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-brand"
                                checked={assigned.has(c.id)}
                                disabled={ccBusy}
                                onChange={() => toggleAssign(c)}
                              />
                              <span className="text-xs">
                                <span className="font-black">{c.code}</span>
                                {c.description ? <span className="text-slate-400 font-semibold"> — {c.description}</span> : ''}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
