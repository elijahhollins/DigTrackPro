import React, { useMemo, useState } from 'react';
import { DigTicket, TicketFieldChange } from '../types.ts';
import { diffTicket } from '../utils/ticketUpdateUtils.ts';

interface TicketUpdateModalProps {
  ticket: DigTicket;
  /** Persists the edited ticket and appends the audit entry. */
  onSave: (updated: DigTicket, changes: TicketFieldChange[], reason: string) => Promise<void>;
  onClose: () => void;
  isDarkMode?: boolean;
}

/**
 * Admin-only focused editor for the handful of ticket fields that change in the
 * field (dates, ticket number, work-begun, archive state). Every save requires a
 * reason, and the resulting before/after diff is written to the ticket's update
 * log. Full-record edits still go through TicketForm.
 */
const TicketUpdateModal: React.FC<TicketUpdateModalProps> = ({ ticket, onSave, onClose, isDarkMode }) => {
  const [ticketNo, setTicketNo] = useState(ticket.ticketNo ?? '');
  const [workDate, setWorkDate] = useState(ticket.workDate ?? '');
  const [digByDate, setDigByDate] = useState(ticket.digByDate ?? '');
  const [expires, setExpires] = useState(ticket.expires ?? '');
  // workBegun is tri-state: undefined (not answered), true, false.
  const [workBegun, setWorkBegun] = useState<boolean | undefined>(ticket.workBegun);
  const [isArchived, setIsArchived] = useState(!!ticket.isArchived);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const draft: DigTicket = useMemo(() => ({
    ...ticket,
    ticketNo: ticketNo.trim(),
    workDate,
    digByDate: digByDate || undefined,
    expires,
    workBegun,
    isArchived,
  }), [ticket, ticketNo, workDate, digByDate, expires, workBegun, isArchived]);

  const changes = useMemo(() => diffTicket(ticket, draft), [ticket, draft]);
  const hasChanges = changes.length > 0;

  const inputCls = `w-full px-4 py-3 border rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${
    isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-black'
  }`;
  const labelCls = `block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) { setError('Nothing has changed yet.'); return; }
    if (!ticketNo.trim()) { setError('Ticket # cannot be empty.'); return; }
    const trimmedReason = reason.trim();
    if (!trimmedReason) { setError('A reason is required so the update can be logged.'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave(draft, changes, trimmedReason);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border flex flex-col animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex justify-between items-center shrink-0 ${isDarkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60'}`}>
          <div>
            <h2 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Update Ticket</h2>
            <p className={`text-[10px] font-bold mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              #{ticket.ticketNo} · Job {ticket.jobNumber}
            </p>
          </div>
          <button type="button" onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className={labelCls} htmlFor="tu-ticket-no">Ticket #</label>
            <input id="tu-ticket-no" className={inputCls} value={ticketNo} onChange={e => setTicketNo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="tu-work-date">Work Date</label>
              <input id="tu-work-date" type="date" className={inputCls} value={workDate} onChange={e => setWorkDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="tu-dig-by">Dig By</label>
              <input id="tu-dig-by" type="date" className={inputCls} value={digByDate} onChange={e => setDigByDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="tu-expires">Expires</label>
            <input id="tu-expires" type="date" className={inputCls} value={expires} onChange={e => setExpires(e.target.value)} />
          </div>

          <div>
            <span className={labelCls}>Work Begun</span>
            <div className={`flex rounded-xl border p-0.5 gap-0.5 w-fit ${isDarkMode ? 'bg-[#0b1629] border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`}>
              {([['Unset', undefined], ['Yes', true], ['No', false]] as const).map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setWorkBegun(value)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    workBegun === value
                      ? isDarkMode ? 'bg-brand/20 text-brand border border-brand/25' : 'bg-white text-brand shadow-sm border border-slate-200'
                      : isDarkMode ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className={`flex items-center gap-2.5 cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            <input type="checkbox" className="w-4 h-4 accent-[var(--brand-primary)]" checked={isArchived} onChange={e => setIsArchived(e.target.checked)} />
            <span className="text-[10px] font-black uppercase tracking-widest">Archived</span>
          </label>

          {/* Live diff preview so the admin sees exactly what will be logged. */}
          <div className={`rounded-xl border px-4 py-3 ${isDarkMode ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Will be logged</p>
            {hasChanges ? (
              <ul className="space-y-1">
                {changes.map(c => (
                  <li key={c.field} className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span className="text-brand">{c.label}</span> {c.before} → {c.after}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`text-[11px] font-bold italic ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No changes yet.</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="tu-reason">Reason for update <span className="text-rose-500">*</span></label>
            <textarea
              id="tu-reason"
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="e.g. Julie extended the locate through 4/12"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex justify-end gap-2 shrink-0 ${isDarkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60'}`}>
          <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isDarkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'}`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !hasChanges}
            className="px-5 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : 'Save & Log Update'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TicketUpdateModal;
