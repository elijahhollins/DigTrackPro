
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, UserRecord, Job, InventoryItem, InventoryItemType, InventoryLocation, InventoryMovement, InventoryMovementType } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { scheduleService } from '../services/scheduleService.ts';
import { Employee } from '../services/schedulingTypes.ts';

interface InventoryViewProps {
  sessionUser: User;
  users: UserRecord[];
  jobs: Job[];
  isDarkMode?: boolean;
  isAdmin: boolean;
}

type InventoryTab = 'items' | 'locations' | 'history';

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  CHECK_OUT: 'Checked Out',
  CHECK_IN: 'Checked In',
  TRANSFER: 'Transferred',
  CONSUME: 'Consumed',
  ASSIGN: 'Assigned',
  RETURN: 'Returned',
};

const MOVEMENT_COLORS: Record<InventoryMovementType, string> = {
  CHECK_OUT: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  CHECK_IN: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  TRANSFER: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  CONSUME: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  ASSIGN: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  RETURN: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

const MOVEMENT_COLORS_LIGHT: Record<InventoryMovementType, string> = {
  CHECK_OUT: 'text-amber-700 bg-amber-50 border-amber-200',
  CHECK_IN: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  TRANSFER: 'text-sky-700 bg-sky-50 border-sky-200',
  CONSUME: 'text-rose-700 bg-rose-50 border-rose-200',
  ASSIGN: 'text-violet-700 bg-violet-50 border-violet-200',
  RETURN: 'text-slate-600 bg-slate-100 border-slate-200',
};

export const InventoryView: React.FC<InventoryViewProps> = ({ sessionUser, users, jobs, isDarkMode, isAdmin }) => {
  const [tab, setTab] = useState<InventoryTab>('items');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<InventoryItemType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  // Item form state
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Location form state
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<InventoryLocation | null>(null);

  // Movement modal state
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [itemHistory, setItemHistory] = useState<InventoryItem | null>(null);

  const isCrew = sessionUser.role === UserRole.CREW;

  const load = async () => {
    setIsLoading(true);
    try {
      const [itemsRes, locsRes, movsRes] = await Promise.all([
        apiService.getInventoryItems(),
        apiService.getInventoryLocations(),
        apiService.getInventoryMovements(),
      ]);
      setItems(itemsRes);
      setLocations(locsRes);
      setMovements(movsRes);
    } finally {
      setIsLoading(false);
    }
    // Foreman list (employees flagged as foreman with a linked login). Loaded
    // best-effort — the scheduling module may be off for some companies.
    try {
      setEmployees(await scheduleService.getEmployees());
    } catch (err) {
      console.warn('Inventory: employee/foreman list unavailable.', err);
    }
  };

  useEffect(() => { load(); }, []);

  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

  // Equipment may only be assigned to a foreman: an Employee marked isForeman
  // with a linked login (profileId) — the login is required both to store the
  // assignment (current_assignee_id → profiles) and to follow their clock-ins.
  // Derived straight from employees (using the employee's own name) so foremen
  // show up even if their profile row isn't in the loaded users list.
  const foremen = useMemo<{ id: string; name: string }[]>(() =>
    employees
      .filter(e => e.isForeman && e.profileId)
      .map(e => ({ id: e.profileId as string, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (typeFilter !== 'ALL' && item.itemType !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return item.name.toLowerCase().includes(s)
          || item.serialNumber?.toLowerCase().includes(s)
          || item.assetTag?.toLowerCase().includes(s)
          || item.licensePlate?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [items, typeFilter, search]);

  const d = (cls: string, dark: string, light: string) => isDarkMode ? `${cls} ${dark}` : `${cls} ${light}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={d('text-3xl font-black uppercase tracking-tight font-display', 'text-white', 'text-slate-900')}>
            Inventory
          </h2>
          <p className={d('text-[10px] font-bold uppercase tracking-[0.2em] mt-1', 'text-slate-600', 'text-slate-400')}>
            {items.length} item{items.length !== 1 ? 's' : ''} · Equipment & Materials
          </p>
        </div>
        {isAdmin && tab === 'items' && (
          <button
            onClick={() => { setEditingItem(null); setShowItemForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 hover:opacity-90 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            Add Item
          </button>
        )}
        {isAdmin && tab === 'locations' && (
          <button
            onClick={() => { setEditingLocation(null); setShowLocationForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 hover:opacity-90 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            Add Location
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className={d('flex rounded-xl border p-0.5 gap-0.5 w-fit', 'bg-[#0b1629] border-white/[0.08]', 'bg-slate-100 border-slate-200')}>
        {(['items', 'locations', 'history'] as InventoryTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              tab === t
                ? isDarkMode ? 'bg-brand/20 text-brand border border-brand/25' : 'bg-white text-brand shadow-sm border border-slate-200'
                : isDarkMode ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {t === 'items' ? 'Items' : t === 'locations' ? 'Locations' : 'History'}
          </button>
        ))}
      </div>

      {/* ── ITEMS TAB ── */}
      {tab === 'items' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className={d('flex rounded-xl border p-0.5 gap-0.5', 'bg-[#0b1629] border-white/[0.08]', 'bg-slate-100 border-slate-200')}>
              {(['ALL', InventoryItemType.EQUIPMENT, InventoryItemType.MATERIAL] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    typeFilter === f
                      ? isDarkMode ? 'bg-brand/20 text-brand border border-brand/25' : 'bg-white text-brand shadow-sm border border-slate-200'
                      : isDarkMode ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {f === 'ALL' ? 'All' : f === InventoryItemType.EQUIPMENT ? 'Equipment' : 'Materials'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <input
                type="text"
                placeholder="Search name, serial, tag..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={d('w-full pl-8 pr-3 py-2 border rounded-xl text-[11px] font-medium outline-none transition-all', 'bg-white/5 border-white/10 text-white placeholder:text-slate-600', 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400')}
              />
              <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>

          {/* Items table */}
          <div className={d('rounded-2xl border overflow-hidden', 'bg-[#0b1629] border-white/[0.06]', 'bg-white border-slate-200 shadow-sm')}>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className={d('border-b', 'border-white/[0.05] bg-white/[0.015]', 'border-slate-100 bg-slate-50/80')}>
                    {['Name', 'Type', 'Location / Assignee', 'Details', 'Actions'].map(h => (
                      <th key={h} className={d(`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${h === 'Actions' ? 'text-right' : ''}`, 'text-slate-600', 'text-slate-400')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={d('divide-y', 'divide-white/[0.03]', 'divide-slate-50')}>
                  {filteredItems.map(item => {
                    const loc = item.currentLocationId ? locationMap.get(item.currentLocationId) : null;
                    const assignee = item.currentAssigneeId ? userMap.get(item.currentAssigneeId) : null;
                    const job = item.currentJobId ? jobMap.get(item.currentJobId) : null;
                    const isEquip = item.itemType === InventoryItemType.EQUIPMENT;

                    return (
                      <tr key={item.id} className={d('group transition-colors', 'hover:bg-white/[0.02]', 'hover:bg-slate-50/70')}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.unitNumber && (
                              <span className={d('inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest', 'bg-amber-500/15 text-amber-400', 'bg-amber-50 text-amber-700 border border-amber-200')}>
                                #{item.unitNumber}
                              </span>
                            )}
                            <p className={d('text-[13px] font-bold', 'text-slate-100', 'text-slate-900')}>{item.name}</p>
                          </div>
                          {item.equipmentType && <p className={d('text-[10px] mt-0.5', 'text-slate-500', 'text-slate-500')}>{item.equipmentType}</p>}
                          {item.assetTag && <p className={d('text-[9px] font-black uppercase tracking-widest mt-0.5', 'text-slate-600', 'text-slate-400')}>Tag: {item.assetTag}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                            isEquip
                              ? isDarkMode ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-sky-50 text-sky-700 border-sky-200'
                              : isDarkMode ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-violet-50 text-violet-700 border-violet-200'
                          }`}>
                            {isEquip ? 'Equipment' : 'Material'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {loc && <p className={d('text-[11px] font-semibold', 'text-slate-300', 'text-slate-700')}>{loc.name}</p>}
                          {job && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>Job #{job.jobNumber}</p>}
                          {assignee && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>{assignee.name}</p>}
                          {!loc && !job && !assignee && <span className={d('text-[10px]', 'text-slate-700', 'text-slate-400')}>Unassigned</span>}
                        </td>
                        <td className="px-5 py-4">
                          {isEquip ? (
                            <div className="space-y-0.5">
                              {item.serialNumber && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>S/N: {item.serialNumber}</p>}
                              {item.odometer != null && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>{item.odometer.toLocaleString()} mi</p>}
                              {item.nextServiceDue && <p className={d('text-[10px] font-bold', 'text-amber-500', 'text-amber-600')}>Service: {item.nextServiceDue}</p>}
                              {item.hourlyRate != null && item.hourlyRate > 0 && <p className={d('text-[10px]', 'text-slate-400', 'text-slate-500')}>${item.hourlyRate}/hr</p>}
                            </div>
                          ) : (
                            <p className={d('text-[13px] font-black tabular-nums', 'text-slate-200', 'text-slate-800')}>
                              {item.quantity} <span className={d('text-[10px] font-bold', 'text-slate-500', 'text-slate-400')}>{item.unit}</span>
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => setItemHistory(item)}
                              title="View history"
                              className={d('p-1.5 rounded-lg transition-all', 'text-slate-500 hover:text-brand hover:bg-brand/10', 'text-slate-400 hover:text-brand hover:bg-brand/10')}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                            <button
                              onClick={() => setMovementItem(item)}
                              title="Log movement"
                              className={d('p-1.5 rounded-lg transition-all', 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10', 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50')}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                                  title="Edit"
                                  className={d('p-1.5 rounded-lg transition-all', 'text-slate-600 hover:text-slate-300 hover:bg-white/5', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
                                    await apiService.deleteInventoryItem(item.id);
                                    setItems(prev => prev.filter(i => i.id !== item.id));
                                  }}
                                  title="Delete"
                                  className={d('p-1.5 rounded-lg transition-all', 'text-rose-700 hover:text-rose-400 hover:bg-rose-500/10', 'text-rose-400 hover:text-rose-600 hover:bg-rose-50')}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className={d('w-14 h-14 rounded-2xl flex items-center justify-center', 'bg-white/[0.03] border border-white/[0.05]', 'bg-slate-100')}>
                            <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                          </div>
                          <p className={d('text-[11px] font-black uppercase tracking-widest', 'text-slate-600', 'text-slate-400')}>No items found</p>
                          {isAdmin && <p className={d('text-[10px]', 'text-slate-700', 'text-slate-500')}>Click Add Item to get started.</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATIONS TAB ── */}
      {tab === 'locations' && (
        <div className={d('rounded-2xl border overflow-hidden', 'bg-[#0b1629] border-white/[0.06]', 'bg-white border-slate-200 shadow-sm')}>
          <table className="w-full text-left">
            <thead>
              <tr className={d('border-b', 'border-white/[0.05] bg-white/[0.015]', 'border-slate-100 bg-slate-50/80')}>
                {['Name', 'Address', 'Items Here', 'Actions'].map(h => (
                  <th key={h} className={d(`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${h === 'Actions' ? 'text-right' : ''}`, 'text-slate-600', 'text-slate-400')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={d('divide-y', 'divide-white/[0.03]', 'divide-slate-50')}>
              {locations.map(loc => {
                const hereCount = items.filter(i => i.currentLocationId === loc.id).length;
                return (
                  <tr key={loc.id} className={d('group', 'hover:bg-white/[0.02]', 'hover:bg-slate-50/70')}>
                    <td className="px-5 py-4">
                      <p className={d('text-[13px] font-bold', 'text-slate-100', 'text-slate-900')}>{loc.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className={d('text-[11px]', 'text-slate-500', 'text-slate-500')}>{[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={d('text-[10px] font-black uppercase px-2 py-1 rounded-lg', 'bg-white/[0.04] text-slate-500', 'bg-slate-100 text-slate-500')}>{hereCount}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => { setEditingLocation(loc); setShowLocationForm(true); }}
                            className={d('p-1.5 rounded-lg transition-all', 'text-slate-600 hover:text-slate-300 hover:bg-white/5', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (hereCount > 0) { alert('Move all items out of this location before deleting it.'); return; }
                              if (!confirm(`Delete location "${loc.name}"?`)) return;
                              await apiService.deleteInventoryLocation(loc.id);
                              setLocations(prev => prev.filter(l => l.id !== loc.id));
                            }}
                            className={d('p-1.5 rounded-lg transition-all', 'text-rose-700 hover:text-rose-400 hover:bg-rose-500/10', 'text-rose-400 hover:text-rose-600 hover:bg-rose-50')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    )}
                    {!isAdmin && <td className="px-5 py-4" />}
                  </tr>
                );
              })}
              {locations.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <p className={d('text-[11px] font-black uppercase tracking-widest', 'text-slate-600', 'text-slate-400')}>No locations yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className={d('rounded-2xl border overflow-hidden', 'bg-[#0b1629] border-white/[0.06]', 'bg-white border-slate-200 shadow-sm')}>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className={d('border-b', 'border-white/[0.05] bg-white/[0.015]', 'border-slate-100 bg-slate-50/80')}>
                  {['When', 'Item', 'Type', 'Details', 'By'].map(h => (
                    <th key={h} className={d('px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em]', 'text-slate-600', 'text-slate-400')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={d('divide-y', 'divide-white/[0.03]', 'divide-slate-50')}>
                {movements.map(mv => {
                  const item = items.find(i => i.id === mv.itemId);
                  const fromLoc = mv.fromLocationId ? locationMap.get(mv.fromLocationId) : null;
                  const toLoc = mv.toLocationId ? locationMap.get(mv.toLocationId) : null;
                  const mvDate = new Date(mv.createdAt);
                  const colorClass = isDarkMode ? MOVEMENT_COLORS[mv.movementType] : MOVEMENT_COLORS_LIGHT[mv.movementType];

                  return (
                    <tr key={mv.id} className={d('', 'hover:bg-white/[0.02]', 'hover:bg-slate-50/70')}>
                      <td className="px-5 py-3">
                        <p className={d('text-[11px] font-semibold tabular-nums', 'text-slate-400', 'text-slate-600')}>{mvDate.toLocaleDateString()}</p>
                        <p className={d('text-[9px]', 'text-slate-600', 'text-slate-400')}>{mvDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item?.unitNumber && (
                            <span className={d('inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest', 'bg-amber-500/15 text-amber-400', 'bg-amber-50 text-amber-700 border border-amber-200')}>
                              #{item.unitNumber}
                            </span>
                          )}
                          <p className={d('text-[11px] font-bold', 'text-slate-300', 'text-slate-700')}>{item?.name || mv.itemId}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${colorClass}`}>
                          {MOVEMENT_LABELS[mv.movementType]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {fromLoc && toLoc && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>{fromLoc.name} → {toLoc.name}</p>}
                        {toLoc && !fromLoc && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>→ {toLoc.name}</p>}
                        {mv.jobNumber && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>Job #{mv.jobNumber}</p>}
                        {mv.assigneeName && <p className={d('text-[10px]', 'text-slate-500', 'text-slate-500')}>To: {mv.assigneeName}</p>}
                        {mv.quantityDelta != null && <p className={d('text-[10px] font-bold', 'text-slate-400', 'text-slate-600')}>{mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta} {item?.unit}</p>}
                        {mv.notes && <p className={d('text-[10px] italic', 'text-slate-600', 'text-slate-400')}>{mv.notes}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <p className={d('text-[10px] font-semibold', 'text-slate-400', 'text-slate-600')}>{mv.performedByName}</p>
                      </td>
                    </tr>
                  );
                })}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <p className={d('text-[11px] font-black uppercase tracking-widest', 'text-slate-600', 'text-slate-400')}>No movement history yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ITEM FORM MODAL ── */}
      {showItemForm && (
        <ItemFormModal
          item={editingItem}
          locations={locations}
          foremen={foremen}
          jobs={jobs}
          isDarkMode={isDarkMode}
          companyId={sessionUser.companyId}
          onSave={async (saved) => {
            setItems(prev => {
              const idx = prev.findIndex(i => i.id === saved.id);
              return idx >= 0 ? prev.map(i => i.id === saved.id ? saved : i) : [...prev, saved];
            });
            setShowItemForm(false);
            setEditingItem(null);
          }}
          onClose={() => { setShowItemForm(false); setEditingItem(null); }}
        />
      )}

      {/* ── LOCATION FORM MODAL ── */}
      {showLocationForm && (
        <LocationFormModal
          location={editingLocation}
          isDarkMode={isDarkMode}
          companyId={sessionUser.companyId}
          onSave={async (saved) => {
            setLocations(prev => {
              const idx = prev.findIndex(l => l.id === saved.id);
              return idx >= 0 ? prev.map(l => l.id === saved.id ? saved : l) : [...prev, saved];
            });
            setShowLocationForm(false);
            setEditingLocation(null);
          }}
          onClose={() => { setShowLocationForm(false); setEditingLocation(null); }}
        />
      )}

      {/* ── MOVEMENT MODAL ── */}
      {movementItem && (
        <MovementModal
          item={movementItem}
          locations={locations}
          users={users}
          foremen={foremen}
          jobs={jobs}
          sessionUser={sessionUser}
          isDarkMode={isDarkMode}
          isCrew={isCrew}
          onSave={async (mv) => {
            setMovements(prev => [mv, ...prev]);
            // Refresh items to get updated state
            const refreshed = await apiService.getInventoryItems();
            setItems(refreshed);
            setMovementItem(null);
          }}
          onClose={() => setMovementItem(null)}
        />
      )}

      {/* ── ITEM HISTORY MODAL ── */}
      {itemHistory && (
        <ItemHistoryModal
          item={itemHistory}
          movements={movements.filter(m => m.itemId === itemHistory.id)}
          locations={locationMap}
          isDarkMode={isDarkMode}
          onClose={() => setItemHistory(null)}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

interface ItemFormProps {
  item: InventoryItem | null;
  locations: InventoryLocation[];
  foremen: { id: string; name: string }[];
  jobs: Job[];
  companyId: string;
  isDarkMode?: boolean;
  onSave: (item: InventoryItem) => void;
  onClose: () => void;
}

type ItemLocKind = 'shop' | 'job' | 'crew';

const ItemFormModal: React.FC<ItemFormProps> = ({ item, locations, foremen, jobs, companyId, isDarkMode, onSave, onClose }) => {
  const [name, setName] = useState(item?.name || '');
  const [itemType, setItemType] = useState<InventoryItemType>(item?.itemType || InventoryItemType.EQUIPMENT);
  const [unitNumber, setUnitNumber] = useState(item?.unitNumber || '');
  const [equipmentType, setEquipmentType] = useState(item?.equipmentType || '');
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber || '');
  const [licensePlate, setLicensePlate] = useState(item?.licensePlate || '');
  const [vin, setVin] = useState(item?.vin || '');
  const [assetTag, setAssetTag] = useState(item?.assetTag || '');
  const [lastServiceDate, setLastServiceDate] = useState(item?.lastServiceDate || '');
  const [nextServiceDue, setNextServiceDue] = useState(item?.nextServiceDue || '');
  const [odometer, setOdometer] = useState(item?.odometer?.toString() || '');
  const [hourlyRate, setHourlyRate] = useState(item?.hourlyRate?.toString() || '');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '0');
  const [unit, setUnit] = useState(item?.unit || 'each');
  // New equipment defaults to the shop (first location with an address, else the
  // first location) so it lands on the equipment map right away. Existing items
  // keep whatever location they already have.
  const defaultLocationId = (locations.find(l => l.address || l.city || l.zip) ?? locations[0])?.id ?? '';
  const initLocKind = (): ItemLocKind => {
    if (item?.currentJobId) return 'job';
    if (item?.currentAssigneeId) return 'crew';
    return 'shop';
  };
  const [locKind, setLocKind] = useState<ItemLocKind>(initLocKind());
  const [currentLocationId, setCurrentLocationId] = useState(item?.currentLocationId ?? (item ? '' : defaultLocationId));
  const [currentJobId, setCurrentJobId] = useState(item?.currentJobId || '');
  const [currentAssigneeId, setCurrentAssigneeId] = useState(item?.currentAssigneeId || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const d = (dark: string, light: string) => isDarkMode ? dark : light;

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setIsSaving(true);
    setError('');
    try {
      const saved = await apiService.saveInventoryItem({
        ...(item ? { id: item.id } : {}),
        companyId,
        name: name.trim(),
        itemType,
        unitNumber: unitNumber || undefined,
        equipmentType: equipmentType || undefined,
        serialNumber: serialNumber || undefined,
        licensePlate: licensePlate || undefined,
        vin: vin || undefined,
        assetTag: assetTag || undefined,
        lastServiceDate: lastServiceDate || undefined,
        nextServiceDue: nextServiceDue || undefined,
        odometer: odometer ? parseFloat(odometer) : undefined,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : 0,
        quantity: parseFloat(quantity) || 0,
        unit: unit || 'each',
        currentLocationId: locKind === 'shop' ? (currentLocationId || undefined) : undefined,
        currentJobId: locKind === 'job' ? (currentJobId || undefined) : undefined,
        currentAssigneeId: locKind === 'crew' ? (currentAssigneeId || undefined) : undefined,
        notes: notes || '',
      });
      onSave(saved);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = d(
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/50',
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  );
  const labelCls = d('text-[9px] font-black uppercase tracking-widest text-slate-500', 'text-[9px] font-black uppercase tracking-widest text-slate-500');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-[2rem] shadow-2xl border overflow-y-auto max-h-[90vh] ${d('bg-[#1e293b] border-white/10', 'bg-white border-slate-200')}`}>
        <div className="p-8 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className={`text-[15px] font-black uppercase tracking-tight ${d('text-white', 'text-slate-900')}`}>{item ? 'Edit Item' : 'New Item'}</h3>
            <button onClick={onClose} className={`p-2 rounded-xl ${d('text-slate-500 hover:text-white hover:bg-white/10', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Type toggle */}
          <div className="space-y-1.5">
            <p className={labelCls}>Type</p>
            <div className={`flex rounded-xl border p-0.5 gap-0.5 ${d('bg-[#0b1629] border-white/[0.08]', 'bg-slate-100 border-slate-200')}`}>
              {([InventoryItemType.EQUIPMENT, InventoryItemType.MATERIAL] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setItemType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    itemType === t
                      ? d('bg-brand/20 text-brand border border-brand/25', 'bg-white text-brand shadow-sm border border-slate-200')
                      : d('text-slate-600 hover:text-slate-300', 'text-slate-400 hover:text-slate-700')
                  }`}
                >
                  {t === InventoryItemType.EQUIPMENT ? 'Equipment / Vehicle' : 'Material / Supply'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={labelCls}>Name *</p>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder='e.g. Excavator #2, 2" HDPE Pipe' />
          </div>

          {itemType === InventoryItemType.EQUIPMENT ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className={labelCls}>Unit #</p>
                <input className={inputCls} value={unitNumber} onChange={e => setUnitNumber(e.target.value)} placeholder="1b, 22b…" />
              </div>
              <div className="space-y-1.5 col-span-1">
                <p className={labelCls}>Equipment Type</p>
                <input className={inputCls} value={equipmentType} onChange={e => setEquipmentType(e.target.value)} placeholder="Pickup Truck, Excavator…" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Serial #</p>
                <input className={inputCls} value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="SN-123" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Asset Tag</p>
                <input className={inputCls} value={assetTag} onChange={e => setAssetTag(e.target.value)} placeholder="TAG-001" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>License Plate</p>
                <input className={inputCls} value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="ABC-1234" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>VIN</p>
                <input className={inputCls} value={vin} onChange={e => setVin(e.target.value)} placeholder="1HGBH41JXMN109186" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Last Service</p>
                <input type="date" className={inputCls} value={lastServiceDate} onChange={e => setLastServiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Next Service Due</p>
                <input type="date" className={inputCls} value={nextServiceDue} onChange={e => setNextServiceDue(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Odometer (miles)</p>
                <input type="number" className={inputCls} value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="12500" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Hourly Rate ($)</p>
                <input type="number" className={inputCls} value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="0.00" min="0" step="0.01" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className={labelCls}>Quantity</p>
                <input type="number" className={inputCls} value={quantity} onChange={e => setQuantity(e.target.value)} min="0" step="0.01" />
              </div>
              <div className="space-y-1.5">
                <p className={labelCls}>Unit</p>
                <input className={inputCls} value={unit} onChange={e => setUnit(e.target.value)} placeholder="ft, lbs, each, rolls…" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className={labelCls}>Current Location</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'shop' as ItemLocKind, label: 'Shop' },
                { id: 'job'  as ItemLocKind, label: 'Job Site' },
                { id: 'crew' as ItemLocKind, label: 'Foreman' },
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLocKind(opt.id)}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                    locKind === opt.id
                      ? d('bg-brand/20 text-brand border-brand/30', 'bg-brand/10 text-brand border-brand/30')
                      : d('border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300', 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700')
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {locKind === 'shop' && (
              <select className={inputCls} value={currentLocationId} onChange={e => setCurrentLocationId(e.target.value)}>
                <option value="">— None / Unassigned —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {locKind === 'job' && (
              <select className={inputCls} value={currentJobId} onChange={e => setCurrentJobId(e.target.value)}>
                <option value="">— Select job —</option>
                {jobs.filter(j => !j.isComplete).map(j => (
                  <option key={j.id} value={j.id}>#{j.jobNumber} — {j.customer}</option>
                ))}
              </select>
            )}
            {locKind === 'crew' && (
              <>
                <select className={inputCls} value={currentAssigneeId} onChange={e => setCurrentAssigneeId(e.target.value)}>
                  <option value="">— Select foreman —</option>
                  {foremen.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {foremen.length === 0 && (
                  <p className={d('text-[10px] text-slate-600', 'text-[10px] text-slate-400')}>
                    No foremen with a login. In Field Ops → Resources, mark an employee as a Foreman and link their login email.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <p className={labelCls}>Notes</p>
            <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…" />
          </div>

          {error && <p className="text-[11px] font-bold text-rose-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${d('border-white/10 text-slate-500 hover:text-slate-200', 'border-slate-200 text-slate-500 hover:text-slate-700')}`}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-brand text-[#07101f] hover:opacity-90 disabled:opacity-50 transition-all">
              {isSaving ? 'Saving…' : 'Save Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface LocationFormProps {
  location: InventoryLocation | null;
  companyId: string;
  isDarkMode?: boolean;
  onSave: (loc: InventoryLocation) => void;
  onClose: () => void;
}

const LocationFormModal: React.FC<LocationFormProps> = ({ location, companyId, isDarkMode, onSave, onClose }) => {
  const [name, setName] = useState(location?.name || '');
  const [address, setAddress] = useState(location?.address || '');
  const [city, setCity] = useState(location?.city || '');
  const [state, setState] = useState(location?.state || '');
  const [zip, setZip] = useState(location?.zip || '');
  const [lat, setLat] = useState(location?.lat != null ? String(location.lat) : '');
  const [lng, setLng] = useState(location?.lng != null ? String(location.lng) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const d = (dark: string, light: string) => isDarkMode ? dark : light;
  const inputCls = d(
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/50',
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  );

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }

    // Manual map position is optional, but if one coordinate is filled in both
    // must be — and both must be in range — otherwise the pin can't be placed.
    const latStr = lat.trim();
    const lngStr = lng.trim();
    let latNum: number | null = null;
    let lngNum: number | null = null;
    if (latStr || lngStr) {
      if (!latStr || !lngStr) { setError('Enter both latitude and longitude, or leave both blank.'); return; }
      latNum = Number(latStr);
      lngNum = Number(lngStr);
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) { setError('Latitude must be a number between -90 and 90.'); return; }
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) { setError('Longitude must be a number between -180 and 180.'); return; }
    }

    setIsSaving(true);
    setError('');
    try {
      const saved = await apiService.saveInventoryLocation({ ...(location ? { id: location.id } : {}), companyId, name: name.trim(), address: address.trim(), city: city.trim(), state: state.trim(), zip: zip.trim(), lat: latNum, lng: lngNum });
      onSave(saved);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className={`w-full max-w-sm rounded-[2rem] shadow-2xl border p-8 space-y-5 ${d('bg-[#1e293b] border-white/10', 'bg-white border-slate-200')}`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-[15px] font-black uppercase tracking-tight ${d('text-white', 'text-slate-900')}`}>{location ? 'Edit Location' : 'New Location'}</h3>
          <button onClick={onClose} className={`p-2 rounded-xl ${d('text-slate-500 hover:text-white hover:bg-white/10', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Name *</p>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Main Yard, Warehouse B…" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Street Address</p>
          <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Storage Rd" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">City</p>
          <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Springfield" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">State</p>
            <input className={inputCls} value={state} onChange={e => setState(e.target.value)} placeholder="IL" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">ZIP Code</p>
            <input className={inputCls} value={zip} onChange={e => setZip(e.target.value)} placeholder="62704" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Latitude</p>
            <input className={inputCls} value={lat} onChange={e => setLat(e.target.value)} placeholder="39.7990" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Longitude</p>
            <input className={inputCls} value={lng} onChange={e => setLng(e.target.value)} placeholder="-89.6540" inputMode="decimal" />
          </div>
        </div>
        <p className={d('text-[10px] text-slate-500', 'text-[10px] text-slate-400')}>Add a full address so equipment parked here pins accurately on the map. Set latitude &amp; longitude to drop the pin manually instead — leave them blank to auto-locate from the address.</p>
        {error && <p className="text-[11px] font-bold text-rose-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${d('border-white/10 text-slate-500 hover:text-slate-200', 'border-slate-200 text-slate-500 hover:text-slate-700')}`}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-brand text-[#07101f] hover:opacity-90 disabled:opacity-50 transition-all">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MovementModalProps {
  item: InventoryItem;
  locations: InventoryLocation[];
  users: UserRecord[];
  foremen: { id: string; name: string }[];
  jobs: Job[];
  sessionUser: User;
  isDarkMode?: boolean;
  isCrew: boolean;
  onSave: (mv: InventoryMovement) => void;
  onClose: () => void;
}

const MovementModal: React.FC<MovementModalProps> = ({ item, locations, users, foremen, jobs, sessionUser, isDarkMode, onSave, onClose }) => {
  const isEquip = item.itemType === InventoryItemType.EQUIPMENT;
  const defaultType = isEquip ? InventoryMovementType.TRANSFER : InventoryMovementType.CONSUME;
  const [movementType, setMovementType] = useState<InventoryMovementType>(defaultType);
  const [toLocationId, setToLocationId] = useState('');
  const [fromLocationId] = useState(item.currentLocationId || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [jobId, setJobId] = useState(item.currentJobId || '');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const d = (dark: string, light: string) => isDarkMode ? dark : light;
  const inputCls = d(
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/50',
    'w-full px-3 py-2 border rounded-xl text-[12px] font-medium outline-none bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  );

  const availableTypes = isEquip
    ? [InventoryMovementType.CHECK_OUT, InventoryMovementType.CHECK_IN, InventoryMovementType.TRANSFER, InventoryMovementType.ASSIGN, InventoryMovementType.RETURN]
    : [InventoryMovementType.CHECK_OUT, InventoryMovementType.CONSUME, InventoryMovementType.CHECK_IN];

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const selectedJob = jobs.find(j => j.id === jobId);
      const assignee = foremen.find(f => f.id === assigneeId) ?? users.find(u => u.id === assigneeId);
      const delta = quantityDelta ? parseFloat(quantityDelta) : undefined;
      const mv = await apiService.addInventoryMovement({
        companyId: sessionUser.companyId,
        itemId: item.id,
        movementType,
        performedById: sessionUser.id,
        performedByName: sessionUser.name,
        jobId: jobId || undefined,
        jobNumber: selectedJob?.jobNumber,
        fromLocationId: fromLocationId || undefined,
        toLocationId: toLocationId || undefined,
        assigneeId: assigneeId || undefined,
        assigneeName: assignee?.name,
        quantityDelta: movementType === InventoryMovementType.CONSUME && delta ? -Math.abs(delta) : delta,
        notes,
      });

      // Update item's current location — exactly one of the three fields should be set.
      let newJobId      = item.currentJobId;
      let newLocationId = item.currentLocationId;
      let newAssigneeId = item.currentAssigneeId;

      switch (movementType) {
        case InventoryMovementType.CHECK_OUT:
          newJobId      = jobId || undefined;
          newLocationId = undefined;
          newAssigneeId = undefined;
          break;
        case InventoryMovementType.CHECK_IN:
        case InventoryMovementType.TRANSFER:
        case InventoryMovementType.RETURN:
          newJobId      = undefined;
          newLocationId = toLocationId || item.currentLocationId || undefined;
          newAssigneeId = undefined;
          break;
        case InventoryMovementType.ASSIGN:
          newJobId      = undefined;
          newLocationId = undefined;
          newAssigneeId = assigneeId || undefined;
          break;
        case InventoryMovementType.CONSUME:
          // No location change; keep current assignment.
          break;
      }

      const updatedItem: Partial<InventoryItem> & { companyId: string; name: string; itemType: InventoryItemType } = {
        ...item,
        currentLocationId: newLocationId,
        currentJobId: newJobId,
        currentAssigneeId: newAssigneeId,
        quantity: movementType === InventoryMovementType.CONSUME && delta
          ? Math.max(0, item.quantity - Math.abs(delta))
          : movementType === InventoryMovementType.CHECK_IN && delta
            ? item.quantity + Math.abs(delta)
            : item.quantity,
      };
      await apiService.saveInventoryItem(updatedItem);
      onSave(mv);
    } catch (e: any) {
      setError(e.message || 'Failed to log movement');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-[2rem] shadow-2xl border p-8 space-y-5 ${d('bg-[#1e293b] border-white/10', 'bg-white border-slate-200')}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">Log Movement</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.unitNumber && (
                <span className={d('inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400', 'inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200')}>
                  #{item.unitNumber}
                </span>
              )}
              <h3 className={`text-[15px] font-black ${d('text-white', 'text-slate-900')}`}>{item.name}</h3>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${d('text-slate-500 hover:text-white hover:bg-white/10', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Movement Type</p>
          <div className="grid grid-cols-2 gap-1.5">
            {availableTypes.map(t => (
              <button
                key={t}
                onClick={() => setMovementType(t)}
                className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                  movementType === t
                    ? isDarkMode ? 'bg-brand/20 text-brand border-brand/30' : 'bg-brand/10 text-brand border-brand/30'
                    : isDarkMode ? 'border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {MOVEMENT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {movementType === InventoryMovementType.CHECK_OUT && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Destination Job</p>
            <select className={inputCls} value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">— Select job —</option>
              {jobs.filter(j => !j.isComplete).map(j => (
                <option key={j.id} value={j.id}>#{j.jobNumber} — {j.customer}</option>
              ))}
            </select>
          </div>
        )}

        {movementType === InventoryMovementType.TRANSFER && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">To Location</p>
            <select className={inputCls} value={toLocationId} onChange={e => setToLocationId(e.target.value)}>
              <option value="">— Select location —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {(movementType === InventoryMovementType.CHECK_IN || movementType === InventoryMovementType.RETURN) && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Return to Location</p>
            <select className={inputCls} value={toLocationId} onChange={e => setToLocationId(e.target.value)}>
              <option value="">— Select location —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {movementType === InventoryMovementType.ASSIGN && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Assign To Foreman</p>
            <select className={inputCls} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
              <option value="">— Select foreman —</option>
              {foremen.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {foremen.length === 0 && (
              <p className="text-[10px] text-slate-400">No foremen with a login. In Field Ops → Resources, mark an employee as a Foreman and link their login email.</p>
            )}
          </div>
        )}

        {!isEquip && movementType !== InventoryMovementType.CHECK_OUT && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {movementType === InventoryMovementType.CONSUME ? 'Quantity Used' : 'Quantity Received'}
              {item.unit ? ` (${item.unit})` : ''}
            </p>
            <input type="number" className={inputCls} value={quantityDelta} onChange={e => setQuantityDelta(e.target.value)} min="0" step="0.01" placeholder="0" />
            {movementType === InventoryMovementType.CONSUME && (
              <p className={d('text-[10px] text-slate-600', 'text-[10px] text-slate-400')}>On hand: {item.quantity} {item.unit}</p>
            )}
          </div>
        )}

        {movementType !== InventoryMovementType.CHECK_OUT && movementType !== InventoryMovementType.ASSIGN && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Linked Job (optional)</p>
            <select className={inputCls} value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">— No job —</option>
              {jobs.filter(j => !j.isComplete).map(j => <option key={j.id} value={j.id}>#{j.jobNumber} — {j.customer}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Notes</p>
          <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
        </div>

        {error && <p className="text-[11px] font-bold text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${d('border-white/10 text-slate-500 hover:text-slate-200', 'border-slate-200 text-slate-500 hover:text-slate-700')}`}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-brand text-[#07101f] hover:opacity-90 disabled:opacity-50 transition-all">
            {isSaving ? 'Logging…' : 'Log Movement'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ItemHistoryModalProps {
  item: InventoryItem;
  movements: InventoryMovement[];
  locations: Map<string, InventoryLocation>;
  isDarkMode?: boolean;
  onClose: () => void;
}

const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({ item, movements, locations, isDarkMode, onClose }) => {
  const d = (dark: string, light: string) => isDarkMode ? dark : light;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-[2rem] shadow-2xl border overflow-hidden ${d('bg-[#1e293b] border-white/10', 'bg-white border-slate-200')}`}>
        <div className={`flex items-center justify-between p-6 border-b ${d('border-white/10', 'border-slate-100')}`}>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">Movement History</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.unitNumber && (
                <span className={d('inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400', 'inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200')}>
                  #{item.unitNumber}
                </span>
              )}
              <h3 className={`text-[15px] font-black ${d('text-white', 'text-slate-900')}`}>{item.name}</h3>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${d('text-slate-500 hover:text-white hover:bg-white/10', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-6 space-y-3">
          {movements.length === 0 && (
            <p className={d('text-[11px] font-black uppercase tracking-widest text-slate-600 text-center py-8', 'text-[11px] font-black uppercase tracking-widest text-slate-400 text-center py-8')}>No history yet</p>
          )}
          {movements.map(mv => {
            const toLoc = mv.toLocationId ? locations.get(mv.toLocationId) : null;
            const fromLoc = mv.fromLocationId ? locations.get(mv.fromLocationId) : null;
            const colorClass = isDarkMode ? MOVEMENT_COLORS[mv.movementType] : MOVEMENT_COLORS_LIGHT[mv.movementType];
            return (
              <div key={mv.id} className={`flex gap-3 p-3 rounded-xl border ${d('border-white/[0.06]', 'border-slate-100')}`}>
                <span className={`inline-flex shrink-0 mt-0.5 px-2 py-0.5 h-fit rounded-md text-[8px] font-black uppercase tracking-widest border ${colorClass}`}>
                  {MOVEMENT_LABELS[mv.movementType]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {fromLoc && toLoc && <p className={d('text-[10px] text-slate-400', 'text-[10px] text-slate-500')}>{fromLoc.name} → {toLoc.name}</p>}
                      {toLoc && !fromLoc && <p className={d('text-[10px] text-slate-400', 'text-[10px] text-slate-500')}>→ {toLoc.name}</p>}
                      {mv.jobNumber && <p className={d('text-[10px] text-slate-400', 'text-[10px] text-slate-500')}>Job #{mv.jobNumber}</p>}
                      {mv.assigneeName && <p className={d('text-[10px] text-slate-400', 'text-[10px] text-slate-500')}>→ {mv.assigneeName}</p>}
                      {mv.quantityDelta != null && <p className={d('text-[10px] font-bold text-slate-300', 'text-[10px] font-bold text-slate-700')}>{mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta} {item.unit}</p>}
                      {mv.notes && <p className={d('text-[10px] italic text-slate-600', 'text-[10px] italic text-slate-400')}>{mv.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={d('text-[9px] text-slate-500', 'text-[9px] text-slate-400')}>{new Date(mv.createdAt).toLocaleDateString()}</p>
                      <p className={d('text-[9px] text-slate-600', 'text-[9px] text-slate-400')}>{mv.performedByName}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
