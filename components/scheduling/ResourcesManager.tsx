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
  const input   = `px-3 py-2 rounded-lg border text-sm w-full transition focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand ${isDarkMode ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const rowCls  = isDarkMode ? 'border-slate-700/70 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50';
  const addBtn  = 'flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold whitespace-nowrap transition-all hover:opacity-90 hover:-translate-y-px shadow-sm';
  const label   = `text-[10px] font-bold uppercase tracking-widest ${subtext}`;
  const TAB_META: Record<ResourceTab, { count: number }> = {
    employees: { count: employees.length },
    equipment: { count: equipment.length },
    materials: { count: materials.length },
  };

  const addEmployee = async () => {
    if (!empDraft.name.trim()) return;
    await scheduleService.createEmployee(companyId, {
      name: empDraft.name.trim(),
      role: empDraft.role.trim(),
      hourlyRate: Number(empDraft.hourlyRate) || 0,
      profileId: null,
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
      <div
        className={`inline-flex items-center gap-1 p-1 rounded-xl border ${
          isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-100/70 border-slate-200'
        }`}
      >
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                active
                  ? 'bg-brand text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {t.icon}{t.label}
              <span
                className={`ml-0.5 min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  active ? 'bg-white/25 text-white' : isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {TAB_META[t.id].count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className={`rounded-2xl border ${card} p-8 flex items-center justify-center gap-2 ${subtext} text-sm shadow-sm`}>
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-brand animate-spin" />
          Loading resources…
        </div>
      ) : (
        <div className={`rounded-2xl border ${card} p-4 sm:p-5 shadow-sm`}>
          {/* EMPLOYEES */}
          {tab === 'employees' && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 pb-2">
                <span className={`flex-1 ${label}`}>Name</span>
                <span className={`flex-1 ${label}`}>Role</span>
                <span className={`w-24 text-right ${label}`}>Rate / hr</span>
                {isAdmin && <span className="w-6 shrink-0" />}
              </div>
              {employees.map(e => (
                <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{e.name}</span>
                  <span className={`flex-1 ${subtext}`}>{e.role || '—'}</span>
                  <span className={`w-24 text-right font-mono tabular-nums text-sm ${text}`}>${e.hourlyRate.toFixed(2)}</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteEmployee(e.id).then(reload)} className="w-6 shrink-0 flex justify-center text-slate-400 hover:text-rose-600 transition-colors" aria-label={`Delete ${e.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {employees.length === 0 && (
                <div className={`text-center py-8 ${subtext} text-sm`}>
                  <Users size={22} className="mx-auto mb-2 opacity-40" />
                  No employees yet.
                </div>
              )}
              {isAdmin && (
                <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'} space-y-2`}>
                  <p className={label}>Add employee</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className={input} placeholder="Name" value={empDraft.name} onChange={e => setEmpDraft({ ...empDraft, name: e.target.value })} />
                    <input className={input} placeholder="Role" value={empDraft.role} onChange={e => setEmpDraft({ ...empDraft, role: e.target.value })} />
                    <input className={input} placeholder="Rate/hr" type="number" value={empDraft.hourlyRate} onChange={e => setEmpDraft({ ...empDraft, hourlyRate: e.target.value })} />
                    <button onClick={addEmployee} className={addBtn}>
                      <Plus size={16} />Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EQUIPMENT */}
          {tab === 'equipment' && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 pb-2">
                <span className={`flex-1 ${label}`}>Name</span>
                <span className={`w-24 text-right ${label}`}>Rate / hr</span>
                {isAdmin && <span className="w-6 shrink-0" />}
              </div>
              {equipment.map(e => (
                <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{e.name}</span>
                  <span className={`w-24 text-right font-mono tabular-nums text-sm ${text}`}>${e.hourlyRate.toFixed(2)}</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteEquipment(e.id).then(reload)} className="w-6 shrink-0 flex justify-center text-slate-400 hover:text-rose-600 transition-colors" aria-label={`Delete ${e.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {equipment.length === 0 && (
                <div className={`text-center py-8 ${subtext} text-sm`}>
                  <Wrench size={22} className="mx-auto mb-2 opacity-40" />
                  No equipment yet.
                </div>
              )}
              {isAdmin && (
                <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'} space-y-2`}>
                  <p className={label}>Add equipment</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className={input} placeholder="Name" value={eqDraft.name} onChange={e => setEqDraft({ ...eqDraft, name: e.target.value })} />
                    <input className={input} placeholder="Rate/hr" type="number" value={eqDraft.hourlyRate} onChange={e => setEqDraft({ ...eqDraft, hourlyRate: e.target.value })} />
                    <button onClick={addEquipment} className={addBtn}>
                      <Plus size={16} />Add
                    </button>
                  </div>
                  <button
                    onClick={() => setCsvModal('equipment')}
                    className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Upload size={14} />Import CSV / Spreadsheet
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MATERIALS */}
          {tab === 'materials' && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 pb-2">
                <span className={`flex-1 ${label}`}>Name</span>
                <span className={`w-24 text-right ${label}`}>Unit price</span>
                {isAdmin && <span className="w-6 shrink-0" />}
              </div>
              {materials.map(m => (
                <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{m.name}</span>
                  <span className={`w-24 text-right font-mono tabular-nums text-sm ${text}`}>{m.unitPrice != null ? `$${m.unitPrice.toFixed(2)}` : '—'}</span>
                  {isAdmin && (
                    <button onClick={() => scheduleService.deleteMaterial(m.id).then(reload)} className="w-6 shrink-0 flex justify-center text-slate-400 hover:text-rose-600 transition-colors" aria-label={`Delete ${m.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {materials.length === 0 && (
                <div className={`text-center py-8 ${subtext} text-sm`}>
                  <Package size={22} className="mx-auto mb-2 opacity-40" />
                  No materials yet.
                </div>
              )}
              {isAdmin && (
                <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'} space-y-2`}>
                  <p className={label}>Add material</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className={input} placeholder="Name" value={matDraft.name} onChange={e => setMatDraft({ ...matDraft, name: e.target.value })} />
                    <input className={input} placeholder="Unit price (blank = unlisted)" type="number" value={matDraft.unitPrice} onChange={e => setMatDraft({ ...matDraft, unitPrice: e.target.value })} />
                    <button onClick={addMaterial} className={addBtn}>
                      <Plus size={16} />Add
                    </button>
                  </div>
                  <button
                    onClick={() => setCsvModal('materials')}
                    className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Upload size={14} />Import CSV / Spreadsheet
                  </button>
                </div>
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
