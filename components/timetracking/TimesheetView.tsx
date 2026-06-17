import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Check, X, Trash2, Pencil } from 'lucide-react';
import { User } from '../../types.ts';
import { Employee } from '../../services/schedulingTypes.ts';
import { CostCode, ClockableJob, TimeEntry, entryRoundedHours } from '../../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';

interface TimesheetViewProps {
  sessionUser: User;
  employees: Employee[];
  costCodes: CostCode[];
  clockableJobs: ClockableJob[];
  isDarkMode?: boolean;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—';
// datetime-local needs local time, not the trailing-Z UTC string.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export default function TimesheetView({ sessionUser, employees, costCodes, clockableJobs, isDarkMode }: TimesheetViewProps) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [empFilter, setEmpFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const codeById = useMemo(() => new Map(costCodes.map(c => [c.id, c])), [costCodes]);
  const codeLabel = (id: number | null) => (id != null && codeById.get(id)) ? codeById.get(id)!.code : '—';

  const load = async () => {
    setBusy(true);
    try {
      const list = await timeTrackingService.listEntries({
        from: new Date(from + 'T00:00:00').toISOString(),
        to: new Date(to + 'T23:59:59').toISOString(),
        employeeId: empFilter === 'all' ? undefined : empFilter,
        approved: statusFilter === 'all' ? undefined : statusFilter === 'approved',
      });
      setEntries(list);
      setSelected(new Set());
    } catch (err) { console.error('Failed to load timesheet:', err); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, empFilter, statusFilter]);

  const totalHours = useMemo(() => entries.reduce((sum, e) => sum + entryRoundedHours(e), 0), [entries]);

  const toggleSel = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = entries.length > 0 && entries.every(e => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.map(e => e.id)));

  const approve = async (approved: boolean) => {
    if (selected.size === 0) return;
    setBusy(true);
    try { await timeTrackingService.setApproval([...selected], approved, sessionUser.id); await load(); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try { await timeTrackingService.deleteEntry(id); await load(); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await timeTrackingService.updateEntry(editing.id, {
        clockedInAt: editing.clockedInAt,
        clockedOutAt: editing.clockedOutAt,
        costCodeId: editing.costCodeId,
        jobKind: editing.jobKind,
        jobRef: editing.jobRef,
        jobLabel: editing.jobLabel,
        note: editing.note,
      });
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const rows = entries.map(e => ({
      Employee: empById.get(e.employeeId)?.name || `#${e.employeeId}`,
      Job: e.jobLabel,
      'Job Type': e.jobKind,
      'Cost Code': codeLabel(e.costCodeId),
      'Clock In': fmt(e.clockedInAt),
      'Clock Out': fmt(e.clockedOutAt),
      'Hours (rounded)': entryRoundedHours(e).toFixed(2),
      Note: e.note,
      Approved: e.approved ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${from}_to_${to}.csv`, { bookType: 'csv' });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`rounded-xl border p-4 flex flex-wrap items-end gap-3 ${card}`}>
        <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">From</label>
          <input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">To</label>
          <input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Employee</label>
          <select className={input} value={empFilter} onChange={e => setEmpFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Status</label>
          <select className={input} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select></div>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCsv} disabled={entries.length === 0} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-slate-300 disabled:opacity-50">
            <Download size={15} /> CSV
          </button>
          <button onClick={() => approve(true)} disabled={selected.size === 0 || busy} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-green-600 text-white disabled:opacity-50">
            <Check size={15} /> Approve
          </button>
          <button onClick={() => approve(false)} disabled={selected.size === 0 || busy} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border border-slate-300 disabled:opacity-50">
            <X size={15} /> Unapprove
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`rounded-xl border overflow-x-auto ${card}`}>
        <table className="w-full text-sm">
          <thead className={isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th className="p-2">Employee</th>
              <th className="p-2">Job</th>
              <th className="p-2">Code</th>
              <th className="p-2">In</th>
              <th className="p-2">Out</th>
              <th className="p-2 text-right">Hrs</th>
              <th className="p-2">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-slate-500">No time entries in this range.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id} className={`border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <td className="p-2"><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSel(e.id)} /></td>
                <td className="p-2 font-semibold">{empById.get(e.employeeId)?.name || `#${e.employeeId}`}</td>
                <td className="p-2 max-w-[200px] truncate">{e.jobLabel}</td>
                <td className="p-2">{codeLabel(e.costCodeId)}</td>
                <td className="p-2 whitespace-nowrap">{fmt(e.clockedInAt)}</td>
                <td className="p-2 whitespace-nowrap">{e.clockedOutAt ? fmt(e.clockedOutAt) : <span className="text-brand font-semibold">Active</span>}</td>
                <td className="p-2 text-right font-mono">{entryRoundedHours(e).toFixed(2)}</td>
                <td className="p-2">{e.approved ? <span className="text-green-600 font-semibold">Approved</span> : <span className="text-slate-500">Pending</span>}</td>
                <td className="p-2 whitespace-nowrap">
                  <button onClick={() => setEditing(e)} className="text-brand mr-2"><Pencil size={14} /></button>
                  <button onClick={() => remove(e.id)} className="text-red-500"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className={`border-t font-bold ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <td colSpan={6} className="p-2 text-right">Total (rounded)</td>
                <td className="p-2 text-right font-mono">{totalHours.toFixed(2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className={`w-full max-w-md rounded-xl border p-5 space-y-3 ${card}`} onClick={ev => ev.stopPropagation()}>
            <h3 className="font-bold">Edit time entry</h3>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Job</label>
              <select className={`${input} w-full`} value={`${editing.jobKind}:${editing.jobRef}`}
                onChange={ev => { const j = clockableJobs.find(x => `${x.kind}:${x.ref}` === ev.target.value); if (j) setEditing({ ...editing, jobKind: j.kind, jobRef: j.ref, jobLabel: j.label }); }}>
                {!clockableJobs.some(j => `${j.kind}:${j.ref}` === `${editing.jobKind}:${editing.jobRef}`) &&
                  <option value={`${editing.jobKind}:${editing.jobRef}`}>{editing.jobLabel}</option>}
                {clockableJobs.map(j => <option key={`${j.kind}:${j.ref}`} value={`${j.kind}:${j.ref}`}>{j.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Cost code</label>
              <select className={`${input} w-full`} value={editing.costCodeId ?? ''} onChange={ev => setEditing({ ...editing, costCodeId: ev.target.value ? Number(ev.target.value) : null })}>
                <option value="">— none —</option>
                {costCodes.map(c => <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ''}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Clock in</label>
                <input type="datetime-local" className={`${input} w-full`} value={toLocalInput(editing.clockedInAt)}
                  onChange={ev => setEditing({ ...editing, clockedInAt: new Date(ev.target.value).toISOString() })} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Clock out</label>
                <input type="datetime-local" className={`${input} w-full`} value={toLocalInput(editing.clockedOutAt)}
                  onChange={ev => setEditing({ ...editing, clockedOutAt: ev.target.value ? new Date(ev.target.value).toISOString() : null })} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Note</label>
              <input className={`${input} w-full`} value={editing.note} onChange={ev => setEditing({ ...editing, note: ev.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-300">Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
