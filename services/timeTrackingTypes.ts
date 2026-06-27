// ─────────────────────────────────────────────────────────────────────────────
// Time Tracker module — type declarations.
//
// Mirrors the Supabase tables added in
// supabase/migrations/20260618000000_add_time_tracking.sql. Kept out of the
// top-level types.ts (matching the inboundTypes.ts / schedulingTypes.ts
// convention) so the core app types stay focused on the dig-ticket domain.
//
// A time entry / cost-code assignment references EITHER a dig job
// (types.ts Job, uuid id) OR a service job (schedulingTypes.ts ServiceJob,
// bigint id) via a polymorphic (jobKind, jobRef) pair plus a denormalized label.
// ─────────────────────────────────────────────────────────────────────────────

export type JobKind = 'dig' | 'service';

export interface CostCode {
  id: number;
  companyId: string;
  code: string;
  description: string;
  isActive: boolean;
}

export interface JobCostCodeAssignment {
  id: number;
  companyId: string;
  jobKind: JobKind;
  jobRef: string;
  costCodeId: number;
}

export interface TimeEntry {
  id: number;
  companyId: string;
  employeeId: number;
  jobKind: JobKind;
  jobRef: string;
  jobLabel: string;
  costCodeId: number | null;
  clockedInAt: string;          // ISO timestamptz
  clockedOutAt: string | null;  // null = currently on the clock
  note: string;
  gpsLat: number | null;
  gpsLng: number | null;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

// A foreman's saved crew: the same few workers they clock in day to day.
// One row per foreman login (owner_profile_id). Members are employee ids;
// the workers themselves have no login — only the foreman does.
export interface TimeClockCrew {
  id: number;
  companyId: string;
  ownerProfileId: string;
  name: string;
  memberIds: number[];
}

// View-model for the merged, searchable job picker (dig + service jobs).
export interface ClockableJob {
  kind: JobKind;
  ref: string;     // dig: Job.id (uuid); service: ServiceJob.id (as string)
  label: string;   // human-friendly: job number + customer/location
}

// ── Daily reports ────────────────────────────────────────────────────────────
// A foreman's end-of-day progress report for a job. Crew hours, the time-entry
// log and the cost-code breakdown are pulled live from `time_entries`; only the
// narrative fields + photos are stored here. Mirrors the daily_reports table in
// supabase/migrations/20260626000000_add_daily_reports.sql.

export interface DailyReportPhoto {
  url: string;
  caption: string;
}

// 'draft'    — foreman is still working on it; foreman (or admin) may edit.
// 'submitted'— finalized by the foreman; only an admin may edit from here.
export type DailyReportStatus = 'draft' | 'submitted';

export interface DailyReport {
  id: number;
  companyId: string;
  jobKind: JobKind;
  jobRef: string;
  jobLabel: string;
  reportDate: string;          // YYYY-MM-DD (local calendar day of the work)
  progressSummary: string;
  safetyNotes: string;
  locatesNotes: string;        // JULIE locates or refreshes needed
  injuriesCount: number;
  photos: DailyReportPhoto[];
  status: DailyReportStatus;
  submittedAt: string | null;
  preparedById: string | null;
  preparedByName: string;
  createdAt: string;
  updatedAt: string;
}

// ── time helpers (display only — raw timestamps are never mutated) ──────────

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/** Round a duration in milliseconds to the nearest quarter-hour. */
export function roundMsToQuarterHour(ms: number): number {
  return Math.round(ms / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
}

/** Milliseconds between clock-in and clock-out (or `now` if still open). */
export function entryDurationMs(entry: TimeEntry, now: number = Date.now()): number {
  const start = new Date(entry.clockedInAt).getTime();
  const end = entry.clockedOutAt ? new Date(entry.clockedOutAt).getTime() : now;
  return Math.max(0, end - start);
}

/** Decimal hours, rounded to the nearest quarter-hour (e.g. 2.25, 2.5). */
export function entryRoundedHours(entry: TimeEntry, now: number = Date.now()): number {
  return roundMsToQuarterHour(entryDurationMs(entry, now)) / (60 * 60 * 1000);
}

/** "2h 15m" style label of the rounded duration. */
export function formatRoundedDuration(entry: TimeEntry, now: number = Date.now()): string {
  const totalMin = roundMsToQuarterHour(entryDurationMs(entry, now)) / (60 * 1000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

/**
 * "H:MM" clock-style label of a raw duration in milliseconds (e.g. 49h 48m →
 * "49:48"). Used by the daily report, which shows exact worked time — not the
 * quarter-hour-rounded payroll figure. Hours are not capped at 24.
 */
export function formatHoursMinutes(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / (60 * 1000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
