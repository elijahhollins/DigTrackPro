import { supabase } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types.ts';

export const SQL_SCHEMA = `create table if not exists jobs (id uuid primary key, job_number text, customer text, address text, city text, state text, county text, is_complete boolean default false, created_at timestamp with time zone default now());
create table if not exists tickets (id uuid primary key, job_number text, ticket_no text, address text, county text, city text, state text, call_in_date text, dig_start text, expiration_date text, site_contact text, created_at timestamp with time zone default now());
create table if not exists photos (id uuid primary key, job_number text, data_url text, caption text, created_at timestamp with time zone default now());
create table if not exists notes (id uuid primary key, job_number text, text text, author text, timestamp bigint);
create table if not exists profiles (id uuid primary key, name text, username text, role text);

alter table jobs disable row level security;
alter table tickets disable row level security;
alter table photos disable row level security;
alter table notes disable row level security;
alter table profiles disable row level security;

grant all on all tables in schema public to anon, authenticated;`;

export const RESET_SQL_SCHEMA = `-- WARNING: THIS WIPES ALL EXISTING DATA
drop table if exists jobs, tickets, photos, notes, profiles cascade;

create table jobs (id uuid primary key, job_number text, customer text, address text, city text, state text, county text, is_complete boolean default false, created_at timestamp with time zone default now());
create table tickets (id uuid primary key, job_number text, ticket_no text, address text, county text, city text, state text, call_in_date text, dig_start text, expiration_date text, site_contact text, created_at timestamp with time zone default now());
create table photos (id uuid primary key, job_number text, data_url text, caption text, created_at timestamp with time zone default now());
create table notes (id uuid primary key, job_number text, text text, author text, timestamp bigint);
create table profiles (id uuid primary key, name text, username text, role text);

alter table jobs disable row level security;
alter table tickets disable row level security;
alter table photos disable row level security;
alter table notes disable row level security;
alter table profiles disable row level security;

grant all on all tables in schema public to anon, authenticated;`;

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
  } catch (e) { return []; }
};

const saveToStorage = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const generateUUID = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

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

export const apiService = {
  async getSyncStatus(): Promise<{ synced: boolean, error?: string }> {
    try {
      const { error } = await supabase.from('jobs').select('id').limit(1);
      if (error) {
        return { 
          synced: false, 
          error: `Supabase Error [${error.code}]: ${error.message}` 
        };
      }
      return { synced: true };
    } catch (e: any) { 
      return { synced: false, error: e.message || String(e) }; 
    }
  },

  async getUsers(): Promise<UserRecord[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return getFromStorage<UserRecord>(STORAGE_KEYS.USERS);
    return (data || []).map(u => ({ ...u, role: u.role as UserRole }));
  },

  async addUser(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    const newUser = { ...user, id: generateUUID() };
    const { data, error } = await supabase.from('profiles').insert([user]).select().single();
    if (error) {
      const users = getFromStorage<UserRecord>(STORAGE_KEYS.USERS);
      saveToStorage(STORAGE_KEYS.USERS, [...users, newUser]);
      return newUser;
    }
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      const users = getFromStorage<UserRecord>(STORAGE_KEYS.USERS).filter(u => u.id !== id);
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  async getJobs(): Promise<Job[]> {
    const { data, error } = await supabase.from('jobs').select('*');
    if (error) return getFromStorage<Job>(STORAGE_KEYS.JOBS);
    return (data || []).map(mapJob);
  },

  async saveJob(job: Job): Promise<Job> {
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

    if (error) {
      const jobs = getFromStorage<Job>(STORAGE_KEYS.JOBS);
      const index = jobs.findIndex(j => j.id === job.id);
      const updated = index > -1 ? jobs.map(j => j.id === job.id ? job : j) : [job, ...jobs];
      saveToStorage(STORAGE_KEYS.JOBS, updated);
      return job;
    }
    return mapJob(data);
  },

  async getTickets(): Promise<DigTicket[]> {
    const { data, error } = await supabase.from('tickets').select('*');
    if (error) return getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS);
    return (data || []).map(mapTicket);
  },

  async saveTicket(ticket: DigTicket): Promise<DigTicket> {
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

    if (error) {
      const tickets = getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS);
      const index = tickets.findIndex(t => t.id === ticket.id);
      const updated = index > -1 ? tickets.map(t => t.id === ticket.id ? ticket : t) : [ticket, ...tickets];
      saveToStorage(STORAGE_KEYS.TICKETS, updated);
      return ticket;
    }
    return mapTicket(data);
  },

  async deleteTicket(id: string): Promise<void> {
    const { error } = await supabase.from('tickets').delete().eq('id', id);
    if (error) {
      const tickets = getFromStorage<DigTicket>(STORAGE_KEYS.TICKETS).filter(t => t.id !== id);
      saveToStorage(STORAGE_KEYS.TICKETS, tickets);
    }
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const { data, error } = await supabase.from('photos').select('*');
    if (error) return getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS);
    return (data || []).map(p => ({ ...p, jobNumber: p.job_number, dataUrl: p.data_url }));
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const newPhoto = { ...photo, id: generateUUID(), dataUrl: base64 };
        
        const { error } = await supabase.from('photos').insert([{
          id: newPhoto.id,
          job_number: photo.jobNumber,
          data_url: base64,
          caption: photo.caption
        }]);

        if (error) {
          const photos = getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS);
          saveToStorage(STORAGE_KEYS.PHOTOS, [newPhoto, ...photos]);
        }
        resolve(newPhoto);
      };
      reader.readAsDataURL(file);
    });
  },

  async deletePhoto(id: string): Promise<void> {
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) {
      const photos = getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS).filter(p => p.id !== id);
      saveToStorage(STORAGE_KEYS.PHOTOS, photos);
    }
  },

  async getNotes(): Promise<JobNote[]> {
    const { data, error } = await supabase.from('notes').select('*');
    if (error) return getFromStorage<JobNote>(STORAGE_KEYS.NOTES);
    return (data || []).map(n => ({ ...n, jobNumber: n.job_number }));
  },

  async addNote(note: JobNote): Promise<JobNote> {
    const { error } = await supabase.from('notes').insert([{
      id: note.id,
      job_number: note.jobNumber,
      text: note.text,
      author: note.author,
      timestamp: note.timestamp
    }]);

    if (error) {
      const notes = getFromStorage<JobNote>(STORAGE_KEYS.NOTES);
      saveToStorage(STORAGE_KEYS.NOTES, [note, ...notes]);
    }
    return note;
  }
};