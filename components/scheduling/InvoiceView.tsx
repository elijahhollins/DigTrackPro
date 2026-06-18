import { useEffect, useMemo, useState } from 'react';
import { FileDown, Trash2, Settings, Receipt } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService.ts';
import {
  Employee, Equipment, Material, ServiceJob, Invoice, InvoiceSettings,
} from '../../services/schedulingTypes.ts';
import { computeTotals } from './costUtils.ts';
import { generateInvoicePdf } from './invoicePdf.ts';

interface InvoiceViewProps {
  companyId: string;
  companyName?: string;
  isAdmin: boolean;
  isDarkMode?: boolean;
}

const DEFAULT_SETTINGS = (companyName: string): Omit<InvoiceSettings, 'id' | 'companyId'> => ({
  companyName: companyName || 'My Company',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  logoInitials: '',
  paymentTerms: 'Payment due within 30 days.',
  headerColor: '#0a142d',
  accentColor: '#c49614',
});

export default function InvoiceView({ companyId, companyName, isAdmin, isDarkMode }: InvoiceViewProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Omit<InvoiceSettings, 'id' | 'companyId'>>(DEFAULT_SETTINGS(companyName ?? ''));

  const reload = async () => {
    setLoading(true);
    try {
      const [j, inv, emp, eq, mat, s] = await Promise.all([
        scheduleService.getServiceJobs(),
        scheduleService.getInvoices(),
        scheduleService.getEmployees(),
        scheduleService.getEquipment(),
        scheduleService.getMaterials(),
        scheduleService.getInvoiceSettings(),
      ]);
      setJobs(j); setInvoices(inv); setEmployees(emp); setEquipment(eq); setMaterials(mat);
      setSettings(s);
      if (s) setDraft({ ...s });
    } catch (err) {
      console.error('[InvoiceView] load failed', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const branding: InvoiceSettings = useMemo(
    () => settings ?? { id: 0, companyId, ...DEFAULT_SETTINGS(companyName ?? '') },
    [settings, companyId, companyName],
  );

  const card    = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const text    = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subtext = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const input   = `px-3 py-2 rounded-lg border text-sm w-full transition focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const rowCls  = isDarkMode ? 'border-slate-700/70 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50';
  const ghostBtn = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`;

  const downloadFor = (job: ServiceJob, existing?: Invoice) => {
    const totals = existing
      ? { labor: existing.laborTotal, equipment: existing.equipmentTotal, material: existing.materialTotal, grand: existing.grandTotal }
      : computeTotals(job.logs, materials);
    generateInvoicePdf({
      job,
      logs: job.logs ?? [],
      totals,
      invoiceNumber: existing?.invoiceNumber ?? `INV-${job.jobNumber || job.id}-${Date.now().toString().slice(-4)}`,
      invoiceDate: existing?.date ? new Date(existing.date) : new Date(),
      dueDate: existing?.dueDate ? new Date(existing.dueDate) : new Date(Date.now() + 30 * 864e5),
      branding, employees, equipment, materials,
    });
  };

  const generateInvoice = async (job: ServiceJob) => {
    const totals = computeTotals(job.logs, materials);
    const invoiceNumber = `INV-${job.jobNumber || job.id}-${Date.now().toString().slice(-4)}`;
    const now = new Date();
    const due = new Date(Date.now() + 30 * 864e5);
    await scheduleService.createInvoice(companyId, {
      jobId: job.id,
      invoiceNumber,
      date: now.toISOString(),
      dueDate: due.toISOString(),
      status: 'draft',
      laborTotal: totals.labor,
      equipmentTotal: totals.equipment,
      materialTotal: totals.material,
      grandTotal: totals.grand,
      data: { logs: job.logs ?? [] },
    });
    downloadFor(job);
    reload();
  };

  const saveSettings = async () => {
    const saved = await scheduleService.upsertInvoiceSettings(companyId, draft);
    setSettings(saved);
    setShowSettings(false);
  };

  const statusColor = (s: Invoice['status']) =>
    s === 'paid' ? 'bg-emerald-500/15 text-emerald-500'
      : s === 'sent' ? 'bg-brand/15 text-brand'
        : 'bg-slate-500/15 text-slate-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 text-brand">
            <Receipt size={16} />
          </span>
          <h3 className={`text-base font-bold ${text}`}>Invoices</h3>
        </div>
        {isAdmin && (
          <button onClick={() => setShowSettings(s => !s)} className={ghostBtn}>
            <Settings size={15} />Invoice settings
          </button>
        )}
      </div>

      {showSettings && (
        <div className={`rounded-2xl border ${card} p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3`}>
          <p className={`sm:col-span-2 text-[10px] font-bold uppercase tracking-widest ${subtext}`}>Invoice branding</p>
          <input className={input} placeholder="Company name" value={draft.companyName} onChange={e => setDraft({ ...draft, companyName: e.target.value })} />
          <input className={input} placeholder="Company email" value={draft.companyEmail} onChange={e => setDraft({ ...draft, companyEmail: e.target.value })} />
          <input className={input} placeholder="Address" value={draft.companyAddress} onChange={e => setDraft({ ...draft, companyAddress: e.target.value })} />
          <input className={input} placeholder="Phone" value={draft.companyPhone} onChange={e => setDraft({ ...draft, companyPhone: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Payment terms" value={draft.paymentTerms} onChange={e => setDraft({ ...draft, paymentTerms: e.target.value })} />
          <label className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border ${isDarkMode ? 'border-slate-600' : 'border-slate-300'} ${subtext}`}>Header color <input type="color" className="w-9 h-6 rounded cursor-pointer bg-transparent" value={draft.headerColor} onChange={e => setDraft({ ...draft, headerColor: e.target.value })} /></label>
          <label className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border ${isDarkMode ? 'border-slate-600' : 'border-slate-300'} ${subtext}`}>Accent color <input type="color" className="w-9 h-6 rounded cursor-pointer bg-transparent" value={draft.accentColor} onChange={e => setDraft({ ...draft, accentColor: e.target.value })} /></label>
          <button onClick={saveSettings} className="sm:col-span-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold transition-all hover:opacity-90 shadow-sm">Save settings</button>
        </div>
      )}

      {loading ? (
        <div className={`rounded-2xl border ${card} p-8 flex items-center justify-center gap-2 ${subtext} text-sm shadow-sm`}>
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-brand animate-spin" />
          Loading invoices…
        </div>
      ) : (
        <>
          {/* Generate from a job */}
          <div className={`rounded-2xl border ${card} p-4 sm:p-5 shadow-sm`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${subtext}`}>Generate from job</h4>
            {jobs.length === 0 && <p className={`text-sm ${subtext}`}>No service jobs yet. Add jobs and work logs first.</p>}
            {jobs.map(job => {
              const t = computeTotals(job.logs, materials);
              return (
                <div key={job.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold text-sm ${text}`}>{job.jobNumber || job.jobName || `Job ${job.id}`}</span>
                    <span className={`block text-xs ${subtext}`}>{job.customerName || '—'} · {(job.logs ?? []).length} logs</span>
                  </div>
                  <span className={`font-mono tabular-nums text-sm font-semibold ${text}`}>${t.grand.toFixed(2)}</span>
                  <button onClick={() => downloadFor(job)} className={ghostBtn}><FileDown size={14} />Preview</button>
                  {isAdmin && <button onClick={() => generateInvoice(job)} className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold transition-all hover:opacity-90 shadow-sm whitespace-nowrap">Create invoice</button>}
                </div>
              );
            })}
          </div>

          {/* Saved invoices */}
          <div className={`rounded-2xl border ${card} p-4 sm:p-5 shadow-sm`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${subtext} flex items-center gap-1.5`}><Receipt size={13} />Saved invoices</h4>
            {invoices.length === 0 && <p className={`text-sm ${subtext}`}>No invoices created yet.</p>}
            {invoices.map(inv => {
              const job = jobs.find(j => j.id === inv.jobId);
              return (
                <div key={inv.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className={`flex-1 text-sm font-mono ${text}`}>{inv.invoiceNumber}</span>
                  {isAdmin ? (
                    <select className={`text-xs font-semibold capitalize rounded-full px-2.5 py-1 border-0 cursor-pointer ${statusColor(inv.status)}`} value={inv.status} onChange={e => scheduleService.updateInvoiceStatus(inv.id, e.target.value as Invoice['status']).then(reload)}>
                      <option value="draft">draft</option><option value="sent">sent</option><option value="paid">paid</option>
                    </select>
                  ) : <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-full ${statusColor(inv.status)}`}>{inv.status}</span>}
                  <span className={`w-24 text-right font-mono tabular-nums text-sm font-semibold ${text}`}>${inv.grandTotal.toFixed(2)}</span>
                  {job && <button onClick={() => downloadFor(job, inv)} className="text-slate-400 hover:text-brand transition-colors" aria-label="Download invoice"><FileDown size={16} /></button>}
                  {isAdmin && <button onClick={() => scheduleService.deleteInvoice(inv.id).then(reload)} className="text-slate-400 hover:text-rose-600 transition-colors" aria-label="Delete invoice"><Trash2 size={15} /></button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
