import { Employee, Equipment, Material, WorkLog } from '../../services/schedulingTypes.ts';

export interface CostTotals {
  labor: number;
  equipment: number;
  material: number;
  grand: number;
}

/**
 * `work_logs.data` is a free-form JSONB blob, so a line written by an older
 * build (or a half-filled row) can be missing `rate` / `unitPrice` / `hours`.
 * Multiplying those produced NaN, which surfaced as "$NaN" on daily logs, job
 * totals and the invoice generator — and could be saved onto an invoice.
 * Treat any non-finite number as 0.
 */
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * If a material was logged before its catalog price was set (unitPrice 0),
 * fall back to the current catalog price so invoices reflect the latest price.
 */
export const resolveUnitPrice = (
  m: { materialId?: number; unitPrice?: number },
  materials: Material[],
): number => {
  const priced = num(m.unitPrice);
  if (priced !== 0 || m.materialId == null) return priced;
  return num(materials.find(mat => mat.id === m.materialId)?.unitPrice);
};

/** Sum labor / equipment / material costs across a job's daily logs. */
export const computeTotals = (logs: WorkLog[] | undefined, materials: Material[]): CostTotals => {
  const labor = (logs ?? []).reduce(
    (acc, log) => acc + (log.data?.employees ?? []).reduce((a, e) => a + num(e.hours) * num(e.rate), 0), 0);
  const equipment = (logs ?? []).reduce(
    (acc, log) => acc + (log.data?.equipment ?? []).reduce((a, e) => a + num(e.hours) * num(e.rate), 0), 0);
  const material = (logs ?? []).reduce(
    (acc, log) => acc + (log.data?.materials ?? []).reduce((a, m) => a + num(m.quantity) * resolveUnitPrice(m, materials), 0), 0);
  return { labor, equipment, material, grand: labor + equipment + material };
};

export const employeeName = (id: number, employees: Employee[]): string =>
  employees.find(e => e.id === id)?.name ?? `Employee #${id}`;

export const equipmentName = (id: string, equipment: Equipment[]): string =>
  equipment.find(e => e.id === id)?.name ?? `Equipment #${id}`;
