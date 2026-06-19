import { useEffect, useMemo, useState } from 'react';
import { Clock, LogOut, MapPin, Search, Users, User as UserIcon, Check, Pencil, X, UserPlus } from 'lucide-react';
import { User } from '../../types.ts';
import { Employee } from '../../services/schedulingTypes.ts';
import { CostCode, ClockableJob, TimeClockCrew, TimeEntry, formatRoundedDuration } from '../../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';

interface ClockPanelProps {
  sessionUser: User;
  isAdmin: boolean;
  employees: Employee[];
  clockableJobs: ClockableJob[];
  isDarkMode?: boolean;
}

type Mode = 'self' | 'crew';

/** Best-effort browser geolocation; resolves null if denied/unavailable. */
function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}

export default function ClockPanel({ sessionUser, isAdmin, employees, clockableJobs, isDarkMode }: ClockPanelProps) {
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // selection state
  const [jobSearch, setJobSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<ClockableJob | null>(null);
  const [jobCodes, setJobCodes] = useState<CostCode[]>([]);
  const [selectedCodeId, setSelectedCodeId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  // crew state
  const [crew, setCrew] = useState<TimeClockCrew | null>(null);
  const [presentIds, setPresentIds] = useState<number[]>([]);       // who gets clocked in
  const [perCode, setPerCode] = useState<Record<number, number>>({}); // per-person cost code override
  const [showPerCode, setShowPerCode] = useState(false);
  const [editingCrew, setEditingCrew] = useState(false);
  const [crewDraftIds, setCrewDraftIds] = useState<number[]>([]);
  const [savingCrew, setSavingCrew] = useState(false);

  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `w-full px-3 py-3 rounded-lg border text-base ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  // The employee record linked to the current login (for self-clock + foreman check).
  const myEmployee = useMemo(
    () => employees.find(e => e.profileId === sessionUser.id) ?? null,
    [employees, sessionUser.id],
  );
  const isForeman = myEmployee?.isForeman === true;
  const canRunCrew = isAdmin || isForeman;

  const [mode, setMode] = useState<Mode>(canRunCrew ? 'crew' : 'self');

  const memberIds = crew?.memberIds ?? [];
  const memberIdSet = useMemo(() => new Set(memberIds), [crew]);

  const reloadActive = async () => {
    try { setActiveEntries(await timeTrackingService.getCompanyActiveEntries()); }
    catch (err) { console.error('Failed to load active entries:', err); }
  };

  const reloadCrew = async () => {
    if (!canRunCrew) return;
    try {
      const c = await timeTrackingService.getMyCrew(sessionUser.id);
      setCrew(c);
      // Default everyone present at the start of the day.
      setPresentIds(c?.memberIds ?? []);
    } catch (err) { console.error('Failed to load crew:', err); }
  };

  useEffect(() => { reloadActive(); }, []);
  useEffect(() => { reloadCrew(); }, [canRunCrew, sessionUser.id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // Load the cost codes available for the chosen job (assigned, or full list).
  useEffect(() => {
    if (!selectedJob) { setJobCodes([]); setSelectedCodeId(null); setPerCode({}); return; }
    timeTrackingService.getCodesForJob(selectedJob.kind, selectedJob.ref)
      .then(codes => { setJobCodes(codes); setSelectedCodeId(codes[0]?.id ?? null); setPerCode({}); })
      .catch(err => console.error('Failed to load cost codes:', err));
  }, [selectedJob]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    const list = q ? clockableJobs.filter(j => j.label.toLowerCase().includes(q)) : clockableJobs;
    return list.slice(0, 25);
  }, [jobSearch, clockableJobs]);

  const targetMembers = mode === 'self'
    ? (myEmployee ? [{ employeeId: myEmployee.id, costCodeId: selectedCodeId }] : [])
    : presentIds.map(id => ({ employeeId: id, costCodeId: perCode[id] ?? selectedCodeId }));

  const canClockIn = !!selectedJob && targetMembers.length > 0 && !busy;

  // Crew members currently on the clock → drives the "Clock out crew" button.
  const crewOnClock = useMemo(
    () => activeEntries.filter(e => memberIdSet.has(e.employeeId)).map(e => e.employeeId),
    [activeEntries, memberIdSet],
  );

  const handleClockIn = async () => {
    if (!selectedJob || targetMembers.length === 0) return;
    setBusy(true); setError('');
    try {
      const gps = await getGps();
      await timeTrackingService.clockInCrew(sessionUser.companyId, targetMembers, {
        jobKind: selectedJob.kind,
        jobRef: selectedJob.ref,
        jobLabel: selectedJob.label,
        note: note.trim(),
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
      });
      setNote('');
      await reloadActive();
    } catch (err) {
      console.error('Clock-in failed:', err);
      setError(err instanceof Error ? err.message : 'Clock-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async (entryId: number) => {
    setBusy(true); setError('');
    try { await timeTrackingService.clockOut(entryId); await reloadActive(); }
    catch (err) { console.error('Clock-out failed:', err); setError(err instanceof Error ? err.message : 'Clock-out failed.'); }
    finally { setBusy(false); }
  };

  const handleClockOutCrew = async () => {
    if (crewOnClock.length === 0) return;
    setBusy(true); setError('');
    try { await timeTrackingService.clockOutMany(crewOnClock); await reloadActive(); }
    catch (err) { console.error('Crew clock-out failed:', err); setError(err instanceof Error ? err.message : 'Clock-out failed.'); }
    finally { setBusy(false); }
  };

  const togglePresent = (id: number) =>
    setPresentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── crew editor ─────────────────────────────────────────────────────────────
  const openCrewEditor = () => {
    // New foreman with no crew yet: pre-seed with themselves (they swing tools too).
    const seed = crew?.memberIds ?? (myEmployee ? [myEmployee.id] : []);
    setCrewDraftIds(seed);
    setEditingCrew(true);
  };
  const toggleDraft = (id: number) =>
    setCrewDraftIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const saveCrew = async () => {
    setSavingCrew(true); setError('');
    try {
      const saved = await timeTrackingService.saveMyCrew(
        sessionUser.companyId, sessionUser.id, crew?.name ?? 'My Crew', crewDraftIds,
      );
      setCrew(saved);
      setPresentIds(saved.memberIds);
      setEditingCrew(false);
    } catch (err) {
      console.error('Save crew failed:', err);
      setError(err instanceof Error ? err.message : 'Could not save crew.');
    } finally {
      setSavingCrew(false);
    }
  };

  const crewMembers = memberIds.map(id => empById.get(id)).filter((e): e is Employee => !!e);

  return (
    <div className="space-y-4">
      {/* Mode toggle (admins/foremen can switch between self and crew) */}
      {canRunCrew && (
        <div className="grid grid-cols-2 gap-2">
          {(['crew', 'self'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-base font-bold border transition ${
                mode === m ? 'bg-brand text-white border-transparent'
                  : isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              {m === 'crew' ? <Users size={18} /> : <UserIcon size={18} />}
              {m === 'crew' ? 'My crew' : 'Just me'}
            </button>
          ))}
        </div>
      )}

      {error && <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-500 border border-red-500/20">{error}</div>}

      <div className={`rounded-xl border p-4 space-y-4 ${card}`}>
        {/* Self mode without a linked employee */}
        {mode === 'self' && !myEmployee ? (
          <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Your login isn't linked to an employee record yet. An admin can link it under Field Ops → Resources.
          </p>
        ) : (
          <>
            {/* Crew picker */}
            {mode === 'crew' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Crew · {presentIds.length}/{crewMembers.length} here
                  </label>
                  <button onClick={openCrewEditor} className="flex items-center gap-1 text-sm text-brand font-bold">
                    <Pencil size={14} /> Edit crew
                  </button>
                </div>

                {crewMembers.length === 0 ? (
                  <button
                    onClick={openCrewEditor}
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-brand/40 text-brand font-bold"
                  >
                    <UserPlus size={18} /> Build your crew
                  </button>
                ) : (
                  <>
                    <div className="flex items-center justify-end gap-3 mb-2 text-xs font-bold">
                      <button onClick={() => setPresentIds(crewMembers.map(e => e.id))} className="text-brand">All here</button>
                      <button onClick={() => setPresentIds([])} className="text-slate-500">Clear</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {crewMembers.map(e => {
                        const here = presentIds.includes(e.id);
                        return (
                          <button
                            key={e.id}
                            onClick={() => togglePresent(e.id)}
                            className={`flex items-center justify-between gap-2 px-4 py-4 rounded-xl text-base font-bold border-2 transition min-h-[60px] ${
                              here
                                ? 'bg-brand text-white border-transparent'
                                : isDarkMode ? 'bg-slate-900 text-slate-500 border-slate-700 line-through' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                            }`}
                          >
                            <span className="truncate text-left">{e.name || 'Unnamed'}</span>
                            {here && <Check size={20} className="shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Job search + picker */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Job</label>
              {selectedJob ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold">{selectedJob.label}
                    <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand/15 text-brand">{selectedJob.kind}</span>
                  </span>
                  <button className="text-sm text-brand font-bold" onClick={() => { setSelectedJob(null); setJobSearch(''); }}>Change</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className={`${input} pl-9`} placeholder="Search jobs…" value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
                  </div>
                  {jobSearch && (
                    <div className={`mt-1 max-h-52 overflow-y-auto rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                      {filteredJobs.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No matching jobs.</div>}
                      {filteredJobs.map(j => (
                        <button
                          key={`${j.kind}:${j.ref}`}
                          onClick={() => { setSelectedJob(j); setJobSearch(''); }}
                          className={`w-full text-left px-3 py-3 text-base flex items-center justify-between ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}
                        >
                          <span>{j.label}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand/15 text-brand">{j.kind}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cost code picker */}
            {selectedJob && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Cost code{mode === 'crew' && !showPerCode ? ' · whole crew' : ''}
                  </label>
                  {mode === 'crew' && jobCodes.length > 1 && presentIds.length > 1 && (
                    <button onClick={() => setShowPerCode(v => !v)} className="text-sm text-brand font-bold">
                      {showPerCode ? 'Same for all' : 'Per person'}
                    </button>
                  )}
                </div>
                {jobCodes.length === 0 ? (
                  <p className="text-sm text-slate-500">No cost codes available. Add some under the Cost Codes tab.</p>
                ) : mode === 'crew' && showPerCode ? (
                  <div className="space-y-2">
                    {presentIds.map(id => (
                      <div key={id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold truncate">{empById.get(id)?.name || `#${id}`}</span>
                        <select
                          className={`${input} max-w-[60%]`}
                          value={perCode[id] ?? selectedCodeId ?? ''}
                          onChange={e => setPerCode(prev => ({ ...prev, [id]: Number(e.target.value) }))}
                        >
                          {jobCodes.map(c => (
                            <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <select className={input} value={selectedCodeId ?? ''} onChange={e => setSelectedCodeId(Number(e.target.value))}>
                    {jobCodes.map(c => (
                      <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Note (optional)</label>
              <input className={input} placeholder="What's being worked on?" value={note} onChange={e => setNote(e.target.value)} />
            </div>

            <button
              disabled={!canClockIn}
              onClick={handleClockIn}
              className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-lg font-black transition ${
                canClockIn ? 'bg-brand text-white hover:opacity-90 shadow-lg shadow-brand/20' : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Clock size={20} />
              {busy ? 'Working…' : mode === 'crew'
                ? `Clock in crew (${targetMembers.length})`
                : 'Clock in'}
            </button>

            {/* End-of-day: clock the whole crew out in one tap. */}
            {mode === 'crew' && crewOnClock.length > 0 && (
              <button
                disabled={busy}
                onClick={handleClockOutCrew}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-lg font-black bg-red-500/10 text-red-500 border-2 border-red-500/30 hover:bg-red-500/20 transition"
              >
                <LogOut size={20} /> Clock out crew ({crewOnClock.length})
              </button>
            )}

            <p className="text-[11px] text-slate-500">Switching job or cost code automatically clocks the prior task out.</p>
          </>
        )}
      </div>

      {/* On the clock now */}
      <div className={`rounded-xl border p-4 ${card}`}>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">On the clock</h3>
        {activeEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No one is currently clocked in.</p>
        ) : (
          <ul className="space-y-2">
            {activeEntries.map(en => (
              <li key={en.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                <div className="min-w-0">
                  <p className="text-base font-bold truncate">{empById.get(en.employeeId)?.name || `Employee #${en.employeeId}`}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {en.jobLabel}
                    {(en.gpsLat != null && en.gpsLng != null) && <MapPin size={11} className="inline ml-1 -mt-0.5 text-brand" />}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-slate-500">{formatRoundedDuration(en, now)}</span>
                  <button
                    onClick={() => handleClockOut(en.id)}
                    disabled={busy}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                  >
                    <LogOut size={15} /> Out
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Crew editor modal */}
      {editingCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setEditingCrew(false); }}>
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <Users size={18} className="text-brand" />
                <h2 className="text-base font-bold">Edit crew</h2>
              </div>
              <button onClick={() => setEditingCrew(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              <p className="text-xs text-slate-500 mb-1">Tap the workers who are on your crew. They don't need their own login.</p>
              {employees.length === 0 && <p className="text-sm text-slate-500">No employees yet — add them under Field Ops → Resources.</p>}
              {employees.map(e => {
                const on = crewDraftIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggleDraft(e.id)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-base font-bold border-2 transition ${
                      on ? 'bg-brand/10 border-brand text-brand' : isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="truncate text-left">
                      {e.name || 'Unnamed'}
                      {e.id === myEmployee?.id && <span className="ml-2 text-[10px] uppercase font-bold text-slate-400">you</span>}
                      {e.role && <span className="block text-xs font-medium text-slate-400">{e.role}</span>}
                    </span>
                    <span className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center ${on ? 'bg-brand border-brand text-white' : 'border-slate-400'}`}>
                      {on && <Check size={15} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={`flex items-center justify-between gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <span className="text-sm font-bold text-slate-500">{crewDraftIds.length} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingCrew(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}>Cancel</button>
                <button
                  onClick={saveCrew}
                  disabled={savingCrew}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {savingCrew ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={16} />}
                  Save crew
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
