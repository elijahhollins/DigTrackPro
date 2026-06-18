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
  profileId:  row.profile_id != null ? String(row.profile_id) : null,
});

const mapEquipment = (row: Record<string, unknown>): Equipment => ({
  id:            String(row.id ?? ''),
  companyId:     String(row.company_id ?? ''),
  name:          String(row.name ?? ''),
  hourlyRate:    Number(row.hourly_rate ?? 0),
  unitNumber:    row.unit_number    != null ? String(row.unit_number)    : undefined,
  equipmentType: row.equipment_type != null ? String(row.equipment_type) : undefined,
  year:          row.year           != null ? Number(row.year)           : null,
  make:          row.make           != null ? String(row.make)           : undefined,
  model:         row.model          != null ? String(row.model)          : undefined,
  vin:           row.vin            != null ? String(row.vin)            : undefined,
  serialNumber:  row.serial_number  != null ? String(row.serial_number)  : undefined,
  licensePlate:  row.license_plate  != null ? String(row.license_plate)  : undefined,
  notes:         row.notes          != null ? String(row.notes)          : undefined,
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
      .insert({ company_id: companyId, name: e.name, role: e.role, hourly_rate: e.hourlyRate, profile_id: e.profileId ?? null })
      .select().single();
    if (error) throw error;
    return mapEmployee(data as Record<string, unknown>);
  },

  async updateEmployee(id: number, updates: Partial<Omit<Employee, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.name       !== undefined) db.name        = updates.name;
    if (updates.role       !== undefined) db.role        = updates.role;
    if (updates.hourlyRate !== undefined) db.hourly_rate = updates.hourlyRate;
    if (updates.profileId  !== undefined) db.profile_id  = updates.profileId;
    const { error } = await supabase.from('employees').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteEmployee(id: number): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Equipment (backed by inventory_items with item_type = 'EQUIPMENT') ───────
  async getEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('item_type', 'EQUIPMENT')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapEquipment(r as Record<string, unknown>));
  },

  async createEquipment(companyId: string, e: Omit<Equipment, 'id' | 'companyId'>): Promise<Equipment> {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ company_id: companyId, name: e.name, item_type: 'EQUIPMENT', hourly_rate: e.hourlyRate })
      .select().single();
    if (error) throw error;
    return mapEquipment(data as Record<string, unknown>);
  },

  async updateEquipment(id: string, updates: Partial<Omit<Equipment, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.name          !== undefined) db.name            = updates.name;
    if (updates.hourlyRate    !== undefined) db.hourly_rate     = updates.hourlyRate;
    if (updates.unitNumber    !== undefined) db.unit_number     = updates.unitNumber;
    if (updates.equipmentType !== undefined) db.equipment_type  = updates.equipmentType;
    if (updates.year          !== undefined) db.year            = updates.year;
    if (updates.make          !== undefined) db.make            = updates.make;
    if (updates.model         !== undefined) db.model           = updates.model;
    if (updates.vin           !== undefined) db.vin             = updates.vin;
    if (updates.serialNumber  !== undefined) db.serial_number   = updates.serialNumber;
    if (updates.licensePlate  !== undefined) db.license_plate   = updates.licensePlate;
    if (updates.notes         !== undefined) db.notes           = updates.notes;
    const { error } = await supabase.from('inventory_items').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteEquipment(id: string): Promise<void> {
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
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

  async bulkCreateEmployee(companyId: string, items: Pick<Employee, 'name' | 'role' | 'hourlyRate'>[]): Promise<Employee[]> {
    const rows = items.map(e => ({
      company_id:  companyId,
      name:        e.name,
      role:        e.role,
      hourly_rate: e.hourlyRate,
      profile_id:  null,
    }));
    const { data, error } = await supabase.from('employees').insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(r => mapEmployee(r as Record<string, unknown>));
  },

  async bulkCreateEquipment(companyId: string, items: Omit<Equipment, 'id' | 'companyId'>[]): Promise<Equipment[]> {
    const rows = items.map(e => ({
      company_id:     companyId,
      name:           e.name,
      item_type:      'EQUIPMENT',
      hourly_rate:    e.hourlyRate,
      unit_number:    e.unitNumber    ?? null,
      equipment_type: e.equipmentType ?? null,
      year:           e.year          ?? null,
      make:           e.make          ?? null,
      model:          e.model         ?? null,
      vin:            e.vin           ?? null,
      serial_number:  e.serialNumber  ?? null,
      license_plate:  e.licensePlate  ?? null,
      notes:          e.notes         ?? null,
    }));
    const { data, error } = await supabase.from('inventory_items').insert(rows).select();
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
