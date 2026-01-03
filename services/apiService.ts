import { supabase } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types.ts';

// Helper to handle both Supabase and LocalStorage fallbacks
const logError = (context: string, error: any) => {
  console.warn(`${context}: ${error.message || error}`);
  return error;
};

// Fallback persistence keys
const STORAGE_KEYS = {
  TICKETS: 'digtrack_tickets_cache',
  JOBS: 'digtrack_jobs_cache',
  PHOTOS: 'digtrack_photos_cache',
  NOTES: 'digtrack_notes_cache',
  USERS: 'digtrack_users_cache'
};

const getFromStorage = <T>(key: string): T[] => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const saveToStorage = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Mapper helpers
const mapJob = (data: any): Job => ({
  id: data.id,
  jobNumber: data.job_number || data.jobNumber || 'UNKNOWN',
  customer: data.customer || '',
  address: data.address || '',
  city: data.city || '',
  state: data.state || '',
  county: data.county || '',
  createdAt: data.created_at ? new Date(data.created_at).getTime() : (data.createdAt || Date.now()),
  isComplete: data.is_complete ?? data.isComplete ?? false
});

const mapTicket = (data: any): DigTicket => ({
  id: data.id,
  jobNumber: data.job_number || data.jobNumber || 'UNKNOWN',
  ticketNo: data.ticket_no || data.ticketNo || 'UNKNOWN',
  address: data.address || '',
  county: data.county || '',
  city: data.city || '',
  state: data.state || '',
  callInDate: data.call_in_date || data.callInDate || '',
  digStart: data.dig_start || data.digStart || '',
  expirationDate: data.expiration_date || data.expirationDate || '',
  siteContact: data.site_contact || data.siteContact || '',
  createdAt: data.created_at ? new Date(data.created_at).getTime() : (data.createdAt || Date.now())
});

export const apiService = {
  // --- USERS ---
  async getUsers(): Promise<UserRecord[]> {
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return (data || []).map(u => ({ ...u, role: u.role as UserRole }));
    } catch (err) {
      return getFromStorage<UserRecord>(STORAGE_KEYS.USERS);
    }
  },

  async addUser(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    const newUser = { ...user, id: crypto.randomUUID() };
    try {
      const { data, error } = await supabase.from('profiles').insert([user]).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      const users = getFromStorage<UserRecord>(STORAGE_KEYS.USERS);
      const updated = [...users, newUser];
      saveToStorage(STORAGE_KEYS.USERS, updated);
      return newUser;
    }
  },

  async deleteUser(id: string): Promise<void> {
    try {
      await supabase.from('profiles').delete().eq('id', id);
    } catch (err) {
      const users = getFromStorage<UserRecord>(STORAGE_KEYS.USERS).filter(u => u.id !== id);
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  // --- JOBS ---
  async getJobs(): Promise<Job[]> {
    try {
      const { data, error } = await supabase.from('jobs').select('*');
      if (error) throw error;
      return (data || []).map(mapJob);
    } catch (err) {
      return getFromStorage<Job>(STORAGE_KEYS.JOBS);
    }
  },

  async saveJob(job: Job): Promise<Job> {
    try {
      const { data, error } = await supabase.from('jobs').upsert({
        id: job.id,
        job_number: job.jobNumber,
        customer: job.customer,
        address: job.address,
        city: job.city,
        state: job.state,
        county: job.county,
        is_complete: job.isComplete
      }).select().single();
      if (error) throw error;
      return mapJob(data);
    } catch (err) {
      const jobs = getFromStorage<Job>(STORAGE_KEYS.JOBS);
      const index = jobs.findIndex(j => j.id === job.id);
      const updated = index > -1 ? jobs.map(j => j.id === job.id ? job : j) : [job, ...jobs];
      saveToStorage(STORAGE_KEYS.JOBS, updated);
      return job;
    }
  },

  // --- TICKETS ---
  async getTickets(): Promise<DigTicket[]> {
    try {
      const { data, error } = await supabase.from('tickets').select('*');
      if (error) throw error;
      return (data || []).map(mapTicket);
    } catch (err) {
      return getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS);
    }
  },

  async saveTicket(ticket: DigTicket): Promise<DigTicket> {
    try {
      const { data, error } = await supabase.from('tickets').upsert({
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
      }).select().single();
      if (error) throw error;
      return mapTicket(data);
    } catch (err) {
      const tickets = getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS);
      const index = tickets.findIndex(t => t.id === ticket.id);
      const updated = index > -1 ? tickets.map(t => t.id === ticket.id ? ticket : t) : [ticket, ...tickets];
      saveToStorage(STORAGE_KEYS.TICKETS, updated);
      return ticket;
    }
  },

  async deleteTicket(id: string): Promise<void> {
    try {
      await supabase.from('tickets').delete().eq('id', id);
    } catch (err) {
      const tickets = getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS).filter(t => t.id !== id);
      saveToStorage(STORAGE_KEYS.TICKETS, tickets);
    }
  },

  // --- PHOTOS ---
  async getPhotos(): Promise<JobPhoto[]> {
    try {
      const { data, error } = await supabase.from('photos').select('*');
      if (error) throw error;
      return (data || []).map(p => ({ ...p, jobNumber: p.job_number, dataUrl: p.data_url }));
    } catch (err) {
      return getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS);
    }
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    // Note: Storage fallback is limited to Base64 in local mode
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPhoto = { ...photo, id: crypto.randomUUID(), dataUrl: reader.result as string };
        const photos = getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS);
        saveToStorage(STORAGE_KEYS.PHOTOS, [newPhoto, ...photos]);
        resolve(newPhoto);
      };
      reader.readAsDataURL(file);
    });
  },

  async deletePhoto(id: string): Promise<void> {
    const photos = getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS).filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.PHOTOS, photos);
  },

  // --- NOTES ---
  async getNotes(): Promise<JobNote[]> {
    try {
      const { data, error } = await supabase.from('notes').select('*');
      if (error) throw error;
      return (data || []).map(n => ({ ...n, jobNumber: n.job_number }));
    } catch (err) {
      return getFromStorage<JobNote>(STORAGE_KEYS.NOTES);
    }
  },

  async addNote(note: JobNote): Promise<JobNote> {
    try {
      await supabase.from('notes').insert([{
        id: note.id,
        job_number: note.jobNumber,
        text: note.text,
        author: note.author,
        timestamp: note.timestamp
      }]);
      return note;
    } catch (err) {
      const notes = getFromStorage<JobNote>(STORAGE_KEYS.NOTES);
      saveToStorage(STORAGE_KEYS.NOTES, [note, ...notes]);
      return note;
    }
  }
};