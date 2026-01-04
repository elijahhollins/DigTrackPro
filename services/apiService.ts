
import { supabase, getSupabaseConfig } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types.ts';

export const SQL_SCHEMA = `-- 1. Drop existing policies to clear recursion loops
drop policy if exists "Auth access all" on jobs;
drop policy if exists "Auth access all" on tickets;
drop policy if exists "Auth access all" on photos;
drop policy if exists "Auth access all" on notes;
drop policy if exists "Auth access all" on profiles;
drop policy if exists "Auth view all" on profiles;

-- 2. Create clean tables
create table if not exists jobs (id uuid primary key, job_number text, customer text, address text, city text, state text, county text, is_complete boolean default false, created_at timestamp with time zone default now());
create table if not exists tickets (id uuid primary key, job_number text, ticket_no text, address text, county text, city text, state text, call_in_date text, dig_start text, expiration_date text, site_contact text, created_at timestamp with time zone default now());
create table if not exists photos (id uuid primary key, job_number text, data_url text, caption text, created_at timestamp with time zone default now());
create table if not exists notes (id uuid primary key, job_number text, text text, author text, timestamp bigint);
create table if not exists profiles (id uuid primary key, name text, username text, role text);

-- 3. Enable RLS
alter table jobs enable row level security;
alter table tickets enable row level security;
alter table photos enable row level security;
alter table notes enable row level security;
alter table profiles enable row level security;

-- 4. Non-Recursive Policies (CRITICAL: 'using (true)' prevents recursion)
create policy "Public Auth Access" on profiles for all to authenticated using (true) with check (true);
create policy "Public Auth Access" on jobs for all to authenticated using (true) with check (true);
create policy "Public Auth Access" on tickets for all to authenticated using (true) with check (true);
create policy "Public Auth Access" on photos for all to authenticated using (true) with check (true);
create policy "Public Auth Access" on notes for all to authenticated using (true) with check (true);

grant all on all tables in schema public to authenticated;`;

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
  async getSyncStatus(): Promise<{ synced: boolean, error?: string, diagnostics?: any }> {
    const config = getSupabaseConfig();
    if (!config.isValid) return { synced: false, error: 'Config missing', diagnostics: config };
    try {
      const { error } = await supabase.from('jobs').select('id').limit(1);
      if (error) return { synced: false, error: error.message, diagnostics: config };
      return { synced: true, diagnostics: config };
    } catch (e: any) { 
      return { synced: false, error: e.message, diagnostics: config }; 
    }
  },

  async getUsers(): Promise<UserRecord[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return getFromStorage<UserRecord>(STORAGE_KEYS.USERS);
    return (data || []).map(u => {
      const rawRole = (u.role || '').toUpperCase();
      const role = rawRole === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW;
      return { ...u, role };
    });
  },

  async addUser(user: Partial<UserRecord>): Promise<UserRecord> {
    const id = user.id || generateUUID();
    const newUserRecord = { 
      id, 
      name: user.name || 'New User', 
      username: user.username || 'user@example.com', 
      role: user.role || UserRole.CREW 
    };
    
    const { data, error } = await supabase.from('profiles').upsert([newUserRecord]).select().single();
    
    if (error) {
      console.error("DB User Creation Error:", error);
      throw error;
    }

    const rawRole = (data.role || '').toUpperCase();
    const role = rawRole === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW;
    return { ...data, role };
  },

  async updateUserRole(id: string, role: UserRole): Promise<void> {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) throw error;
  },

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw error;
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
    
    if (error) throw error;
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
    
    if (error) throw error;
    return mapTicket(data);
  },

  async deleteTicket(id: string): Promise<void> {
    const { error } = await supabase.from('tickets').delete().eq('id', id);
    if (error) throw error;
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const { data, error } = await supabase.from('photos').select('*');
    if (error) return getFromStorage<JobPhoto>(STORAGE_KEYS.PHOTOS);
    return (data || []).map(p => ({ ...p, jobNumber: p.job_number, dataUrl: p.data_url }));
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const id = generateUUID();
        const newPhoto = { ...photo, id, dataUrl: base64 };
        const { error } = await supabase.from('photos').insert([{
          id: id,
          job_number: photo.jobNumber,
          data_url: base64,
          caption: photo.caption
        }]);
        if (error) reject(error);
        else resolve(newPhoto);
      };
      reader.readAsDataURL(file);
    });
  },

  async deletePhoto(id: string): Promise<void> {
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) throw error;
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
    if (error) throw error;
    return note;
  }
};
