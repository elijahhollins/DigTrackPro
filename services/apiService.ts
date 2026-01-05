import { supabase } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types.ts';

export const SQL_SCHEMA = `-- 1. SECURITY POLICY NUKER
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('profiles', 'jobs', 'tickets', 'photos', 'notes')
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 2. TABLE INITIALIZATION
create table if not exists jobs (id uuid primary key, job_number text, customer text, address text, city text, state text, county text, is_complete boolean default false, created_at timestamp with time zone default now());
create table if not exists tickets (id uuid primary key, job_number text, ticket_no text, address text, county text, city text, state text, call_in_date text, dig_start text, expiration_date text, site_contact text, created_at timestamp with time zone default now());
create table if not exists photos (id uuid primary key, job_number text, data_url text, caption text, created_at timestamp with time zone default now());
create table if not exists notes (id uuid primary key, job_number text, text text, author text, timestamp bigint);
create table if not exists profiles (id uuid primary key, name text, username text, role text);

-- 3. ENABLE RLS
alter table jobs enable row level security;
alter table tickets enable row level security;
alter table photos enable row level security;
alter table notes enable row level security;
alter table profiles enable row level security;

-- 4. POLICIES (Simplified for dev)
create policy "allow_authenticated_all" on profiles for all to authenticated using (true) with check (true);
create policy "allow_authenticated_all" on jobs for all to authenticated using (true) with check (true);
create policy "allow_authenticated_all" on tickets for all to authenticated using (true) with check (true);
create policy "allow_authenticated_all" on photos for all to authenticated using (true) with check (true);
create policy "allow_authenticated_all" on notes for all to authenticated using (true) with check (true);

grant all on all tables in schema public to authenticated;`;

const generateUUID = () => crypto.randomUUID();

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

export const apiService = {
  async getUsers(): Promise<UserRecord[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    return (data || []).map(u => ({ ...u, role: u.role?.toUpperCase() === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW }));
  },

  async addUser(user: Partial<UserRecord>): Promise<UserRecord> {
    const id = user.id || generateUUID();
    const newUserRecord = { 
      id, 
      name: user.name, 
      username: user.username, 
      role: user.role || UserRole.CREW
    };
    const { data, error } = await supabase.from('profiles').upsert([newUserRecord]).select().single();
    if (error) throw error;
    return { ...data, role: data.role?.toUpperCase() === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW };
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
    if (error) return [];
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
    if (error) return [];
    return (data || []).map(t => ({
        id: t.id,
        jobNumber: t.job_number,
        ticketNo: t.ticket_no,
        address: t.address,
        county: t.county,
        city: t.city,
        state: t.state,
        callInDate: t.call_in_date,
        digStart: t.dig_start,
        expirationDate: t.expiration_date,
        siteContact: t.site_contact,
        createdAt: new Date(t.created_at).getTime()
    }));
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
    return {
        id: data.id,
        jobNumber: data.job_number,
        ticketNo: data.ticket_no,
        address: data.address,
        county: data.county,
        city: data.city,
        state: data.state,
        callInDate: data.call_in_date,
        digStart: data.dig_start,
        expirationDate: data.expiration_date,
        siteContact: data.site_contact,
        createdAt: new Date(data.created_at).getTime()
    };
  },

  async deleteTicket(id: string): Promise<void> {
    const { error } = await supabase.from('tickets').delete().eq('id', id);
    if (error) throw error;
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const { data, error } = await supabase.from('photos').select('*');
    if (error) return [];
    return (data || []).map(p => ({ ...p, jobNumber: p.job_number, dataUrl: p.data_url }));
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    const id = generateUUID();
    const fileExt = file.name.split('.').pop();
    const filePath = `${photo.jobNumber}/${id}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('job-photos').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(filePath);
    const { error: dbError } = await supabase.from('photos').insert([{
      id,
      job_number: photo.jobNumber,
      data_url: publicUrl,
      caption: photo.caption
    }]);
    if (dbError) throw dbError;
    return { ...photo, id, dataUrl: publicUrl };
  },

  async deletePhoto(id: string): Promise<void> {
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) throw error;
  },

  async getNotes(): Promise<JobNote[]> {
    const { data, error } = await supabase.from('notes').select('*');
    if (error) return [];
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