import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Wrench, Package, Upload, Pencil, X, Check, DollarSign, Link, LinkOff, Search } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService.ts';
import { Employee, Equipment, Material } from '../../services/schedulingTypes.ts';
import CsvImportModal from './CsvImportModal.tsx';

type ResourceTab = 'employees' | 'equipment' | 'materials';

interface ResourcesManagerProps {
  companyId: string;
  isAdmin: boolean;
  isDarkMode?: boolean;
}

const BLANK_EDIT: Partial<Equipment> = {
  name: '', hourlyRate: 0, equipmentType: '', unitNumber: '',
  year: undefined, make: '', model: '', vin: '', serialNumber: '', licensePlate: '', notes: '',
};

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
  const [csvModal, setCsvModal] = useState<'equipment' | 'materials' | 'employees' | null>(null);

  // New-row drafts
  const [empDraft, setEmpDraft] = useState({ name: '', role: '', hourlyRate: '' });
  const [eqDraft, setEqDraft]   = useState({ name: '', hourlyRate: '' });
  const [matDraft, setMatDraft] = useState({ name: '', unitPrice: '' });

  // Equipment edit modal
  const [editingEq, setEditingEq]   = useState<Equipment | null>(null);
  const [editDraft, setEditDraft]   = useState<Partial<Equipment>>(BLANK_EDIT);
  const [saving, setSaving]         = useState(false);

  // Employee edit modal
  const [editingEmp, setEditingEmp]     = useState<Employee | null>(null);
  const [editEmpDraft, setEditEmpDraft] = useState({ name: '', role: '', hourlyRate: '', isForeman: false, profileId: null as string | null, linkedEmail: '' });
  const [savingEmp, setSavingEmp]       = useState(false);

  // Account linking state (inside the employee edit modal)
  const [acctSearch, setAcctSearch]     = useState('');
  const [acctResult, setAcctResult]     = useState<{ id: string; name: string; username: string } | null>(null);
  const [acctNotFound, setAcctNotFound] = useState(false);
  const [acctSearching, setAcctSearching] = useState(false);

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
      isForeman: false,
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

  const openEditEq = (eq: Equipment) => {
    setEditingEq(eq);
    setEditDraft({ ...eq });
  };
  const closeEditEq = () => { setEditingEq(null); setEditDraft(BLANK_EDIT); };
  const saveEditEq = async () => {
    if (!editingEq) return;
    setSaving(true);
    try {
      await scheduleService.updateEquipment(editingEq.id, {
        name:          editDraft.name,
        hourlyRate:    editDraft.hourlyRate,
        equipmentType: editDraft.equipmentType || undefined,
        unitNumber:    editDraft.unitNumber    || undefined,
        year:          editDraft.year          ?? undefined,
        make:          editDraft.make          || undefined,
        model:         editDraft.model         || undefined,
        vin:           editDraft.vin           || undefined,
        serialNumber:  editDraft.serialNumber  || undefined,
        licensePlate:  editDraft.licensePlate  || undefined,
        notes:         editDraft.notes         || undefined,
      });
      closeEditEq();
      reload();
    } catch (err) {
      console.error('[ResourcesManager] save equipment failed', err);
    } finally {
      setSaving(false);
    }
  };

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEditEmpDraft({ name: emp.name, role: emp.role, hourlyRate: emp.hourlyRate > 0 ? String(emp.hourlyRate) : '', isForeman: emp.isForeman, profileId: emp.profileId, linkedEmail: '' });
    setAcctSearch('');
    setAcctResult(null);
    setAcctNotFound(false);
    if (emp.profileId) {
      scheduleService.getProfileById(emp.profileId).then(p => {
        if (p) setEditEmpDraft(d => ({ ...d, linkedEmail: p.username }));
      }).catch(() => {});
    }
  };
  const closeEditEmp = () => {
    setEditingEmp(null);
    setEditEmpDraft({ name: '', role: '', hourlyRate: '', isForeman: false, profileId: null, linkedEmail: '' });
    setAcctSearch('');
    setAcctResult(null);
    setAcctNotFound(false);
  };
  const saveEditEmp = async () => {
    if (!editingEmp || !editEmpDraft.name.trim()) return;
    setSavingEmp(true);
    try {
      await scheduleService.updateEmployee(editingEmp.id, {
        name:       editEmpDraft.name.trim(),
        role:       editEmpDraft.role.trim(),
        hourlyRate: editEmpDraft.hourlyRate !== '' ? Number(editEmpDraft.hourlyRate) : 0,
        isForeman:  editEmpDraft.isForeman,
        profileId:  editEmpDraft.profileId,
      });
      closeEditEmp();
      reload();
    } catch (err) {
      console.error('[ResourcesManager] save employee failed', err);
    } finally {
      setSavingEmp(false);
    }
  };

  const searchAcctByEmail = async () => {
    if (!acctSearch.trim()) return;
    setAcctSearching(true);
    setAcctResult(null);
    setAcctNotFound(false);
    try {
      const found = await scheduleService.findProfileByEmail(acctSearch.trim());
      if (found) { setAcctResult(found); }
      else { setAcctNotFound(true); }
    } catch (err) {
      console.error('[ResourcesManager] profile search failed', err);
    } finally {
      setAcctSearching(false);
    }
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
                {isAdmin && <span className="w-12 shrink-0" />}
              </div>
              {employees.map(e => (
                <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className="flex-1 flex items-center gap-2 min-w-0">
                    <span className={`font-medium truncate ${text}`}>{e.name}</span>
                    {e.isForeman && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 ${e.profileId ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>
                        {e.profileId ? <Link size={8} /> : null}
                        Foreman
                      </span>
                    )}
                  </span>
                  <span className={`flex-1 ${subtext}`}>{e.role || '—'}</span>
                  <span className={`w-24 text-right font-mono tabular-nums text-sm ${e.hourlyRate > 0 ? text : subtext}`}>
                    {e.hourlyRate > 0 ? `$${e.hourlyRate.toFixed(2)}` : '—'}
                  </span>
                  {isAdmin && (
                    <div className="w-12 shrink-0 flex justify-end gap-1">
                      <button
                        onClick={() => openEditEmp(e)}
                        className="w-6 flex justify-center text-slate-400 hover:text-brand transition-colors"
                        aria-label={`Edit ${e.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => scheduleService.deleteEmployee(e.id).then(reload)}
                        className="w-6 flex justify-center text-slate-400 hover:text-rose-600 transition-colors"
                        aria-label={`Delete ${e.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
                    <input className={input} placeholder="Name *" value={empDraft.name} onChange={e => setEmpDraft({ ...empDraft, name: e.target.value })} />
                    <input className={input} placeholder="Role (optional)" value={empDraft.role} onChange={e => setEmpDraft({ ...empDraft, role: e.target.value })} />
                    <input className={input} placeholder="Rate/hr (optional)" type="number" value={empDraft.hourlyRate} onChange={e => setEmpDraft({ ...empDraft, hourlyRate: e.target.value })} />
                    <button onClick={addEmployee} className={addBtn}>
                      <Plus size={16} />Add
                    </button>
                  </div>
                  <button
                    onClick={() => setCsvModal('employees')}
                    className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Upload size={14} />Import CSV / Spreadsheet
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EQUIPMENT */}
          {tab === 'equipment' && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 pb-2">
                <span className={`flex-1 ${label}`}>Name</span>
                <span className={`w-32 ${label}`}>Type</span>
                <span className={`w-24 text-right ${label}`}>Rate / hr</span>
                {isAdmin && <span className="w-12 shrink-0" />}
              </div>
              {equipment.map(e => (
                <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-b last:border-b-0 transition-colors ${rowCls}`}>
                  <span className={`flex-1 font-medium ${text}`}>{e.name}</span>
                  <span className={`w-32 text-sm ${subtext} truncate`}>{e.equipmentType || '—'}</span>
                  <span className={`w-24 text-right font-mono tabular-nums text-sm ${text}`}>${e.hourlyRate.toFixed(2)}</span>
                  {isAdmin && (
                    <div className="w-12 shrink-0 flex justify-end gap-1">
                      <button
                        onClick={() => openEditEq(e)}
                        className="w-6 flex justify-center text-slate-400 hover:text-brand transition-colors"
                        aria-label={`Edit ${e.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => scheduleService.deleteEquipment(e.id).then(reload)}
                        className="w-6 flex justify-center text-slate-400 hover:text-rose-600 transition-colors"
                        aria-label={`Delete ${e.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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

      {/* Employee Edit Modal */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) closeEditEmp(); }}>
          <div className={`w-full max-w-sm rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <Users size={17} className="text-brand" />
                <h2 className={`text-base font-semibold ${text}`}>Edit Employee</h2>
              </div>
              <button onClick={closeEditEmp} className={`rounded-lg p-1.5 transition hover:bg-slate-100 ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'text-slate-400'}`}>
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className={`mb-1 ${label}`}>Name *</p>
                <input className={input} value={editEmpDraft.name} onChange={e => setEditEmpDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <p className={`mb-1 ${label}`}>Role</p>
                <input className={input} placeholder="e.g. Operator, Foreman, Laborer" value={editEmpDraft.role} onChange={e => setEditEmpDraft(d => ({ ...d, role: e.target.value }))} />
              </div>
              <div>
                <p className={`mb-1 ${label}`}>Rate / hr ($)</p>
                <div className="relative">
                  <DollarSign size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${subtext}`} />
                  <input
                    className={`${input} pl-7`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={editEmpDraft.hourlyRate}
                    onChange={e => setEditEmpDraft(d => ({ ...d, hourlyRate: e.target.value }))}
                  />
                </div>
              </div>
              {/* Foreman switch: unlocks crew clock-in for this employee's login. */}
              <button
                type="button"
                onClick={() => setEditEmpDraft(d => ({ ...d, isForeman: !d.isForeman }))}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition ${
                  editEmpDraft.isForeman
                    ? 'border-brand bg-brand/10'
                    : isDarkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>
                  <span className={`block text-sm font-semibold ${text}`}>Foreman</span>
                  <span className={`block text-xs ${subtext}`}>Can save a crew and clock the whole crew in/out.</span>
                </span>
                <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${editEmpDraft.isForeman ? 'bg-brand' : isDarkMode ? 'bg-slate-600' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${editEmpDraft.isForeman ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
              </button>

              {/* Account linking — only visible when foreman is on */}
              {editEmpDraft.isForeman && (
                <div className={`rounded-lg border p-3 space-y-2 ${isDarkMode ? 'border-slate-600 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={label}>Linked Login Account</p>

                  {editEmpDraft.profileId ? (
                    /* Linked — show email + unlink button */
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDarkMode ? 'border-emerald-700/60 bg-emerald-900/20' : 'border-emerald-200 bg-emerald-50'}`}>
                      <Link size={14} className="text-emerald-500 shrink-0" />
                      <span className={`flex-1 text-xs font-medium truncate ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        {editEmpDraft.linkedEmail || editEmpDraft.profileId}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditEmpDraft(d => ({ ...d, profileId: null, linkedEmail: '' }))}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded transition ${isDarkMode ? 'text-rose-400 hover:bg-rose-900/30' : 'text-rose-600 hover:bg-rose-100'}`}
                      >
                        <LinkOff size={12} />Unlink
                      </button>
                    </div>
                  ) : (
                    /* Not linked — email search */
                    <div className="space-y-2">
                      <p className={`text-xs ${subtext}`}>Enter the login email of the account this foreman will use.</p>
                      <div className="flex gap-2">
                        <input
                          className={`${input} flex-1`}
                          type="email"
                          placeholder="foreman@company.com"
                          value={acctSearch}
                          onChange={e => { setAcctSearch(e.target.value); setAcctResult(null); setAcctNotFound(false); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchAcctByEmail(); } }}
                        />
                        <button
                          type="button"
                          onClick={searchAcctByEmail}
                          disabled={acctSearching || !acctSearch.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold transition hover:opacity-90 disabled:opacity-40 shrink-0"
                        >
                          {acctSearching
                            ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            : <Search size={13} />}
                          Find
                        </button>
                      </div>
                      {acctResult && (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'}`}>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${text}`}>{acctResult.name}</p>
                            <p className={`text-[11px] truncate ${subtext}`}>{acctResult.username}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditEmpDraft(d => ({ ...d, profileId: acctResult.id, linkedEmail: acctResult.username }));
                              setAcctResult(null);
                              setAcctSearch('');
                            }}
                            className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-brand text-white transition hover:opacity-90 shrink-0"
                          >
                            <Link size={12} />Link
                          </button>
                        </div>
                      )}
                      {acctNotFound && (
                        <p className={`text-xs ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>
                          No account found with that email. Make sure they have signed up first.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button
                onClick={closeEditEmp}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={saveEditEmp}
                disabled={savingEmp || !editEmpDraft.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                {savingEmp ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={15} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Edit Modal */}
      {editingEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) closeEditEq(); }}>
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <Wrench size={17} className="text-brand" />
                <h2 className={`text-base font-semibold ${text}`}>Edit Equipment</h2>
              </div>
              <button onClick={closeEditEq} className={`rounded-lg p-1.5 transition hover:bg-slate-100 ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'text-slate-400'}`}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Name & Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={`mb-1 ${label}`}>Name *</p>
                  <input className={input} value={editDraft.name ?? ''} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <p className={`mb-1 ${label}`}>Rate / hr ($)</p>
                  <input className={input} type="number" value={editDraft.hourlyRate ?? ''} onChange={e => setEditDraft(d => ({ ...d, hourlyRate: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Type & Unit # */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={`mb-1 ${label}`}>Equipment Type</p>
                  <input className={input} placeholder="e.g. Excavator" value={editDraft.equipmentType ?? ''} onChange={e => setEditDraft(d => ({ ...d, equipmentType: e.target.value }))} />
                </div>
                <div>
                  <p className={`mb-1 ${label}`}>Unit Number</p>
                  <input className={input} placeholder="e.g. EQ-042" value={editDraft.unitNumber ?? ''} onChange={e => setEditDraft(d => ({ ...d, unitNumber: e.target.value }))} />
                </div>
              </div>

              {/* Year / Make / Model */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className={`mb-1 ${label}`}>Year</p>
                  <input className={input} type="number" placeholder="2022" value={editDraft.year ?? ''} onChange={e => setEditDraft(d => ({ ...d, year: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div>
                  <p className={`mb-1 ${label}`}>Make</p>
                  <input className={input} placeholder="Caterpillar" value={editDraft.make ?? ''} onChange={e => setEditDraft(d => ({ ...d, make: e.target.value }))} />
                </div>
                <div>
                  <p className={`mb-1 ${label}`}>Model</p>
                  <input className={input} placeholder="320" value={editDraft.model ?? ''} onChange={e => setEditDraft(d => ({ ...d, model: e.target.value }))} />
                </div>
              </div>

              {/* VIN / Serial / License */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className={`mb-1 ${label}`}>VIN</p>
                  <input className={input} placeholder="Vehicle identification number" value={editDraft.vin ?? ''} onChange={e => setEditDraft(d => ({ ...d, vin: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={`mb-1 ${label}`}>Serial Number</p>
                  <input className={input} value={editDraft.serialNumber ?? ''} onChange={e => setEditDraft(d => ({ ...d, serialNumber: e.target.value }))} />
                </div>
                <div>
                  <p className={`mb-1 ${label}`}>License Plate</p>
                  <input className={input} value={editDraft.licensePlate ?? ''} onChange={e => setEditDraft(d => ({ ...d, licensePlate: e.target.value }))} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className={`mb-1 ${label}`}>Notes</p>
                <textarea
                  className={`${input} resize-none`}
                  rows={3}
                  value={editDraft.notes ?? ''}
                  onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button
                onClick={closeEditEq}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={saveEditEq}
                disabled={saving || !editDraft.name?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={15} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
