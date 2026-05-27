
import React, { useState } from 'react';
import { UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_UTILITIES,
} from '../services/inboundTypes.ts';

interface InboundTicketFormProps {
  initialData?:  InboundTicket | null;
  crewUsers:     UserRecord[];
  companyId:     string;
  createdBy:     string;
  isDarkMode?:   boolean;
  onSave:        (ticket: Omit<InboundTicket, 'id' | 'createdAt'>) => Promise<void>;
  onClose:       () => void;
}

const emptyForm = () => ({
  ticketNumber:  '',
  siteAddress:   '',
  digStartDate:  '',
  dueDate:       '',
  callerName:    '',
  callerPhone:   '',
  utilityTypes:  [] as string[],
  notes:         '',
  assignedTo:    null as string | null,
  status:        InboundTicketStatus.UNASSIGNED,
});

const InboundTicketForm: React.FC<InboundTicketFormProps> = ({
  initialData,
  crewUsers,
  companyId,
  createdBy,
  isDarkMode,
  onSave,
  onClose,
}) => {
  const [form, setForm] = useState(() =>
    initialData
      ? {
          ticketNumber:  initialData.ticketNumber,
          siteAddress:   initialData.siteAddress,
          digStartDate:  initialData.digStartDate,
          dueDate:       initialData.dueDate,
          callerName:    initialData.callerName,
          callerPhone:   initialData.callerPhone,
          utilityTypes:  [...initialData.utilityTypes],
          notes:         initialData.notes,
          assignedTo:    initialData.assignedTo,
          status:        initialData.status,
        }
      : emptyForm(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleUtility = (u: string) =>
    setForm(prev => ({
      ...prev,
      utilityTypes: prev.utilityTypes.includes(u)
        ? prev.utilityTypes.filter(x => x !== u)
        : [...prev.utilityTypes, u],
    }));

  const handleAssigneeChange = (userId: string) => {
    if (!userId) {
      setForm(prev => ({ ...prev, assignedTo: null, status: InboundTicketStatus.UNASSIGNED }));
    } else {
      setForm(prev => ({
        ...prev,
        assignedTo: userId,
        status:
          prev.status === InboundTicketStatus.UNASSIGNED
            ? InboundTicketStatus.ASSIGNED
            : prev.status,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticketNumber.trim()) { setError('Ticket number is required.'); return; }
    if (!form.siteAddress.trim())  { setError('Site address is required.');  return; }
    if (!form.dueDate)             { setError('Due date is required.');       return; }

    setIsSaving(true);
    setError('');
    try {
      await onSave({
        companyId,
        createdBy,
        ticketNumber: form.ticketNumber.trim(),
        siteAddress:  form.siteAddress.trim(),
        digStartDate: form.digStartDate,
        dueDate:      form.dueDate,
        callerName:   form.callerName.trim(),
        callerPhone:  form.callerPhone.trim(),
        utilityTypes: form.utilityTypes,
        notes:        form.notes.trim(),
        assignedTo:   form.assignedTo,
        status:       form.status,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to save ticket.');
    } finally {
      setIsSaving(false);
    }
  };

  const dm = isDarkMode ?? false;
  const inputCls = `w-full px-3.5 py-2.5 border rounded-xl text-[12px] font-medium outline-none transition-all ${
    dm
      ? 'bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 focus:border-brand/40 focus:bg-white/8'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  }`;
  const labelCls = `block text-[9px] font-black uppercase tracking-[0.15em] mb-1.5 ${
    dm ? 'text-slate-500' : 'text-slate-500'
  }`;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div
        className={`w-full max-w-2xl rounded-[2rem] shadow-2xl border overflow-hidden flex flex-col max-h-[90vh] ${
          dm ? 'bg-[#0b1629] border-white/10' : 'bg-white border-slate-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-7 py-5 border-b shrink-0 ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand mb-0.5">
              {initialData ? 'Edit Ticket' : 'New Ticket'}
            </p>
            <h2 className={`text-lg font-black uppercase tracking-tight font-display ${dm ? 'text-white' : 'text-slate-900'}`}>
              Inbound Locate Request
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all ${dm ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-7 py-6 space-y-5">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Ticket Number *</label>
              <input
                className={inputCls}
                placeholder="e.g. 2026-08432"
                value={form.ticketNumber}
                onChange={e => set('ticketNumber', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Due Date *</label>
              <input
                type="date"
                className={inputCls}
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
              />
            </div>
          </div>

          {/* Row 2 */}
          <div>
            <label className={labelCls}>Site Address *</label>
            <input
              className={inputCls}
              placeholder="123 Main St, Springfield, IL"
              value={form.siteAddress}
              onChange={e => set('siteAddress', e.target.value)}
            />
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Dig Start Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.digStartDate}
                onChange={e => set('digStartDate', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Assign To</label>
              <select
                className={inputCls}
                value={form.assignedTo ?? ''}
                onChange={e => handleAssigneeChange(e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {crewUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4 — Caller */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Caller Name</label>
              <input
                className={inputCls}
                placeholder="John Doe"
                value={form.callerName}
                onChange={e => set('callerName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Caller Phone</label>
              <input
                className={inputCls}
                placeholder="(555) 555-5555"
                value={form.callerPhone}
                onChange={e => set('callerPhone', e.target.value)}
              />
            </div>
          </div>

          {/* Utility Types */}
          <div>
            <label className={labelCls}>Utility Types</label>
            <div className="flex flex-wrap gap-2">
              {INBOUND_UTILITIES.map(u => {
                const selected = form.utilityTypes.includes(u);
                return (
                  <button
                    type="button"
                    key={u}
                    onClick={() => toggleUtility(u)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      selected
                        ? 'bg-brand/15 text-brand border-brand/30'
                        : dm
                        ? 'bg-white/[0.04] text-slate-500 border-white/[0.08] hover:border-brand/20 hover:text-brand'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-brand/30 hover:text-brand'
                    }`}
                  >
                    {u}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Initial Notes</label>
            <textarea
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Describe the locate request, special instructions, etc."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && (
            <p className="text-[11px] font-semibold text-rose-500">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-7 py-5 border-t shrink-0 ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              dm
                ? 'border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20'
                : 'border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : initialData ? 'Save Changes' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InboundTicketForm;
