// ─────────────────────────────────────────────────────────────────────────────
// Job Invoice Service — Supabase CRUD for Job Hub invoicing.
//
// Invoices here are keyed to the dig-ticket `jobs` table (uuid id), stored in
// `job_invoices`. This is separate from the service-job `invoices` table used by
// the Operations module. Tenant isolation is enforced by RLS
// (get_user_company_id()); callers still pass companyId on insert.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import { JobInvoice, JobInvoiceData } from './schedulingTypes.ts';

const EMPTY_DATA: JobInvoiceData = { customerName: '', address: '', employees: [], equipment: [], materials: [] };

const mapInvoice = (row: Record<string, unknown>): JobInvoice => ({
  id:             Number(row.id ?? 0),
  companyId:      String(row.company_id ?? ''),
  jobId:          String(row.job_id ?? ''),
  invoiceNumber:  String(row.invoice_number ?? ''),
  date:           row.date != null ? String(row.date) : null,
  dueDate:        row.due_date != null ? String(row.due_date) : null,
  laborTotal:     Number(row.labor_total ?? 0),
  equipmentTotal: Number(row.equipment_total ?? 0),
  materialTotal:  Number(row.material_total ?? 0),
  grandTotal:     Number(row.grand_total ?? 0),
  data:           { ...EMPTY_DATA, ...((row.data as Partial<JobInvoiceData>) ?? {}) },
  createdAt:      row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
});

export const jobInvoiceService = {
  async listByJob(jobId: string): Promise<JobInvoice[]> {
    const { data, error } = await supabase
      .from('job_invoices')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => mapInvoice(r as Record<string, unknown>));
  },

  async create(companyId: string, inv: Omit<JobInvoice, 'id' | 'companyId' | 'createdAt'>): Promise<JobInvoice> {
    const { data, error } = await supabase
      .from('job_invoices')
      .insert({
        company_id:      companyId,
        job_id:          inv.jobId,
        invoice_number:  inv.invoiceNumber,
        date:            inv.date,
        due_date:        inv.dueDate,
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

  async delete(id: number): Promise<void> {
    const { error } = await supabase.from('job_invoices').delete().eq('id', id);
    if (error) throw error;
  },
};
