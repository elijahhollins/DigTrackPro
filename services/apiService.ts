
import { supabase } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types.ts';

/**
 * Standardized error logger to extract clean strings from any input type.
 * Ensures we don't log raw objects that appear as [object Object].
 */
const logError = (context: string, error: any) => {
  let message = 'Unknown Error';
  
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    // PostgrestError format is { message, details, hint, code }
    message = error.message || error.error_description || error.code || JSON.stringify(error);
  }

  const details = error?.details ? ` (${error.details})` : '';
  const hint = error?.hint ? ` Hint: ${error.hint}` : '';
  const fullMessage = `${context}: ${message}${details}${hint}`;
  
  // Log as a single string to avoid [object Object] in simple log viewers
  console.error(fullMessage);
  return new Error(fullMessage);
};

// Helper to map DB snake_case to Frontend camelCase
const mapJob = (data: any): Job => ({
  id: data.id,
  jobNumber: data.job_number || 'UNKNOWN',
  customer: data.customer || '',
  address: data.address || '',
  city: data.city || '',
  state: data.state || '',
  county: data.county || '',
  createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
  isComplete: data.is_complete ?? false
});

const mapTicket = (data: any): DigTicket => ({
  id: data.id,
  jobNumber: data.job_number || 'UNKNOWN',
  ticketNo: data.ticket_no || 'UNKNOWN',
  address: data.address || '',
  county: data.county || '',
  city: data.city || '',
  state: data.state || '',
  callInDate: data.call_in_date || '',
  digStart: data.dig_start || '',
  expirationDate: data.expiration_date || '',
  siteContact: data.site_contact || '',
  createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now()
});

const mapPhoto = (data: any): JobPhoto => ({
  id: data.id,
  jobNumber: data.job_number || 'UNKNOWN',
  dataUrl: data.data_url || '',
  timestamp: data.timestamp ? Number(data.timestamp) : Date.now(),
  caption: data.caption || ''
});

const mapNote = (data: any): JobNote => ({
  id: data.id,
  jobNumber: data.job_number || 'UNKNOWN',
  text: data.text || '',
  author: data.author || 'System',
  timestamp: data.timestamp ? Number(data.timestamp) : Date.now()
});

export const apiService = {
  // --- USERS & AUTH ---
  async getUsers(): Promise<UserRecord[]> {
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data || [];
    } catch (err) {
      logError("Fetch users failed", err);
      return [];
    }
  },

  async addUser(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([{
          username: user.username,
          name: user.name,
          role: user.role
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      throw logError("Add user failed", err);
    }
  },

  async deleteUser(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      throw logError("Delete user failed", err);
    }
  },

  // --- JOBS ---
  async getJobs(): Promise<Job[]> {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapJob);
    } catch (err) {
      throw logError("Fetch jobs failed", err);
    }
  },

  async saveJob(job: Job): Promise<Job> {
    try {
      const dbPayload = {
        id: job.id,
        job_number: job.jobNumber,
        customer: job.customer,
        address: job.address,
        city: job.city,
        state: job.state,
        county: job.county,
        is_complete: job.isComplete
      };
      const { data, error } = await supabase
        .from('jobs')
        .upsert(dbPayload)
        .select()
        .single();
      if (error) throw error;
      return mapJob(data);
    } catch (err) {
      throw logError("Save job failed", err);
    }
  },

  // --- TICKETS ---
  async getTickets(): Promise<DigTicket[]> {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapTicket);
    } catch (err) {
      throw logError("Fetch tickets failed", err);
    }
  },

  async saveTicket(ticket: DigTicket): Promise<DigTicket> {
    try {
      // Fix: site_contact corrected to siteContact to match DigTicket type
      const dbPayload = {
        id: ticket.id,
        job_number: ticket.jobNumber,
        ticket_no: ticket.ticketNo,
        address: ticket.address,
        county: ticket.county,
        city: ticket.city,
        state: ticket.state,
        call_in_date: ticket.callInDate,
        dig_start: ticket.digStart,
        expiration_date: ticket.expirationDate,
        site_contact: ticket.siteContact
      };
      const { data, error } = await supabase
        .from('tickets')
        .upsert(dbPayload)
        .select()
        .single();
      if (error) throw error;
      return mapTicket(data);
    } catch (err) {
      throw logError("Save ticket failed", err);
    }
  },

  async deleteTicket(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('tickets').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      throw logError("Delete ticket failed", err);
    }
  },

  // --- PHOTOS ---
  async getPhotos(): Promise<JobPhoto[]> {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapPhoto);
    } catch (err) {
      throw logError("Fetch photos failed", err);
    }
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    try {
      const fileName = `${photo.jobNumber}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName);

      const { data, error } = await supabase
        .from('photos')
        .insert([{
          job_number: photo.jobNumber,
          data_url: publicUrl,
          caption: photo.caption,
          timestamp: photo.timestamp
        }])
        .select()
        .single();

      if (error) throw error;
      return mapPhoto(data);
    } catch (err) {
      throw logError("Add photo failed", err);
    }
  },

  async deletePhoto(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('photos').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      throw logError("Delete photo failed", err);
    }
  },

  // --- NOTES ---
  async getNotes(): Promise<JobNote[]> {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapNote);
    } catch (err) {
      throw logError("Fetch notes failed", err);
    }
  },

  async addNote(note: JobNote): Promise<JobNote> {
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([{
          id: note.id,
          job_number: note.jobNumber,
          text: note.text,
          author: note.author,
          timestamp: note.timestamp
        }])
        .select()
        .single();
      if (error) throw error;
      return mapNote(data);
    } catch (err) {
      throw logError("Add note failed", err);
    }
  }
};