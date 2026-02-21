
import { supabase } from '../lib/supabaseClient.ts';
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job, NoShowRecord, JobPrint, PrintMarker, Company } from '../types.ts';

export const SQL_SCHEMA = `-- 1. RESET SCHEMATIC
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('companies', 'profiles', 'jobs', 'tickets', 'photos', 'notes', 'no_shows', 'push_subscriptions', 'job_prints', 'print_markers')
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 2. CORE TABLES WITH MULTI-TENANCY
create table if not exists companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    brand_color text default '#3b82f6',
    created_at timestamp with time zone default now()
);

create table if not exists profiles (
    id uuid primary key, 
    company_id uuid references companies(id),
    name text, 
    username text, 
    role text
);

create table if not exists jobs (
    id uuid primary key, 
    company_id uuid references companies(id) not null,
    job_number text, 
    customer text, 
    address text, 
    city text, 
    state text, 
    county text, 
    is_complete boolean default false, 
    created_at timestamp with time zone default now()
);

create table if not exists tickets (
    id uuid primary key, 
    company_id uuid references companies(id) not null,
    job_number text, 
    ticket_no text, 
    street text, 
    cross_street text,
    place text,
    extent text, 
    county text, 
    city text, 
    state text, 
    call_in_date text, 
    work_date text, 
    expires text, 
    site_contact text, 
    refresh_requested boolean default false, 
    no_show_requested boolean default false, 
    is_archived boolean default false, 
    document_url text,
    created_at timestamp with time zone default now()
);

create table if not exists job_prints (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) not null,
    job_number text not null,
    storage_path text not null,
    file_name text not null,
    is_pinned boolean default true,
    created_at timestamp with time zone default now()
);

create table if not exists print_markers (
    id uuid primary key default gen_random_uuid(),
    print_id uuid references job_prints(id) on delete cascade,
    ticket_id uuid references tickets(id) on delete cascade,
    x_percent float8 not null,
    y_percent float8 not null,
    page_number int4 default 1,
    label text,
    created_at timestamp with time zone default now()
);

create table if not exists photos (
    id uuid primary key, 
    company_id uuid references companies(id) not null,
    job_number text, 
    data_url text, 
    caption text, 
    created_at timestamp with time zone default now()
);

create table if not exists notes (
    id uuid primary key, 
    company_id uuid references companies(id) not null,
    job_number text, 
    text text, 
    author text, 
    timestamp bigint
);

create table if not exists no_shows (
    id uuid primary key, 
    company_id uuid references companies(id) not null,
    ticket_id uuid references tickets(id) on delete cascade, 
    job_number text, 
    utilities text[], 
    companies text, 
    author text, 
    timestamp bigint
);

-- 3. ENABLE RLS
alter table companies enable row level security;
alter table jobs enable row level security;
alter table tickets enable row level security;
alter table photos enable row level security;
alter table notes enable row level security;
alter table profiles enable row level security;
alter table no_shows enable row level security;
alter table job_prints enable row level security;
alter table print_markers enable row level security;

-- 4. TENANT ISOLATION POLICIES (THE ENGINE OF SCALING)
create policy "tenant_isolation_profiles" on profiles for all to authenticated 
using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "tenant_isolation_jobs" on jobs for all to authenticated 
using (company_id = (select company_id from profiles where id = auth.uid()))
with check (company_id = (select company_id from profiles where id = auth.uid()));

create policy "tenant_isolation_tickets" on tickets for all to authenticated 
using (company_id = (select company_id from profiles where id = auth.uid()))
with check (company_id = (select company_id from profiles where id = auth.uid()));

create policy "tenant_isolation_photos" on photos for all to authenticated 
using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "tenant_isolation_companies" on companies for select to authenticated 
using (id = (select company_id from profiles where id = auth.uid()));

grant all on all tables in schema public to authenticated;`;

const generateUUID = () => crypto.randomUUID();

const mapJob = (data: any): Job => ({
  id: data.id,
  companyId: data.company_id,
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
  async getCompany(id: string): Promise<Company | null> {
    const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
    if (error) return null;
    return {
      id: data.id,
      name: data.name,
      brandColor: data.brand_color,
      createdAt: new Date(data.created_at).getTime()
    };
  },

  async getUsers(): Promise<UserRecord[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    return (data || []).map(u => ({ 
      ...u, 
      companyId: u.company_id,
      role: u.role?.toUpperCase() === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW 
    }));
  },

  async addUser(user: Partial<UserRecord>): Promise<UserRecord> {
    const id = user.id || generateUUID();
    const newUserRecord = { 
      id, 
      name: user.name, 
      username: user.username, 
      role: user.role || UserRole.CREW,
      company_id: user.companyId
    };
    const { data, error } = await supabase.from('profiles').upsert([newUserRecord]).select().single();
    if (error) throw error;
    return { 
      ...data, 
      companyId: data.company_id,
      role: data.role?.toUpperCase() === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW 
    };
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
      company_id: job.companyId,
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

  async deleteJob(id: string): Promise<void> {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw error;
  },

  async getTickets(): Promise<DigTicket[]> {
    const { data, error } = await supabase.from('tickets').select('*');
    if (error) return [];
    return (data || []).map(t => ({
        id: t.id,
        companyId: t.company_id,
        jobNumber: t.job_number,
        ticketNo: t.ticket_no,
        street: t.street,
        crossStreet: t.cross_street || '',
        place: t.place || '',
        extent: t.extent || '',
        county: t.county,
        city: t.city,
        state: t.state,
        callInDate: t.call_in_date,
        workDate: t.work_date,
        expires: t.expires,
        site_contact: t.site_contact,
        refreshRequested: t.refresh_requested ?? false,
        noShowRequested: t.no_show_requested ?? false,
        isArchived: t.is_archived ?? false,
        documentUrl: t.document_url || '',
        createdAt: new Date(t.created_at).getTime()
    } as any));
  },

  async saveTicket(ticket: DigTicket, archiveExisting: boolean = false): Promise<DigTicket> {
    if (archiveExisting) {
      await supabase.from('tickets').update({ is_archived: true }).eq('ticket_no', ticket.ticketNo).eq('job_number', ticket.jobNumber).neq('id', ticket.id);
    }
    const { data, error } = await supabase.from('tickets').upsert({
      id: ticket.id,
      company_id: ticket.companyId,
      job_number: ticket.jobNumber,
      ticket_no: ticket.ticketNo,
      street: ticket.street,
      cross_street: ticket.crossStreet,
      place: ticket.place,
      extent: ticket.extent,
      county: ticket.county,
      city: ticket.city,
      state: ticket.state,
      call_in_date: ticket.callInDate,
      work_date: ticket.workDate,
      expires: ticket.expires,
      site_contact: ticket.siteContact,
      refresh_requested: ticket.refreshRequested ?? false,
      no_show_requested: ticket.noShowRequested ?? false,
      is_archived: ticket.isArchived ?? false,
      document_url: ticket.documentUrl
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        companyId: data.company_id,
        jobNumber: data.job_number,
        ticketNo: data.ticket_no,
        street: data.street,
        crossStreet: data.cross_street || '',
        place: data.place || '',
        extent: data.extent,
        county: data.county,
        city: data.city,
        state: data.state,
        callInDate: data.call_in_date,
        workDate: data.work_date,
        expires: data.expires,
        siteContact: data.site_contact,
        refreshRequested: data.refresh_requested ?? false,
        noShowRequested: data.no_show_requested ?? false,
        isArchived: data.is_archived ?? false,
        documentUrl: data.document_url || '',
        createdAt: new Date(data.created_at).getTime()
    };
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const { data, error } = await supabase.from('photos').select('*');
    if (error) return [];
    return (data || []).map(p => ({ ...p, jobNumber: p.job_number, companyId: p.company_id, dataUrl: p.data_url, timestamp: new Date(p.created_at).getTime() }));
  },

  async addPhoto(photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File): Promise<JobPhoto> {
    const id = generateUUID();
    const fileExt = file.name.split('.').pop();
    const filePath = `${photo.jobNumber}/${id}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('job-photos').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(filePath);
    const { error: dbError } = await supabase.from('photos').insert([{ id, company_id: photo.companyId, job_number: photo.jobNumber, data_url: publicUrl, caption: photo.caption }]);
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
    return (data || []).map(n => ({ ...n, jobNumber: n.job_number, companyId: n.company_id }));
  },

  async addNote(note: JobNote): Promise<JobNote> {
    const { error } = await supabase.from('notes').insert([{ id: note.id, company_id: note.companyId, job_number: note.jobNumber, text: note.text, author: note.author, timestamp: note.timestamp }]);
    if (error) throw error;
    return note;
  },

  async addTicketFile(jobNumber: string, file: File): Promise<string> {
    const id = generateUUID();
    const fileExt = file.name.split('.').pop();
    const filePath = `${jobNumber}/tickets/${id}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('Ticket_Images').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('Ticket_Images').getPublicUrl(filePath);
    return publicUrl;
  },

  async savePushSubscription(userId: string, subscription: any): Promise<void> {
    const { error } = await supabase.from('push_subscriptions').upsert([{
      user_id: userId,
      subscription_json: JSON.stringify(subscription)
    }]);
    if (error) throw error;
  },

  async getNoShows(): Promise<NoShowRecord[]> {
    const { data, error } = await supabase.from('no_shows').select('*');
    if (error) return [];
    return (data || []).map(n => ({ id: n.id, ticketId: n.ticket_id, companyId: n.company_id, jobNumber: n.job_number, utilities: n.utilities || [], companies: n.companies || '', author: n.author || '', timestamp: Number(n.timestamp) }));
  },

  async addNoShow(noShow: NoShowRecord): Promise<void> {
    const { error } = await supabase.from('no_shows').insert([{ id: noShow.id, company_id: noShow.companyId, ticket_id: noShow.ticketId, job_number: noShow.jobNumber, utilities: noShow.utilities, companies: noShow.companies, author: noShow.author, timestamp: noShow.timestamp }]);
    if (error) throw error;
    await supabase.from('tickets').update({ no_show_requested: true }).eq('id', noShow.ticketId);
  },

  async deleteNoShow(ticketId: string): Promise<void> {
    await supabase.from('no_shows').delete().eq('ticket_id', ticketId);
    await supabase.from('tickets').update({ no_show_requested: false }).eq('id', ticketId);
  },

  async getJobPrints(jobNumber: string): Promise<JobPrint[]> {
    const { data, error } = await supabase.from('job_prints').select('*').eq('job_number', jobNumber);
    if (error) return [];
    return (data || []).map(p => {
      const { data: { publicUrl } } = supabase.storage.from('job-prints').getPublicUrl(p.storage_path);
      return {
        id: p.id,
        jobNumber: p.job_number,
        companyId: p.company_id,
        storagePath: p.storage_path,
        fileName: p.file_name,
        isPinned: p.is_pinned,
        createdAt: new Date(p.created_at).getTime(),
        url: publicUrl
      };
    });
  },

  async uploadJobPrint(jobNumber: string, file: File): Promise<JobPrint> {
    const id = generateUUID();
    const fileExt = file.name.split('.').pop();
    const filePath = `${jobNumber}/${id}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('job-prints').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('job-prints').getPublicUrl(filePath);
    const { data, error } = await supabase.from('job_prints').insert([{ id, job_number: jobNumber, storage_path: filePath, file_name: file.name, is_pinned: true }]).select().single();
    if (error) throw error;
    return { ...data, companyId: data.company_id, url: publicUrl, createdAt: new Date(data.created_at).getTime() };
  },

  async getPrintMarkers(printId: string): Promise<PrintMarker[]> {
    const { data, error } = await supabase.from('print_markers').select('*').eq('print_id', printId);
    if (error) return [];
    return (data || []).map(m => ({ id: m.id, printId: m.print_id, ticketId: m.ticket_id, xPercent: m.x_percent, yPercent: m.y_percent, pageNumber: m.page_number, label: m.label }));
  },

  async savePrintMarker(marker: Omit<PrintMarker, 'id'>): Promise<PrintMarker> {
    const { data, error } = await supabase.from('print_markers').insert({ print_id: marker.printId, ticket_id: marker.ticketId, x_percent: marker.xPercent, y_percent: marker.yPercent, page_number: marker.pageNumber, label: marker.label }).select().single();
    if (error) throw error;
    return { id: data.id, printId: data.print_id, ticketId: data.ticket_id, xPercent: data.x_percent, yPercent: data.y_percent, pageNumber: data.page_number, label: data.label };
  },

  async deletePrintMarker(id: string): Promise<void> {
    const { error } = await supabase.from('print_markers').delete().eq('id', id);
    if (error) throw error;
  },

  async createCompany(company: Company): Promise<Company> {
    const { data, error } = await supabase.from('companies').insert([{
      id: company.id,
      name: company.name,
      brand_color: company.brandColor,
      created_at: new Date().toISOString()
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      brandColor: data.brand_color,
      createdAt: new Date(data.created_at).getTime()
    };
  },

  async updateUserCompany(userId: string, companyId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ company_id: companyId })
      .eq('id', userId);

    if (error) throw error;
  }
};
