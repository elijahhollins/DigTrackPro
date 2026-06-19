// In-memory stand-in for services/scheduleService.ts, used ONLY by the preview
// build (wired via a Vite resolve alias). Lets the data-driven scheduling views
// render with representative sample data without the Supabase backend.
import {
  Employee, Equipment, Material, ServiceJob, WorkLog, WorkLogEntry,
  WorkLogTemplate, Invoice, InvoiceSettings,
} from '../services/schedulingTypes.ts';

const wait = <T>(v: T): Promise<T> => new Promise(r => setTimeout(() => r(v), 120));

let employees: Employee[] = [
  { id: 1, companyId: 'demo', name: 'Marcus Webb',    role: 'Foreman',         hourlyRate: 48, profileId: null, isForeman: true },
  { id: 2, companyId: 'demo', name: 'Diego Alvarez',  role: 'Operator',        hourlyRate: 41, profileId: null, isForeman: false },
  { id: 3, companyId: 'demo', name: 'Tyler Nguyen',   role: 'Laborer',         hourlyRate: 32, profileId: null, isForeman: false },
  { id: 4, companyId: 'demo', name: 'Priya Anand',    role: 'Pipe Layer',      hourlyRate: 38, profileId: null, isForeman: false },
  { id: 5, companyId: 'demo', name: 'Sam Carter',     role: 'Equipment Op.',   hourlyRate: 44, profileId: null, isForeman: false },
];
let equipment: Equipment[] = [
  { id: 'eq1', companyId: 'demo', name: '2020 Caterpillar 320 Excavator', hourlyRate: 145, unitNumber: '1001', equipmentType: 'Excavator', year: 2020, make: 'Caterpillar', model: '320' },
  { id: 'eq2', companyId: 'demo', name: '2019 Kenworth T880 Dump Truck',  hourlyRate: 95,  unitNumber: '1002', equipmentType: 'Dump Truck', year: 2019, make: 'Kenworth', model: 'T880' },
  { id: 'eq3', companyId: 'demo', name: '2021 Bobcat S76 Skid Steer',     hourlyRate: 72,  unitNumber: '1003', equipmentType: 'Skid Steer', year: 2021, make: 'Bobcat', model: 'S76' },
  { id: 'eq4', companyId: 'demo', name: '2021 Bomag BW213D Compactor',    hourlyRate: 55,  unitNumber: '1004', equipmentType: 'Compactor', year: 2021, make: 'Bomag', model: 'BW213D' },
  { id: 'eq5', companyId: 'demo', name: 'Multiquip Trash Pump',           hourlyRate: 28,  unitNumber: '1005', equipmentType: 'Pump', make: 'Multiquip' },
];
let materials: Material[] = [
  { id: 1, companyId: 'demo', name: 'Concrete (cu yd)',  unitPrice: 142 },
  { id: 2, companyId: 'demo', name: 'Rebar #5 (ton)',    unitPrice: 880 },
  { id: 3, companyId: 'demo', name: '6" PVC Pipe (ft)',  unitPrice: 7.25 },
  { id: 4, companyId: 'demo', name: 'Crushed Stone (ton)', unitPrice: 24 },
  { id: 5, companyId: 'demo', name: 'Geotextile Fabric (roll)', unitPrice: null },
];
const log = (id: number, jobId: number, date: string, notes: string, e: WorkLogEntry): WorkLog => ({ id, jobId, date, notes, data: e });
let serviceJobs: ServiceJob[] = [
  {
    id: 1, companyId: 'demo', customerName: 'City of Austin PW', jobName: 'Riverside Main Replacement', jobNumber: 'J-2041',
    address: '1180 Riverside Dr, Austin', startDate: null, endDate: null, notes: '', status: 'active', foremanId: null,
    logs: [
      log(11, 1, '2026-06-15', 'Trench + lay pipe', { employees: [{ employeeId: 1, hours: 8, rate: 48 }, { employeeId: 4, hours: 8, rate: 38 }], equipment: [{ equipmentId: 'eq1', hours: 8, rate: 145 }], materials: [{ materialId: 3, name: '6" PVC Pipe (ft)', quantity: 120, unitPrice: 7.25 }] }),
      log(12, 1, '2026-06-16', 'Backfill + compact', { employees: [{ employeeId: 1, hours: 8, rate: 48 }, { employeeId: 3, hours: 8, rate: 32 }], equipment: [{ equipmentId: 'eq4', hours: 6, rate: 55 }], materials: [{ materialId: 4, name: 'Crushed Stone (ton)', quantity: 18, unitPrice: 24 }] }),
    ],
  },
  {
    id: 2, companyId: 'demo', customerName: 'Round Rock ISD', jobName: 'Industrial Pkwy Storm Drain', jobNumber: 'J-2042',
    address: '95 Industrial Pkwy, Round Rock', startDate: null, endDate: null, notes: '', status: 'active', foremanId: null,
    logs: [
      log(21, 2, '2026-06-17', 'Set inlets', { employees: [{ employeeId: 5, hours: 8, rate: 44 }, { employeeId: 2, hours: 8, rate: 41 }], equipment: [{ equipmentId: 'eq3', hours: 8, rate: 72 }], materials: [{ materialId: 1, name: 'Concrete (cu yd)', quantity: 6, unitPrice: 142 }] }),
    ],
  },
  {
    id: 3, companyId: 'demo', customerName: 'Lakeway HOA', jobName: 'Lakeway Blvd Curb & Gutter', jobNumber: 'J-2043',
    address: '400 Lakeway Blvd, Lakeway', startDate: null, endDate: null, notes: '', status: 'active', foremanId: null,
    logs: [],
  },
];
let invoices: Invoice[] = [
  { id: 101, companyId: 'demo', jobId: 1, invoiceNumber: 'INV-J-2041-8842', date: '2026-06-17', dueDate: '2026-07-17', status: 'sent',  laborTotal: 1408, equipmentTotal: 1490, materialTotal: 1302, grandTotal: 4200, data: {} },
  { id: 102, companyId: 'demo', jobId: 2, invoiceNumber: 'INV-J-2042-1190', date: '2026-06-18', dueDate: '2026-07-18', status: 'draft', laborTotal: 680,  equipmentTotal: 576,  materialTotal: 852,  grandTotal: 2108, data: {} },
];
let templates: WorkLogTemplate[] = [
  { id: 1, companyId: 'demo', name: 'Standard 2-man crew + excavator', data: { employees: [{ employeeId: 1, hours: 8, rate: 48 }, { employeeId: 3, hours: 8, rate: 32 }], equipment: [{ equipmentId: 'eq1', hours: 8, rate: 145 }], materials: [] } },
];
let settings: InvoiceSettings = {
  id: 1, companyId: 'demo', companyName: 'Demo Underground Co.', companyAddress: '500 Industrial Blvd, Austin, TX',
  companyPhone: '(512) 555-0142', companyEmail: 'billing@demoug.com', logoInitials: 'DU',
  paymentTerms: 'Payment due within 30 days.', headerColor: '#0a142d', accentColor: '#c49614',
};

let eqSeq = 6, matSeq = 6, empSeq = 6, jobSeq = 4, logSeq = 900, invSeq = 200, tplSeq = 10;

export const scheduleService = {
  getEmployees: () => wait([...employees]),
  createEmployee: (companyId: string, e: Omit<Employee, 'id' | 'companyId'>) => { const row = { ...e, id: empSeq++, companyId }; employees.push(row); return wait(row); },
  updateEmployee: () => wait(undefined),
  deleteEmployee: (id: number) => { employees = employees.filter(x => x.id !== id); return wait(undefined); },

  getEquipment: () => wait([...equipment]),
  createEquipment: (companyId: string, e: Omit<Equipment, 'id' | 'companyId'>) => { const row = { ...e, id: 'eq' + eqSeq++, companyId }; equipment.push(row); return wait(row); },
  updateEquipment: () => wait(undefined),
  deleteEquipment: (id: string) => { equipment = equipment.filter(x => x.id !== id); return wait(undefined); },
  bulkCreateEquipment: (companyId: string, items: Omit<Equipment, 'id' | 'companyId'>[]) => { const rows = items.map(i => ({ ...i, id: 'eq' + eqSeq++, companyId })); equipment.push(...rows); return wait(rows); },

  getMaterials: () => wait([...materials]),
  createMaterial: (companyId: string, m: Omit<Material, 'id' | 'companyId'>) => { const row = { ...m, id: matSeq++, companyId }; materials.push(row); return wait(row); },
  updateMaterial: () => wait(undefined),
  deleteMaterial: (id: number) => { materials = materials.filter(x => x.id !== id); return wait(undefined); },
  bulkCreateMaterial: (companyId: string, items: Omit<Material, 'id' | 'companyId'>[]) => { const rows = items.map(i => ({ ...i, id: matSeq++, companyId })); materials.push(...rows); return wait(rows); },

  getServiceJobs: () => wait(JSON.parse(JSON.stringify(serviceJobs)) as ServiceJob[]),
  createServiceJob: (companyId: string, j: Omit<ServiceJob, 'id' | 'companyId' | 'logs'>) => { const row: ServiceJob = { ...j, id: jobSeq++, companyId, logs: [] }; serviceJobs.push(row); return wait(row); },
  updateServiceJob: () => wait(undefined),
  deleteServiceJob: (id: number) => { serviceJobs = serviceJobs.filter(x => x.id !== id); return wait(undefined); },

  createWorkLog: (jobId: number, date: string, notes: string, data: WorkLogEntry) => { const row = log(logSeq++, jobId, date, notes, data); const job = serviceJobs.find(j => j.id === jobId); if (job) job.logs = [...(job.logs ?? []), row]; return wait(row); },
  updateWorkLog: () => wait(undefined),
  deleteWorkLog: (id: number) => { serviceJobs.forEach(j => { if (j.logs) j.logs = j.logs.filter(l => l.id !== id); }); return wait(undefined); },

  getTemplates: () => wait([...templates]),
  createTemplate: (companyId: string, name: string, data: WorkLogEntry) => { const row = { id: tplSeq++, companyId, name, data }; templates.push(row); return wait(row); },
  deleteTemplate: (id: number) => { templates = templates.filter(x => x.id !== id); return wait(undefined); },

  getInvoices: () => wait([...invoices]),
  createInvoice: (companyId: string, inv: Omit<Invoice, 'id' | 'companyId'>) => { const row = { ...inv, id: invSeq++, companyId }; invoices.push(row); return wait(row); },
  updateInvoiceStatus: (id: number, status: 'draft' | 'sent' | 'paid') => { const i = invoices.find(x => x.id === id); if (i) i.status = status; return wait(undefined); },
  deleteInvoice: (id: number) => { invoices = invoices.filter(x => x.id !== id); return wait(undefined); },

  getInvoiceSettings: () => wait(settings),
  upsertInvoiceSettings: (companyId: string, s: Omit<InvoiceSettings, 'id' | 'companyId'>) => { settings = { ...s, id: 1, companyId }; return wait(settings); },
};
