import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Wrench, Package, Upload } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService.ts';
import { Employee, Equipment, Material } from '../../services/schedulingTypes.ts';
import CsvImportModal from './CsvImportModal.tsx';

type ResourceTab = 'employees' | 'equipment' | 'materials';

interface ResourcesManagerProps {
  companyId: string;
  isAdmin: boolean;
  isDarkMode?: boolean;
}

/**
 * Admin CRUD for the costing resources that the scheduler and work logs draw
 * from: employees (labor), equipment, and materials. Writes go straight to the
 * Supabase tables created in the scheduling migration; the Scheduler board reads
 * the same `employees` / `equipment` tables for crew assignment.
 */
export default function ResourcesManager({ companyId, isAdmin, isDarkMode }: ResourcesManagerProps) {
  const [tab, setTab] = useState<ResourceTab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvModal, setCsvModal] = useState<'equipment' | 'materials' | null>(null);

  // New-row drafts
  const [empDraft, setEmpDraft] = useState({ name: '', role: '', hourlyRate: '' });
  const [eqDraft, setEqDraft]   = useState({ name: '', hourlyRate: '' });
  const [matDraft, setMatDraft] = useState({ name: '', unitPrice: '' });

  const reload = async () => {
    setLoading(true);
    try {
      const [emp, eq, mat] = await Promise.all([
        scheduleService.getEmployees(),
        scheduleService.getEquipment(),
        scheduleService.getMaterials(),
      ]);
      setEmployees(emp);
      setEquipment(eq);
      setMaterials(mat);
    } catch (err) {
      console.error('[ResourcesManager] load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const card    = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const text    = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subtext = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const input   = `px-3 py-2 rounded-lg border text-sm w-full ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const rowCls  = isDarkMode ? 'border-slate-700' : 'border-slate-100';

  const addEmployee = async () => {
    if (!empDraft.name.trim()) return;
    await scheduleService.createEmployee(companyId, {
      name: empDraft.name.trim(),
      role: empDraft.role.trim(),
      hourlyRate: Number(empDraft.hourlyRate) || 0,
    });
    setEmpDraft({ name: '', role: '', hourlyRate: '' });
    reload();
  };
  const addEquipment = async () => {
    if (!eqDraft.name.trim()) return;
    await scheduleService.createEquipment(companyId, {
      name: eqDraft.name.trim(),
      hourlyRate: Number(eqDraft.hourlyRate) || 0,
    });
    setEqDraft({ name: '', hourlyRate: '' });
    reload();
  };
  const addMaterial = async () => {
    if (!matDraft.name.trim()) return;
    await scheduleService.createMaterial(companyId, {
      name: matDraft.name.trim(),
      unitPrice: matDraft.unitPrice === '' ? null : Number(matDraft.unitPrice),
    });
    setMatDraft({ name: '', unitPrice: '' });
    reload();
  };

  const TABS: { id: ResourceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'employees', label: 'Employees', icon: <Users size={16} /> },
    { id: 'equipment', label: 'Equipment', icon: <Wrench size={16} /> },
    { id: 'materials', label: 'Materials', icon: <Package size={16} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.id ? 'bg-brand text-white' : `${card} ${text} border`
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={subtext}>Loading…</p>
      ) : (
        <div className={`rounded-xl border ${card} p-4`}>
          {/* EMPLOYEES */}
          {tab === 'employees' && (
            <div className="space-y-2">
              {employees.map(e => (
                <div key={e.id} className={`flex items-center gap-3 py-2 border-b ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{e.name}</span>
                  <span className={`flex-1 ${subtext}`}>{e.role || '—'}</span>
                  <span className={`w-24 text-right ${text}`}>${e.hourlyRate.toFixed(2)}/hr</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteEmployee(e.id).then(reload)} className="text-rose-500 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {employees.length === 0 && <p className={subtext}>No employees yet.</p>}
              {isAdmin && (
                <div className="flex flex-col sm:flex-row gap-2 pt-3">
                  <input className={input} placeholder="Name" value={empDraft.name} onChange={e => setEmpDraft({ ...empDraft, name: e.target.value })} />
                  <input className={input} placeholder="Role" value={empDraft.role} onChange={e => setEmpDraft({ ...empDraft, role: e.target.value })} />
                  <input className={input} placeholder="Rate/hr" type="number" value={empDraft.hourlyRate} onChange={e => setEmpDraft({ ...empDraft, hourlyRate: e.target.value })} />
                  <button onClick={addEmployee} className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold whitespace-nowrap">
                    <Plus size={16} />Add
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EQUIPMENT */}
          {tab === 'equipment' && (
            <div className="space-y-2">
              {equipment.map(e => (
                <div key={e.id} className={`flex items-center gap-3 py-2 border-b ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{e.name}</span>
                  <span className={`w-24 text-right ${text}`}>${e.hourlyRate.toFixed(2)}/hr</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteEquipment(e.id).then(reload)} className="text-rose-500 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {equipment.length === 0 && <p className={subtext}>No equipment yet.</p>}
              {isAdmin && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2 pt-3">
                    <input className={input} placeholder="Name" value={eqDraft.name} onChange={e => setEqDraft({ ...eqDraft, name: e.target.value })} />
                    <input className={input} placeholder="Rate/hr" type="number" value={eqDraft.hourlyRate} onChange={e => setEqDraft({ ...eqDraft, hourlyRate: e.target.value })} />
                    <button onClick={addEquipment} className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold whitespace-nowrap">
                      <Plus size={16} />Add
                    </button>
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={() => setCsvModal('equipment')}
                      className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Upload size={14} />Import CSV / Spreadsheet
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* MATERIALS */}
          {tab === 'materials' && (
            <div className="space-y-2">
              {materials.map(m => (
                <div key={m.id} className={`flex items-center gap-3 py-2 border-b ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{m.name}</span>
                  <span className={`w-24 text-right ${text}`}>{m.unitPrice != null ? `$${m.unitPrice.toFixed(2)}` : '—'}</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteMaterial(m.id).then(reload)} className="text-rose-500 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {materials.length === 0 && <p className={subtext}>No materials yet.</p>}
              {isAdmin && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2 pt-3">
                    <input className={input} placeholder="Name" value={matDraft.name} onChange={e => setMatDraft({ ...matDraft, name: e.target.value })} />
                    <input className={input} placeholder="Unit price (blank = unlisted)" type="number" value={matDraft.unitPrice} onChange={e => setMatDraft({ ...matDraft, unitPrice: e.target.value })} />
                    <button onClick={addMaterial} className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold whitespace-nowrap">
                      <Plus size={16} />Add
                    </button>
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={() => setCsvModal('materials')}
                      className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Upload size={14} />Import CSV / Spreadsheet
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {csvModal && (
        <CsvImportModal
          type={csvModal}
          companyId={companyId}
          isDarkMode={isDarkMode}
          onClose={() => setCsvModal(null)}
          onImported={reload}
        />
      )}
    </div>
  );
}
