
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { JobPhoto, Job, DigTicket } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Field Docs — Professional photo & document hub for construction & excavation
// ─────────────────────────────────────────────────────────────────────────────

interface PhotoManagerProps {
  photos: JobPhoto[];
  jobs: Job[];
  tickets: DigTicket[];
  initialSearch?: string | null;
  isDarkMode?: boolean;
  isAdmin?: boolean;
  companyId: string;
  onAddPhoto: (photo: Omit<JobPhoto, 'id' | 'dataUrl' | 'companyId'>, file: File) => Promise<JobPhoto>;
  onDeletePhoto: (id: string) => void;
  onDeleteJob?: (jobId: string) => void;
}

interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
}

type UnifiedAsset = (JobPhoto & { type: 'photo' }) | {
  id: string;
  jobNumber: string;
  dataUrl: string;
  timestamp: number;
  caption: string;
  type: 'ticket';
  ticketNo: string;
};

type AssetFilter = 'all' | 'photos' | 'tickets';

// ─────────────────────────────────────────────────────────────────────────────

const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  jobs,
  tickets,
  initialSearch = null,
  isDarkMode,
  isAdmin,
  onAddPhoto,
  onDeletePhoto,
  onDeleteJob,
}) => {
  const [selectedJobNumber, setSelectedJobNumber] = useState<string | null>(initialSearch || null);
  const [assetFilter, setAssetFilter]             = useState<AssetFilter>('all');
  const [hubSearch, setHubSearch]                 = useState('');
  const [jobSearch, setJobSearch]                 = useState('');
  const [activePhotoIndex, setActivePhotoIndex]   = useState<number | null>(null);
  const [selectionMode, setSelectionMode]         = useState(false);
  const [selectedIds, setSelectedIds]             = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading]             = useState(false);
  const [uploadQueue, setUploadQueue]             = useState<UploadQueueItem[]>([]);
  const [isDraggingOver, setIsDraggingOver]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSearch) setSelectedJobNumber(initialSearch);
  }, [initialSearch]);

  // ── Data ───────────────────────────────────────────────────────────────────

  const folderData = useMemo(() => {
    const groups: Record<string, UnifiedAsset[]> = {};
    jobs.forEach(j => { if (j.jobNumber && !groups[j.jobNumber]) groups[j.jobNumber] = []; });
    photos.forEach(p => {
      if (!groups[p.jobNumber]) groups[p.jobNumber] = [];
      groups[p.jobNumber].push({ ...p, type: 'photo' });
    });
    tickets.forEach(t => {
      if (t.documentUrl && t.jobNumber) {
        if (!groups[t.jobNumber]) groups[t.jobNumber] = [];
        groups[t.jobNumber].push({
          id: t.id,
          jobNumber: t.jobNumber,
          dataUrl: t.documentUrl,
          timestamp: t.createdAt,
          caption: `Ticket Doc: ${t.ticketNo}`,
          type: 'ticket',
          ticketNo: t.ticketNo,
        });
      }
    });
    return groups;
  }, [photos, jobs, tickets]);

  const filteredJobs = useMemo(() => {
    const q = hubSearch.toLowerCase();
    return [...jobs]
      .filter(j =>
        !q ||
        j.jobNumber.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.address.toLowerCase().includes(q) ||
        j.city.toLowerCase().includes(q),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [jobs, hubSearch]);

  const currentAssets = useMemo(() => {
    if (!selectedJobNumber) return [];
    let assets = [...(folderData[selectedJobNumber] || [])];
    if (assetFilter === 'photos')  assets = assets.filter(a => a.type === 'photo');
    if (assetFilter === 'tickets') assets = assets.filter(a => a.type === 'ticket');
    const q = jobSearch.toLowerCase();
    if (q) assets = assets.filter(a => a.caption.toLowerCase().includes(q));
    return assets.sort((a, b) => b.timestamp - a.timestamp);
  }, [folderData, selectedJobNumber, assetFilter, jobSearch]);

  const currentJob = useMemo(
    () => jobs.find(j => j.jobNumber === selectedJobNumber),
    [jobs, selectedJobNumber],
  );

  const stats = useMemo(() => ({
    totalPhotos:    photos.length,
    totalDocs:      tickets.filter(t => t.documentUrl).length,
    jobsWithMedia:  Object.values(folderData).filter(arr => arr.length > 0).length,
  }), [photos, tickets, folderData]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleJobSelect = (jobNumber: string) => {
    setSelectedJobNumber(jobNumber);
    setAssetFilter('all');
    setJobSearch('');
    setSelectionMode(false);
    setSelectedIds(new Set());
    setActivePhotoIndex(null);
  };

  const handleJobBack = () => {
    setSelectedJobNumber(null);
    setAssetFilter('all');
    setJobSearch('');
    setSelectionMode(false);
    setSelectedIds(new Set());
    setActivePhotoIndex(null);
  };

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const photoIds = Array.from(selectedIds).filter(id =>
      currentAssets.find(a => a.id === id && a.type === 'photo'),
    );
    if (photoIds.length === 0) {
      alert('Ticket documents cannot be deleted here. Manage them via Job Review.');
      return;
    }
    if (!confirm(`Permanently delete ${photoIds.length} photo${photoIds.length !== 1 ? 's' : ''}?`)) return;
    for (const id of photoIds) await onDeletePhoto(id);
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const processBatch = async (files: File[]) => {
    if (!selectedJobNumber) { alert('Select a job first.'); return; }
    setIsUploading(true);
    const newItems: UploadQueueItem[] = files.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      progress: 0,
      status: 'pending',
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
    for (const item of newItems) {
      setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        const timer = setInterval(() => {
          setUploadQueue(cur =>
            cur.map(q => q.id === item.id ? { ...q, progress: Math.min(q.progress + 15, 90) } : q),
          );
        }, 150);
        await onAddPhoto(
          { jobNumber: selectedJobNumber, timestamp: Date.now(), caption: `Site Photo ${new Date().toLocaleDateString()}` },
          item.file,
        );
        clearInterval(timer);
        setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'complete', progress: 100 } : q));
      } catch {
        setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
      }
    }
    setIsUploading(false);
    setTimeout(() => setUploadQueue(prev => prev.filter(q => q.status !== 'complete')), 4000);
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); };
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) processBatch(files);
  };

  // ── Lightbox keyboard nav ──────────────────────────────────────────────────

  useEffect(() => {
    if (activePhotoIndex === null) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setActivePhotoIndex(i => i !== null && i < currentAssets.length - 1 ? i + 1 : i);
      if (e.key === 'ArrowLeft')  setActivePhotoIndex(i => i !== null && i > 0 ? i - 1 : i);
      if (e.key === 'Escape')     setActivePhotoIndex(null);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [activePhotoIndex, currentAssets.length]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const isPdf = (url: string) => url?.toLowerCase().includes('.pdf');
  const dm    = isDarkMode;

  // Shared style shorthands
  const surface  = dm ? 'bg-slate-800/60 border-white/[0.06]'          : 'bg-white border-slate-200 shadow-sm';
  const tp       = dm ? 'text-white'                                    : 'text-slate-900';
  const ts       = dm ? 'text-slate-400'                                : 'text-slate-500';
  const tm       = dm ? 'text-slate-500'                                : 'text-slate-400';
  const inputCls = dm
    ? 'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-brand/40'
    : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-brand/50 focus:ring-1 focus:ring-brand/20';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col -mt-2 h-[calc(100vh-140px)] overflow-hidden"
      onDragOver={selectedJobNumber && isAdmin ? handleDragOver : undefined}
      onDragLeave={selectedJobNumber && isAdmin ? handleDragLeave : undefined}
      onDrop={selectedJobNumber && isAdmin ? handleDrop : undefined}
    >

      {/* ── Drag overlay ──────────────────────────────────────────────────── */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-[300] pointer-events-none flex items-center justify-center">
          <div className="absolute inset-4 rounded-3xl border-4 border-dashed border-brand/50 bg-brand/5 backdrop-blur-sm" />
          <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-3xl px-12 py-10 text-center border border-brand/30 shadow-2xl">
            <svg className="w-14 h-14 text-brand mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-white font-black text-base uppercase tracking-widest">Drop to Upload</p>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">Images will be added to this job</p>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`shrink-0 mb-5 rounded-2xl border p-4 ${surface}`}>
        {selectedJobNumber ? (
          /* ─ Job detail header ─ */
          <div className="flex flex-col gap-3">
            {/* Breadcrumb row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                onClick={handleJobBack}
                className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-colors ${ts} hover:text-brand`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Field Docs</span>
                <span className={tm}>/</span>
                <span className="text-brand">Job #{selectedJobNumber}</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Selection mode toggle */}
                <button
                  onClick={() => { setSelectionMode(s => !s); setSelectedIds(new Set()); }}
                  title="Toggle selection mode"
                  className={`p-1.5 rounded-lg border transition-all ${
                    selectionMode
                      ? 'bg-brand text-white border-brand shadow-md shadow-brand/20'
                      : dm
                        ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </button>

                {/* Upload button (admin + photos filter) */}
                {isAdmin && assetFilter !== 'tickets' && (
                  <label
                    className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand text-white font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-md shadow-brand/20 ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => { processBatch(Array.from(e.target.files || [])); e.target.value = ''; }}
                    />
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                    </svg>
                    {isUploading ? 'Uploading…' : 'Upload Photos'}
                  </label>
                )}
              </div>
            </div>

            {/* Job info strip */}
            {currentJob && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-sm uppercase tracking-wider truncate ${tp}`}>{currentJob.customer}</p>
                  <p className={`text-xs truncate ${ts}`}>{currentJob.address}, {currentJob.city}</p>
                </div>
                {currentJob.isComplete && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest shrink-0">
                    Complete
                  </span>
                )}
              </div>
            )}

            {/* Filter tabs + search */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'photos', 'tickets'] as AssetFilter[]).map(f => {
                const allAssets = folderData[selectedJobNumber!] || [];
                const count =
                  f === 'all'     ? allAssets.length :
                  f === 'photos'  ? allAssets.filter(a => a.type === 'photo').length :
                                    allAssets.filter(a => a.type === 'ticket').length;
                const label =
                  f === 'all'     ? 'All' :
                  f === 'photos'  ? 'Photos' :
                                    'Ticket Docs';
                return (
                  <button
                    key={f}
                    onClick={() => setAssetFilter(f)}
                    className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all border ${
                      assetFilter === f
                        ? 'bg-brand text-white border-brand shadow-md shadow-brand/20'
                        : dm
                          ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}&nbsp;<span className="opacity-50">({count})</span>
                  </button>
                );
              })}
              <div className="flex-1 min-w-0" />
              {/* Per-job search */}
              <div className="relative">
                <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${tm}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search assets…"
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  className={`pl-8 pr-3 py-1.5 rounded-lg text-xs font-medium border outline-none transition-all w-36 sm:w-48 ${inputCls}`}
                />
              </div>
            </div>
          </div>
        ) : (
          /* ─ Hub header ─ */
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className={`font-black text-sm uppercase tracking-widest ${tp}`}>Field Docs</h1>
                <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${tm}`}>
                    {stats.totalPhotos} Photos
                  </span>
                  <span className={`w-0.5 h-0.5 rounded-full ${dm ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider ${tm}`}>
                    {stats.totalDocs} Ticket Docs
                  </span>
                  <span className={`w-0.5 h-0.5 rounded-full ${dm ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider ${tm}`}>
                    {stats.jobsWithMedia} Jobs with Files
                  </span>
                </div>
              </div>
            </div>
            {/* Hub search */}
            <div className="relative sm:w-60">
              <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${tm}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search jobs…"
                value={hubSearch}
                onChange={e => setHubSearch(e.target.value)}
                className={`w-full pl-9 pr-4 py-2 rounded-xl text-sm font-medium border outline-none transition-all ${inputCls}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">

        {!selectedJobNumber ? (
          /* ────────────────────── HUB: job card grid ─────────────────────── */
          filteredJobs.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-24 text-center rounded-2xl border ${dm ? 'border-white/[0.05] bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
              <svg className={`w-14 h-14 mb-4 ${dm ? 'text-slate-700' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className={`font-black text-sm uppercase tracking-widest ${dm ? 'text-slate-500' : 'text-slate-400'}`}>No Jobs Found</p>
              {hubSearch && (
                <button
                  onClick={() => setHubSearch('')}
                  className={`mt-3 text-xs font-black uppercase tracking-widest underline underline-offset-2 ${tm} hover:text-brand`}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredJobs.map(job => {
                const assets       = folderData[job.jobNumber] || [];
                const photoAssets  = assets.filter(a => a.type === 'photo') as (JobPhoto & { type: 'photo' })[];
                const ticketAssets = assets.filter(a => a.type === 'ticket');
                const hasContent   = assets.length > 0;
                const collage      = photoAssets.slice(0, 4);

                return (
                  <div
                    key={job.id}
                    className={`group rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.99] ${
                      hasContent
                        ? dm
                          ? 'bg-slate-800/80 border-white/[0.07] hover:border-brand/40 hover:shadow-brand/10'
                          : 'bg-white border-slate-200 hover:border-brand/40 hover:shadow-brand/10'
                        : dm
                          ? 'bg-slate-800/40 border-white/[0.04] hover:border-white/[0.10]'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => handleJobSelect(job.jobNumber)}
                  >
                    {/* ── Thumbnail collage ── */}
                    <div className="relative aspect-video overflow-hidden">
                      {collage.length > 0 ? (
                        /* Photo collage */
                        <div className={`w-full h-full grid gap-0.5 ${collage.length === 1 ? 'grid-cols-1' : 'grid-cols-2 grid-rows-2'}`}>
                          {collage.length === 1 ? (
                            <img
                              src={collage[0].dataUrl}
                              alt={`Site photo thumbnail for Job #${job.jobNumber}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              loading="lazy"
                            />
                          ) : (
                            [0, 1, 2, 3].map(i => (
                              <div key={i} className="relative overflow-hidden">
                                {collage[i] ? (
                                  <img
                                    src={collage[i].dataUrl}
                                    alt={`Site photo thumbnail for Job #${job.jobNumber}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className={`w-full h-full ${dm ? 'bg-slate-700/50' : 'bg-slate-100'}`} />
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ) : ticketAssets.length > 0 ? (
                        /* Ticket-doc-only state */
                        <div className={`w-full h-full flex items-center justify-center ${dm ? 'bg-rose-950/30' : 'bg-rose-50'}`}>
                          <svg className={`w-14 h-14 ${dm ? 'text-rose-900' : 'text-rose-200'}`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" />
                          </svg>
                        </div>
                      ) : (
                        /* Empty state */
                        <div className={`w-full h-full flex items-center justify-center ${dm ? 'bg-slate-700/20' : 'bg-slate-100'}`}>
                          <svg className={`w-12 h-12 ${dm ? 'text-slate-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </div>
                      )}

                      {/* Count badges */}
                      {hasContent && (
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {photoAssets.length > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-full text-[9px] font-black text-white">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {photoAssets.length}
                            </span>
                          )}
                          {ticketAssets.length > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-600/80 backdrop-blur-sm rounded-full text-[9px] font-black text-white">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {ticketAssets.length}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Admin delete */}
                      {isAdmin && onDeleteJob && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (window.confirm(`Delete Job #${job.jobNumber}? This cannot be undone.`)) {
                              if (selectedJobNumber === job.jobNumber) handleJobBack();
                              onDeleteJob(job.id);
                            }
                          }}
                          className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white/40 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete job"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* ── Card info ── */}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`font-black text-xs uppercase tracking-wider ${tp}`}>Job #{job.jobNumber}</p>
                          <p className={`text-[11px] font-semibold truncate ${ts} mt-0.5`}>{job.customer}</p>
                          <p className={`text-[10px] truncate ${tm}`}>{job.address}, {job.city}</p>
                        </div>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${dm ? 'bg-white/5 group-hover:bg-brand/10' : 'bg-slate-100 group-hover:bg-brand/10'}`}>
                          <svg className={`w-3.5 h-3.5 transition-colors ${dm ? 'text-slate-500 group-hover:text-brand' : 'text-slate-400 group-hover:text-brand'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                      {!hasContent && (
                        <p className={`text-[9px] font-black uppercase tracking-widest mt-2 ${tm}`}>No files yet</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ────────────────────── JOB VIEW: asset grid ───────────────────── */
          currentAssets.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed transition-all ${
                dm ? 'border-white/[0.07] bg-white/[0.02]' : 'border-slate-200 bg-white'
              }`}
            >
              <svg className={`w-14 h-14 mb-4 ${dm ? 'text-slate-700' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className={`font-black text-sm uppercase tracking-widest ${dm ? 'text-slate-500' : 'text-slate-400'} mb-2`}>
                {assetFilter === 'photos' ? 'No Photos Yet' : assetFilter === 'tickets' ? 'No Ticket Docs' : 'No Files Yet'}
              </p>
              {isAdmin && assetFilter !== 'tickets' && (
                <>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${tm} mb-5`}>
                    Drag &amp; drop photos here, or click to upload
                  </p>
                  <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-brand text-white font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-brand/20">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={e => { processBatch(Array.from(e.target.files || [])); e.target.value = ''; }}
                    />
                    Upload First Photo
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3 space-y-3">
              {currentAssets.map((asset, idx) => {
                const isSelected  = selectedIds.has(asset.id);
                const isTicket    = asset.type === 'ticket';
                const isPdfAsset  = isPdf(asset.dataUrl);

                return (
                  <div
                    key={asset.id}
                    onClick={() => selectionMode ? toggleSelection(asset.id) : setActivePhotoIndex(idx)}
                    className={`break-inside-avoid relative group rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'ring-2 ring-brand border-brand scale-[0.98]'
                        : dm
                          ? 'bg-slate-800/60 border-white/[0.06] hover:border-brand/30'
                          : 'bg-white border-slate-200 hover:border-brand/30 shadow-sm'
                    }`}
                  >
                    {isPdfAsset || isTicket ? (
                      /* ── Ticket / PDF card ── */
                      <div className={`p-4 flex items-start gap-3 ${dm ? 'bg-rose-950/20' : 'bg-rose-50/60'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${dm ? 'bg-rose-900/40' : 'bg-rose-100'}`}>
                          <svg className={`w-5 h-5 ${dm ? 'text-rose-400' : 'text-rose-500'}`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-rose-400' : 'text-rose-500'}`}>
                            Ticket Doc
                          </span>
                          <p className={`text-xs font-bold truncate mt-0.5 ${tp}`}>{asset.caption}</p>
                          <p className={`text-[10px] mt-0.5 ${tm}`}>{new Date(asset.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ) : (
                      /* ── Photo card ── */
                      <div className="relative">
                        <img
                          src={asset.dataUrl}
                          alt={asset.caption}
                          className="w-full h-auto object-cover group-hover:scale-[1.03] transition-transform duration-700"
                          loading="lazy"
                        />
                        {/* Hover overlay with caption */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent transition-opacity ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className="text-white text-[10px] font-black uppercase tracking-wider truncate">{asset.caption}</p>
                            <p className="text-white/50 text-[9px] mt-0.5">{new Date(asset.timestamp).toLocaleDateString()}</p>
                          </div>
                        </div>
                        {/* Per-photo delete (admin, non-selection mode) */}
                        {isAdmin && !selectionMode && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (confirm('Delete this photo? This cannot be undone.')) onDeletePhoto(asset.id);
                            }}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white/40 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete photo"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Selection checkbox */}
                    {selectionMode && (
                      <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'bg-brand border-brand' : 'bg-black/40 border-white/50 backdrop-blur-sm'
                      }`}>
                        {isSelected && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── Batch action bar ──────────────────────────────────────────────── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom duration-200">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
            <span className="text-[10px] font-black text-brand uppercase tracking-widest">{selectedIds.size} Selected</span>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={handleBatchDelete}
              className="px-4 py-1.5 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
            <button
              onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
              className="px-3 py-1.5 text-slate-400 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {activePhotoIndex !== null && currentAssets[activePhotoIndex] && (
        <div className="fixed inset-0 z-[250] bg-slate-950/98 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <div>
              <h4 className="text-white font-black text-sm uppercase tracking-widest">
                Job #{selectedJobNumber}
              </h4>
              <p className="text-brand text-[10px] font-black uppercase tracking-wider mt-0.5">
                {activePhotoIndex + 1}&nbsp;/&nbsp;{currentAssets.length}
              </p>
            </div>
            <button
              onClick={() => setActivePhotoIndex(null)}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Viewer */}
          <div className="flex-1 flex items-center gap-4 px-4 sm:px-8 overflow-hidden min-h-0">
            <button
              disabled={activePhotoIndex === 0}
              onClick={() => setActivePhotoIndex(i => i! - 1)}
              className="hidden lg:flex shrink-0 p-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 disabled:opacity-0 disabled:pointer-events-none transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
              {isPdf(currentAssets[activePhotoIndex].dataUrl) ? (
                <iframe
                  src={`${currentAssets[activePhotoIndex].dataUrl}#toolbar=0`}
                  className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white"
                  style={{ height: 'min(62vh, 760px)' }}
                />
              ) : (
                <img
                  src={currentAssets[activePhotoIndex].dataUrl}
                  alt={currentAssets[activePhotoIndex].caption}
                  className="max-w-full max-h-[62vh] rounded-2xl shadow-2xl border border-white/10 object-contain"
                />
              )}
            </div>

            <button
              disabled={activePhotoIndex === currentAssets.length - 1}
              onClick={() => setActivePhotoIndex(i => i! + 1)}
              className="hidden lg:flex shrink-0 p-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 disabled:opacity-0 disabled:pointer-events-none transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Info bar */}
          <div className="shrink-0 px-6 py-3 flex items-center justify-between gap-4 border-t border-white/[0.05]">
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate">{currentAssets[activePhotoIndex].caption}</p>
              <p className="text-slate-500 text-[10px] mt-0.5">{new Date(currentAssets[activePhotoIndex].timestamp).toLocaleDateString()}</p>
            </div>
            <a
              href={currentAssets[activePhotoIndex].dataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Full Size
            </a>
          </div>

          {/* Filmstrip */}
          <div className="hidden lg:flex shrink-0 px-6 pb-5 items-center justify-center gap-2 overflow-x-auto no-scrollbar">
            {currentAssets.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setActivePhotoIndex(i)}
                className={`w-12 h-12 rounded-xl border-2 transition-all shrink-0 overflow-hidden flex items-center justify-center bg-slate-800 ${
                  activePhotoIndex === i ? 'border-brand scale-110 shadow-lg shadow-brand/30' : 'border-transparent opacity-40 hover:opacity-80'
                }`}
              >
                {isPdf(a.dataUrl) ? (
                  <svg className="w-5 h-5 text-rose-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" />
                  </svg>
                ) : (
                  <img src={a.dataUrl} alt={a.caption} className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload status drawer ───────────────────────────────────────────── */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-24 right-4 w-72 z-[200] animate-in slide-in-from-right duration-200">
          <div className={`backdrop-blur-xl border rounded-2xl overflow-hidden ${dm ? 'bg-slate-900/95 border-white/10' : 'bg-white border-slate-200 shadow-2xl'}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${dm ? 'border-white/5' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isUploading ? 'bg-brand' : 'bg-emerald-500'}`}>
                  {isUploading
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  }
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${tp}`}>{isUploading ? 'Uploading…' : 'Upload Complete'}</span>
              </div>
              <button
                onClick={() => setUploadQueue([])}
                className={`p-1 rounded-lg ${tm} hover:text-rose-500 transition-colors`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto no-scrollbar p-3 space-y-2">
              {uploadQueue.map(item => (
                <div key={item.id} className={`flex items-center gap-2.5 p-2 rounded-xl border ${dm ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-black/10">
                    <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-tight truncate ${tp}`}>{item.file.name}</p>
                    <div className={`w-full h-1 rounded-full mt-1 overflow-hidden ${dm ? 'bg-white/10' : 'bg-slate-200'}`}>
                      <div
                        className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-rose-500' : 'bg-brand'}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                  {item.status === 'complete' && (
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {item.status === 'error' && (
                    <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={e => processBatch(Array.from(e.target.files || []))}
      />
    </div>
  );
};

export default PhotoManager;
