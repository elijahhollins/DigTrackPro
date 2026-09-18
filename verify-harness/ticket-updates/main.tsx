// Mounts the real TicketActionMenu / TicketUpdateModal / TicketNotesModal
// against the in-memory mock apiService, wired the same way App.tsx wires them.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TicketActionMenu from '../../components/TicketActionMenu.tsx';
import TicketUpdateModal from '../../components/TicketUpdateModal.tsx';
import TicketNotesModal from '../../components/TicketNotesModal.tsx';
import { DigTicket, TicketFieldChange, TicketUpdateKind } from '../../types.ts';
import { apiService } from '../../services/apiService.ts';
import '../../index.css';

const initialTicket: DigTicket = {
  id: 'tk-1',
  companyId: 'co-1',
  jobNumber: 'J-1000',
  ticketNo: 'B2451',
  street: 'W Main St',
  crossStreet: 'N 3rd Ave',
  place: 'Springfield',
  extent: 'Front of 412',
  county: 'Sangamon',
  city: 'Springfield',
  state: 'IL',
  callInDate: '2026-03-01',
  workDate: '2026-03-04',
  digByDate: '2026-03-11',
  expires: '2026-03-16',
  siteContact: 'Pat Rivera',
  createdAt: Date.now() - 86400000,
};

const params = new URLSearchParams(location.search);
const isAdmin = !params.has('crew');
const isDarkMode = !params.has('light');

const Harness: React.FC = () => {
  const [ticket, setTicket] = useState<DigTicket>(initialTicket);
  const [showUpdate, setShowUpdate] = useState(false);
  const [notesTab, setNotesTab] = useState<'notes' | 'history'>('notes');
  const [showNotes, setShowNotes] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const logEvent = async (t: DigTicket, kind: TicketUpdateKind, options?: { reason?: string; changes?: TicketFieldChange[] }) => {
    await apiService.logTicketUpdate({
      companyId: t.companyId, ticketId: t.id, jobNumber: t.jobNumber, ticketNo: t.ticketNo,
      kind, author: 'Dana Reyes', authorId: 'u-1', reason: options?.reason, changes: options?.changes ?? [],
    });
    setLog(prev => [...prev, kind]);
  };

  const menu = (testid: string) => (
    <TicketActionMenu
      ticket={ticket}
      isAdmin={isAdmin}
      isDarkMode={isDarkMode}
      onNotes={() => { setNotesTab('notes'); setShowNotes(true); }}
      onHistory={() => { setNotesTab('history'); setShowNotes(true); }}
      onNoShow={() => logEvent(ticket, TicketUpdateKind.NO_SHOW_LOGGED, { reason: 'No show on GAS' })}
      onRefresh={() => logEvent(ticket, TicketUpdateKind.REFRESH_REQUESTED, { reason: 'Refresh on ELECTRIC' })}
      onUpdate={() => setShowUpdate(true)}
      onArchive={() => { setTicket(p => ({ ...p, isArchived: true })); logEvent(ticket, TicketUpdateKind.ARCHIVED); }}
    />
  );

  const rowCls = `flex items-center justify-between max-w-xl rounded-xl border px-5 py-4 ${
    isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white shadow-sm'
  }`;

  return (
    <div className={`min-h-screen p-10 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'}`}>
      <h1 className="text-sm font-black uppercase tracking-widest text-brand mb-6">Ticket action menu harness</h1>

      <div className={rowCls} data-testid="row-top">
        <div>
          <p className="text-xs font-bold" data-testid="ticket-no">#{ticket.ticketNo}</p>
          <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`} data-testid="ticket-expires">Expires {ticket.expires}</p>
        </div>
        {menu('top')}
      </div>

      <p className={`mt-6 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`} data-testid="event-log">events: {log.join(',') || 'none'}</p>

      {/* Anchored near the viewport floor so the menu has to flip above its
          trigger. Inline styles, not Tailwind classes: verify-harness/ is
          outside the content globs in tailwind.config.js, so utilities used
          only here are never generated. */}
      <div style={{ position: 'fixed', left: 40, right: 40, bottom: 16 }} data-testid="row-bottom-wrap">
        <div className={rowCls}>
          <div>
            <p className="text-xs font-bold">#{ticket.ticketNo} (bottom row)</p>
            <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>menu should open upward</p>
          </div>
          {menu('bottom')}
        </div>
      </div>

      {showUpdate && (
        <TicketUpdateModal
          ticket={ticket}
          isDarkMode={isDarkMode}
          onSave={async (updated, changes, reason) => {
            setTicket(updated);
            await logEvent(updated, TicketUpdateKind.UPDATED, { changes, reason });
          }}
          onClose={() => setShowUpdate(false)}
        />
      )}

      {showNotes && (
        <TicketNotesModal
          ticket={ticket}
          userName="Dana Reyes"
          isAdmin
          initialTab={notesTab}
          isDarkMode={isDarkMode}
          onClose={() => setShowNotes(false)}
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
