import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, FileText, Upload, Clock, Package, Users, Truck,
  CalendarDays, Activity, Trash2, Pencil, CheckCircle2, RotateCcw, X, Receipt,
} from 'lucide-react';
import { Job, DigTicket, TicketStatus, InventoryItem, InventoryItemType, InventoryMovement, JobPrint } from '../types.ts';
import { getTicketStatus, getStatusColor, formatDateStr } from '../utils/dateUtils.ts';
import { apiService } from '../services/apiService.ts';
import { scheduleService } from '../services/scheduleService.ts';
import { timeTrackingService } from '../services/timeTrackingService.ts';
import { CostCode, JobCostCodeAssignment, TimeEntry, entryRoundedHours } from '../services/timeTrackingTypes.ts';
import { Employee } from '../services/schedulingTypes.ts';
import { jobInvoiceService } from '../services/jobInvoiceService.ts';
import { JobInvoiceModal } from './JobInvoiceModal.tsx';
import { supabase } from '../lib/supabaseClient.ts';

interface JobHubProps {
  jobs: Job[];
  tickets: DigTicket[];
  companyId: string;
  isAdmin: boolean;
  isDarkMode?: boolean;
  schedulingEnabled?: boolean;
  timeTrackingEnabled?: boolean;
  inventoryEnabled?: boolean;
  // Bumped by the parent whenever the Job form closes, so we re-read cost-code assignments.
  refreshKey?: number;
  onCreateJob: () => void;
  onEditJob: (job: Job) => void;
  onDeleteJob: (job: Job) => void;
  onToggleComplete: (job: Job) => Promise<void> | void;
  onUpdateJob: (job: Job) => Promise<void> | void;
  onOpenMarkup: (job: Job) => void;
  onViewDoc: (url: string) => void;
  onViewMedia: (job: Job) => void;
}

interface ScheduleBlockRow {
  id: string;
  crewId: string;
  jobNumber: string;
  startDate: string;
  durationDays: number;
  type: 'job' | 'delay';
}

// The five ticket health buckets we summarize, in priority order.
const HEALTH_ORDER: TicketStatus[] = [
  TicketStatus.VALID,
  TicketStatus.EXTENDABLE,
  TicketStatus.REFRESH_NEEDED,
  TicketStatus.PENDING,
  TicketStatus.EXPIRED,
];

const HEALTH_DOT: Record<string, string> = {
  [TicketStatus.VALID]: 'bg-emerald-500',
  [TicketStatus.EXTENDABLE]: 'bg-orange-500',
  [TicketStatus.REFRESH_NEEDED]: 'bg-amber-500',
  [TicketStatus.PENDING]: 'bg-slate-400',
  [TicketStatus.EXPIRED]: 'bg-rose-500',
  [TicketStatus.OTHER]: 'bg-slate-400',
};

export const JobHub: React.FC<JobHubProps> = ({
  jobs, tickets, companyId, isAdmin, isDarkMode,
  schedulingEnabled, timeTrackingEnabled, inventoryEnabled, refreshKey,
  onCreateJob, onEditJob, onDeleteJob, onToggleComplete, onUpdateJob, onOpenMarkup, onViewDoc, onViewMedia,
}) => {
  const [search, setSearch] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // ── inline customer edit ────────────────────────────────────────────────────
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // ── company-wide aux data (loaded once) ──────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [assignments, setAssignments] = useState<JobCostCodeAssignment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlockRow[]>([]);
  const [crewNames, setCrewNames] = useState<Map<string, string>>(new Map());

  // ── per-job data ──────────────────────────────────────────────────────────
  const [prints, setPrints] = useState<JobPrint[]>([]);
  const [printsLoading, setPrintsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── invoicing ───────────────────────────────────────────────────────────────
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);

  const card = isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200 shadow-sm';
  const subtle = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  // Load aux data once per company.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tasks: Promise<void>[] = [];
        if (timeTrackingEnabled) {
          tasks.push((async () => {
            const [emps, entries, codes, asg] = await Promise.all([
              scheduleService.getEmployees().catch(() => []),
              timeTrackingService.listEntries().catch(() => []),
              timeTrackingService.getCostCodes().catch(() => []),
              timeTrackingService.getAssignments().catch(() => []),
            ]);
            if (!alive) return;
            setEmployees(emps); setTimeEntries(entries); setCostCodes(codes); setAssignments(asg);
          })());
        } else {
          tasks.push(scheduleService.getEmployees().then(e => { if (alive) setEmployees(e); }).catch(() => {}));
        }
        if (inventoryEnabled) {
          tasks.push((async () => {
            const [items, mvs] = await Promise.all([
              apiService.getInventoryItems().catch(() => []),
              apiService.getInventoryMovements().catch(() => []),
            ]);
            if (!alive) return;
            setInventory(items); setMovements(mvs);
          })());
        }
        if (schedulingEnabled) {
          tasks.push((async () => {
            const [{ data: blockRows }, { data: crewRows }] = await Promise.all([
              supabase.from('schedule_blocks').select('id, crew_id, job_number, start_date, duration_days, type').eq('company_id', companyId),
              supabase.from('schedule_crews').select('id, name').eq('company_id', companyId),
            ]);
            if (!alive) return;
            setBlocks((blockRows ?? []).map((r: Record<string, unknown>) => ({
              id: r.id as string, crewId: r.crew_id as string, jobNumber: r.job_number as string,
              startDate: r.start_date as string, durationDays: Number(r.duration_days) || 0, type: r.type as 'job' | 'delay',
            })));
            const m = new Map<string, string>();
            (crewRows ?? []).forEach((c: Record<string, unknown>) => m.set(c.id as string, c.name as string));
            setCrewNames(m);
          })());
        }
        await Promise.all(tasks);
      } catch (err) { console.error('JobHub aux load failed:', err); }
    })();
    return () => { alive = false; };
  }, [companyId, timeTrackingEnabled, inventoryEnabled, schedulingEnabled, refreshKey]);

  // ── grouped ticket lookup by job number ─────────────────────────────────────
  const ticketsByJob = useMemo(() => {
    const m = new Map<string, DigTicket[]>();
    tickets.forEach(t => {
      if (t.isArchived) return;
      const arr = m.get(t.jobNumber) ?? [];
      arr.push(t);
      m.set(t.jobNumber, arr);
    });
    return m;
  }, [tickets]);

  const healthFor = (jobNumber: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    (ticketsByJob.get(jobNumber) ?? []).forEach(t => {
      const s = getTicketStatus(t);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  };

  const visibleJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = jobs.filter(j =>
      !q || j.jobNumber.toLowerCase().includes(q) || (j.jobName ?? '').toLowerCase().includes(q) || (j.city ?? '').toLowerCase().includes(q)
    );
    if (hideCompleted) list = list.filter(j => !j.isComplete);
    return [...list].sort((a, b) => b.jobNumber.localeCompare(a.jobNumber, undefined, { numeric: true }));
  }, [jobs, search, hideCompleted]);

  // Keep a valid selection.
  useEffect(() => {
    if (selectedId && jobs.some(j => j.id === selectedId)) return;
    if (!selectedId && visibleJobs.length && typeof window !== 'undefined' && window.innerWidth >= 768) {
      setSelectedId(visibleJobs[0].id);
    }
  }, [visibleJobs, selectedId, jobs]);

  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedId) ?? null, [jobs, selectedId]);

  // Load prints for the selected job.
  useEffect(() => {
    if (!selectedJob) { setPrints([]); return; }
    let alive = true;
    setPrintsLoading(true);
    apiService.getJobPrints(selectedJob.jobNumber)
      .then(p => { if (alive) setPrints(p); })
      .catch(() => { if (alive) setPrints([]); })
      .finally(() => { if (alive) setPrintsLoading(false); });
    return () => { alive = false; };
  }, [selectedJob?.jobNumber]);

  // Load saved-invoice count for the selected job (drives the header badge).
  const loadInvoiceCount = (jobId: string) => {
    jobInvoiceService.listByJob(jobId).then(list => setInvoiceCount(list.length)).catch(() => setInvoiceCount(0));
  };
  useEffect(() => {
    if (!selectedJob) { setInvoiceCount(0); return; }
    loadInvoiceCount(selectedJob.id);
  }, [selectedJob?.id]);

  const selectJob = (id: string) => { setSelectedId(id); setMobileDetailOpen(true); };

  // Drop any in-progress customer edit when the selected job changes.
  useEffect(() => { setEditingCustomer(false); setSavingCustomer(false); }, [selectedId]);

  const beginEditCustomer = () => {
    if (!selectedJob) return;
    setCustomerDraft(selectedJob.customer ?? '');
    setEditingCustomer(true);
  };

  const saveCustomer = async () => {
    if (!selectedJob) return;
    const next = customerDraft.trim();
    if (next === (selectedJob.customer ?? '')) { setEditingCustomer(false); return; }
    setSavingCustomer(true);
    try {
      await onUpdateJob({ ...selectedJob, customer: next });
      setEditingCustomer(false);
    } catch (err: any) {
      alert('Failed to save customer: ' + (err?.message ?? err));
    } finally {
      setSavingCustomer(false);
    }
  };

  // ── derived detail data for the selected job ────────────────────────────────
  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const detail = useMemo(() => {
    if (!selectedJob) return null;
    const job = selectedJob;
    const jobTickets = (ticketsByJob.get(job.jobNumber) ?? []).slice()
      .sort((a, b) => getTicketStatus(a).localeCompare(getTicketStatus(b)));
    const health = healthFor(job.jobNumber);

    const jobEntries = timeEntries.filter(e => e.jobKind === 'dig' && e.jobRef === job.id);
    let totalHours = 0;
    let laborCost = 0;
    jobEntries.forEach(e => {
      const h = entryRoundedHours(e);
      totalHours += h;
      const rate = e.employeeId ? (empById.get(e.employeeId)?.hourlyRate ?? 0) : 0;
      laborCost += h * rate;
    });
    const activeEntries = jobEntries.filter(e => !e.clockedOutAt);
    const crewOnSite = Array.from(new Set(activeEntries.map(e => empById.get(e.employeeId)?.name).filter(Boolean))) as string[];

    const jobItems = inventory.filter(i => i.currentJobId === job.id);
    const materials = jobItems.filter(i => i.itemType === InventoryItemType.MATERIAL);
    const equipment = jobItems.filter(i => i.itemType === InventoryItemType.EQUIPMENT);
    const jobMovements = movements.filter(m => m.jobId === job.id || m.jobNumber === job.jobNumber);

    const jobBlocks = blocks.filter(b => b.jobNumber === job.jobNumber && b.type === 'job')
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const assignedCodes = costCodes.filter(c =>
      assignments.some(a => a.jobKind === 'dig' && a.jobRef === job.id && a.costCodeId === c.id));

    // Merged activity feed (newest first).
    type Act = { ts: number; kind: string; text: string };
    const acts: Act[] = [];
    jobTickets.forEach(t => acts.push({ ts: t.createdAt, kind: 'ticket', text: `Ticket ${t.ticketNo} added — ${t.street || 'locate'}` }));
    jobMovements.forEach(m => acts.push({ ts: m.createdAt, kind: 'inventory', text: `${m.movementType.replace('_', ' ').toLowerCase()} — ${m.notes || m.performedByName || 'inventory'}` }));
    jobEntries.forEach(e => acts.push({ ts: new Date(e.clockedInAt).getTime(), kind: 'time', text: `${empById.get(e.employeeId)?.name ?? 'Crew'} clocked in` }));
    prints.forEach(p => acts.push({ ts: p.createdAt, kind: 'print', text: `Blueprint added — ${p.fileName}` }));
    acts.sort((a, b) => b.ts - a.ts);

    return {
      jobTickets, health, totalHours, laborCost, crewOnSite, jobEntries,
      materials, equipment, jobMovements, jobBlocks, assignedCodes, activity: acts.slice(0, 18),
    };
  }, [selectedJob, ticketsByJob, timeEntries, empById, inventory, movements, blocks, costCodes, assignments, prints]);

  // ── actions ─────────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    if (!selectedJob) return;
    setUploading(true);
    try {
      await apiService.uploadJobPrint(selectedJob.jobNumber, file, companyId);
      const p = await apiService.getJobPrints(selectedJob.jobNumber);
      setPrints(p);
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message ?? err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── render helpers ──────────────────────────────────────────────────────────
  const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-brand">{icon}</span>
        <h3 className={`text-[10px] font-black uppercase tracking-[0.18em] ${subtle}`}>{title}</h3>
      </div>
      {right}
    </div>
  );

  const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`rounded-2xl border p-5 ${card} ${className ?? ''}`}>{children}</div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Jobs</h2>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${subtle}`}>Project Command Center</p>
        </div>
        {isAdmin && (
          <button onClick={onCreateJob} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-[#0f172a] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 hover:scale-[1.02] active:scale-95 transition-all self-start">
            <Plus size={15} /> New Job
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr] gap-5">
        {/* ── LEFT: job list ───────────────────────────────────────────────── */}
        <div className={`${mobileDetailOpen ? 'hidden md:block' : 'block'}`}>
          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            <div className="p-4 space-y-3 border-b border-black/5">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search jobs…"
                  className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 accent-brand rounded" checked={hideCompleted} onChange={() => setHideCompleted(v => !v)} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${subtle}`}>Hide Completed</span>
              </label>
            </div>

            <div className="max-h-[70vh] overflow-y-auto divide-y divide-black/5">
              {visibleJobs.length === 0 && (
                <p className={`p-6 text-center text-[11px] font-bold uppercase tracking-widest ${subtle}`}>No jobs found</p>
              )}
              {visibleJobs.map(job => {
                const health = healthFor(job.jobNumber);
                const active = ticketsByJob.get(job.jobNumber)?.length ?? 0;
                const isSel = job.id === selectedId;
                const needsAttention = (health[TicketStatus.EXPIRED] ?? 0) + (health[TicketStatus.REFRESH_NEEDED] ?? 0) + (health[TicketStatus.EXTENDABLE] ?? 0);
                return (
                  <button key={job.id} onClick={() => selectJob(job.id)}
                    className={`w-full text-left px-4 py-3 transition-colors group ${isSel ? (isDarkMode ? 'bg-brand/10' : 'bg-brand/5') : 'hover:bg-black/5'} ${job.isComplete ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-black uppercase tracking-tight ${isSel ? 'text-brand' : ''}`}>#{job.jobNumber}</span>
                      {job.isComplete
                        ? <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase">Closed</span>
                        : needsAttention > 0
                          ? <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase">{needsAttention} ⚠</span>
                          : null}
                    </div>
                    <p className={`text-[11px] font-bold truncate mt-0.5 ${subtle}`}>{job.jobName || `Job #${job.jobNumber}`}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {HEALTH_ORDER.filter(s => health[s]).map(s => (
                        <span key={s} className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT[s]}`} />
                          <span className="text-[9px] font-black">{health[s]}</span>
                        </span>
                      ))}
                      {active === 0 && <span className={`text-[9px] font-bold uppercase ${subtle}`}>No tickets</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: detail ────────────────────────────────────────────────── */}
        <div className={`${mobileDetailOpen ? 'block' : 'hidden md:block'} space-y-5`}>
          {!selectedJob || !detail ? (
            <Panel className="min-h-[300px] flex items-center justify-center">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${subtle}`}>Select a job to view details</p>
            </Panel>
          ) : (
            <>
              {/* Header / actions */}
              <Panel>
                <button onClick={() => setMobileDetailOpen(false)} className={`md:hidden flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mb-3 ${subtle}`}>
                  <X size={13} /> Back to list
                </button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black uppercase tracking-tight">#{selectedJob.jobNumber}</h2>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${selectedJob.isComplete ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {selectedJob.isComplete ? 'Closed' : 'Active'}
                      </span>
                    </div>
                    <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{selectedJob.jobName || `Job #${selectedJob.jobNumber}`}</p>
                    <p className={`text-[11px] font-semibold ${subtle}`}>{[selectedJob.address, selectedJob.city, selectedJob.state].filter(Boolean).join(', ')}</p>

                    {/* Customer — view + inline edit */}
                    <div className="mt-2">
                      <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Customer</p>
                      {editingCustomer ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            autoFocus
                            value={customerDraft}
                            onChange={e => setCustomerDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCustomer(); if (e.key === 'Escape') setEditingCustomer(false); }}
                            disabled={savingCustomer}
                            placeholder="Client / customer name"
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                          />
                          <button onClick={saveCustomer} disabled={savingCustomer}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand text-[#0f172a] text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                            <CheckCircle2 size={12} /> {savingCustomer ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingCustomer(false)} disabled={savingCustomer}
                            className={`flex items-center px-2 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className={`text-[11px] font-bold ${selectedJob.customer ? (isDarkMode ? 'text-slate-200' : 'text-slate-700') : `italic ${subtle}`}`}>
                            {selectedJob.customer || 'No customer set'}
                          </p>
                          {isAdmin && (
                            <button onClick={beginEditCustomer} className={`p-1 rounded-md transition-colors ${subtle} hover:text-brand`} aria-label="Edit customer">
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setShowInvoice(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 transition-all">
                        <Receipt size={13} /> Invoice{invoiceCount > 0 ? ` (${invoiceCount})` : ''}
                      </button>
                      <button onClick={() => onEditJob(selectedJob)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button onClick={() => onToggleComplete(selectedJob)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedJob.isComplete ? (isDarkMode ? 'bg-white/10' : 'bg-slate-100') : 'bg-emerald-500 text-white'}`}>
                        {selectedJob.isComplete ? <><RotateCcw size={13} /> Reopen</> : <><CheckCircle2 size={13} /> Complete</>}
                      </button>
                      <button onClick={() => onDeleteJob(selectedJob)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Quick stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Panel>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Active Tickets</p>
                  <p className="text-2xl font-black mt-1">{detail.jobTickets.length}</p>
                </Panel>
                <Panel>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Need Attention</p>
                  <p className="text-2xl font-black mt-1 text-rose-500">
                    {(detail.health[TicketStatus.EXPIRED] ?? 0) + (detail.health[TicketStatus.REFRESH_NEEDED] ?? 0) + (detail.health[TicketStatus.EXTENDABLE] ?? 0)}
                  </p>
                </Panel>
                <Panel>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Hours Logged</p>
                  <p className="text-2xl font-black mt-1">{timeTrackingEnabled ? detail.totalHours.toFixed(1) : '—'}</p>
                </Panel>
                <Panel>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Labor Cost</p>
                  <p className="text-2xl font-black mt-1">{timeTrackingEnabled ? `$${Math.round(detail.laborCost).toLocaleString()}` : '—'}</p>
                </Panel>
              </div>

              {/* Ticket health */}
              <Panel>
                <SectionTitle icon={<Activity size={14} />} title="Ticket Health" />
                <div className="flex flex-wrap gap-2 mb-4">
                  {HEALTH_ORDER.map(s => (
                    <div key={s} className={`px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wide ${getStatusColor(s)}`}>
                      {s.replace('_', ' ')}: {detail.health[s] ?? 0}
                    </div>
                  ))}
                </div>
                {detail.jobTickets.length === 0 ? (
                  <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>No active tickets on this job.</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {detail.jobTickets.map(t => {
                      const s = getTicketStatus(t);
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-black/5 last:border-0">
                          <button onClick={() => t.documentUrl && onViewDoc(t.documentUrl)}
                            className={`text-[11px] font-mono font-bold ${t.documentUrl ? 'text-brand hover:underline' : subtle}`}>
                            {t.ticketNo}
                          </button>
                          <span className={`text-[11px] font-bold flex-1 truncate ${subtle}`}>{t.street}</span>
                          <span className={`px-1.5 py-0.5 rounded-md border uppercase text-[8px] font-black ${getStatusColor(s)}`}>{s.replace('_', ' ')}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              {/* Blueprints / PDFs */}
              <Panel>
                <SectionTitle
                  icon={<FileText size={14} />} title="Blueprints & Prints"
                  right={isAdmin && (
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 text-brand text-[9px] font-black uppercase tracking-widest hover:bg-brand/20 disabled:opacity-50">
                      <Upload size={12} /> {uploading ? 'Uploading…' : 'Add'}
                    </button>
                  )}
                />
                <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                {printsLoading ? (
                  <p className={`text-[11px] font-bold ${subtle}`}>Loading…</p>
                ) : prints.length === 0 ? (
                  <button onClick={() => isAdmin ? fileRef.current?.click() : onOpenMarkup(selectedJob)}
                    className={`w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all ${isDarkMode ? 'border-white/10 hover:border-brand/40' : 'border-slate-200 hover:border-brand/40'}`}>
                    <FileText size={20} className="text-slate-400" />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${subtle}`}>{isAdmin ? 'Upload blueprint or PDF' : 'No prints yet'}</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {prints.map(p => (
                      <button key={p.id} onClick={() => onOpenMarkup(selectedJob)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <FileText size={18} className="text-rose-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold truncate">{p.fileName}</p>
                          <p className={`text-[9px] font-semibold uppercase ${subtle}`}>{p.isPinned ? 'Pinned · ' : ''}{formatDateStr(new Date(p.createdAt).toISOString().slice(0, 10))}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {prints.length > 0 && (
                  <button onClick={() => onOpenMarkup(selectedJob)} className="mt-3 text-[10px] font-black uppercase tracking-widest text-brand hover:underline">
                    Open markup editor →
                  </button>
                )}
              </Panel>

              {/* Cost codes — read-only here; edit via the Edit Job form */}
              {timeTrackingEnabled && (
                <Panel>
                  <SectionTitle
                    icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                    title="Cost Codes"
                    right={isAdmin && (
                      <button onClick={() => onEditJob(selectedJob)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 text-brand text-[9px] font-black uppercase tracking-widest hover:bg-brand/20">
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                  />
                  {detail.assignedCodes.length === 0 ? (
                    <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>
                      {!isAdmin
                        ? 'Full active list available when clocking in.'
                        : 'No codes assigned — crew sees the full active list. Use Edit to assign codes.'}
                    </p>
                  ) : (
                    <>
                      {isAdmin && (
                        <p className={`text-[10px] mb-2 ${subtle}`}>Crew can only clock into these codes. Use Edit to change them.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {detail.assignedCodes.map(c => (
                          <span key={c.id} className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-[10px] font-black">
                            {c.code}{c.description ? <span className="font-semibold opacity-70"> — {c.description}</span> : ''}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </Panel>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Crew & equipment */}
                <Panel>
                  <SectionTitle icon={<Users size={14} />} title="Crew & Equipment On Site" />
                  <div className="space-y-3">
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${subtle}`}>Crew clocked in</p>
                      {!timeTrackingEnabled ? <p className={`text-[11px] ${subtle}`}>Time tracking off</p>
                        : detail.crewOnSite.length === 0 ? <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>Nobody clocked in</p>
                        : <div className="flex flex-wrap gap-1.5">{detail.crewOnSite.map(n => <span key={n} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-black">{n}</span>)}</div>}
                    </div>
                    <div className="pt-2 border-t border-black/5">
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${subtle}`}>Equipment assigned</p>
                      {!inventoryEnabled ? <p className={`text-[11px] ${subtle}`}>Inventory off</p>
                        : detail.equipment.length === 0 ? <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>None assigned</p>
                        : <div className="space-y-1">{detail.equipment.map(i => (
                            <div key={i.id} className="flex items-center gap-2 text-[11px] font-bold">
                              <Truck size={13} className="text-brand shrink-0" />
                              <span className="truncate">{i.unitNumber ? `#${i.unitNumber} · ` : ''}{i.name}</span>
                            </div>
                          ))}</div>}
                    </div>
                  </div>
                </Panel>

                {/* Materials */}
                <Panel>
                  <SectionTitle icon={<Package size={14} />} title="Material Orders" />
                  {!inventoryEnabled ? <p className={`text-[11px] ${subtle}`}>Inventory off</p>
                    : detail.materials.length === 0 && detail.jobMovements.length === 0
                      ? <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>No materials linked to this job.</p>
                      : (
                        <div className="space-y-2">
                          {detail.materials.map(i => (
                            <div key={i.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-bold truncate">{i.name}</span>
                              <span className={`font-black ${subtle}`}>{i.quantity} {i.unit}</span>
                            </div>
                          ))}
                          {detail.jobMovements.length > 0 && (
                            <div className="pt-2 mt-1 border-t border-black/5 space-y-1">
                              <p className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Recent movements</p>
                              {detail.jobMovements.slice(0, 5).map(m => (
                                <div key={m.id} className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="truncate">{m.movementType.replace('_', ' ').toLowerCase()}{m.quantityDelta != null ? ` (${m.quantityDelta})` : ''}</span>
                                  <span className={subtle}>{formatDateStr(new Date(m.createdAt).toISOString().slice(0, 10))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                </Panel>
              </div>

              {/* Hours detail */}
              {timeTrackingEnabled && (
                <Panel>
                  <SectionTitle icon={<Clock size={14} />} title="Hours Worked" right={<span className={`text-[10px] font-black ${subtle}`}>{detail.totalHours.toFixed(2)} h total</span>} />
                  {detail.jobEntries.length === 0 ? (
                    <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>No time logged on this job yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {detail.jobEntries.slice(0, 12).map(e => (
                        <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-black/5 last:border-0 text-[11px]">
                          <span className="font-bold truncate">{empById.get(e.employeeId)?.name ?? 'Crew'}</span>
                          <span className={subtle}>{formatDateStr(e.clockedInAt.slice(0, 10))}</span>
                          <span className="font-black">{entryRoundedHours(e).toFixed(2)} h{!e.clockedOutAt ? ' · open' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}

              {/* Schedule */}
              {schedulingEnabled && (
                <Panel>
                  <SectionTitle icon={<CalendarDays size={14} />} title="Scheduled Work" />
                  {detail.jobBlocks.length === 0 ? (
                    <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>Nothing scheduled for this job.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.jobBlocks.map(b => (
                        <div key={b.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold">{crewNames.get(b.crewId) ?? 'Crew'}</span>
                          <span className={subtle}>{formatDateStr(b.startDate)} · {b.durationDays}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}

              {/* Activity timeline */}
              <Panel>
                <SectionTitle icon={<Activity size={14} />} title="Recent Activity" />
                {detail.activity.length === 0 ? (
                  <p className={`text-[11px] font-bold uppercase italic ${subtle}`}>No activity recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.activity.map((a, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${a.kind === 'ticket' ? 'bg-blue-500' : a.kind === 'time' ? 'bg-emerald-500' : a.kind === 'inventory' ? 'bg-amber-500' : 'bg-brand'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold capitalize truncate">{a.text}</p>
                          <p className={`text-[9px] font-bold uppercase ${subtle}`}>{new Date(a.ts).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Media link */}
              <button onClick={() => onViewMedia(selectedJob)}
                className={`w-full py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                View Job Photos & Media →
              </button>
            </>
          )}
        </div>
      </div>

      {showInvoice && selectedJob && detail && (
        <JobInvoiceModal
          job={selectedJob}
          companyId={companyId}
          isDarkMode={isDarkMode}
          prefill={{
            // Crew: aggregate logged hours per employee, rate from the employee record.
            crew: Array.from(
              detail.jobEntries.reduce((map, e) => {
                const prev = map.get(e.employeeId) ?? { employeeId: e.employeeId, hours: 0, rate: empById.get(e.employeeId)?.hourlyRate ?? 0 };
                prev.hours += entryRoundedHours(e);
                map.set(e.employeeId, prev);
                return map;
              }, new Map<number, { employeeId: number; hours: number; rate: number }>()).values(),
            ),
            // Equipment on site: one line each, hours blank for the user to fill.
            equipment: detail.equipment.map(i => ({ equipmentId: i.id, hours: 0, rate: i.hourlyRate ?? 0 })),
            // Materials linked to the job: qty from inventory, price for the user to fill.
            materials: detail.materials.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: 0 })),
            customerName: selectedJob.customer ?? '',
            address: [selectedJob.address, selectedJob.city, selectedJob.state].filter(Boolean).join(', '),
          }}
          onClose={() => setShowInvoice(false)}
          onSaved={() => loadInvoiceCount(selectedJob.id)}
        />
      )}
    </div>
  );
};

export default JobHub;
