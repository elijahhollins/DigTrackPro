import { Employee, Equipment, Material, WorkLog } from '../../services/schedulingTypes.ts';

export interface CostTotals {
  labor: number;
  equipment: number;
  material: number;
  grand: number;
}

/**
 * If a material was logged before its catalog price was set (unitPrice 0),
 * fall back to the current catalog price so invoices reflect the latest price.
 */
export const resolveUnitPrice = (
  m: { materialId?: number; unitPrice: number },
  materials: Material[],
): number => {
  if (m.unitPrice !== 0 || m.materialId == null) return m.unitPrice;
  return materials.find(mat => mat.id === m.materialId)?.unitPrice ?? 0;
};

/** Sum labor / equipment / material costs across a job's daily logs. */
export const computeTotals = (logs: WorkLog[] | undefined, materials: Material[]): CostTotals => {
  const labor = (logs ?? []).reduce(
    (acc, log) => acc + log.data.employees.reduce((a, e) => a + e.hours * e.rate, 0), 0);
  const equipment = (logs ?? []).reduce(
    (acc, log) => acc + log.data.equipment.reduce((a, e) => a + e.hours * e.rate, 0), 0);
  const material = (logs ?? []).reduce(
    (acc, log) => acc + log.data.materials.reduce((a, m) => a + m.quantity * resolveUnitPrice(m, materials), 0), 0);
  return { labor, equipment, material, grand: labor + equipment + material };
};

export const employeeName = (id: number, employees: Employee[]): string =>
  employees.find(e => e.id === id)?.name ?? `Employee #${id}`;

export const equipmentName = (id: number, equipment: Equipment[]): string =>
  equipment.find(e => e.id === id)?.name ?? `Equipment #${id}`;
