// ─────────────────────────────────────────────────────────────────────────────
// Scheduling & Field Ops module types (ported from service-track-pro).
//
// These mirror the new Supabase tables added in
// supabase/migrations/20260611000000_add_scheduling.sql. They are kept out of
// the top-level types.ts (matching the inboundTypes.ts convention) so the core
// app types stay focused on the dig-ticket domain.
//
// Integer ids (BIGSERIAL) are preserved from the source schema for employees,
// equipment, materials, service jobs, work logs, templates and invoices.
// Crews and schedule blocks use client-generated UUID strings.
// ─────────────────────────────────────────────────────────────────────────────

export interface Employee {
  id: number;
  companyId: string;
  name: string;
  role: string;
  hourlyRate: number;
  // Optional link to an auth login (profiles.id). A linked employee can
  // self-clock in the Time Tracker module. Null = not linked to a login.
  profileId: string | null;
}

export interface Equipment {
  id: string;
  companyId: string;
  name: string;
  hourlyRate: number;
}

export interface Material {
  id: number;
  companyId: string;
  name: string;
  unitPrice: number | null;
}

// JSON payload stored on work_logs.data and templates.data
export interface WorkLogEntry {
  employees: { employeeId: number; hours: number; rate: number }[];
  equipment: { equipmentId: string; hours: number; rate: number }[];
  materials: { materialId?: number; name: string; quantity: number; unitPrice: number }[];
}

export interface WorkLog {
  id: number;
  jobId: number;
  date: string;
  notes: string;
  data: WorkLogEntry;
}

export interface WorkLogTemplate {
  id: number;
  companyId: string;
  name: string;
  data: WorkLogEntry;
}

export interface ServiceJob {
  id: number;
  companyId: string;
  customerName: string;
  jobName: string;
  jobNumber: string;
  address: string;
  startDate: string | null;
  endDate: string | null;
  notes: string;
  status: 'active' | 'completed';
  foremanId: string | null;
  logs?: WorkLog[];
}

export interface InvoiceSettings {
  id?: number;
  companyId: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoInitials: string;
  paymentTerms: string;
  headerColor: string;
  accentColor: string;
}

export interface Invoice {
  id: number;
  companyId: string;
  jobId: number;
  invoiceNumber: string;
  date: string | null;
  dueDate: string | null;
  status: 'draft' | 'sent' | 'paid';
  laborTotal: number;
  equipmentTotal: number;
  materialTotal: number;
  grandTotal: number;
  data: Record<string, unknown>;
}

// ── Scheduler board entities (UUID-string ids) ──────────────────────────────

export interface Crew {
  id: string;
  companyId: string;
  name: string;
  memberIds: number[];
}

export interface ScheduleJobOption {
  id: number;
  companyId: string;
  jobNumber: string;
  location: string;
  estimatedDays: number;
}

export interface ScheduleBlock {
  id: string;
  companyId: string;
  crewId: string;
  jobNumber: string;
  startDate: string;       // ISO YYYY-MM-DD
  durationDays: number;
  type: 'job' | 'delay';
  extended: boolean;
  equipmentIds: string[];
}
