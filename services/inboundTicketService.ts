
// ─────────────────────────────────────────────────────────────────────────────
// Inbound Ticket Service — Supabase CRUD for inbound_tickets,
// inbound_ticket_photos, inbound_ticket_notes, and inbound_ticket_time_entries.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import {
  InboundTicket,
  InboundTicketPhoto,
  InboundTicketNote,
  InboundTicketStatus,
  InboundTimeEntry,
} from './inboundTypes.ts';

const PHOTOS_BUCKET = 'inbound-ticket-photos';

// ── mappers ───────────────────────────────────────────────────────────────────

const mapTicket = (row: Record<string, unknown>): InboundTicket => ({
  id:           String(row.id ?? ''),
  createdAt:    String(row.created_at ?? ''),
  companyId:    String(row.company_id ?? ''),
  ticketNumber: String(row.ticket_number ?? ''),
  siteAddress:  String(row.site_address ?? ''),
  digStartDate: String(row.dig_start_date ?? ''),
  dueDate:      String(row.due_date ?? ''),
  status:       (row.status as InboundTicketStatus) ?? InboundTicketStatus.UNASSIGNED,
  assignedTo:   row.assigned_to != null ? String(row.assigned_to) : null,
  callerName:   String(row.caller_name ?? ''),
  callerPhone:  String(row.caller_phone ?? ''),
  utilityTypes: Array.isArray(row.utility_types) ? (row.utility_types as string[]) : [],
  notes:        String(row.notes ?? ''),
  createdBy:    String(row.created_by ?? ''),
});

const mapPhoto = (row: Record<string, unknown>): InboundTicketPhoto => ({
  id:          String(row.id ?? ''),
  ticketId:    String(row.ticket_id ?? ''),
  storagePath: String(row.storage_path ?? ''),
  uploadedBy:  row.uploaded_by != null ? String(row.uploaded_by) : null,
  uploadedAt:  String(row.uploaded_at ?? ''),
});

const mapNote = (row: Record<string, unknown>): InboundTicketNote => ({
  id:         String(row.id ?? ''),
  ticketId:   String(row.ticket_id ?? ''),
  text:       String(row.text ?? ''),
  authorId:   row.author_id != null ? String(row.author_id) : null,
  authorName: String(row.author_name ?? ''),
  createdAt:  String(row.created_at ?? ''),
});

const mapTimeEntry = (row: Record<string, unknown>): InboundTimeEntry => ({
  id:             String(row.id ?? ''),
  ticketId:       String(row.ticket_id ?? ''),
  technicianId:   String(row.technician_id ?? ''),
  technicianName: String(row.technician_name ?? ''),
  clockedInAt:    String(row.clocked_in_at ?? ''),
  clockedOutAt:   row.clocked_out_at != null ? String(row.clocked_out_at) : null,
  createdAt:      String(row.created_at ?? ''),
});

// ── public API ────────────────────────────────────────────────────────────────

export const inboundTicketService = {
  // ── Tickets ────────────────────────────────────────────────────────────────

  /** Fetch all inbound tickets for the authenticated user's company. */
  async getTickets(): Promise<InboundTicket[]> {
    const { data, error } = await supabase
      .from('inbound_tickets')
      .select('*')
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(r => mapTicket(r as Record<string, unknown>));
  },

  /** Fetch only tickets assigned to the given user. */
  async getMyTickets(userId: string): Promise<InboundTicket[]> {
    const { data, error } = await supabase
      .from('inbound_tickets')
      .select('*')
      .eq('assigned_to', userId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(r => mapTicket(r as Record<string, unknown>));
  },

  /** Create a new inbound ticket. */
  async createTicket(
    ticket: Omit<InboundTicket, 'id' | 'createdAt'>,
  ): Promise<InboundTicket> {
    const { data, error } = await supabase
      .from('inbound_tickets')
      .insert({
        company_id:     ticket.companyId,
        ticket_number:  ticket.ticketNumber,
        site_address:   ticket.siteAddress,
        dig_start_date: ticket.digStartDate,
        due_date:       ticket.dueDate,
        status:         ticket.status,
        assigned_to:    ticket.assignedTo,
        caller_name:    ticket.callerName,
        caller_phone:   ticket.callerPhone,
        utility_types:  ticket.utilityTypes,
        notes:          ticket.notes,
        created_by:     ticket.createdBy,
      })
      .select()
      .single();
    if (error) throw error;
    return mapTicket(data as Record<string, unknown>);
  },

  /** Update an existing inbound ticket (partial updates allowed). */
  async updateTicket(
    id: string,
    updates: Partial<Omit<InboundTicket, 'id' | 'createdAt' | 'companyId' | 'createdBy'>>,
  ): Promise<InboundTicket> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.ticketNumber  !== undefined) dbUpdates.ticket_number  = updates.ticketNumber;
    if (updates.siteAddress   !== undefined) dbUpdates.site_address   = updates.siteAddress;
    if (updates.digStartDate  !== undefined) dbUpdates.dig_start_date = updates.digStartDate;
    if (updates.dueDate       !== undefined) dbUpdates.due_date       = updates.dueDate;
    if (updates.status        !== undefined) dbUpdates.status         = updates.status;
    if (updates.assignedTo    !== undefined) dbUpdates.assigned_to    = updates.assignedTo;
    if (updates.callerName    !== undefined) dbUpdates.caller_name    = updates.callerName;
    if (updates.callerPhone   !== undefined) dbUpdates.caller_phone   = updates.callerPhone;
    if (updates.utilityTypes  !== undefined) dbUpdates.utility_types  = updates.utilityTypes;
    if (updates.notes         !== undefined) dbUpdates.notes          = updates.notes;

    const { data, error } = await supabase
      .from('inbound_tickets')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapTicket(data as Record<string, unknown>);
  },

  /** Delete an inbound ticket and all related photos/notes (via CASCADE). */
  async deleteTicket(id: string): Promise<void> {
    const { error } = await supabase
      .from('inbound_tickets')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /** Assign or unassign a single ticket. */
  async assignTicket(ticketId: string, userId: string | null): Promise<void> {
    const newStatus = userId
      ? InboundTicketStatus.ASSIGNED
      : InboundTicketStatus.UNASSIGNED;
    const { error } = await supabase
      .from('inbound_tickets')
      .update({ assigned_to: userId, status: newStatus })
      .eq('id', ticketId);
    if (error) throw error;
  },

  /** Bulk-assign multiple tickets to one user. */
  async bulkAssign(ticketIds: string[], userId: string): Promise<void> {
    if (!ticketIds.length) return;
    const { error } = await supabase
      .from('inbound_tickets')
      .update({ assigned_to: userId, status: InboundTicketStatus.ASSIGNED })
      .in('id', ticketIds);
    if (error) throw error;
  },

  // ── Notes ──────────────────────────────────────────────────────────────────

  /** Fetch the note history for a ticket, oldest first. */
  async getNotes(ticketId: string): Promise<InboundTicketNote[]> {
    const { data, error } = await supabase
      .from('inbound_ticket_notes')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(r => mapNote(r as Record<string, unknown>));
  },

  /** Append a new note to a ticket. */
  async addNote(
    ticketId:   string,
    text:       string,
    authorId:   string,
    authorName: string,
  ): Promise<InboundTicketNote> {
    const { data, error } = await supabase
      .from('inbound_ticket_notes')
      .insert({
        ticket_id:   ticketId,
        text,
        author_id:   authorId,
        author_name: authorName,
      })
      .select()
      .single();
    if (error) throw error;
    return mapNote(data as Record<string, unknown>);
  },

  // ── Photos ─────────────────────────────────────────────────────────────────

  /** Fetch all photos for a ticket and resolve their public URLs. */
  async getPhotos(ticketId: string): Promise<InboundTicketPhoto[]> {
    const { data, error } = await supabase
      .from('inbound_ticket_photos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('uploaded_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(row => {
      const photo = mapPhoto(row as Record<string, unknown>);
      photo.url = supabase.storage
        .from(PHOTOS_BUCKET)
        .getPublicUrl(photo.storagePath).data.publicUrl;
      return photo;
    });
  },

  /**
   * Upload a photo file to Supabase Storage and record it in the DB.
   * Automatically attempts to create the storage bucket on first upload.
   */
  async uploadPhoto(
    ticketId:   string,
    companyId:  string,
    file:       File,
    uploadedBy: string,
  ): Promise<InboundTicketPhoto> {
    // Ensure bucket exists (idempotent)
    await supabase.storage.createBucket(PHOTOS_BUCKET, {
      public:          true,
      fileSizeLimit:   10 * 1024 * 1024,
      allowedMimeTypes: ['image/*'],
    });

    const ext   = file.name.split('.').pop() ?? 'jpg';
    const path  = `${companyId}/${ticketId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('inbound_ticket_photos')
      .insert({
        ticket_id:    ticketId,
        storage_path: path,
        uploaded_by:  uploadedBy,
      })
      .select()
      .single();
    if (error) throw error;

    const photo = mapPhoto(data as Record<string, unknown>);
    photo.url = supabase.storage
      .from(PHOTOS_BUCKET)
      .getPublicUrl(path).data.publicUrl;
    return photo;
  },

  /** Delete a photo from Storage and the DB record. */
  async deletePhoto(photo: InboundTicketPhoto): Promise<void> {
    await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storagePath]);
    const { error } = await supabase
      .from('inbound_ticket_photos')
      .delete()
      .eq('id', photo.id);
    if (error) throw error;
  },

  // ── Time Entries ───────────────────────────────────────────────────────────

  /** Fetch all time entries for a ticket (newest first). */
  async getTimeEntries(ticketId: string): Promise<InboundTimeEntry[]> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('clocked_in_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => mapTimeEntry(r as Record<string, unknown>));
  },

  /**
   * Returns the currently open (clocked-in but not yet clocked-out) entry for
   * the given ticket + technician, or null if the technician is not clocked in.
   */
  async getActiveEntry(
    ticketId:     string,
    technicianId: string,
  ): Promise<InboundTimeEntry | null> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('technician_id', technicianId)
      .is('clocked_out_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTimeEntry(data as Record<string, unknown>) : null;
  },

  /**
   * Returns all currently open (not clocked-out) entries for the given
   * technician, across all tickets. Used to detect multi-ticket clock-in conflicts.
   */
  async getAllActiveEntries(technicianId: string): Promise<InboundTimeEntry[]> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .select('*')
      .eq('technician_id', technicianId)
      .is('clocked_out_at', null);
    if (error) throw error;
    return (data ?? []).map(r => mapTimeEntry(r as Record<string, unknown>));
  },

  /**
   * Returns ALL currently open (not clocked-out) entries for the authenticated
   * user's company (admin view). RLS restricts results to the caller's company.
   */
  async getCompanyActiveEntries(): Promise<InboundTimeEntry[]> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .select('*')
      .is('clocked_out_at', null)
      .order('clocked_in_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(r => mapTimeEntry(r as Record<string, unknown>));
  },

  /**
   * Clock a technician in to a ticket.
   * Also promotes the ticket status to IN_PROGRESS if it was ASSIGNED.
   */
  async clockIn(
    ticketId:       string,
    companyId:      string,
    technicianId:   string,
    technicianName: string,
  ): Promise<InboundTimeEntry> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .insert({
        ticket_id:       ticketId,
        company_id:      companyId,
        technician_id:   technicianId,
        technician_name: technicianName,
      })
      .select()
      .single();
    if (error) throw error;

    // Promote ticket to IN_PROGRESS if it was ASSIGNED
    await supabase
      .from('inbound_tickets')
      .update({ status: InboundTicketStatus.IN_PROGRESS })
      .eq('id', ticketId)
      .eq('status', InboundTicketStatus.ASSIGNED);

    return mapTimeEntry(data as Record<string, unknown>);
  },

  /** Clock a technician out by setting clocked_out_at to the database server time. */
  async clockOut(entryId: string): Promise<InboundTimeEntry> {
    const { data, error } = await supabase
      .from('inbound_ticket_time_entries')
      .update({ clocked_out_at: new Date().toISOString() })
      .eq('id', entryId)
      .select()
      .single();
    if (error) throw error;
    return mapTimeEntry(data as Record<string, unknown>);
  },
};
