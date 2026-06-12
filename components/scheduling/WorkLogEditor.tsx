import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, FileStack, X } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService.ts';
import {
  Employee, Equipment, Material, ServiceJob, WorkLogEntry, WorkLogTemplate,
} from '../../services/schedulingTypes.ts';
import { computeTotals } from './costUtils.ts';

interface WorkLogEditorProps {
  companyId: string;
  isAdmin: boolean;
  isDarkMode?: boolean;
}

const EMPTY_ENTRY: WorkLogEntry = { employees: [], equipment: [], materials: [] };
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function WorkLogEditor({ companyId, isAdmin, isDarkMode }: WorkLogEditorProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [templates, setTemplates] = useState<WorkLogTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJobForm, setShowJobForm] = useState(false);

  // New-job draft
  const [jobDraft, setJobDraft] = useState({ customerName: '', jobName: '', jobNumber: '', address: '' });

  // Work-log draft for the selected job
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [entry, setEntry] = useState<WorkLogEntry>(EMPTY_ENTRY);

  const reload = async () => {
    setLoading(true);
    try {
      const [j, emp, eq, mat, tpl] = await Promise.all([
        scheduleService.getServiceJobs(),
        scheduleService.getEmployees(),
        scheduleService.getEquipment(),
        scheduleService.getMaterials(),
        scheduleService.getTemplates(),
      ]);
      setJobs(j); setEmployees(emp); setEquipment(eq); setMaterials(mat); setTemplates(tpl);
      if (selectedId == null && j.length > 0) setSelectedId(j[0].id);
    } catch (err) {
      console.error('[WorkLogEditor] load failed', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const selected = useMemo(() => jobs.find(j => j.id === selectedId) ?? null, [jobs, selectedId]);

  const card    = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const text    = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subtext = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const input   = `px-2.5 py-1.5 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;

  const createJob = async () => {
    if (!jobDraft.jobNumber.trim() && !jobDraft.jobName.trim()) return;
    const j = await scheduleService.createServiceJob(companyId, {
      customerName: jobDraft.customerName.trim(),
      jobName: jobDraft.jobName.trim(),
      jobNumber: jobDraft.jobNumber.trim(),
      address: jobDraft.address.trim(),
      startDate: null, endDate: null, notes: '', status: 'active', foremanId: null,
    });
    setJobDraft({ customerName: '', jobName: '', jobNumber: '', address: '' });
    setShowJobForm(false);
    setSelectedId(j.id);
    reload();
  };

  // ── entry line mutators ────────────────────────────────────────────────────
  const addLabor = () => {
    const e = employees[0];
    if (!e) return;
    setEntry(p => ({ ...p, employees: [...p.employees, { employeeId: e.id, hours: 8, rate: e.hourlyRate }] }));
  };
  const addEquip = () => {
    const e = equipment[0];
    if (!e) return;
    setEntry(p => ({ ...p, equipment: [...p.equipment, { equipmentId: e.id, hours: 8, rate: e.hourlyRate }] }));
  };
  const addMaterial = () => {
    setEntry(p => ({ ...p, materials: [...p.materials, { name: '', quantity: 1, unitPrice: 0 }] }));
  };

  const totals = computeTotals(
    [{ id: 0, jobId: selected?.id ?? 0, date, notes, data: entry }],
    materials,
  );

  const saveLog = async () => {
    if (!selected) return;
    await scheduleService.createWorkLog(selected.id, date, notes, entry);
    setNotes(''); setEntry(EMPTY_ENTRY); setDate(todayISO());
    reload();
  };

  const saveTemplate = async () => {
    const name = prompt('Template name?');
    if (!name) return;
    await scheduleService.createTemplate(companyId, name, entry);
    reload();
  };
  const applyTemplate = (t: WorkLogTemplate) => setEntry(t.data);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Jobs list */}
      <div className={`rounded-xl border ${card} p-3 space-y-2`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold ${text}`}>Jobs</h3>
          {isAdmin && (
            <button onClick={() => setShowJobForm(s => !s)} className="text-brand hover:opacity-80">
              {showJobForm ? <X size={16} /> : <Plus size={16} />}
            </button>
          )}
        </div>
        {showJobForm && (
          <div className="space-y-1.5 pb-2 border-b border-slate-700/30">
            <input className={`${input} w-full`} placeholder="Job number" value={jobDraft.jobNumber} onChange={e => setJobDraft({ ...jobDraft, jobNumber: e.target.value })} />
            <input className={`${input} w-full`} placeholder="Job name" value={jobDraft.jobName} onChange={e => setJobDraft({ ...jobDraft, jobName: e.target.value })} />
            <input className={`${input} w-full`} placeholder="Customer" value={jobDraft.customerName} onChange={e => setJobDraft({ ...jobDraft, customerName: e.target.value })} />
            <input className={`${input} w-full`} placeholder="Address" value={jobDraft.address} onChange={e => setJobDraft({ ...jobDraft, address: e.target.value })} />
            <button onClick={createJob} className="w-full px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold">Create job</button>
          </div>
        )}
        {loading ? <p className={subtext}>Loading…</p> : jobs.map(j => (
          <button
            key={j.id}
            onClick={() => setSelectedId(j.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
              selectedId === j.id ? 'bg-brand text-white' : isDarkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <span className="font-semibold">{j.jobNumber || j.jobName || `Job ${j.id}`}</span>
            <span className="block text-xs opacity-70">{j.customerName}</span>
          </button>
        ))}
        {!loading && jobs.length === 0 && <p className={subtext}>No jobs yet.</p>}
      </div>

      {/* Selected job logs + editor */}
      <div className="lg:col-span-2 space-y-4">
        {!selected ? (
          <div className={`rounded-xl border ${card} p-6 ${subtext}`}>Select or create a job to log work.</div>
        ) : (
          <>
            {/* Existing logs */}
            <div className={`rounded-xl border ${card} p-4`}>
              <h3 className={`text-sm font-bold mb-2 ${text}`}>Daily logs — {selected.jobNumber || selected.jobName}</h3>
              {(selected.logs ?? []).length === 0 && <p className={subtext}>No logs recorded yet.</p>}
              {(selected.logs ?? []).map(log => {
                const t = computeTotals([log], materials);
                return (
                  <div key={log.id} className={`flex items-center gap-3 py-2 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                    <span className={`flex-1 text-sm ${text}`}>{new Date(log.date).toLocaleDateString('en-US')}</span>
                    <span className={`text-xs ${subtext}`}>
                      {log.data.employees.length} labor · {log.data.equipment.length} equip · {log.data.materials.length} mat
                    </span>
                    <span className={`w-24 text-right font-mono text-sm ${text}`}>${t.grand.toFixed(2)}</span>
                    <button onClick={() => scheduleService.deleteWorkLog(log.id).then(reload)} className="text-rose-500 hover:text-rose-600"><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>

            {/* New log editor */}
            <div className={`rounded-xl border ${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={`text-sm font-bold ${text}`}>Add daily log</h3>
                <div className="flex items-center gap-2">
                  {templates.length > 0 && (
                    <select className={input} onChange={e => { const t = templates.find(x => x.id === Number(e.target.value)); if (t) applyTemplate(t); }} defaultValue="">
                      <option value="" disabled>Apply template…</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>

              {/* Labor lines */}
              <Section title="Labor" onAdd={addLabor} disabled={employees.length === 0} text={text}>
                {entry.employees.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className={`${input} flex-1`} value={l.employeeId} onChange={e => {
                      const emp = employees.find(x => x.id === Number(e.target.value));
                      setEntry(p => ({ ...p, employees: p.employees.map((x, xi) => xi === i ? { ...x, employeeId: Number(e.target.value), rate: emp?.hourlyRate ?? x.rate } : x) }));
                    }}>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                    <input type="number" className={`${input} w-20`} value={l.hours} onChange={e => setEntry(p => ({ ...p, employees: p.employees.map((x, xi) => xi === i ? { ...x, hours: Number(e.target.value) } : x) }))} />
                    <span className={`w-16 text-right text-xs ${subtext}`}>${l.rate.toFixed(2)}/h</span>
                    <button onClick={() => setEntry(p => ({ ...p, employees: p.employees.filter((_, xi) => xi !== i) }))} className="text-rose-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </Section>

              {/* Equipment lines */}
              <Section title="Equipment" onAdd={addEquip} disabled={equipment.length === 0} text={text}>
                {entry.equipment.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className={`${input} flex-1`} value={l.equipmentId} onChange={e => {
                      const eq = equipment.find(x => x.id === Number(e.target.value));
                      setEntry(p => ({ ...p, equipment: p.equipment.map((x, xi) => xi === i ? { ...x, equipmentId: Number(e.target.value), rate: eq?.hourlyRate ?? x.rate } : x) }));
                    }}>
                      {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                    </select>
                    <input type="number" className={`${input} w-20`} value={l.hours} onChange={e => setEntry(p => ({ ...p, equipment: p.equipment.map((x, xi) => xi === i ? { ...x, hours: Number(e.target.value) } : x) }))} />
                    <span className={`w-16 text-right text-xs ${subtext}`}>${l.rate.toFixed(2)}/h</span>
                    <button onClick={() => setEntry(p => ({ ...p, equipment: p.equipment.filter((_, xi) => xi !== i) }))} className="text-rose-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </Section>

              {/* Material lines */}
              <Section title="Materials" onAdd={addMaterial} disabled={false} text={text}>
                {entry.materials.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={`${input} flex-1`} list="material-catalog" placeholder="Material" value={l.name} onChange={e => {
                      const cat = materials.find(m => m.name === e.target.value);
                      setEntry(p => ({ ...p, materials: p.materials.map((x, xi) => xi === i ? { ...x, name: e.target.value, materialId: cat?.id, unitPrice: cat?.unitPrice ?? x.unitPrice } : x) }));
                    }} />
                    <input type="number" className={`${input} w-16`} value={l.quantity} onChange={e => setEntry(p => ({ ...p, materials: p.materials.map((x, xi) => xi === i ? { ...x, quantity: Number(e.target.value) } : x) }))} />
                    <input type="number" className={`${input} w-20`} value={l.unitPrice} onChange={e => setEntry(p => ({ ...p, materials: p.materials.map((x, xi) => xi === i ? { ...x, unitPrice: Number(e.target.value) } : x) }))} />
                    <button onClick={() => setEntry(p => ({ ...p, materials: p.materials.filter((_, xi) => xi !== i) }))} className="text-rose-500"><Trash2 size={14} /></button>
                  </div>
                ))}
                <datalist id="material-catalog">{materials.map(m => <option key={m.id} value={m.name} />)}</datalist>
              </Section>

              <input className={`${input} w-full`} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />

              <div className="flex items-center justify-between pt-1">
                <span className={`font-mono text-sm ${text}`}>Total: ${totals.grand.toFixed(2)}</span>
                <div className="flex gap-2">
                  <button onClick={saveTemplate} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border ${card} ${text}`}><FileStack size={15} />Save as template</button>
                  <button onClick={saveLog} className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold"><Save size={15} />Save log</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, onAdd, disabled, text, children }: { title: string; onAdd: () => void; disabled: boolean; text: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wide ${text} opacity-70`}>{title}</span>
        <button onClick={onAdd} disabled={disabled} className="text-brand disabled:opacity-30"><Plus size={15} /></button>
      </div>
      {children}
    </div>
  );
}
