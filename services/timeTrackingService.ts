// ─────────────────────────────────────────────────────────────────────────────
// Time Tracker Service — Supabase CRUD for the Time Tracker module.
// Mirrors the structure of scheduleService.ts / inboundTicketService.ts. Tenant
// isolation is enforced by RLS; callers still pass companyId for inserts.
//
// Core rule: an employee may have only ONE open entry at a time. clockIn() first
// closes any open entry for that employee, then opens a new one — so switching
// job/cost code produces a clean per-code breakdown.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import {
  CostCode,
  JobCostCodeAssignment,
  JobKind,
  TimeEntry,
} from './timeTrackingTypes.ts';

// ── mappers ─────────────────────────────────────────────────────────────────

const mapCostCode = (row: Record<string, unknown>): CostCode => ({
  id:          Number(row.id ?? 0),
  companyId:   String(row.company_id ?? ''),
  code:        String(row.code ?? ''),
  description: String(row.description ?? ''),
  isActive:    row.is_active !== false,
});

const mapAssignment = (row: Record<string, unknown>): JobCostCodeAssignment => ({
  id:         Number(row.id ?? 0),
  companyId:  String(row.company_id ?? ''),
  jobKind:    (row.job_kind as JobKind) ?? 'dig',
  jobRef:     String(row.job_ref ?? ''),
  costCodeId: Number(row.cost_code_id ?? 0),
});

const mapEntry = (row: Record<string, unknown>): TimeEntry => ({
  id:           Number(row.id ?? 0),
  companyId:    String(row.company_id ?? ''),
  employeeId:   Number(row.employee_id ?? 0),
  jobKind:      (row.job_kind as JobKind) ?? 'dig',
  jobRef:       String(row.job_ref ?? ''),
  jobLabel:     String(row.job_label ?? ''),
  costCodeId:   row.cost_code_id != null ? Number(row.cost_code_id) : null,
  clockedInAt:  String(row.clocked_in_at ?? ''),
  clockedOutAt: row.clocked_out_at != null ? String(row.clocked_out_at) : null,
  note:         String(row.note ?? ''),
  gpsLat:       row.gps_lat != null ? Number(row.gps_lat) : null,
  gpsLng:       row.gps_lng != null ? Number(row.gps_lng) : null,
  approved:     row.approved === true,
  approvedBy:   row.approved_by != null ? String(row.approved_by) : null,
  approvedAt:   row.approved_at != null ? String(row.approved_at) : null,
});

export interface ClockInInput {
  employeeId: number;
  jobKind:    JobKind;
  jobRef:     string;
  jobLabel:   string;
  costCodeId: number | null;
  note?:      string;
  gpsLat?:    number | null;
  gpsLng?:    number | null;
}

export interface ManualEntryInput extends ClockInInput {
  clockedInAt:  string;
  clockedOutAt: string | null;
}

// ── public API ────────────────────────────────────────────────────────────--

export const timeTrackingService = {
  // ── Cost codes ───────────────────────────────────────────────────────────
  async getCostCodes(): Promise<CostCode[]> {
    const { data, error } = await supabase.from('cost_codes').select('*').order('code');
    if (error) throw error;
    return (data ?? []).map(r => mapCostCode(r as Record<string, unknown>));
  },

  async createCostCode(companyId: string, c: Omit<CostCode, 'id' | 'companyId'>): Promise<CostCode> {
    const { data, error } = await supabase
      .from('cost_codes')
      .insert({ company_id: companyId, code: c.code, description: c.description, is_active: c.isActive })
      .select().single();
    if (error) throw error;
    return mapCostCode(data as Record<string, unknown>);
  },

  async updateCostCode(id: number, updates: Partial<Omit<CostCode, 'id' | 'companyId'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.code        !== undefined) db.code        = updates.code;
    if (updates.description !== undefined) db.description = updates.description;
    if (updates.isActive    !== undefined) db.is_active   = updates.isActive;
    const { error } = await supabase.from('cost_codes').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteCostCode(id: number): Promise<void> {
    const { error } = await supabase.from('cost_codes').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkCreateCostCodes(companyId: string, items: { code: string; description: string }[]): Promise<CostCode[]> {
    const { data, error } = await supabase
      .from('cost_codes')
      .insert(items.map(c => ({ company_id: companyId, code: c.code, description: c.description, is_active: true })))
      .select();
    if (error) throw error;
    return (data ?? []).map(r => mapCostCode(r as Record<string, unknown>));
  },

  // ── Job <-> cost code assignments ──────────────────────────────────────────
  async getAssignments(): Promise<JobCostCodeAssignment[]> {
    const { data, error } = await supabase.from('job_cost_codes').select('*');
    if (error) throw error;
    return (data ?? []).map(r => mapAssignment(r as Record<string, unknown>));
  },

  async assignCostCode(companyId: string, jobKind: JobKind, jobRef: string, costCodeId: number): Promise<JobCostCodeAssignment> {
    const { data, error } = await supabase
      .from('job_cost_codes')
      .insert({ company_id: companyId, job_kind: jobKind, job_ref: jobRef, cost_code_id: costCodeId })
      .select().single();
    if (error) throw error;
    return mapAssignment(data as Record<string, unknown>);
  },

  async unassignCostCode(id: number): Promise<void> {
    const { error } = await supabase.from('job_cost_codes').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Cost codes available for a job: those explicitly assigned to it, or — if none
   * are assigned — the company's full active list (fallback).
   */
  async getCodesForJob(jobKind: JobKind, jobRef: string): Promise<CostCode[]> {
    const [codes, assignments] = await Promise.all([this.getCostCodes(), this.getAssignments()]);
    const assignedIds = new Set(
      assignments.filter(a => a.jobKind === jobKind && a.jobRef === jobRef).map(a => a.costCodeId),
    );
    const active = codes.filter(c => c.isActive);
    if (assignedIds.size === 0) return active;
    return active.filter(c => assignedIds.has(c.id));
  },

  // ── Clock in / out ───────────────────────────────────────────────────────--
  /** The employee's currently-open entry, or null if not clocked in. */
  async getActiveEntry(employeeId: number): Promise<TimeEntry | null> {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('employee_id', employeeId)
      .is('clocked_out_at', null)
      .order('clocked_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEntry(data as Record<string, unknown>) : null;
  },

  /** All currently-open entries for the company (RLS scopes to caller's company). */
  async getCompanyActiveEntries(): Promise<TimeEntry[]> {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .is('clocked_out_at', null)
      .order('clocked_in_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(r => mapEntry(r as Record<string, unknown>));
  },

  /** Close any open entry for an employee (used by clockOut + auto-close on switch). */
  async closeOpenEntries(employeeId: number): Promise<void> {
    const { error } = await supabase
      .from('time_entries')
      .update({ clocked_out_at: new Date().toISOString() })
      .eq('employee_id', employeeId)
      .is('clocked_out_at', null);
    if (error) throw error;
  },

  /**
   * Clock an employee in. First auto-closes any open entry for that employee
   * (enforcing one-open-at-a-time + switch semantics), then opens a new one.
   */
  async clockIn(companyId: string, input: ClockInInput): Promise<TimeEntry> {
    await this.closeOpenEntries(input.employeeId);
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        company_id:   companyId,
        employee_id:  input.employeeId,
        job_kind:     input.jobKind,
        job_ref:      input.jobRef,
        job_label:    input.jobLabel,
        cost_code_id: input.costCodeId,
        note:         input.note ?? '',
        gps_lat:      input.gpsLat ?? null,
        gps_lng:      input.gpsLng ?? null,
      })
      .select().single();
    if (error) throw error;
    return mapEntry(data as Record<string, unknown>);
  },

  /** Clock several employees into the SAME job + cost code in one action (crew). */
  async clockInMany(companyId: string, employeeIds: number[], input: Omit<ClockInInput, 'employeeId'>): Promise<void> {
    await Promise.all(employeeIds.map(id => this.clockIn(companyId, { ...input, employeeId: id })));
  },

  /** Clock a specific entry out by id (server timestamp). */
  async clockOut(entryId: number): Promise<void> {
    const { error } = await supabase
      .from('time_entries')
      .update({ clocked_out_at: new Date().toISOString() })
      .eq('id', entryId);
    if (error) throw error;
  },

  // ── Timesheets / admin ─────────────────────────────────────────────────────
  async listEntries(filter: { from?: string; to?: string; employeeId?: number; approved?: boolean } = {}): Promise<TimeEntry[]> {
    let q = supabase.from('time_entries').select('*').order('clocked_in_at', { ascending: false });
    if (filter.from       !== undefined) q = q.gte('clocked_in_at', filter.from);
    if (filter.to         !== undefined) q = q.lte('clocked_in_at', filter.to);
    if (filter.employeeId !== undefined) q = q.eq('employee_id', filter.employeeId);
    if (filter.approved   !== undefined) q = q.eq('approved', filter.approved);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(r => mapEntry(r as Record<string, unknown>));
  },

  async createManualEntry(companyId: string, input: ManualEntryInput): Promise<TimeEntry> {
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        company_id:     companyId,
        employee_id:    input.employeeId,
        job_kind:       input.jobKind,
        job_ref:        input.jobRef,
        job_label:      input.jobLabel,
        cost_code_id:   input.costCodeId,
        note:           input.note ?? '',
        gps_lat:        input.gpsLat ?? null,
        gps_lng:        input.gpsLng ?? null,
        clocked_in_at:  input.clockedInAt,
        clocked_out_at: input.clockedOutAt,
      })
      .select().single();
    if (error) throw error;
    return mapEntry(data as Record<string, unknown>);
  },

  async updateEntry(id: number, updates: Partial<Pick<TimeEntry,
    'jobKind' | 'jobRef' | 'jobLabel' | 'costCodeId' | 'clockedInAt' | 'clockedOutAt' | 'note'>>): Promise<void> {
    const db: Record<string, unknown> = {};
    if (updates.jobKind      !== undefined) db.job_kind       = updates.jobKind;
    if (updates.jobRef       !== undefined) db.job_ref        = updates.jobRef;
    if (updates.jobLabel     !== undefined) db.job_label      = updates.jobLabel;
    if (updates.costCodeId   !== undefined) db.cost_code_id   = updates.costCodeId;
    if (updates.clockedInAt  !== undefined) db.clocked_in_at  = updates.clockedInAt;
    if (updates.clockedOutAt !== undefined) db.clocked_out_at = updates.clockedOutAt;
    if (updates.note         !== undefined) db.note           = updates.note;
    const { error } = await supabase.from('time_entries').update(db).eq('id', id);
    if (error) throw error;
  },

  async deleteEntry(id: number): Promise<void> {
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    if (error) throw error;
  },

  async setApproval(ids: number[], approved: boolean, approverId: string): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('time_entries')
      .update({
        approved,
        approved_by: approved ? approverId : null,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .in('id', ids);
    if (error) throw error;
  },
};
