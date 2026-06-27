import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Plus, Download, Trash2, Image as ImageIcon, X, Save, Camera, ClipboardList,
  Lock, CheckCircle2, History, Clock,
} from 'lucide-react';
import { Company, Job, User } from '../../types.ts';
import { Employee, ServiceJob } from '../../services/schedulingTypes.ts';
import {
  CostCode, ClockableJob, DailyReport, DailyReportPhoto, DailyReportStatus, TimeEntry,
} from '../../services/timeTrackingTypes.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';
import { dailyReportService, DailyReportInput } from '../../services/dailyReportService.ts';
import { computeDailyReport, generateDailyReportPdf } from './dailyReportPdf.ts';

interface DailyReportViewProps {
  sessionUser: User;
  isAdmin: boolean;
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
  sessionUser, isAdmin, company, jobs, serviceJobs, employees, costCodes, clockableJobs, isDarkMode,
}: DailyReportViewProps) {
  const card = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const input = `w-full px-3 py-3 rounded-lg border text-base ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} disabled:opacity-60`;
  const labelCls = 'block text-xs font-bold uppercase tracking-wide mb-1 text-slate-500';

  const [reports, setReports] = useState<DailyReport[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<DailyReportStatus>('draft');
  const [editingPreparedById, setEditingPreparedById] = useState<string | null>(null);

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
  const [recentJobs, setRecentJobs] = useState<ClockableJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const maxDate = todayLocal();

  // Whether the current login can edit the open report. New reports + own drafts
  // are editable by the preparer; admins can edit anything. A submitted report is
  // locked to its foreman (RLS enforces the same rule server-side).
  const isMine = editingId === null || editingPreparedById === sessionUser.id;
  const canEdit = isAdmin || (isMine && editingStatus === 'draft');
  const locked = !canEdit;

  const myEmployeeId = useMemo(
    () => employees.find(e => e.profileId === sessionUser.id)?.id ?? null,
    [employees, sessionUser.id],
  );

  const loadReports = async () => {
    try { setReports(await dailyReportService.listReports()); }
    catch (err) { console.error('Failed to load daily reports:', err); }
  };
  useEffect(() => { loadReports(); }, []);

  // Recently clocked-into jobs for this foreman (quick-pick). Falls back to the
  // company's recent activity if their login isn't linked to an employee.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await timeTrackingService.listEntries(myEmployeeId != null ? { employeeId: myEmployeeId } : {});
        const seen = new Set<string>();
        const list: ClockableJob[] = [];
        for (const e of entries) {            // listEntries is newest-first
          const key = `${e.jobKind}:${e.jobRef}`;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push(clockableJobs.find(j => j.kind === e.jobKind && j.ref === e.jobRef) ?? { kind: e.jobKind, ref: e.jobRef, label: e.jobLabel });
          if (list.length >= 6) break;
        }
        if (!cancelled) setRecentJobs(list);
      } catch (err) { console.error('Failed to load recent jobs:', err); }
    })();
    return () => { cancelled = true; };
  }, [myEmployeeId, clockableJobs]);

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
  const resolveMetaFor = (jobKind: string, jobRef: string) => {
    if (jobKind === 'dig') {
      const j = jobs.find(x => x.id === jobRef);
      return { projectNumber: j?.jobNumber || '', projectName: j?.jobName || '', customer: j?.siteContact || j?.customer || '' };
    }
    const s = serviceJobs.find(x => String(x.id) === jobRef);
    return { projectNumber: s?.jobNumber || '', projectName: s?.jobName || '', customer: s?.customerName || '' };
  };
  const summary = useMemo(() => {
    if (!selectedJob) return null;
    return computeDailyReport(
      { jobKind: selectedJob.kind, jobRef: selectedJob.ref, reportDate },
      dayEntries, employees, costCodes,
    );
  }, [selectedJob, reportDate, dayEntries, employees, costCodes]);

  const resetForm = () => {
    setEditingId(null);
    setEditingStatus('draft');
    setEditingPreparedById(null);
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
    setEditingStatus(r.status);
    setEditingPreparedById(r.preparedById);
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

  const setDate = (v: string) => setReportDate(v && v > maxDate ? maxDate : v);

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
    if (reportDate > maxDate) { setError('Reports can only be filed for today or a past date.'); return null; }
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
      preparedById: editingPreparedById ?? sessionUser.id,
      preparedByName: editingId ? (reports.find(r => r.id === editingId)?.preparedByName || sessionUser.name) : sessionUser.name,
    };
  };

  const save = async (): Promise<DailyReport | null> => {
    const inputData = buildInput();
    if (!inputData) return null;
    setBusy(true); setError('');
    try {
      const saved = editingId
        ? await dailyReportService.updateReport(editingId, sessionUser.companyId, inputData)
        : await dailyReportService.createReport(sessionUser.companyId, inputData);
      setEditingId(saved.id);
      setEditingPreparedById(saved.preparedById);
      await loadReports();
      return saved;
    } catch (err) {
      console.error('Save report failed:', err);
      setError(err instanceof Error ? err.message : 'Could not save report.');
      return null;
    } finally { setBusy(false); }
  };

  const handleSaveDraft = async () => {
    const saved = await save();
    if (saved) { resetForm(); setMode('list'); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finalize and submit this report? After submitting, only an admin can make changes.')) return;
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try {
      await dailyReportService.submitReport(saved.id);
      await loadReports();
      resetForm();
      setMode('list');
    } catch (err) {
      console.error('Submit failed:', err);
      setError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally { setBusy(false); }
  };

  const handleReopen = async () => {
    if (editingId == null) return;
    setBusy(true); setError('');
    try {
      const r = await dailyReportService.reopenReport(editingId);
      setEditingStatus(r.status);
      await loadReports();
    } catch (err) {
      console.error('Reopen failed:', err);
      setError(err instanceof Error ? err.message : 'Could not reopen report.');
    } finally { setBusy(false); }
  };

  const downloadPdf = async (r: DailyReport) => {
    setBusy(true); setError('');
    try {
      const entriesForReport = await timeTrackingService.listEntries({
        from: new Date(r.reportDate + 'T00:00:00').toISOString(),
        to: new Date(r.reportDate + 'T23:59:59').toISOString(),
      });
      const meta = resolveMetaFor(r.jobKind, r.jobRef);
      await generateDailyReportPdf({
        report: r,
        entries: entriesForReport,
        employees,
        costCodes,
        company: company ? { name: company.name, phone: company.phone, city: company.city, state: company.state, brandColor: company.brandColor } : undefined,
        projectNumber: meta.projectNumber,
        projectName: meta.projectName,
        customer: meta.customer,
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError(err instanceof Error ? err.message : 'Could not generate PDF.');
    } finally { setBusy(false); }
  };

  // From the editor: persist edits first (when allowed) so the PDF reflects them.
  const handleDownloadFromEditor = async () => {
    let r: DailyReport | null = null;
    if (canEdit) r = await save();
    else if (editingId != null) r = reports.find(x => x.id === editingId) ?? null;
    if (r) await downloadPdf(r);
  };

  const removeReport = async (id: number) => {
    if (!confirm('Delete this daily report? This cannot be undone.')) return;
    setBusy(true);
    try { await dailyReportService.deleteReport(id); await loadReports(); }
    catch (err) { console.error('Delete failed:', err); setError(err instanceof Error ? err.message : 'Delete failed.'); }
    finally { setBusy(false); }
  };

  const StatusBadge = ({ status }: { status: DailyReportStatus }) => (
    status === 'submitted'
      ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/15 text-green-600"><CheckCircle2 size={11} /> Submitted</span>
      : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600"><Clock size={11} /> Draft</span>
  );

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
            {reports.map(r => {
              const editable = isAdmin || (r.preparedById === sessionUser.id && r.status === 'draft');
              return (
                <li key={r.id} className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${card}`}>
                  <button className="min-w-0 text-left flex-1" onClick={() => openReport(r)}>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold truncate">{r.jobLabel || 'Job'}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {prettyDate(r.reportDate)}
                      {r.preparedByName && <span className="ml-2">· {r.preparedByName}</span>}
                      {r.photos.length > 0 && <span className="ml-2 inline-flex items-center gap-1"><ImageIcon size={11} /> {r.photos.length}</span>}
                      {r.injuriesCount > 0 && <span className="ml-2 text-red-500 font-semibold">{r.injuriesCount} injury</span>}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => downloadPdf(r)} disabled={busy} title="Download PDF" className="p-2 rounded-lg text-brand hover:bg-brand/10 disabled:opacity-50">
                      <Download size={17} />
                    </button>
                    {editable && (
                      <button onClick={() => removeReport(r.id)} disabled={busy} title="Delete" className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
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
        <span className="flex items-center gap-2 text-sm font-bold text-slate-500">
          {editingId ? 'Edit report' : 'New report'}
          {editingId != null && <StatusBadge status={editingStatus} />}
        </span>
      </div>

      {locked && (
        <div className="px-3 py-2 rounded-lg text-sm bg-slate-500/10 text-slate-500 border border-slate-500/20 flex items-center gap-2">
          <Lock size={15} />
          {editingStatus === 'submitted'
            ? 'This report has been submitted and is locked. Ask an admin to make changes.'
            : 'This report belongs to another foreman. Only they or an admin can edit it.'}
        </div>
      )}
      {error && <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-500 border border-red-500/20">{error}</div>}

      <div className={`rounded-xl border p-4 space-y-4 ${card}`}>
        {/* Job + date */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Job</label>
            {selectedJob ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold truncate">{selectedJob.label}</span>
                {canEdit && <button className="text-sm text-brand font-bold shrink-0" onClick={() => { setSelectedJob(null); setJobSearch(''); }}>Change</button>}
              </div>
            ) : (
              <>
                {/* Recent jobs quick-pick */}
                {recentJobs.length > 0 && (
                  <div className="mb-2">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                      <History size={11} /> Recent jobs
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recentJobs.map(j => (
                        <button key={`${j.kind}:${j.ref}`} onClick={() => { setSelectedJob(j); setJobSearch(''); }}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold border text-left ${isDarkMode ? 'bg-slate-900 border-slate-700 hover:border-brand' : 'bg-slate-50 border-slate-200 hover:border-brand'}`}>
                          {j.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input className={input} placeholder="Search all jobs…" value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
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
            <input type="date" className={input} max={maxDate} disabled={locked} value={reportDate} onChange={e => setDate(e.target.value)} />
            <p className="text-[11px] text-slate-500 mt-1">Today or earlier — future dates aren't allowed.</p>
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
          <textarea className={`${input} min-h-[120px] resize-y`} disabled={locked} placeholder="What got done today? Footage, bores, backfill, equipment, where the crew picks up tomorrow…"
            value={progressSummary} onChange={e => setProgressSummary(e.target.value)} />
        </div>

        {/* Photos */}
        <div>
          <label className={labelCls}>Photos</label>
          {!locked && (
            <>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { handlePhotoFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed font-bold ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600'} ${uploading ? 'opacity-60' : 'hover:border-brand/50 hover:text-brand'}`}>
                <Camera size={18} /> {uploading ? 'Uploading…' : 'Add photos'}
              </button>
            </>
          )}
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {photos.map((p, i) => (
                <div key={p.url} className={`rounded-lg border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className="relative">
                    <img src={p.url} alt={p.caption || 'Site photo'} className="w-full h-28 object-cover" />
                    {!locked && (
                      <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white hover:bg-red-500">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <input className={`w-full px-2 py-1.5 text-xs border-t ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'} disabled:opacity-70`}
                    placeholder="Caption…" value={p.caption} disabled={locked}
                    onChange={e => setPhotos(prev => prev.map((x, idx) => idx === i ? { ...x, caption: e.target.value } : x))} />
                </div>
              ))}
            </div>
          ) : locked ? <p className="text-sm text-slate-500">No photos attached.</p> : null}
        </div>

        {/* Safety + JULIE + injuries */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Safety notes</label>
            <textarea className={`${input} min-h-[80px] resize-y`} disabled={locked} placeholder="Toolbox talks, incidents, near-misses…"
              value={safetyNotes} onChange={e => setSafetyNotes(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>JULIE locates / refreshes needed</label>
            <textarea className={`${input} min-h-[80px] resize-y`} disabled={locked} placeholder="Tickets to call in or refresh…"
              value={locatesNotes} onChange={e => setLocatesNotes(e.target.value)} />
          </div>
        </div>

        <div className="max-w-[180px]">
          <label className={labelCls}>Injuries reported</label>
          <input type="number" min={0} className={input} disabled={locked} value={injuriesCount}
            onChange={e => setInjuriesCount(Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </div>

        <p className="text-xs text-slate-500">Prepared by <b>{editingPreparedById && editingId ? (reports.find(r => r.id === editingId)?.preparedByName || sessionUser.name) : sessionUser.name}</b> · {prettyDate(reportDate)}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleDownloadFromEditor} disabled={busy || !selectedJob}
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-slate-300 disabled:opacity-50">
          <Download size={16} /> Download PDF
        </button>

        {canEdit && editingStatus === 'draft' && (
          <>
            <button onClick={handleSaveDraft} disabled={busy || !selectedJob}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-slate-300 disabled:opacity-50">
              <Save size={16} /> Save draft
            </button>
            <button onClick={handleFinalize} disabled={busy || !selectedJob}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black bg-brand text-white hover:opacity-90 disabled:opacity-50">
              <CheckCircle2 size={16} /> {busy ? 'Working…' : 'Finalize & submit'}
            </button>
          </>
        )}

        {/* Admin editing an already-submitted report */}
        {canEdit && editingStatus === 'submitted' && (
          <>
            <button onClick={async () => { const s = await save(); if (s) { resetForm(); setMode('list'); } }} disabled={busy || !selectedJob}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black bg-brand text-white hover:opacity-90 disabled:opacity-50">
              <Save size={16} /> Save changes
            </button>
            <button onClick={handleReopen} disabled={busy}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-amber-400 text-amber-600 disabled:opacity-50">
              <History size={16} /> Reopen to draft
            </button>
          </>
        )}
      </div>
    </div>
  );
}
