import { useEffect, useMemo, useState } from 'react';
import { Clock, LogOut, MapPin, Search, Users, User as UserIcon } from 'lucide-react';
import { User } from '../../types.ts';
import { Employee } from '../../services/schedulingTypes.ts';
import { CostCode, ClockableJob, TimeEntry, formatRoundedDuration } from '../../services/timeTrackingTypes.ts';
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
  const [mode, setMode] = useState<Mode>(isAdmin ? 'crew' : 'self');
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
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);

  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  // The employee record linked to the current login (for self-clock).
  const myEmployee = useMemo(
    () => employees.find(e => e.profileId === sessionUser.id) ?? null,
    [employees, sessionUser.id],
  );

  const reloadActive = async () => {
    try { setActiveEntries(await timeTrackingService.getCompanyActiveEntries()); }
    catch (err) { console.error('Failed to load active entries:', err); }
  };

  useEffect(() => { reloadActive(); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // Load the cost codes available for the chosen job (assigned, or full list).
  useEffect(() => {
    if (!selectedJob) { setJobCodes([]); setSelectedCodeId(null); return; }
    timeTrackingService.getCodesForJob(selectedJob.kind, selectedJob.ref)
      .then(codes => { setJobCodes(codes); setSelectedCodeId(codes[0]?.id ?? null); })
      .catch(err => console.error('Failed to load cost codes:', err));
  }, [selectedJob]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    const list = q ? clockableJobs.filter(j => j.label.toLowerCase().includes(q)) : clockableJobs;
    return list.slice(0, 25);
  }, [jobSearch, clockableJobs]);

  const targetEmployeeIds = mode === 'self'
    ? (myEmployee ? [myEmployee.id] : [])
    : selectedEmpIds;

  const canClockIn = !!selectedJob && targetEmployeeIds.length > 0 && !busy;

  const handleClockIn = async () => {
    if (!selectedJob || targetEmployeeIds.length === 0) return;
    setBusy(true); setError('');
    try {
      const gps = await getGps();
      await timeTrackingService.clockInMany(sessionUser.companyId, targetEmployeeIds, {
        jobKind: selectedJob.kind,
        jobRef: selectedJob.ref,
        jobLabel: selectedJob.label,
        costCodeId: selectedCodeId,
        note: note.trim(),
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
      });
      setNote(''); setSelectedEmpIds([]);
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

  const toggleEmp = (id: number) =>
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-4">
      {/* Mode toggle (admins/foremen can switch between self and crew) */}
      {isAdmin && (
        <div className="flex gap-2">
          {(['crew', 'self'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                mode === m ? 'bg-brand text-white border-transparent'
                  : isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {m === 'crew' ? <Users size={15} /> : <UserIcon size={15} />}
              {m === 'crew' ? 'Clock in crew' : 'Clock in myself'}
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
                <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Employees</label>
                <div className="flex flex-wrap gap-2">
                  {employees.length === 0 && <span className="text-sm text-slate-500">No employees yet — add them under Field Ops → Resources.</span>}
                  {employees.map(e => (
                    <button
                      key={e.id}
                      onClick={() => toggleEmp(e.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                        selectedEmpIds.includes(e.id)
                          ? 'bg-brand text-white border-transparent'
                          : isDarkMode ? 'bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {e.name || 'Unnamed'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Job search + picker */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Job</label>
              {selectedJob ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{selectedJob.label}
                    <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand/15 text-brand">{selectedJob.kind}</span>
                  </span>
                  <button className="text-xs text-brand font-semibold" onClick={() => { setSelectedJob(null); setJobSearch(''); }}>Change</button>
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
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}
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
                <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500">Cost code</label>
                {jobCodes.length === 0 ? (
                  <p className="text-sm text-slate-500">No cost codes available. Add some under the Cost Codes tab.</p>
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
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${
                canClockIn ? 'bg-brand text-white hover:opacity-90' : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Clock size={16} />
              {busy ? 'Working…' : mode === 'crew' ? `Clock in ${targetEmployeeIds.length || ''} ${targetEmployeeIds.length === 1 ? 'person' : 'people'}`.trim() : 'Clock in'}
            </button>
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
              <li key={en.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-lg ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{empById.get(en.employeeId)?.name || `Employee #${en.employeeId}`}</p>
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
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                  >
                    <LogOut size={13} /> Out
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
