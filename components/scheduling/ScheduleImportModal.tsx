import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, FileSpreadsheet, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import type { Crew, JobOption } from './Scheduler.tsx';

// A single normalized row parsed from the uploaded spreadsheet. `valid` rows are
// the ones that will actually be turned into schedule blocks on import.
export interface ScheduleImportRow {
  crewName:     string;
  jobNumber:    string;
  location:     string;
  startDate:    string;   // ISO YYYY-MM-DD ('' when unparseable)
  durationDays: number;
  rawStart:     string;   // original cell text, kept for error display
  valid:        boolean;
  error?:       string;
}

interface ScheduleImportModalProps {
  crews: Crew[];
  jobs:  JobOption[];
  onImport: (rows: ScheduleImportRow[]) => void;
  onClose: () => void;
}

// ── Header matching ───────────────────────────────────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[\s_\-\/\.#()]/g, ''); }
function findKey(keys: string[], candidates: string[]): string | undefined {
  return keys.find(k => candidates.includes(norm(k)));
}

// ── Date parsing ─────────────────────────────────────────────────────────────
const pad = (n: string | number) => String(n).padStart(2, '0');

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a spreadsheet date cell — handles JS Date objects, ISO, and US-style strings. */
function parseFlexibleDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return dateToISO(v);

  const s = String(v).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD (or with time)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // US: M/D/YYYY, M-D-YY, etc.
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${pad(m[1])}-${pad(m[2])}`;
  }

  // Fallback to the engine's own parser (e.g. "June 26 2026")
  const d = new Date(s);
  if (!isNaN(d.getTime())) return dateToISO(d);
  return null;
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const cleaned = String(v).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

async function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // cellDates lets real date cells come through as JS Date objects.
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function toScheduleRows(
  raw: Record<string, unknown>[],
  jobs: JobOption[],
): ScheduleImportRow[] {
  const jobByNumber = new Map(jobs.map(j => [j.jobNumber.toLowerCase(), j]));

  return raw.map(row => {
    const keys = Object.keys(row);
    const crewKey  = findKey(keys, ['crew', 'crewname', 'team', 'crewid', 'assignedcrew', 'crews']);
    const jobKey   = findKey(keys, ['job', 'jobnumber', 'jobno', 'jobid', 'number', 'wo', 'workorder', 'ticket', 'jobnum']);
    const locKey   = findKey(keys, ['location', 'address', 'site', 'jobsite', 'jobname', 'place', 'description']);
    const startKey = findKey(keys, ['startdate', 'start', 'date', 'begindate', 'scheduleddate', 'startday', 'day']);
    const daysKey  = findKey(keys, ['days', 'duration', 'durationdays', 'length', 'numdays', 'estimateddays', 'estdays', 'jobdays', 'workdays']);

    const crewName  = crewKey ? String(row[crewKey] ?? '').trim() : '';
    const jobNumber = jobKey  ? String(row[jobKey]  ?? '').trim() : '';
    const rawStart  = startKey ? String(row[startKey] ?? '').trim() : '';
    const startDate = startKey ? parseFlexibleDate(row[startKey]) : null;

    const matchedJob = jobByNumber.get(jobNumber.toLowerCase());
    const location  = locKey ? String(row[locKey] ?? '').trim() : (matchedJob?.location ?? '');
    const parsedDays = daysKey ? parseNumber(row[daysKey]) : null;
    const durationDays = Math.max(1, Math.round(parsedDays ?? matchedJob?.estimatedDays ?? 1));

    // Validate
    let error: string | undefined;
    if (!crewName)        error = 'Missing crew';
    else if (!jobNumber)  error = 'Missing job number';
    else if (!startDate)  error = rawStart ? `Unrecognized date "${rawStart}"` : 'Missing start date';

    return {
      crewName,
      jobNumber,
      location,
      startDate: startDate ?? '',
      durationDays,
      rawStart,
      valid: !error,
      error,
    };
  }).filter(r => r.crewName || r.jobNumber || r.rawStart); // drop fully-blank rows
}

function downloadTemplate() {
  const header  = 'crew,jobNumber,location,startDate,days';
  const example = [
    'Alpha Crew,J-1001,123 Main St,2026-07-06,5',
    'Beta Crew,J-1002,456 Oak Ave,2026-07-06,3',
    'Alpha Crew,J-1003,789 Pine Rd,2026-07-13,7',
  ].join('\n');
  const blob = new Blob([`${header}\n${example}`], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'schedule-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function ScheduleImportModal({ crews, jobs, onImport, onClose }: ScheduleImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [rows,       setRows]       = useState<ScheduleImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingCrewNames = useMemo(
    () => new Set(crews.map(c => c.name.trim().toLowerCase())),
    [crews],
  );
  const existingJobNumbers = useMemo(
    () => new Set(jobs.map(j => j.jobNumber.toLowerCase())),
    [jobs],
  );

  const validRows   = rows?.filter(r => r.valid) ?? [];
  const invalidRows = rows?.filter(r => !r.valid) ?? [];

  const newCrewCount = useMemo(() => {
    const names = new Set<string>();
    validRows.forEach(r => {
      const key = r.crewName.toLowerCase();
      if (!existingCrewNames.has(key)) names.add(key);
    });
    return names.size;
  }, [validRows, existingCrewNames]);

  const newJobCount = useMemo(() => {
    const nums = new Set<string>();
    validRows.forEach(r => {
      const key = r.jobNumber.toLowerCase();
      if (!existingJobNumbers.has(key)) nums.add(key);
    });
    return nums.size;
  }, [validRows, existingJobNumbers]);

  const processFile = async (file: File) => {
    setRows(null);
    setParseError(null);
    try {
      const raw = await parseSpreadsheet(file);
      setRows(toScheduleRows(raw, jobs));
    } catch {
      setParseError('Could not parse this file. Make sure it is a valid CSV or Excel spreadsheet.');
    }
  };

  const handleFiles = (files: FileList | null) => { if (files?.length) processFile(files[0]); };

  const doImport = () => {
    if (validRows.length === 0) return;
    onImport(validRows);
    onClose();
  };

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';
  const thCls = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200';
  const tdCls = 'px-3 py-1.5 border-b border-slate-100 text-sm text-slate-700';

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 text-brand">
              <FileSpreadsheet size={16} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Import Schedule</h2>
              <p className="text-xs text-slate-500">Upload a CSV or spreadsheet of scheduled jobs</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"><X size={18} /></button>
        </div>

        {/* Drop zone (shown until a file is parsed) */}
        {!rows && (
          <>
            <div
              className={[
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition',
                isDragging ? 'border-brand bg-brand/5' : 'border-slate-300 hover:border-slate-400',
              ].join(' ')}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={40} className="mx-auto mb-3 text-brand opacity-80" />
              <p className="font-semibold text-slate-800">Drop your schedule here</p>
              <p className="text-sm mt-1 text-slate-500">or click to browse — CSV, XLSX, or XLS</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            <div className="mt-3 text-xs text-slate-500 text-center">
              Expected columns:{' '}
              <code className="font-mono">crew</code>,{' '}
              <code className="font-mono">jobNumber</code>,{' '}
              <code className="font-mono">location</code>,{' '}
              <code className="font-mono">startDate</code>,{' '}
              <code className="font-mono">days</code>
              {' · '}
              <button className="underline hover:opacity-75" onClick={e => { e.stopPropagation(); downloadTemplate(); }}>
                Download template
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 text-center">
              Crews and jobs that don't exist yet will be created automatically.
            </p>

            {parseError && (
              <div className="flex items-start gap-2 p-3 mt-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </>
        )}

        {/* Preview */}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              <span className="text-sm font-medium text-slate-700">
                {validRows.length} job{validRows.length !== 1 ? 's' : ''} ready to import
              </span>
              {(newCrewCount > 0 || newJobCount > 0) && (
                <span className="inline-flex items-center gap-1 text-xs text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                  <Sparkles size={11} />
                  {[
                    newCrewCount > 0 ? `${newCrewCount} new crew${newCrewCount !== 1 ? 's' : ''}` : null,
                    newJobCount > 0 ? `${newJobCount} new job${newJobCount !== 1 ? 's' : ''}` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
              {invalidRows.length > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {invalidRows.length} skipped
                </span>
              )}
              <button onClick={() => { setRows(null); setParseError(null); }} className="ml-auto text-xs underline text-slate-500">
                Change file
              </button>
            </div>

            <div className="overflow-auto max-h-64 rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className={thCls}>Crew</th>
                    <th className={thCls}>Job #</th>
                    <th className={thCls}>Location</th>
                    <th className={thCls}>Start</th>
                    <th className={`${thCls} text-right`}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isNewCrew = r.crewName && !existingCrewNames.has(r.crewName.toLowerCase());
                    const isNewJob  = r.jobNumber && !existingJobNumbers.has(r.jobNumber.toLowerCase());
                    return (
                      <tr key={i} className={r.valid ? '' : 'bg-amber-50/60'}>
                        <td className={tdCls}>
                          <span className="inline-flex items-center gap-1.5">
                            {r.crewName || <span className="text-slate-400">—</span>}
                            {isNewCrew && r.valid && <span className="text-[9px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">NEW</span>}
                          </span>
                        </td>
                        <td className={tdCls}>
                          <span className="inline-flex items-center gap-1.5">
                            {r.jobNumber || <span className="text-slate-400">—</span>}
                            {isNewJob && r.valid && <span className="text-[9px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">NEW</span>}
                          </span>
                        </td>
                        <td className={`${tdCls} max-w-[180px] truncate`} title={r.location}>{r.location || <span className="text-slate-400">—</span>}</td>
                        <td className={tdCls}>
                          {r.valid
                            ? fmtDate(r.startDate)
                            : <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle size={12} /> {r.error}</span>}
                        </td>
                        <td className={`${tdCls} text-right tabular-nums`}>{r.durationDays}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={validRows.length === 0}
                className="flex-1 py-2 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-50 transition hover:opacity-90"
              >
                Import {validRows.length} job{validRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Empty parse result */}
        {rows && rows.length === 0 && (
          <div className="text-sm text-center py-6 space-y-2 text-slate-500">
            <p>No rows found. Make sure the file has a header row with at least:</p>
            <p>
              <code className="font-mono text-xs">crew</code>{', '}
              <code className="font-mono text-xs">jobNumber</code>{', '}
              <code className="font-mono text-xs">startDate</code>
            </p>
            <button className="underline text-xs mt-1" onClick={() => { setRows(null); setParseError(null); }}>Try another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
