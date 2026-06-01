
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketPhoto,
  InboundTicketNote,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
  INBOUND_UTILITIES,
  InboundTimeEntry,
  statusAfterAssign,
} from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import { statusBadge } from './InboundTicketRow.tsx';
import { fmtElapsed, fmtMinutes, computeDurationMinutes, useElapsedSeconds } from '../utils/inboundTimeUtils.ts';

interface InboundTicketDetailProps {
  ticket:      InboundTicket;
  users:       UserRecord[];
  sessionUser: User;
  isAdmin:     boolean;
  isDarkMode?: boolean;
  onClose:     () => void;
  onTicketUpdated: (ticket: InboundTicket) => void;
  onTicketDeleted: (id: string) => void;
}

const fmt = (dateStr: string): string => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return '—';
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString();
};

const fmtTs = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const STATUS_ORDER: InboundTicketStatus[] = [
  InboundTicketStatus.UNASSIGNED,
  InboundTicketStatus.ASSIGNED,
  InboundTicketStatus.IN_PROGRESS,
  InboundTicketStatus.COMPLETED,
];

// ── Time tab sub-component ────────────────────────────────────────────────────

interface TimeTabProps {
  ticket:              InboundTicket;
  sessionUser:         User;
  isAdmin:             boolean;
  isDarkMode:          boolean;
  timeEntries:         InboundTimeEntry[];
  onTimeEntriesChanged:(entries: InboundTimeEntry[]) => void;
  onTicketUpdated:     (ticket: InboundTicket) => void;
}

const TimeTab: React.FC<TimeTabProps> = ({
  ticket,
  sessionUser,
  isAdmin,
  isDarkMode: dm,
  timeEntries,
  onTimeEntriesChanged,
  onTicketUpdated,
}) => {
  const myActiveEntry = timeEntries.find(
    e => e.technicianId === sessionUser.id && e.clockedOutAt === null,
  ) ?? null;

  const [clocking, setClocking] = useState(false);
  const elapsed = useElapsedSeconds(myActiveEntry ? myActiveEntry.clockedInAt : null);

  // Compute total logged minutes (closed entries + current open entry)
  const totalMinutes = timeEntries.reduce((sum, e) => sum + computeDurationMinutes(e), 0);

  const handleClockIn = async () => {
    setClocking(true);
    try {
      const entry = await inboundTicketService.clockIn(ticket.id, ticket.companyId, sessionUser.id, sessionUser.name);
      onTimeEntriesChanged([entry, ...timeEntries]);
      if (ticket.status === InboundTicketStatus.ASSIGNED) {
        onTicketUpdated({ ...ticket, status: InboundTicketStatus.IN_PROGRESS });
      }
    } catch (err) {
      console.error('Clock-in failed:', err);
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    if (!myActiveEntry) return;
    setClocking(true);
    try {
      const updated = await inboundTicketService.clockOut(myActiveEntry.id);
      onTimeEntriesChanged(timeEntries.map(e => e.id === updated.id ? updated : e));
    } catch (err) {
      console.error('Clock-out failed:', err);
    } finally {
      setClocking(false);
    }
  };

  const canClockIn = !myActiveEntry && ticket.status !== InboundTicketStatus.COMPLETED;

  return (
    <div className="px-7 py-6 space-y-5">
      {/* Summary bar */}
      <div className={`flex items-center justify-between rounded-2xl p-4 border ${dm ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-50 border-slate-200'}`}>
        <div>
          <p className={`text-[9px] font-black uppercase tracking-[0.15em] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Total Time Logged</p>
          <p className={`text-2xl font-black font-display mt-0.5 ${dm ? 'text-slate-100' : 'text-slate-900'}`}>
            {timeEntries.length === 0 ? '—' : fmtMinutes(Math.round(totalMinutes))}
          </p>
        </div>
        {/* Clock in/out for current crew user (hidden for admin-only view when admin isn't the assignee) */}
        {(!isAdmin || ticket.assignedTo === sessionUser.id) && (
          myActiveEntry ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className={`text-[14px] font-black tabular-nums font-display ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {fmtElapsed(elapsed)}
                </span>
              </div>
              <button
                onClick={handleClockOut}
                disabled={clocking}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  clocking ? 'opacity-50 cursor-not-allowed' : ''
                } ${dm ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'}`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                {clocking ? 'Saving…' : 'Clock Out'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleClockIn}
              disabled={clocking || !canClockIn}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                clocking || !canClockIn ? 'opacity-50 cursor-not-allowed' : ''
              } ${dm ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {clocking ? 'Starting…' : 'Clock In'}
            </button>
          )
        )}
      </div>

      {/* Time entry list */}
      {timeEntries.length === 0 ? (
        <p className={`text-[11px] text-center font-medium ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
          No time entries yet.
        </p>
      ) : (
        <div className="space-y-2">
          {timeEntries.map(entry => {
            const isOpen = entry.clockedOutAt === null;
            const duration = computeDurationMinutes(entry);
            return (
              <div
                key={entry.id}
                className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 ${
                  isOpen
                    ? dm ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-emerald-200 bg-emerald-50'
                    : dm ? 'border-white/[0.05] bg-white/[0.02]' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className={`text-[11px] font-semibold truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
                      {entry.technicianName || 'Technician'}
                    </p>
                    {isOpen && (
                      <span className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        Active
                      </span>
                    )}
                  </div>
                  <p className={`text-[9px] tabular-nums ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                    {fmtTs(entry.clockedInAt)}
                    {entry.clockedOutAt ? ` → ${fmtTs(entry.clockedOutAt)}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[12px] font-black tabular-nums ${
                  isOpen
                    ? dm ? 'text-emerald-400' : 'text-emerald-600'
                    : dm ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  {fmtMinutes(Math.round(duration))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Main modal component ──────────────────────────────────────────────────────

const InboundTicketDetail: React.FC<InboundTicketDetailProps> = ({
  ticket,
  users,
  sessionUser,
  isAdmin,
  isDarkMode,
  onClose,
  onTicketUpdated,
  onTicketDeleted,
}) => {
  const dm = isDarkMode ?? false;

  const [notes, setNotes]   = useState<InboundTicketNote[]>([]);
  const [photos, setPhotos] = useState<InboundTicketPhoto[]>([]);
  const [timeEntries, setTimeEntries] = useState<InboundTimeEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote]   = useState(false);
  const [isUploading, setIsUploading]     = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loadError, setLoadError]         = useState('');
  const [activeTab, setActiveTab]         = useState<'info' | 'notes' | 'photos' | 'time'>('info');

  // Editable fields (admin only)
  const [editSiteAddress, setEditSiteAddress]   = useState(ticket.siteAddress);
  const [editDueDate, setEditDueDate]             = useState(ticket.dueDate);
  const [editDigStartDate, setEditDigStartDate]   = useState(ticket.digStartDate);
  const [editCallerName, setEditCallerName]       = useState(ticket.callerName);
  const [editCallerPhone, setEditCallerPhone]     = useState(ticket.callerPhone);
  const [editUtilities, setEditUtilities]         = useState<string[]>([...ticket.utilityTypes]);
  const [editAssignedTo, setEditAssignedTo]       = useState<string | null>(ticket.assignedTo);
  const [isSavingInfo, setIsSavingInfo]           = useState(false);
  const [infoError, setInfoError]                 = useState('');

  const photoInputRef = useRef<HTMLInputElement>(null);
  const notesBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    setLoadError('');
    Promise.all([
      inboundTicketService.getNotes(ticket.id),
      inboundTicketService.getPhotos(ticket.id),
      inboundTicketService.getTimeEntries(ticket.id),
    ]).then(([n, p, te]) => {
      if (!mounted) return;
      setNotes(n);
      setPhotos(p);
      setTimeEntries(te);
    }).catch(err => {
      if (mounted) setLoadError(String(err?.message ?? 'Failed to load details.'));
    });
    return () => { mounted = false; };
  }, [ticket.id]);

  // Auto-scroll notes to bottom
  useEffect(() => {
    notesBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes.length]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setIsAddingNote(true);
    try {
      const n = await inboundTicketService.addNote(
        ticket.id,
        noteText.trim(),
        sessionUser.id,
        sessionUser.name,
      );
      setNotes(prev => [...prev, n]);
      setNoteText('');
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handlePhotoUpload = async (files: FileList) => {
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const p = await inboundTicketService.uploadPhoto(
          ticket.id,
          ticket.companyId,
          file,
          sessionUser.id,
        );
        setPhotos(prev => [...prev, p]);
      }
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: InboundTicketPhoto) => {
    try {
      await inboundTicketService.deletePhoto(photo);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  const handleStatusChange = async (newStatus: InboundTicketStatus) => {
    setIsChangingStatus(true);
    try {
      const updated = await inboundTicketService.updateTicket(ticket.id, { status: newStatus });
      onTicketUpdated(updated);
    } catch (err) {
      console.error('Status change failed:', err);
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!editSiteAddress.trim()) { setInfoError('Site address is required.'); return; }
    if (!editDueDate)            { setInfoError('Due date is required.'); return; }
    setIsSavingInfo(true);
    setInfoError('');
    try {
      const updates: Partial<InboundTicket> = {
        siteAddress:  editSiteAddress.trim(),
        dueDate:      editDueDate,
        digStartDate: editDigStartDate,
        callerName:   editCallerName.trim(),
        callerPhone:  editCallerPhone.trim(),
        utilityTypes: editUtilities,
        assignedTo:   editAssignedTo,
        status:       statusAfterAssign(ticket.status, editAssignedTo),
      };
      const updated = await inboundTicketService.updateTicket(ticket.id, updates);
      onTicketUpdated(updated);
    } catch (err) {
      setInfoError((err as Error).message ?? 'Save failed.');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await inboundTicketService.deleteTicket(ticket.id);
      onTicketDeleted(ticket.id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const crewUsers = users.filter(u => u.role === 'CREW' || u.role === 'ADMIN');

  const inputCls = `w-full px-3.5 py-2.5 border rounded-xl text-[12px] font-medium outline-none transition-all ${
    dm
      ? 'bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 focus:border-brand/40'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  }`;
  const labelCls = `block text-[9px] font-black uppercase tracking-[0.15em] mb-1.5 ${dm ? 'text-slate-500' : 'text-slate-500'}`;
  const tabBtn = (id: typeof activeTab) =>
    `px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
      activeTab === id
        ? 'bg-brand/10 text-brand border border-brand/20'
        : dm
        ? 'text-slate-600 hover:text-slate-200 hover:bg-white/5'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
    }`;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div
        className={`w-full max-w-2xl rounded-[2rem] shadow-2xl border overflow-hidden flex flex-col max-h-[92vh] ${
          dm ? 'bg-[#0b1629] border-white/10' : 'bg-white border-slate-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-start justify-between px-7 py-5 border-b shrink-0 ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand mb-1">
              Inbound Ticket
            </p>
            <h2 className={`text-xl font-black uppercase tracking-tight font-display ${dm ? 'text-white' : 'text-slate-900'}`}>
              #{ticket.ticketNumber}
            </h2>
            <p className={`text-[11px] font-medium mt-0.5 truncate ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
              {ticket.siteAddress}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <span className={`inline-flex px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${statusBadge(ticket.status, dm)}`}>
              {INBOUND_STATUS_LABELS[ticket.status]}
            </span>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all ${dm ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status controls */}
        <div className={`px-7 py-3 border-b shrink-0 ${dm ? 'border-white/[0.04]' : 'border-slate-50'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase tracking-widest mr-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Status:</span>
            {STATUS_ORDER.map(s => (
              <button
                key={s}
                disabled={isChangingStatus || ticket.status === s}
                onClick={() => handleStatusChange(s)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all disabled:cursor-default ${
                  ticket.status === s
                    ? statusBadge(s, dm) + ' cursor-default'
                    : dm
                    ? 'border-white/[0.06] text-slate-600 hover:border-white/20 hover:text-slate-300'
                    : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-700'
                }`}
              >
                {INBOUND_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className={`flex items-center gap-1.5 px-7 py-3 border-b shrink-0 ${dm ? 'border-white/[0.04]' : 'border-slate-50'}`}>
          <button className={tabBtn('info')}   onClick={() => setActiveTab('info')}>Info</button>
          <button className={tabBtn('notes')}  onClick={() => setActiveTab('notes')}>Notes {notes.length > 0 && `(${notes.length})`}</button>
          <button className={tabBtn('photos')} onClick={() => setActiveTab('photos')}>Photos {photos.length > 0 && `(${photos.length})`}</button>
          <button className={tabBtn('time')}   onClick={() => setActiveTab('time')}>Time {timeEntries.length > 0 && `(${timeEntries.length})`}</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loadError && (
            <div className="px-7 py-4">
              <p className="text-[11px] text-rose-500 font-semibold">{loadError}</p>
            </div>
          )}

          {/* ── Info tab ── */}
          {activeTab === 'info' && (
            <div className="px-7 py-6 space-y-5">
              {/* Read-only meta */}
              <div className={`grid grid-cols-2 gap-4 p-4 rounded-2xl border ${dm ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50'}`}>
                <div>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Created</p>
                  <p className={`text-[11px] font-semibold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{fmtTs(ticket.createdAt)}</p>
                </div>
                <div>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Created By</p>
                  <p className={`text-[11px] font-semibold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                    {users.find(u => u.id === ticket.createdBy)?.name ?? '—'}
                  </p>
                </div>
              </div>

              {isAdmin ? (
                /* Admin — editable fields */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Site Address *</label>
                      <input className={inputCls} value={editSiteAddress} onChange={e => setEditSiteAddress(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Due Date *</label>
                      <input type="date" className={inputCls} value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Dig Start Date</label>
                      <input type="date" className={inputCls} value={editDigStartDate} onChange={e => setEditDigStartDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Assign To</label>
                      <select className={inputCls} value={editAssignedTo ?? ''} onChange={e => setEditAssignedTo(e.target.value || null)}>
                        <option value="">— Unassigned —</option>
                        {crewUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Caller Name</label>
                      <input className={inputCls} value={editCallerName} onChange={e => setEditCallerName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Caller Phone</label>
                      <input className={inputCls} value={editCallerPhone} onChange={e => setEditCallerPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Utility Types</label>
                    <div className="flex flex-wrap gap-2">
                      {INBOUND_UTILITIES.map(u => {
                        const sel = editUtilities.includes(u);
                        return (
                          <button
                            type="button" key={u}
                            onClick={() => setEditUtilities(prev => sel ? prev.filter(x => x !== u) : [...prev, u])}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                              sel
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
                  {infoError && <p className="text-[11px] font-semibold text-rose-500">{infoError}</p>}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleSaveInfo}
                      disabled={isSavingInfo}
                      className="px-5 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50"
                    >
                      {isSavingInfo ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        dm ? 'border-rose-500/20 text-rose-500 hover:bg-rose-500/10' : 'border-rose-200 text-rose-500 hover:bg-rose-50'
                      }`}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                /* Crew — read-only info */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Due Date',       val: fmt(ticket.dueDate) },
                      { label: 'Dig Start Date', val: fmt(ticket.digStartDate) },
                      { label: 'Caller Name',    val: ticket.callerName || '—' },
                      { label: 'Caller Phone',   val: ticket.callerPhone || '—' },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{label}</p>
                        <p className={`text-[12px] font-semibold ${dm ? 'text-slate-200' : 'text-slate-800'}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                  {ticket.utilityTypes.length > 0 && (
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Utility Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ticket.utilityTypes.map(u => (
                          <span key={u} className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wide border ${dm ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{u}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Notes tab ── */}
          {activeTab === 'notes' && (
            <div className="px-7 py-6 flex flex-col gap-4 h-full">
              {/* Note history */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1">
                {notes.length === 0 ? (
                  <p className={`text-[11px] font-medium ${dm ? 'text-slate-600' : 'text-slate-400'}`}>No notes yet. Add the first one below.</p>
                ) : (
                  notes.map(n => (
                    <div key={n.id} className={`p-3.5 rounded-2xl border ${dm ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-black uppercase tracking-wide ${dm ? 'text-slate-400' : 'text-slate-700'}`}>{n.authorName}</span>
                        <span className={`text-[9px] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{fmtTs(n.createdAt)}</span>
                      </div>
                      <p className={`text-[12px] leading-relaxed ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{n.text}</p>
                    </div>
                  ))
                )}
                <div ref={notesBottomRef} />
              </div>
              {/* Add note */}
              <div className={`border-t pt-4 ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`}>
                <textarea
                  rows={3}
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  className={`w-full px-3.5 py-2.5 border rounded-xl text-[12px] font-medium outline-none transition-all resize-none ${
                    dm
                      ? 'bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-600 focus:border-brand/40'
                      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
                  }`}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddNote}
                    disabled={isAddingNote || !noteText.trim()}
                    className="px-5 py-2 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isAddingNote ? 'Adding…' : 'Add Note'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Photos tab ── */}
          {activeTab === 'photos' && (
            <div className="px-7 py-6 space-y-5">
              {/* Upload zone */}
              <div
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  dm ? 'border-white/10 hover:border-brand/30 hover:bg-brand/5' : 'border-slate-200 hover:border-brand/30 hover:bg-brand/5'
                }`}
                onClick={() => photoInputRef.current?.click()}
              >
                {isUploading ? (
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className={`w-8 h-8 ${dm ? 'text-slate-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                <p className={`text-[11px] font-black uppercase tracking-widest ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isUploading ? 'Uploading…' : 'Click to upload photos'}
                </p>
                <p className={`text-[9px] ${dm ? 'text-slate-600' : 'text-slate-500'}`}>JPG, PNG, HEIC — max 10 MB each</p>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && handlePhotoUpload(e.target.files)}
              />

              {/* Photo grid */}
              {photos.length === 0 ? (
                <p className={`text-[11px] font-medium text-center ${dm ? 'text-slate-600' : 'text-slate-400'}`}>No photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {photos.map(ph => (
                    <div key={ph.id} className="relative group aspect-square rounded-xl overflow-hidden border border-white/10">
                      <img
                        src={ph.url}
                        alt="Job site"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="flex gap-2">
                          <a href={ph.url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-all"
                            onClick={e => e.stopPropagation()}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          {(isAdmin || ph.uploadedBy === sessionUser.id) && (
                            <button
                              onClick={() => handleDeletePhoto(ph)}
                              className="p-1.5 rounded-lg bg-rose-500/70 text-white hover:bg-rose-500 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className={`absolute bottom-0 left-0 right-0 text-[8px] font-bold px-2 py-1 bg-black/60 text-white/70 truncate`}>
                        {fmtTs(ph.uploadedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Time tab ── */}
          {activeTab === 'time' && (
            <TimeTab
              ticket={ticket}
              sessionUser={sessionUser}
              isAdmin={isAdmin}
              isDarkMode={dm}
              timeEntries={timeEntries}
              onTimeEntriesChanged={setTimeEntries}
              onTicketUpdated={onTicketUpdated}
            />
          )}
        </div>

        {/* Delete confirm overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm rounded-[2rem] z-10 flex items-center justify-center p-8">
            <div className={`w-full max-w-sm rounded-2xl p-6 border shadow-xl space-y-4 ${dm ? 'bg-[#0b1629] border-white/10' : 'bg-white border-slate-200'}`}>
              <p className={`text-[13px] font-black ${dm ? 'text-white' : 'text-slate-900'}`}>Delete this ticket?</p>
              <p className={`text-[11px] font-medium ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
                This will permanently delete ticket #{ticket.ticketNumber} and all associated notes and photos.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${dm ? 'border-white/10 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={isDeleting} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-400 transition-all disabled:opacity-50">
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboundTicketDetail;
