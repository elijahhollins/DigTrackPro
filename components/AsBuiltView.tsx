
import React, { useState, useCallback } from 'react';
import { Job, JobPrint, User } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import PdfMarkupEditor from './PdfMarkupEditor.tsx';

interface AsBuiltViewProps {
  jobs: Job[];
  sessionUser: User;
  isAdmin: boolean;
  isDarkMode: boolean;
  onDeleteJob: (id: string) => Promise<void>;
}

interface JobPrintsState {
  prints: JobPrint[];
  isLoading: boolean;
  loaded: boolean;
}

export const AsBuiltView: React.FC<AsBuiltViewProps> = ({ jobs, sessionUser, isAdmin, isDarkMode, onDeleteJob }) => {
  const [search, setSearch] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [printsMap, setPrintsMap] = useState<Record<string, JobPrintsState>>({});
  const [markupPrint, setMarkupPrint] = useState<JobPrint | null>(null);
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const filteredJobs = jobs.filter((job) => {
    const q = search.toLowerCase();
    return (
      job.jobNumber.toLowerCase().includes(q) ||
      job.customer.toLowerCase().includes(q) ||
      job.address.toLowerCase().includes(q)
    );
  });

  const loadPrints = useCallback(async (jobNumber: string) => {
    setPrintsMap((prev) => ({
      ...prev,
      [jobNumber]: { prints: prev[jobNumber]?.prints ?? [], isLoading: true, loaded: false },
    }));
    try {
      const prints = await apiService.getJobPrints(jobNumber);
      setPrintsMap((prev) => ({
        ...prev,
        [jobNumber]: { prints, isLoading: false, loaded: true },
      }));
    } catch {
      setPrintsMap((prev) => ({
        ...prev,
        [jobNumber]: { prints: [], isLoading: false, loaded: true },
      }));
    }
  }, []);

  const toggleJob = (jobNumber: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobNumber)) {
        next.delete(jobNumber);
      } else {
        next.add(jobNumber);
        if (!printsMap[jobNumber]?.loaded) {
          loadPrints(jobNumber);
        }
      }
      return next;
    });
  };

  const getDownloadUrl = (print: JobPrint): string => {
    if (!print.url) return '';
    const baseUrl = print.url.split('?')[0];
    return `${baseUrl}?download=${encodeURIComponent(print.fileName)}`;
  };

  const handleDownload = (print: JobPrint) => {
    if (!print.url) return;
    const downloadUrl = getDownloadUrl(print);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = print.fileName;
    if (isMobile) {
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    } else {
      link.click();
    }
  };

  const handleOpen = (print: JobPrint) => {
    if (!print.url) return;
    window.open(print.url, '_blank');
  };

  const handleUpload = async (job: Job, file: File) => {
    if (!file.type.includes('pdf')) {
      alert('Please upload a PDF file');
      return;
    }
    setIsUploading((prev) => ({ ...prev, [job.jobNumber]: true }));
    try {
      await apiService.uploadJobPrint(job.jobNumber, file, job.companyId);
      await loadPrints(job.jobNumber);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Upload failed: ' + msg);
    } finally {
      setIsUploading((prev) => ({ ...prev, [job.jobNumber]: false }));
    }
  };

  if (markupPrint) {
    return (
      <PdfMarkupEditor
        print={markupPrint}
        sessionUser={sessionUser}
        onClose={() => setMarkupPrint(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            As Built Editor
          </h1>
          <p className={`text-xs uppercase tracking-wider mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Browse jobs and manage PDF prints
          </p>
        </div>
        {/* Search */}
        <div className="relative sm:w-72">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all ${
              isDarkMode
                ? 'bg-white/[0.05] border-white/10 text-white placeholder-slate-500 focus:border-brand/40 focus:bg-white/[0.08]'
                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-brand/50 focus:ring-1 focus:ring-brand/20'
            }`}
          />
        </div>
      </div>

      {/* Job list */}
      {filteredJobs.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-24 text-center rounded-2xl border ${isDarkMode ? 'border-white/[0.05] bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
          <svg className={`w-12 h-12 mb-4 ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No Jobs Found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map((job) => {
            const isExpanded = expandedJobs.has(job.jobNumber);
            const state = printsMap[job.jobNumber];
            const uploading = isUploading[job.jobNumber] ?? false;

            return (
              <div
                key={job.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  isDarkMode
                    ? 'bg-white/[0.03] border-white/[0.07] hover:border-brand/30'
                    : 'bg-white border-slate-200 hover:border-brand/30'
                }`}
              >
                {/* Job row */}
                <div className="flex items-center">
                  <button
                    className="flex-1 flex items-center gap-4 px-5 py-4 text-left transition-all min-w-0"
                    onClick={() => toggleJob(job.jobNumber)}
                  >
                    {/* Expand chevron */}
                    <svg
                      className={`w-4 h-4 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>

                    {/* PDF icon */}
                    <div className="w-9 h-9 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                      <svg className="w-4.5 h-4.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Job #{job.jobNumber}
                      </p>
                      <p className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {job.customer} — {job.address}, {job.city}
                      </p>
                    </div>

                    {state?.loaded && (
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0 ${
                        state.prints.length > 0
                          ? 'bg-brand/10 text-brand'
                          : isDarkMode ? 'bg-white/[0.05] text-slate-500' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {state.prints.length} {state.prints.length === 1 ? 'PDF' : 'PDFs'}
                      </span>
                    )}
                  </button>

                  {/* Admin delete button */}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete Job #${job.jobNumber}? This cannot be undone.`)) {
                          onDeleteJob(job.id);
                        }
                      }}
                      className="p-3 mr-3 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shrink-0"
                      title="Delete job"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className={`border-t px-5 py-5 ${isDarkMode ? 'border-white/[0.05]' : 'border-slate-100'}`}>
                    {/* Upload button for admins */}
                    {isAdmin && (
                      <div className="flex justify-end mb-4">
                        <label className={`cursor-pointer px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'} bg-brand text-slate-900 shadow-md shadow-brand/20`}>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(job, file);
                              e.target.value = '';
                            }}
                          />
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {uploading ? 'Uploading…' : 'Upload PDF'}
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Loading state */}
                    {state?.isLoading && (
                      <div className="flex items-center justify-center py-10 gap-3">
                        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        <span className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading…</span>
                      </div>
                    )}

                    {/* Empty state */}
                    {state?.loaded && state.prints.length === 0 && !state.isLoading && (
                      <div className="flex flex-col items-center py-10 text-center">
                        <svg className={`w-10 h-10 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No PDFs Uploaded</p>
                      </div>
                    )}

                    {/* PDF list */}
                    {state?.loaded && state.prints.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {state.prints.map((print) => (
                          <div
                            key={print.id}
                            className={`rounded-xl border p-4 transition-all ${
                              isDarkMode
                                ? 'bg-white/[0.03] border-white/[0.07] hover:border-brand/30'
                                : 'bg-slate-50 border-slate-200 hover:border-brand/30'
                            }`}
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-9 h-9 bg-brand/10 rounded-lg flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-brand" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`} title={print.fileName}>
                                  {print.fileName}
                                </p>
                                <p className={`text-[10px] uppercase tracking-wider mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {new Date(print.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => setMarkupPrint(print)}
                                className="flex-1 px-3 py-2 bg-brand text-slate-900 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Markup
                              </button>
                              <button
                                onClick={() => handleOpen(print)}
                                className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${
                                  isDarkMode
                                    ? 'bg-slate-800 text-white border border-white/10 hover:bg-slate-700'
                                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Open
                              </button>
                              <button
                                onClick={() => handleDownload(print)}
                                className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${
                                  isDarkMode
                                    ? 'bg-slate-800 text-white border border-white/10 hover:bg-slate-700'
                                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AsBuiltView;
