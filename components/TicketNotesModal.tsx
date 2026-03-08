
import React, { useState, useEffect, useRef } from 'react';
import { DigTicket, JobNote } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface TicketNotesModalProps {
  ticket: DigTicket;
  userName: string;
  isAdmin: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

const TicketNotesModal: React.FC<TicketNotesModalProps> = ({ ticket, userName, isAdmin, onClose, isDarkMode }) => {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    apiService.getTicketNotes(ticket.id)
      .then(data => { if (isMounted) setNotes(data); })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newNoteText.trim();
    if (!text) return;
    setIsSubmitting(true);
    try {
      const note: JobNote = {
        id: crypto.randomUUID(),
        companyId: ticket.companyId,
        jobNumber: ticket.jobNumber,
        ticketId: ticket.id,
        text,
        author: userName,
        timestamp: Date.now(),
      };
      await apiService.addNote(note);
      setNotes(prev => [...prev, note]);
      setNewNoteText('');
    } catch (err: any) {
      alert('Error saving note: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeletingId(noteId);
    try {
      await apiService.deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err: any) {
      alert('Error deleting note: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border flex flex-col animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`} style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className={`px-6 py-4 border-b flex justify-between items-center shrink-0 ${isDarkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60'}`}>
          <div className="flex items-center gap-2.5">
            <div className="bg-brand p-1.5 rounded-lg shadow-lg" style={{ boxShadow: '0 4px 12px var(--brand-shadow)' }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-sm font-black uppercase tracking-widest text-brand`}>Ticket Notes</h2>
              <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>#{ticket.ticketNo} · {ticket.street}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 opacity-40 hover:opacity-100 transition-opacity rounded-lg hover:bg-white/10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <p className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Loading Notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/[0.04] border border-white/[0.05]' : 'bg-slate-100'}`}>
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              </div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No Notes Yet</p>
              <p className={`text-[9px] ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>Add the first note for this ticket below.</p>
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className={`group rounded-xl border p-4 space-y-2 ${isDarkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-[12px] font-semibold leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{note.text}</p>
                <div className={`flex items-center justify-between pt-1 border-t ${isDarkMode ? 'border-white/[0.04]' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-brand/20 flex items-center justify-center">
                      <span className="text-[7px] font-black text-brand uppercase">{note.author.charAt(0)}</span>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{note.author}</span>
                    <span className={`text-[8px] ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>
                      {new Date(note.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                      {new Date(note.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deletingId === note.id}
                      className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isDarkMode ? 'text-slate-600 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                      title="Delete note"
                    >
                      {deletingId === note.id ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Add note form */}
        <form onSubmit={handleAddNote} className={`shrink-0 border-t p-4 space-y-3 ${isDarkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60'}`}>
          <textarea
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            placeholder="Add a note for this ticket..."
            rows={3}
            className={`w-full px-4 py-3 border rounded-xl text-[12px] font-medium outline-none focus:ring-4 transition-all resize-none ${isDarkMode ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 focus:ring-brand/10 focus:border-brand/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-brand/10 focus:border-brand/40'}`}
          />
          <div className="flex items-center justify-between">
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
              As: {userName}
            </span>
            <button
              type="submit"
              disabled={isSubmitting || !newNoteText.trim()}
              className="px-5 py-2.5 bg-brand text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 transition-all active:scale-[0.97] hover:brightness-110"
              style={{ boxShadow: '0 4px 12px var(--brand-shadow)' }}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TicketNotesModal;
