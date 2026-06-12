// ─────────────────────────────────────────────────────────────────────────────
// Schedule / Field-Ops Service — Supabase CRUD for the scheduling module.
// Mirrors the structure of inboundTicketService.ts. Tenant isolation is enforced
// by RLS (get_user_company_id()); callers still pass companyId for inserts.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import {
  Employee,
  Equipment,
  Material,
  ServiceJob,
  WorkLog,
  WorkLogEntry,
  WorkLogTemplate,
  Invoice,
  InvoiceSettings,
} from './schedulingTypes.ts';

// ── mappers ─────────────────────────────────────────────────────────────────

const mapEmployee = (row: Record<string, unknown>): Employee => ({
  id:         Number(row.id ?? 0),
  companyId:  String(row.company_id ?? ''),
  name:       String(row.name ?? ''),
  role:       String(row.role ?? ''),
  hourlyRate: Number(row.hourly_rate ?? 0),
});

const mapEquipment = (row: Record<string, unknown>): Equipment => ({
  id:         Number(row.id ?? 0),
  companyId:  String(row.company_id ?? ''),
  name:       String(row.name ?? ''),
  hourlyRate: Number(row.hourly_rate ?? 0),
});

const mapMaterial = (row: Record<string, unknown>): Material => ({
  id:        Number(row.id ?? 0),
  companyId: String(row.company_id ?? ''),
  name:      String(row.name ?? ''),
  unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
});

const EMPTY_ENTRY: WorkLogEntry = { employees: [], equipment: [], materials: [] };

const mapWorkLog = (row: Record<string, unknown>): WorkLog => ({
  id:    Number(row.id ?? 0),
  jobId: Number(row.job_id ?? 0),
  date:  String(row.date ?? ''),
  notes: String(row.notes ?? ''),
  data:  (row.data as WorkLogEntry) ?? EMPTY_ENTRY,
});

const mapServiceJob = (row: Record<string, unknown>): ServiceJob => ({
  id:           Number(row.id ?? 0),
  companyId:    String(row.company_id ?? ''),
  customerName: String(row.customer_name ?? ''),
  jobName:      String(row.job_name ?? ''),
  jobNumber:    String(row.job_number ?? ''),
  address:      String(row.address ?? ''),
  startDate:    row.start_date != null ? String(row.start_date) : null,
  endDate:      row.end_date != null ? String(row.end_date) : null,
  notes:        String(row.notes ?? ''),
  status:       (row.status as 'active' | 'completed') ?? 'active',
  foremanId:    row.foreman_id != null ? String(row.foreman_id) : null,
});

const mapTemplate = (row: Record<string, unknown>): WorkLogTemplate => ({
  id:        Number(row.id ?? 0),
  companyId: String(row.company_id ?? ''),
  name:      String(row.name ?? ''),
  data:      (row.data as WorkLogEntry) ?? EMPTY_ENTRY,
});

const mapInvoice = (row: Record<string, unknown>): Invoice => ({
  id:             Number(row.id ?? 0),
  companyId:      String(row.company_id ?? ''),
  jobId:          Number(row.job_id ?? 0),
  invoiceNumber:  String(row.invoice_number ?? ''),
  date:           row.date != null ? String(row.date) : null,
  dueDate:        row.due_date != null ? String(row.due_date) : null,
  status:         (row.status as 'draft' | 'sent' | 'paid') ?? 'draft',
  laborTotal:     Number(row.labor_total ?? 0),
  equipmentTotal: Number(row.equipment_total ?? 0),
  materialTotal:  Number(row.material_total ?? 0),
  grandTotal:     Number(row.grand_total ?? 0),
  data:           (row.data as Record<string, unknown>) ?? {},
});

const mapSettings = (row: Record<string, unknown>): InvoiceSettings => ({
  id:             Number(row.id ?? 0),
  companyId:      String(row.company_id ?? ''),
  companyName:    String(row.company_name ?? ''),
  companyAddress: String(row.company_address ?? ''),
  companyPhone:   String(row.company_phone ?? ''),
  companyEmail:   String(row.company_email ?? ''),
  logoInitials:   String(row.logo_initials ?? ''),
  paymentTerms:   String(row.payment_terms ?? ''),
  headerColor:    String(row.header_color ?? '#0a142d'),
  accentColor:    String(row.accent_color ?? '#c49614'),
});

// ── public API ──────────────────────────────────────────────────────────────

export const scheduleService = {
  // ── Employees ──────────────────────────────────────────────────────────────
  async getEmployees(): Promise<Employee[]> {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapEmployee(r as Record<string, unknown>));
  },

  async createEmployee(companyId: string, e: Omit<Employee, 'id' | 'companyId'>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .insert({ company_id: companyId, name: e.name, role: e.role, hourly_rate: e.hourlyRate })
      .select().single();
    if (error) throw error;
    return mapEmployee(data as Record<string, unknown>);
  },

  async updateEmployee(id: number, updates: Partial<Omit<Employee, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.name       !== undefined) db.name        = updates.name;
    if (updates.role       !== undefined) db.role        = updates.role;
    if (updates.hourlyRate !== undefined) db.hourly_rate = updates.hourlyRate;
    const { error } = await supabase.from('employees').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteEmployee(id: number): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Equipment ──────────────────────────────────────────────────────────────
  async getEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabase.from('equipment').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapEquipment(r as Record<string, unknown>));
  },

  async createEquipment(companyId: string, e: Omit<Equipment, 'id' | 'companyId'>): Promise<Equipment> {
    const { data, error } = await supabase
      .from('equipment')
      .insert({ company_id: companyId, name: e.name, hourly_rate: e.hourlyRate })
      .select().single();
    if (error) throw error;
    return mapEquipment(data as Record<string, unknown>);
  },

  async updateEquipment(id: number, updates: Partial<Omit<Equipment, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.name       !== undefined) db.name        = updates.name;
    if (updates.hourlyRate !== undefined) db.hourly_rate = updates.hourlyRate;
    const { error } = await supabase.from('equipment').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteEquipment(id: number): Promise<void> {
    const { error } = await supabase.from('equipment').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Materials ──────────────────────────────────────────────────────────────
  async getMaterials(): Promise<Material[]> {
    const { data, error } = await supabase.from('materials').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapMaterial(r as Record<string, unknown>));
  },

  async createMaterial(companyId: string, m: Omit<Material, 'id' | 'companyId'>): Promise<Material> {
    const { data, error } = await supabase
      .from('materials')
      .insert({ company_id: companyId, name: m.name, unit_price: m.unitPrice })
      .select().single();
    if (error) throw error;
    return mapMaterial(data as Record<string, unknown>);
  },

  async updateMaterial(id: number, updates: Partial<Omit<Material, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.name      !== undefined) db.name       = updates.name;
    if (updates.unitPrice !== undefined) db.unit_price = updates.unitPrice;
    const { error } = await supabase.from('materials').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteMaterial(id: number): Promise<void> {
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkCreateEquipment(companyId: string, items: Omit<Equipment, 'id' | 'companyId'>[]): Promise<Equipment[]> {
    const rows = items.map(e => ({ company_id: companyId, name: e.name, hourly_rate: e.hourlyRate }));
    const { data, error } = await supabase.from('equipment').insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(r => mapEquipment(r as Record<string, unknown>));
  },

  async bulkCreateMaterial(companyId: string, items: Omit<Material, 'id' | 'companyId'>[]): Promise<Material[]> {
    const rows = items.map(m => ({ company_id: companyId, name: m.name, unit_price: m.unitPrice }));
    const { data, error } = await supabase.from('materials').insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(r => mapMaterial(r as Record<string, unknown>));
  },

  // ── Service jobs (billing entity, with nested work logs) ────────────────────
  async getServiceJobs(): Promise<ServiceJob[]> {
    const { data, error } = await supabase
      .from('service_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const jobs = (data ?? []).map(r => mapServiceJob(r as Record<string, unknown>));

    // Attach work logs (single query, grouped client-side)
    const { data: logRows, error: logErr } = await supabase
      .from('work_logs')
      .select('*')
      .order('date', { ascending: true });
    if (logErr) throw logErr;
    const logs = (logRows ?? []).map(r => mapWorkLog(r as Record<string, unknown>));
    for (const job of jobs) {
      job.logs = logs.filter(l => l.jobId === job.id);
    }
    return jobs;
  },

  async createServiceJob(companyId: string, j: Omit<ServiceJob, 'id' | 'companyId' | 'logs'>): Promise<ServiceJob> {
    const { data, error } = await supabase
      .from('service_jobs')
      .insert({
        company_id:    companyId,
        customer_name: j.customerName,
        job_name:      j.jobName,
        job_number:    j.jobNumber,
        address:       j.address,
        start_date:    j.startDate,
        end_date:      j.endDate,
        notes:         j.notes,
        status:        j.status,
        foreman_id:    j.foremanId,
      })
      .select().single();
    if (error) throw error;
    return mapServiceJob(data as Record<string, unknown>);
  },

  async updateServiceJob(id: number, updates: Partial<Omit<ServiceJob, 'id' | 'companyId' | 'logs'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.customerName !== undefined) db.customer_name = updates.customerName;
    if (updates.jobName      !== undefined) db.job_name      = updates.jobName;
    if (updates.jobNumber    !== undefined) db.job_number    = updates.jobNumber;
    if (updates.address      !== undefined) db.address       = updates.address;
    if (updates.startDate    !== undefined) db.start_date    = updates.startDate;
    if (updates.endDate      !== undefined) db.end_date      = updates.endDate;
    if (updates.notes        !== undefined) db.notes         = updates.notes;
    if (updates.status       !== undefined) db.status        = updates.status;
    if (updates.foremanId    !== undefined) db.foreman_id    = updates.foremanId;
    const { error } = await supabase.from('service_jobs').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteServiceJob(id: number): Promise<void> {
    const { error } = await supabase.from('service_jobs').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Work logs ───────────────────────────────────────────────────────────────
  async createWorkLog(jobId: number, date: string, notes: string, data: WorkLogEntry): Promise<WorkLog> {
    const { data: row, error } = await supabase
      .from('work_logs')
      .insert({ job_id: jobId, date, notes, data })
      .select().single();
    if (error) throw error;
    return mapWorkLog(row as Record<string, unknown>);
  },

  async updateWorkLog(id: number, updates: { date?: string; notes?: string; data?: WorkLogEntry }): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.date  !== undefined) db.date  = updates.date;
    if (updates.notes !== undefined) db.notes = updates.notes;
    if (updates.data  !== undefined) db.data  = updates.data;
    const { error } = await supabase.from('work_logs').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteWorkLog(id: number): Promise<void> {
    const { error } = await supabase.from('work_logs').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Work-log templates ──────────────────────────────────────────────────────
  async getTemplates(): Promise<WorkLogTemplate[]> {
    const { data, error } = await supabase.from('work_log_templates').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapTemplate(r as Record<string, unknown>));
  },

  async createTemplate(companyId: string, name: string, data: WorkLogEntry): Promise<WorkLogTemplate> {
    const { data: row, error } = await supabase
      .from('work_log_templates')
      .insert({ company_id: companyId, name, data })
      .select().single();
    if (error) throw error;
    return mapTemplate(row as Record<string, unknown>);
  },

  async deleteTemplate(id: number): Promise<void> {
    const { error } = await supabase.from('work_log_templates').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Invoices ────────────────────────────────────────────────────────────────
  async getInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => mapInvoice(r as Record<string, unknown>));
  },

  async createInvoice(companyId: string, inv: Omit<Invoice, 'id' | 'companyId'>): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        company_id:      companyId,
        job_id:          inv.jobId,
        invoice_number:  inv.invoiceNumber,
        date:            inv.date,
        due_date:        inv.dueDate,
        status:          inv.status,
        labor_total:     inv.laborTotal,
        equipment_total: inv.equipmentTotal,
        material_total:  inv.materialTotal,
        grand_total:     inv.grandTotal,
        data:            inv.data,
      })
      .select().single();
    if (error) throw error;
    return mapInvoice(data as Record<string, unknown>);
  },

  async updateInvoiceStatus(id: number, status: 'draft' | 'sent' | 'paid'): Promise<void> {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async deleteInvoice(id: number): Promise<void> {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Invoice settings (one row per company) ──────────────────────────────────
  async getInvoiceSettings(): Promise<InvoiceSettings | null> {
    const { data, error } = await supabase.from('invoice_settings').select('*').maybeSingle();
    if (error) throw error;
    return data ? mapSettings(data as Record<string, unknown>) : null;
  },

  async upsertInvoiceSettings(companyId: string, s: Omit<InvoiceSettings, 'id' | 'companyId'>): Promise<InvoiceSettings> {
    const { data, error } = await supabase
      .from('invoice_settings')
      .upsert({
        company_id:      companyId,
        company_name:    s.companyName,
        company_address: s.companyAddress,
        company_phone:   s.companyPhone,
        company_email:   s.companyEmail,
        logo_initials:   s.logoInitials,
        payment_terms:   s.paymentTerms,
        header_color:    s.headerColor,
        accent_color:    s.accentColor,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'company_id' })
      .select().single();
    if (error) throw error;
    return mapSettings(data as Record<string, unknown>);
  },
};
