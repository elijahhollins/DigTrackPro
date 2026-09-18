// In-memory stand-in for the Supabase-backed apiService, aliased in by
// verify-harness/ticket-updates/vite.config.ts so the dashboard's ticket action
// menu, update modal and update log run without a backend.
import { JobNote, TicketUpdate } from '../../types.ts';

let notes: JobNote[] = [];
export const updates: TicketUpdate[] = [];

export const apiService = {
  async getTicketNotes(ticketId: string): Promise<JobNote[]> {
    return notes.filter(n => n.ticketId === ticketId);
  },
  async addNote(note: JobNote): Promise<JobNote> {
    notes.push(note);
    return note;
  },
  async deleteNote(id: string): Promise<void> {
    notes = notes.filter(n => n.id !== id);
  },
  async getTicketUpdatesForTicket(ticketId: string): Promise<TicketUpdate[]> {
    return updates.filter(u => u.ticketId === ticketId).sort((a, b) => a.timestamp - b.timestamp);
  },
  async logTicketUpdate(entry: any): Promise<TicketUpdate> {
    const row: TicketUpdate = {
      ...entry,
      id: 'upd-' + Math.random().toString(36).slice(2),
      timestamp: entry.timestamp ?? Date.now(),
      changes: entry.changes ?? [],
    };
    updates.push(row);
    return row;
  },
};
