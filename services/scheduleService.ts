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
};
