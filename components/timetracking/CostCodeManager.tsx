import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { CostCode, ClockableJob, JobCostCodeAssignment } from '../../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';

interface CostCodeManagerProps {
  companyId: string;
  costCodes: CostCode[];
  clockableJobs: ClockableJob[];
  onChange: () => Promise<void> | void;   // reload parent data (cost codes)
  isDarkMode?: boolean;
}

/**
 * Admin tool: manage the company's global cost-code list and assign which codes
 * apply to which job (dig or service). A job with no explicit assignments offers
 * the full active list when clocking in.
 */
export default function CostCodeManager({ companyId, costCodes, clockableJobs, onChange, isDarkMode }: CostCodeManagerProps) {
  const [draft, setDraft] = useState({ code: '', description: '' });
  const [assignments, setAssignments] = useState<JobCostCodeAssignment[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<ClockableJob | null>(null);
  const [busy, setBusy] = useState(false);

  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;

  const loadAssignments = async () => {
    try { setAssignments(await timeTrackingService.getAssignments()); }
    catch (err) { console.error('Failed to load assignments:', err); }
  };
  useEffect(() => { loadAssignments(); }, []);

  const addCode = async () => {
    if (!draft.code.trim()) return;
    setBusy(true);
    try {
      await timeTrackingService.createCostCode(companyId, { code: draft.code.trim(), description: draft.description.trim(), isActive: true });
      setDraft({ code: '', description: '' });
      await onChange();
    } finally { setBusy(false); }
  };

  const removeCode = async (id: number) => {
    setBusy(true);
    try { await timeTrackingService.deleteCostCode(id); await onChange(); await loadAssignments(); }
    finally { setBusy(false); }
  };

  const toggleActive = async (c: CostCode) => {
    setBusy(true);
    try { await timeTrackingService.updateCostCode(c.id, { isActive: !c.isActive }); await onChange(); }
    finally { setBusy(false); }
  };

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return (q ? clockableJobs.filter(j => j.label.toLowerCase().includes(q)) : clockableJobs).slice(0, 25);
  }, [jobSearch, clockableJobs]);

  const assignedForSelected = useMemo(() => {
    if (!selectedJob) return new Map<number, number>();   // codeId -> assignmentId
    const m = new Map<number, number>();
    assignments.filter(a => a.jobKind === selectedJob.kind && a.jobRef === selectedJob.ref).forEach(a => m.set(a.costCodeId, a.id));
    return m;
  }, [assignments, selectedJob]);

  const toggleAssign = async (code: CostCode) => {
    if (!selectedJob) return;
    setBusy(true);
    try {
      const existing = assignedForSelected.get(code.id);
      if (existing) await timeTrackingService.unassignCostCode(existing);
      else await timeTrackingService.assignCostCode(companyId, selectedJob.kind, selectedJob.ref, code.id);
      await loadAssignments();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Global cost-code list */}
      <div className={`rounded-xl border p-4 ${card}`}>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Cost codes</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <input className={`${input} w-24`} placeholder="Code" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} />
          <input className={`${input} flex-1 min-w-[140px]`} placeholder="Description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          <button disabled={busy || !draft.code.trim()} onClick={addCode} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white disabled:opacity-50">
            <Plus size={15} /> Add
          </button>
        </div>
        {costCodes.length === 0 ? (
          <p className="text-sm text-slate-500">No cost codes yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {costCodes.map(c => (
              <li key={c.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'} ${c.isActive ? '' : 'opacity-50'}`}>
                <span className="text-sm min-w-0 truncate"><span className="font-bold">{c.code}</span>{c.description ? ` — ${c.description}` : ''}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(c)} className="text-xs font-semibold text-brand">{c.isActive ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => removeCode(c.id)} className="text-red-500"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-job assignment */}
      <div className={`rounded-xl border p-4 ${card}`}>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Assign codes to a job</h3>
        {selectedJob ? (
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold truncate">{selectedJob.label}</span>
            <button className="text-xs text-brand font-semibold shrink-0 ml-2" onClick={() => { setSelectedJob(null); setJobSearch(''); }}>Change</button>
          </div>
        ) : (
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${input} w-full pl-9`} placeholder="Search jobs…" value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
            {jobSearch && (
              <div className={`mt-1 max-h-52 overflow-y-auto rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                {filteredJobs.map(j => (
                  <button key={`${j.kind}:${j.ref}`} onClick={() => { setSelectedJob(j); setJobSearch(''); }}
                    className={`w-full text-left px-3 py-2 text-sm ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                    {j.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedJob && (
          <>
            <p className="text-[11px] text-slate-500 mb-2">
              {assignedForSelected.size === 0
                ? 'No codes assigned — this job currently offers the full active list.'
                : 'Only checked codes will be offered when clocking into this job.'}
            </p>
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {costCodes.filter(c => c.isActive).map(c => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={assignedForSelected.has(c.id)} disabled={busy} onChange={() => toggleAssign(c)} />
                    <span><span className="font-bold">{c.code}</span>{c.description ? ` — ${c.description}` : ''}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
