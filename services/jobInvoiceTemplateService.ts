// ─────────────────────────────────────────────────────────────────────────────
// Job Invoice Template Service — Supabase CRUD for foreman crew/equipment
// templates used to quickly build a Job Hub invoice.
//
// RLS on job_invoice_templates already scopes visibility: a foreman only sees
// their own templates, an admin sees every template in their company. `list()`
// relies on that — no need to branch on role client-side.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import { JobInvoiceTemplate } from './schedulingTypes.ts';

const mapTemplate = (row: Record<string, unknown>): JobInvoiceTemplate => ({
  id:             Number(row.id ?? 0),
  companyId:      String(row.company_id ?? ''),
  ownerProfileId: String(row.owner_profile_id ?? ''),
  name:           String(row.name ?? ''),
  employeeIds:    ((row.employee_ids as unknown[]) ?? []).map(Number),
  equipmentIds:   ((row.equipment_ids as unknown[]) ?? []).map(String),
  createdAt:      row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
});

export const jobInvoiceTemplateService = {
  async list(): Promise<JobInvoiceTemplate[]> {
    const { data, error } = await supabase
      .from('job_invoice_templates')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(r => mapTemplate(r as Record<string, unknown>));
  },

  async create(
    companyId: string, ownerProfileId: string, name: string, employeeIds: number[], equipmentIds: string[],
  ): Promise<JobInvoiceTemplate> {
    const { data, error } = await supabase
      .from('job_invoice_templates')
      .insert({
        company_id:       companyId,
        owner_profile_id: ownerProfileId,
        name,
        employee_ids:     employeeIds,
        equipment_ids:    equipmentIds,
      })
      .select().single();
    if (error) throw error;
    return mapTemplate(data as Record<string, unknown>);
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase.from('job_invoice_templates').delete().eq('id', id);
    if (error) throw error;
  },
};
