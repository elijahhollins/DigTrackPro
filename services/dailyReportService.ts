// ─────────────────────────────────────────────────────────────────────────────
// Daily Report Service — Supabase CRUD for the Time Tracker daily reports.
// Mirrors the structure of timeTrackingService.ts. Tenant isolation is enforced
// by RLS; callers still pass companyId for inserts.
//
// Photos are uploaded to the existing `job-photos` storage bucket under a
// `daily-reports/<companyId>/` prefix and referenced by public URL in the
// report's `photos` JSON column.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabaseClient.ts';
import { DailyReport, DailyReportPhoto, DailyReportStatus, JobKind } from './timeTrackingTypes.ts';

const mapReport = (row: Record<string, unknown>): DailyReport => ({
  id:              Number(row.id ?? 0),
  companyId:       String(row.company_id ?? ''),
  jobKind:         (row.job_kind as JobKind) ?? 'dig',
  jobRef:          String(row.job_ref ?? ''),
  jobLabel:        String(row.job_label ?? ''),
  reportDate:      String(row.report_date ?? '').slice(0, 10),
  progressSummary: String(row.progress_summary ?? ''),
  safetyNotes:     String(row.safety_notes ?? ''),
  locatesNotes:    String(row.locates_notes ?? ''),
  injuriesCount:   Number(row.injuries_count ?? 0),
  photos:          Array.isArray(row.photos) ? (row.photos as DailyReportPhoto[]) : [],
  status:          (row.status as DailyReportStatus) === 'submitted' ? 'submitted' : 'draft',
  submittedAt:     row.submitted_at != null ? String(row.submitted_at) : null,
  preparedById:    row.prepared_by_id != null ? String(row.prepared_by_id) : null,
  preparedByName:  String(row.prepared_by_name ?? ''),
  createdAt:       String(row.created_at ?? ''),
  updatedAt:       String(row.updated_at ?? ''),
});

export interface DailyReportInput {
  jobKind: JobKind;
  jobRef: string;
  jobLabel: string;
  reportDate: string;          // YYYY-MM-DD
  progressSummary: string;
  safetyNotes: string;
  locatesNotes: string;
  injuriesCount: number;
  photos: DailyReportPhoto[];
  preparedById: string | null;
  preparedByName: string;
}

const toDbRow = (companyId: string, input: DailyReportInput): Record<string, unknown> => ({
  company_id:       companyId,
  job_kind:         input.jobKind,
  job_ref:          input.jobRef,
  job_label:        input.jobLabel,
  report_date:      input.reportDate,
  progress_summary: input.progressSummary,
  safety_notes:     input.safetyNotes,
  locates_notes:    input.locatesNotes,
  injuries_count:   input.injuriesCount,
  photos:           input.photos,
  prepared_by_id:   input.preparedById,
  prepared_by_name: input.preparedByName,
});

export const dailyReportService = {
  /** Reports for the company, newest first. Optional job / date-range filter. */
  async listReports(filter: { jobKind?: JobKind; jobRef?: string; from?: string; to?: string } = {}): Promise<DailyReport[]> {
    let q = supabase.from('daily_reports').select('*').order('report_date', { ascending: false }).order('id', { ascending: false });
    if (filter.jobKind !== undefined) q = q.eq('job_kind', filter.jobKind);
    if (filter.jobRef  !== undefined) q = q.eq('job_ref', filter.jobRef);
    if (filter.from    !== undefined) q = q.gte('report_date', filter.from);
    if (filter.to      !== undefined) q = q.lte('report_date', filter.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(r => mapReport(r as Record<string, unknown>));
  },

  async createReport(companyId: string, input: DailyReportInput): Promise<DailyReport> {
    const { data, error } = await supabase
      .from('daily_reports')
      .insert(toDbRow(companyId, input))
      .select().single();
    if (error) throw error;
    return mapReport(data as Record<string, unknown>);
  },

  async updateReport(id: number, companyId: string, input: DailyReportInput): Promise<DailyReport> {
    const { data, error } = await supabase
      .from('daily_reports')
      .update({ ...toDbRow(companyId, input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();
    if (error) throw error;
    return mapReport(data as Record<string, unknown>);
  },

  /** Finalize a report: foreman can no longer edit it; only admins can. */
  async submitReport(id: number): Promise<DailyReport> {
    const { data, error } = await supabase
      .from('daily_reports')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();
    if (error) throw error;
    return mapReport(data as Record<string, unknown>);
  },

  /** Admin-only: reopen a submitted report so it can be edited again. */
  async reopenReport(id: number): Promise<DailyReport> {
    const { data, error } = await supabase
      .from('daily_reports')
      .update({ status: 'draft', submitted_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();
    if (error) throw error;
    return mapReport(data as Record<string, unknown>);
  },

  async deleteReport(id: number): Promise<void> {
    const { error } = await supabase.from('daily_reports').delete().eq('id', id);
    if (error) throw error;
  },

  /** Upload a single photo to the shared job-photos bucket; returns its public URL. */
  async uploadPhoto(companyId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const uuid = (crypto as Crypto & { randomUUID: () => string }).randomUUID();
    const filePath = `daily-reports/${companyId}/${uuid}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('job-photos').upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(filePath);
    return publicUrl;
  },
};
