import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Plus, Download, Trash2, Image as ImageIcon, X, Save, Camera, ClipboardList,
} from 'lucide-react';
import { Company, Job, User } from '../../types.ts';
import { Employee, ServiceJob } from '../../services/schedulingTypes.ts';
import { CostCode, ClockableJob, DailyReport, DailyReportPhoto, TimeEntry } from '../../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';
import { dailyReportService, DailyReportInput } from '../../services/dailyReportService.ts';
import { computeDailyReport, generateDailyReportPdf } from './dailyReportPdf.ts';

interface DailyReportViewProps {
  sessionUser: User;
  company?: Company;
  jobs: Job[];
  serviceJobs: ServiceJob[];
  employees: Employee[];
  costCodes: CostCode[];
  clockableJobs: ClockableJob[];
  isDarkMode?: boolean;
}

const todayLocal = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

const prettyDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function DailyReportView({
  sessionUser, company, jobs, serviceJobs, employees, costCodes, clockableJobs, isDarkMode,
}: DailyReportViewProps) {
  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `w-full px-3 py-3 rounded-lg border text-base ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;
  const labelCls = 'block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500';

  const [reports, setReports] = useState<DailyReport[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);

  // form state
  const [selectedJob, setSelectedJob] = useState<ClockableJob | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [reportDate, setReportDate] = useState(todayLocal());
  const [progressSummary, setProgressSummary] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');
  const [locatesNotes, setLocatesNotes] = useState('');
  const [injuriesCount, setInjuriesCount] = useState(0);
  const [photos, setPhotos] = useState<DailyReportPhoto[]>([]);

  const [dayEntries, setDayEntries] = useState<TimeEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReports = async () => {
    try { setReports(await dailyReportService.listReports()); }
    catch (err) { console.error('Failed to load daily reports:', err); }
  };
  useEffect(() => { loadReports(); }, []);

  // Pull the selected job + day's time entries (for the live summary + PDF).
  useEffect(() => {
    if (!selectedJob || !reportDate) { setDayEntries([]); return; }
    let cancelled = false;
    timeTrackingService.listEntries({
      from: new Date(reportDate + 'T00:00:00').toISOString(),
      to: new Date(reportDate + 'T23:59:59').toISOString(),
    })
      .then(list => { if (!cancelled) setDayEntries(list); })
      .catch(err => console.error('Failed to load entries for report:', err));
    return () => { cancelled = true; };
  }, [selectedJob, reportDate]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return (q ? clockableJobs.filter(j => j.label.toLowerCase().includes(q)) : clockableJobs).slice(0, 25);
  }, [jobSearch, clockableJobs]);

  // Resolve project number / name / customer for the header from the source job.
  const jobMeta = useMemo(() => {
    if (!selectedJob) return { projectNumber: '', projectName: '', customer: '' };
    if (selectedJob.kind === 'dig') {
      const j = jobs.find(x => x.id === selectedJob.ref);
      return {
        projectNumber: j?.jobNumber || '',
        projectName: j?.jobName || '',
        customer: j?.siteContact || j?.customer || '',
      };
    }
    const s = serviceJobs.find(x => String(x.id) === selectedJob.ref);
    return {
      projectNumber: s?.jobNumber || '',
      projectName: s?.jobName || '',
      customer: s?.customerName || '',
    };
  }, [selectedJob, jobs, serviceJobs]);

  const summary = useMemo(() => {
    if (!selectedJob) return null;
    return computeDailyReport(
      { jobKind: selectedJob.kind, jobRef: selectedJob.ref, reportDate },
      dayEntries, employees, costCodes,
    );
  }, [selectedJob, reportDate, dayEntries, employees, costCodes]);

  const resetForm = () => {
    setEditingId(null);
    setSelectedJob(null);
    setJobSearch('');
    setReportDate(todayLocal());
    setProgressSummary('');
    setSafetyNotes('');
    setLocatesNotes('');
    setInjuriesCount(0);
    setPhotos([]);
    setError('');
  };

  const startNew = () => { resetForm(); setMode('edit'); };

  const openReport = (r: DailyReport) => {
    setEditingId(r.id);
    setSelectedJob(clockableJobs.find(j => j.kind === r.jobKind && j.ref === r.jobRef) ?? { kind: r.jobKind, ref: r.jobRef, label: r.jobLabel });
    setReportDate(r.reportDate);
    setProgressSummary(r.progressSummary);
    setSafetyNotes(r.safetyNotes);
    setLocatesNotes(r.locatesNotes);
    setInjuriesCount(r.injuriesCount);
    setPhotos(r.photos);
    setError('');
    setMode('edit');
  };

  const handlePhotoFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true); setError('');
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const url = await dailyReportService.uploadPhoto(sessionUser.companyId, file);
        setPhotos(prev => [...prev, { url, caption: '' }]);
      }
    } catch (err) {
      console.error('Photo upload failed:', err);
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally { setUploading(false); }
  };

  const buildInput = (): DailyReportInput | null => {
    if (!selectedJob) { setError('Pick a job first.'); return null; }
    return {
      jobKind: selectedJob.kind,
      jobRef: selectedJob.ref,
      jobLabel: selectedJob.label,
      reportDate,
      progressSummary: progressSummary.trim(),
      safetyNotes: safetyNotes.trim(),
      locatesNotes: locatesNotes.trim(),
      injuriesCount: Math.max(0, injuriesCount || 0),
      photos,
      preparedById: sessionUser.id,
      preparedByName: sessionUser.name,
    };
  };

  const handleSave = async (): Promise<DailyReport | null> => {
    const inputData = buildInput();
    if (!inputData) return null;
    setBusy(true); setError('');
    try {
      const saved = editingId
        ? await dailyReportService.updateReport(editingId, sessionUser.companyId, inputData)
        : await dailyReportService.createReport(sessionUser.companyId, inputData);
      setEditingId(saved.id);
      await loadReports();
      return saved;
    } catch (err) {
      console.error('Save report failed:', err);
      setError(err instanceof Error ? err.message : 'Could not save report.');
      return null;
    } finally { setBusy(false); }
  };

  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (saved) { resetForm(); setMode('list'); }
  };

  const downloadPdf = async (r: DailyReport, meta = jobMeta, entries = dayEntries) => {
    setBusy(true); setError('');
    try {
      // Ensure we have that report's entries (when downloading from the list).
      let entriesForReport = entries;
      if (entries.length === 0 || (selectedJob && (selectedJob.kind !== r.jobKind || selectedJob.ref !== r.jobRef))) {
        entriesForReport = await timeTrackingService.listEntries({
          from: new Date(r.reportDate + 'T00:00:00').toISOString(),
          to: new Date(r.reportDate + 'T23:59:59').toISOString(),
        });
      }
      const resolvedMeta = meta.projectNumber || meta.projectName ? meta : resolveMetaFor(r);
      await generateDailyReportPdf({
        report: r,
        entries: entriesForReport,
        employees,
        costCodes,
        company: company ? { name: company.name, phone: company.phone, city: company.city, state: company.state, brandColor: company.brandColor } : undefined,
        projectNumber: resolvedMeta.projectNumber,
        projectName: resolvedMeta.projectName,
        customer: resolvedMeta.customer,
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError(err instanceof Error ? err.message : 'Could not generate PDF.');
    } finally { setBusy(false); }
  };

  const resolveMetaFor = (r: DailyReport) => {
    if (r.jobKind === 'dig') {
      const j = jobs.find(x => x.id === r.jobRef);
      return { projectNumber: j?.jobNumber || '', projectName: j?.jobName || '', customer: j?.siteContact || j?.customer || '' };
    }
    const s = serviceJobs.find(x => String(x.id) === r.jobRef);
    return { projectNumber: s?.jobNumber || '', projectName: s?.jobName || '', customer: s?.customerName || '' };
  };

  const handleSaveAndPdf = async () => {
    const saved = await handleSave();
    if (saved) await downloadPdf(saved, jobMeta, dayEntries);
  };

  const removeReport = async (id: number) => {
    if (!confirm('Delete this daily report? This cannot be undone.')) return;
    setBusy(true);
    try { await dailyReportService.deleteReport(id); await loadReports(); }
    catch (err) { console.error('Delete failed:', err); }
    finally { setBusy(false); }
  };

  // ── List view ──────────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <ClipboardList size={16} /> Daily Reports
          </h3>
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-brand text-white hover:opacity-90">
            <Plus size={16} /> New report
          </button>
        </div>

        {reports.length === 0 ? (
          <div className={`rounded-xl border p-8 text-center ${card}`}>
            <FileText size={32} className="mx-auto mb-3 text-slate-400" />
            <p className="text-sm text-slate-500">No daily reports yet. Tap <b>New report</b> to log today's progress.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map(r => (
              <li key={r.id} className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${card}`}>
                <button className="min-w-0 text-left flex-1" onClick={() => openReport(r)}>
                  <p className="text-base font-bold truncate">{r.jobLabel || 'Job'}</p>
                  <p className="text-xs text-slate-500">
                    {prettyDate(r.reportDate)}
                    {r.photos.length > 0 && <span className="ml-2 inline-flex items-center gap-1"><ImageIcon size={11} /> {r.photos.length}</span>}
                    {r.injuriesCount > 0 && <span className="ml-2 text-red-500 font-semibold">{r.injuriesCount} injury{r.injuriesCount > 1 ? '' : ''}</span>}
                  </p>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => downloadPdf(r)} disabled={busy} title="Download PDF" className="p-2 rounded-lg text-brand hover:bg-brand/10 disabled:opacity-50">
                    <Download size={17} />
                  </button>
                  <button onClick={() => removeReport(r.id)} disabled={busy} title="Delete" className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-500 border border-red-500/20">{error}</div>}
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────────────────────--
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { resetForm(); setMode('list'); }} className="text-sm font-bold text-slate-500 hover:text-brand">
          ← All reports
        </button>
        <span className="text-sm font-bold text-slate-500">{editingId ? 'Edit report' : 'New report'}</span>
      </div>

      {error && <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-500 border border-red-500/20">{error}</div>}

      <div className={`rounded-xl border p-4 space-y-4 ${card}`}>
        {/* Job + date */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Job</label>
            {selectedJob ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold truncate">{selectedJob.label}</span>
                <button className="text-sm text-brand font-bold shrink-0" onClick={() => { setSelectedJob(null); setJobSearch(''); }}>Change</button>
              </div>
            ) : (
              <>
                <input className={input} placeholder="Search jobs…" value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
                {jobSearch && (
                  <div className={`mt-1 max-h-52 overflow-y-auto rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    {filteredJobs.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No matching jobs.</div>}
                    {filteredJobs.map(j => (
                      <button key={`${j.kind}:${j.ref}`} onClick={() => { setSelectedJob(j); setJobSearch(''); }}
                        className={`w-full text-left px-3 py-3 text-base ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                        {j.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={input} value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </div>
        </div>

        {/* Live summary pulled from time entries */}
        {selectedJob && summary && (
          <div className="grid grid-cols-3 gap-2">
            {[
              ['On site', String(summary.employeesOnSite)],
              ['Hours', summary.totalHours],
              ['Entries', String(summary.entryRows.length)],
            ].map(([label, val]) => (
              <div key={label} className={`rounded-lg p-3 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                <p className="text-lg font-black">{val}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}
        {selectedJob && summary && summary.entryRows.length === 0 && (
          <p className="text-xs text-slate-500">No time entries logged for this job on {prettyDate(reportDate)}. Crew hours will appear once they clock in.</p>
        )}

        {/* Progress summary */}
        <div>
          <label className={labelCls}>Progress Summary</label>
          <textarea className={`${input} min-h-[120px] resize-y`} placeholder="What got done today? Footage, bores, backfill, equipment, where the crew picks up tomorrow…"
            value={progressSummary} onChange={e => setProgressSummary(e.target.value)} />
        </div>

        {/* Photos */}
        <div>
          <label className={labelCls}>Photos</label>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { handlePhotoFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed font-bold ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600'} ${uploading ? 'opacity-60' : 'hover:border-brand/50 hover:text-brand'}`}>
            <Camera size={18} /> {uploading ? 'Uploading…' : 'Add photos'}
          </button>
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {photos.map((p, i) => (
                <div key={p.url} className={`rounded-lg border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className="relative">
                    <img src={p.url} alt={p.caption || 'Site photo'} className="w-full h-28 object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white hover:bg-red-500">
                      <X size={14} />
                    </button>
                  </div>
                  <input className={`w-full px-2 py-1.5 text-xs border-t ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                    placeholder="Caption…" value={p.caption}
                    onChange={e => setPhotos(prev => prev.map((x, idx) => idx === i ? { ...x, caption: e.target.value } : x))} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Safety + JULIE + injuries */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Safety notes</label>
            <textarea className={`${input} min-h-[80px] resize-y`} placeholder="Toolbox talks, incidents, near-misses…"
              value={safetyNotes} onChange={e => setSafetyNotes(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>JULIE locates / refreshes needed</label>
            <textarea className={`${input} min-h-[80px] resize-y`} placeholder="Tickets to call in or refresh…"
              value={locatesNotes} onChange={e => setLocatesNotes(e.target.value)} />
          </div>
        </div>

        <div className="max-w-[180px]">
          <label className={labelCls}>Injuries reported</label>
          <input type="number" min={0} className={input} value={injuriesCount}
            onChange={e => setInjuriesCount(Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </div>

        <p className="text-xs text-slate-500">Prepared by <b>{sessionUser.name}</b> · {prettyDate(reportDate)}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleSaveAndClose} disabled={busy || !selectedJob}
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-slate-300 disabled:opacity-50">
          <Save size={16} /> Save
        </button>
        <button onClick={handleSaveAndPdf} disabled={busy || !selectedJob}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black bg-brand text-white hover:opacity-90 disabled:opacity-50">
          <Download size={16} /> {busy ? 'Working…' : 'Save & download PDF'}
        </button>
      </div>
    </div>
  );
}
