import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Download, Save, Users, Truck, Package, FileText, Clock } from 'lucide-react';
import { Job, InventoryItem, InventoryItemType } from '../types.ts';
import {
  Employee, Equipment, ServiceJob, WorkLog, WorkLogEntry, InvoiceSettings, JobInvoice, JobInvoiceData,
} from '../services/schedulingTypes.ts';
import { generateInvoicePdf } from './scheduling/invoicePdf.ts';
import { computeTotals } from './scheduling/costUtils.ts';
import { jobInvoiceService } from '../services/jobInvoiceService.ts';
import { scheduleService } from '../services/scheduleService.ts';
import { apiService } from '../services/apiService.ts';
import { TimeEntry, entryRoundedHours } from '../services/timeTrackingTypes.ts';

type CrewLine = WorkLogEntry['employees'][number];
type EquipLine = WorkLogEntry['equipment'][number];
type MatLine = WorkLogEntry['materials'][number];

interface PrefillData {
  crew: CrewLine[];
  equipment: EquipLine[];
  materials: MatLine[];
  customerName: string;
  address: string;
  // Raw time entries for this job, so the modal can re-pull crew hours by work date.
  timeEntries: TimeEntry[];
}

interface JobInvoiceModalProps {
  job: Job;
  companyId: string;
  isDarkMode?: boolean;
  prefill: PrefillData;
  onClose: () => void;
  onSaved?: () => void;
}

const DEFAULT_BRANDING = (companyId: string): InvoiceSettings => ({
  companyId,
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  logoInitials: '',
  paymentTerms: 'Payment due within 30 days.',
  headerColor: '#0a142d',
  accentColor: '#c49614',
});

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export const JobInvoiceModal: React.FC<JobInvoiceModalProps> = ({
  job, companyId, isDarkMode, prefill, onClose, onSaved,
}) => {
  // ── editable line items (seeded from the job's tracked data) ────────────────
  const [crew, setCrew] = useState<CrewLine[]>(prefill.crew);
  const [equipment, setEquipment] = useState<EquipLine[]>(prefill.equipment);
  const [materials, setMaterials] = useState<MatLine[]>(prefill.materials);

  const [customerName, setCustomerName] = useState(prefill.customerName);
  const [address, setAddress] = useState(prefill.address);
  const [invoiceDate, setInvoiceDate] = useState(toISODate(new Date()));

  // Work-date range over which crew hours are pulled (a time entry's clock-in day).
  // Defaults to the full span of the job's logged entries.
  const workDays = useMemo(
    () => prefill.timeEntries.map(e => e.clockedInAt.slice(0, 10)).sort(),
    [prefill.timeEntries],
  );
  const [workFrom, setWorkFrom] = useState(workDays[0] ?? '');
  const [workTo, setWorkTo] = useState(workDays[workDays.length - 1] ?? '');

  // ── catalogs + branding + history (loaded on mount) ─────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipCatalog, setEquipCatalog] = useState<Equipment[]>([]);
  const [matCatalog, setMatCatalog] = useState<InventoryItem[]>([]);
  const [branding, setBranding] = useState<InvoiceSettings>(DEFAULT_BRANDING(companyId));
  const [history, setHistory] = useState<JobInvoice[]>([]);
  const [saving, setSaving] = useState(false);

  const card = isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200';
  const subtle = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const inputCls = `px-2 py-1.5 rounded-lg border text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [emps, items, settings, invs] = await Promise.all([
        scheduleService.getEmployees().catch(() => [] as Employee[]),
        apiService.getInventoryItems().catch(() => [] as InventoryItem[]),
        scheduleService.getInvoiceSettings().catch(() => null),
        jobInvoiceService.listByJob(job.id).catch(() => [] as JobInvoice[]),
      ]);
      if (!alive) return;
      setEmployees(emps);
      setEquipCatalog(items
        .filter(i => i.itemType === InventoryItemType.EQUIPMENT)
        .map(i => ({ id: i.id, companyId: i.companyId, name: i.unitNumber ? `#${i.unitNumber} ${i.name}` : i.name, hourlyRate: i.hourlyRate ?? 0 })));
      setMatCatalog(items.filter(i => i.itemType === InventoryItemType.MATERIAL));
      if (settings) setBranding(settings);
      setHistory(invs);
    })();
    return () => { alive = false; };
  }, [job.id, companyId]);

  const empName = (id: number) => employees.find(e => e.id === id)?.name ?? `Employee #${id}`;
  const equipName = (id: string) => equipCatalog.find(e => e.id === id)?.name ?? `Equipment #${id}`;

  // Re-pull crew lines from the time entries whose work day falls in [workFrom, workTo],
  // grouped by employee with hours summed and rate from the employee record.
  const pullCrewFromWorkDates = () => {
    const inRange = prefill.timeEntries.filter(e => {
      const d = e.clockedInAt.slice(0, 10);
      return (!workFrom || d >= workFrom) && (!workTo || d <= workTo);
    });
    const byEmp = new Map<number, CrewLine>();
    for (const e of inRange) {
      const rate = employees.find(em => em.id === e.employeeId)?.hourlyRate
        ?? crew.find(c => c.employeeId === e.employeeId)?.rate ?? 0;
      const prev = byEmp.get(e.employeeId) ?? { employeeId: e.employeeId, hours: 0, rate };
      prev.hours += entryRoundedHours(e);
      byEmp.set(e.employeeId, prev);
    }
    setCrew(Array.from(byEmp.values()));
  };

  // ── totals ──────────────────────────────────────────────────────────────────
  const entry: WorkLogEntry = useMemo(() => ({ employees: crew, equipment, materials }), [crew, equipment, materials]);
  const totals = useMemo(() => computeTotals([{ id: 0, jobId: 0, date: invoiceDate, notes: '', data: entry }], []), [entry, invoiceDate]);

  const invoiceNumber = useMemo(() => `INV-${job.jobNumber}-${history.length + 1}`, [job.jobNumber, history.length]);

  const buildServiceJob = (cn: string, addr: string): ServiceJob => ({
    id: 0, companyId, customerName: cn, jobName: job.jobName || '', jobNumber: job.jobNumber,
    address: addr, startDate: null, endDate: null, notes: '', status: 'active', foremanId: null,
  });

  const download = (
    log: WorkLog, t: ReturnType<typeof computeTotals>, num: string, cn: string, addr: string, dt: Date,
  ) => {
    generateInvoicePdf({
      job: buildServiceJob(cn, addr),
      logs: [log], totals: t, invoiceNumber: num,
      invoiceDate: dt, branding,
      employees, equipment: equipCatalog, materials: [],
    });
  };

  const handleDownload = () => {
    download(
      { id: 0, jobId: 0, date: invoiceDate, notes: '', data: entry },
      totals, invoiceNumber, customerName, address, new Date(invoiceDate),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: JobInvoiceData = { customerName, address, employees: crew, equipment, materials };
      const saved = await jobInvoiceService.create(companyId, {
        jobId: job.id, invoiceNumber, date: invoiceDate, dueDate: null,
        laborTotal: totals.labor, equipmentTotal: totals.equipment,
        materialTotal: totals.material, grandTotal: totals.grand, data,
      });
      setHistory(prev => [saved, ...prev]);
      onSaved?.();
    } catch (err: any) {
      alert('Failed to save invoice: ' + (err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const downloadSaved = (inv: JobInvoice) => {
    const data = inv.data;
    const log: WorkLog = { id: 0, jobId: 0, date: inv.date ?? toISODate(new Date()), notes: '', data: { employees: data.employees, equipment: data.equipment, materials: data.materials } };
    download(
      log,
      { labor: inv.laborTotal, equipment: inv.equipmentTotal, material: inv.materialTotal, grand: inv.grandTotal },
      inv.invoiceNumber, data.customerName, data.address,
      inv.date ? new Date(inv.date) : new Date(),
    );
  };

  const deleteSaved = async (inv: JobInvoice) => {
    if (!confirm(`Delete invoice ${inv.invoiceNumber}?`)) return;
    try {
      await jobInvoiceService.delete(inv.id);
      setHistory(prev => prev.filter(i => i.id !== inv.id));
      onSaved?.();
    } catch (err: any) {
      alert('Failed to delete: ' + (err?.message ?? err));
    }
  };

  // ── line-item editors ─────────────────────────────────────────────────────
  const SectionHead: React.FC<{ icon: React.ReactNode; title: string; onAdd: () => void; addLabel: string }> = ({ icon, title, onAdd, addLabel }) => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-brand">{icon}</span>
        <h4 className={`text-[10px] font-black uppercase tracking-[0.18em] ${subtle}`}>{title}</h4>
      </div>
      <button onClick={onAdd} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-[9px] font-black uppercase tracking-widest hover:bg-brand/20">
        <Plus size={11} /> {addLabel}
      </button>
    </div>
  );

  const numInput = (val: number, onChange: (n: number) => void, w = 'w-20') => (
    <input type="number" min={0} step="0.01" value={Number.isFinite(val) ? val : 0}
      onChange={e => onChange(parseFloat(e.target.value) || 0)} className={`${inputCls} ${w} text-right`} />
  );

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[170] overflow-y-auto pt-8 pb-20 px-4">
      <div className={`w-full max-w-2xl mx-auto rounded-3xl shadow-2xl overflow-hidden border ${card}`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/5 flex justify-between items-center bg-black/5">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand">Create Invoice</h2>
            <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${subtle}`}>Job #{job.jobNumber} · {invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 opacity-50 hover:opacity-100 transition-opacity"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Bill-to + dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Bill To</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" className={`${inputCls} w-full`} />
            </div>
            <div className="space-y-1">
              <label className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Billing address" className={`${inputCls} w-full`} />
            </div>
            <div className="space-y-1">
              <label className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={`${inputCls} w-full`} />
            </div>
          </div>

          {/* Crew labor */}
          <div>
            <SectionHead icon={<Users size={14} />} title="Crew Labor" addLabel="Add crew"
              onAdd={() => setCrew(prev => [...prev, { employeeId: employees[0]?.id ?? 0, hours: 0, rate: employees[0]?.hourlyRate ?? 0 }])} />
            {/* Work-date range: pull employees + hours logged within the window. */}
            <div className={`flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Work From</label>
                <input type="date" value={workFrom} onChange={e => setWorkFrom(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div className="space-y-1">
                <label className={`text-[9px] font-black uppercase tracking-widest ${subtle}`}>Work To</label>
                <input type="date" value={workTo} onChange={e => setWorkTo(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <button onClick={pullCrewFromWorkDates} disabled={prefill.timeEntries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-[#0f172a] text-[9px] font-black uppercase tracking-widest disabled:opacity-40">
                <Clock size={12} /> Pull Hours
              </button>
              <span className={`text-[9px] font-bold ${subtle}`}>
                {prefill.timeEntries.length === 0 ? 'No time logged on this job' : `${prefill.timeEntries.length} entr${prefill.timeEntries.length === 1 ? 'y' : 'ies'} logged`}
              </span>
            </div>
            {crew.length === 0 ? <p className={`text-[11px] italic ${subtle}`}>No crew lines.</p> : (
              <div className="space-y-1.5">
                {crew.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={c.employeeId} onChange={e => setCrew(prev => prev.map((x, j) => j === i ? { ...x, employeeId: Number(e.target.value), rate: x.rate || (employees.find(em => em.id === Number(e.target.value))?.hourlyRate ?? 0) } : x))} className={`${inputCls} flex-1`}>
                      {employees.length === 0 && <option value={c.employeeId}>{empName(c.employeeId)}</option>}
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    {numInput(c.hours, n => setCrew(prev => prev.map((x, j) => j === i ? { ...x, hours: n } : x)))}
                    <span className={`text-[9px] ${subtle}`}>hrs ×</span>
                    {numInput(c.rate, n => setCrew(prev => prev.map((x, j) => j === i ? { ...x, rate: n } : x)))}
                    <span className="w-20 text-right text-[11px] font-black">${(c.hours * c.rate).toFixed(2)}</span>
                    <button onClick={() => setCrew(prev => prev.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Equipment */}
          <div>
            <SectionHead icon={<Truck size={14} />} title="Equipment" addLabel="Add equipment"
              onAdd={() => setEquipment(prev => [...prev, { equipmentId: equipCatalog[0]?.id ?? '', hours: 0, rate: equipCatalog[0]?.hourlyRate ?? 0 }])} />
            {equipment.length === 0 ? <p className={`text-[11px] italic ${subtle}`}>No equipment lines.</p> : (
              <div className="space-y-1.5">
                {equipment.map((eq, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={eq.equipmentId} onChange={e => setEquipment(prev => prev.map((x, j) => j === i ? { ...x, equipmentId: e.target.value, rate: x.rate || (equipCatalog.find(c => c.id === e.target.value)?.hourlyRate ?? 0) } : x))} className={`${inputCls} flex-1`}>
                      {equipCatalog.length === 0 && <option value={eq.equipmentId}>{equipName(eq.equipmentId)}</option>}
                      {equipCatalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {numInput(eq.hours, n => setEquipment(prev => prev.map((x, j) => j === i ? { ...x, hours: n } : x)))}
                    <span className={`text-[9px] ${subtle}`}>hrs ×</span>
                    {numInput(eq.rate, n => setEquipment(prev => prev.map((x, j) => j === i ? { ...x, rate: n } : x)))}
                    <span className="w-20 text-right text-[11px] font-black">${(eq.hours * eq.rate).toFixed(2)}</span>
                    <button onClick={() => setEquipment(prev => prev.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materials */}
          <div>
            <SectionHead icon={<Package size={14} />} title="Materials" addLabel="Add material"
              onAdd={() => setMaterials(prev => [...prev, { name: '', quantity: 1, unitPrice: 0 }])} />
            {materials.length === 0 ? <p className={`text-[11px] italic ${subtle}`}>No material lines.</p> : (
              <div className="space-y-1.5">
                {materials.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input list="job-invoice-materials" value={m.name} placeholder="Material"
                      onChange={e => setMaterials(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className={`${inputCls} flex-1`} />
                    {numInput(m.quantity, n => setMaterials(prev => prev.map((x, j) => j === i ? { ...x, quantity: n } : x)))}
                    <span className={`text-[9px] ${subtle}`}>×</span>
                    {numInput(m.unitPrice, n => setMaterials(prev => prev.map((x, j) => j === i ? { ...x, unitPrice: n } : x)))}
                    <span className="w-20 text-right text-[11px] font-black">${(m.quantity * m.unitPrice).toFixed(2)}</span>
                    <button onClick={() => setMaterials(prev => prev.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                ))}
                <datalist id="job-invoice-materials">
                  {matCatalog.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between"><span className={subtle}>Labor</span><span className="font-bold">${totals.labor.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className={subtle}>Equipment</span><span className="font-bold">${totals.equipment.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className={subtle}>Materials</span><span className="font-bold">${totals.material.toFixed(2)}</span></div>
              <div className="flex justify-between pt-2 mt-1 border-t border-black/10 text-sm"><span className="font-black uppercase tracking-widest">Total</span><span className="font-black text-brand">${totals.grand.toFixed(2)}</span></div>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <h4 className={`text-[10px] font-black uppercase tracking-[0.18em] mb-2 ${subtle}`}>Saved Invoices</h4>
              <div className="space-y-1.5">
                {history.map(inv => (
                  <div key={inv.id} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-brand shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold truncate">{inv.invoiceNumber}</p>
                        <p className={`text-[9px] font-semibold ${subtle}`}>{inv.date ?? ''} · ${inv.grandTotal.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => downloadSaved(inv)} className="p-1.5 rounded-lg bg-brand/10 text-brand hover:bg-brand/20" aria-label="Download"><Download size={13} /></button>
                      <button onClick={() => deleteSaved(inv)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10" aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-2 bg-black/5">
          <button onClick={onClose} className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>Close</button>
          <button onClick={handleDownload} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <Download size={13} /> Download PDF
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand text-[#0f172a] text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobInvoiceModal;
