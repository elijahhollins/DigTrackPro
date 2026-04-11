import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { JobPhoto, Job, DigTicket } from '../types.ts';

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

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface Asset {
  id: string;
  jobNumber: string;
  url: string;
  caption: string;
  timestamp: number;
  type: 'photo' | 'ticket';
  ticketNo?: string;
}

type TabFilter = 'all' | 'photos' | 'tickets';

const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

const PdfThumb: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
    <svg className="w-10 h-10 text-rose-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363zM19 9h-7V2l7 7z" />
    </svg>
    <span className={`text-[9px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>PDF</span>
  </div>
);

const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  jobs,
  tickets,
  initialSearch = null,
  isDarkMode: dark,
  isAdmin,
  onAddPhoto,
  onDeletePhoto,
  onDeleteJob,
}) => {
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [activeJob, setActiveJob] = useState<string | null>(initialSearch || null);
  const [tab, setTab] = useState<TabFilter>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSearch) { setActiveJob(initialSearch); setTab('all'); }
  }, [initialSearch]);

  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
    setGallerySearch('');
  }, [activeJob, tab]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const assetMap = useMemo(() => {
    const map: Record<string, Asset[]> = {};
    jobs.forEach(j => { if (j.jobNumber) map[j.jobNumber] = []; });
    photos.forEach(p => {
      if (!map[p.jobNumber]) map[p.jobNumber] = [];
      map[p.jobNumber].push({ id: p.id, jobNumber: p.jobNumber, url: p.dataUrl, caption: p.caption, timestamp: p.timestamp, type: 'photo' });
    });
    tickets.forEach(t => {
      if (t.documentUrl && t.jobNumber) {
        if (!map[t.jobNumber]) map[t.jobNumber] = [];
        map[t.jobNumber].push({ id: t.id, jobNumber: t.jobNumber, url: t.documentUrl, caption: `Ticket #${t.ticketNo}`, timestamp: t.createdAt, type: 'ticket', ticketNo: t.ticketNo });
      }
    });
    return map;
  }, [photos, jobs, tickets]);

  const jobList = useMemo(() => {
    const q = sidebarSearch.toLowerCase();
    return Object.keys(assetMap)
      .filter(num => {
        if (!q) return true;
        const j = jobs.find(j => j.jobNumber === num);
        return num.includes(q) || j?.customer?.toLowerCase().includes(q) || j?.address?.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aT = Math.max(0, ...(assetMap[a].map(x => x.timestamp)));
        const bT = Math.max(0, ...(assetMap[b].map(x => x.timestamp)));
        return bT - aT || b.localeCompare(a);
      });
  }, [assetMap, sidebarSearch, jobs]);

  const activeJobMeta = useMemo(() => jobs.find(j => j.jobNumber === activeJob), [jobs, activeJob]);

  const visibleAssets = useMemo(() => {
    if (!activeJob) return [];
    let list = assetMap[activeJob] || [];
    if (tab === 'photos') list = list.filter(a => a.type === 'photo');
    else if (tab === 'tickets') list = list.filter(a => a.type === 'ticket');
    const q = gallerySearch.toLowerCase();
    if (q) list = list.filter(a => a.caption.toLowerCase().includes(q));
    return [...list].sort((a, b) => b.timestamp - a.timestamp);
  }, [assetMap, activeJob, tab, gallerySearch]);

  const pCount = activeJob ? (assetMap[activeJob] || []).filter(a => a.type === 'photo').length : 0;
  const tCount = activeJob ? (assetMap[activeJob] || []).filter(a => a.type === 'ticket').length : 0;

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleBatchDelete = async () => {
    const photoIds = [...selected].filter(id => visibleAssets.find(a => a.id === id && a.type === 'photo'));
    if (!photoIds.length) { alert('Only site photos can be deleted here. Ticket documents must be removed via the ticket record.'); return; }
    const hasTicketDocs = [...selected].some(id => visibleAssets.find(a => a.id === id && a.type === 'ticket'));
    if (!confirm(`Permanently delete ${photoIds.length} photo${photoIds.length !== 1 ? 's' : ''}?${hasTicketDocs ? '\n\nTicket documents in the selection will be skipped.' : ''}`)) return;
    for (const id of photoIds) await onDeletePhoto(id);
    setSelected(new Set());
    setSelectMode(false);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const processFiles = async (files: File[]) => {
    if (!activeJob) { alert('Select a job first.'); return; }
    setIsUploading(true);
    const newItems: UploadItem[] = files.map(f => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11),
      file: f,
      previewUrl: URL.createObjectURL(f),
      progress: 0,
      status: 'pending',
    }));
    setUploadItems(prev => [...prev, ...newItems]);
    for (const item of newItems) {
      setUploadItems(cur => cur.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        const timer = setInterval(() =>
          setUploadItems(cur => cur.map(q => q.id === item.id ? { ...q, progress: Math.min(q.progress + 18, 88) } : q)), 180);
        await onAddPhoto({ jobNumber: activeJob, timestamp: Date.now(), caption: `Site Photo ${new Date().toLocaleDateString()}` }, item.file);
        clearInterval(timer);
        setUploadItems(cur => cur.map(q => q.id === item.id ? { ...q, status: 'done', progress: 100 } : q));
      } catch {
        setUploadItems(cur => cur.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
      }
    }
    setIsUploading(false);
    setTimeout(() => setUploadItems(prev => prev.filter(q => q.status !== 'done')), 4000);
  };

  // ── Lightbox keyboard ─────────────────────────────────────────────────────
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (lightboxIdx === null) return;
    if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min((i ?? 0) + 1, visibleAssets.length - 1));
    else if (e.key === 'ArrowLeft') setLightboxIdx(i => Math.max((i ?? 0) - 1, 0));
    else if (e.key === 'Escape') setLightboxIdx(null);
  }, [lightboxIdx, visibleAssets.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) processFiles(files);
  };

  // ── Delete from lightbox ──────────────────────────────────────────────────
  const deleteLightboxPhoto = () => {
    if (lightboxIdx === null) return;
    const asset = visibleAssets[lightboxIdx];
    if (!asset || asset.type !== 'photo') return;
    if (!confirm('Permanently delete this photo?')) return;
    onDeletePhoto(asset.id);
    if (visibleAssets.length <= 1) setLightboxIdx(null);
    else setLightboxIdx(Math.min(lightboxIdx, visibleAssets.length - 2));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const lb = lightboxIdx !== null ? visibleAssets[lightboxIdx] : null;

  return (
    <div className={`flex h-[calc(100vh-140px)] overflow-hidden rounded-2xl border ${dark ? 'border-white/[0.06] bg-[#0a1628]' : 'border-slate-200 bg-white shadow-sm'}`}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className={`w-60 xl:w-64 shrink-0 flex flex-col border-r ${dark ? 'border-white/[0.06] bg-[#0b1a2e]' : 'border-slate-100 bg-slate-50'}`}>

        {/* Sidebar header */}
        <div className={`px-4 pt-4 pb-3 shrink-0 border-b ${dark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] mb-3 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            Field Docs
          </p>
          <div className={`relative flex items-center rounded-xl border ${dark ? 'bg-slate-800/60 border-white/[0.08]' : 'bg-white border-slate-200'}`}>
            <svg className={`absolute left-2.5 w-3.5 h-3.5 shrink-0 ${dark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search jobs…"
              className={`w-full pl-8 pr-8 py-2 bg-transparent outline-none text-[12px] ${dark ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`}
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch('')} className={`absolute right-2 transition-colors ${dark ? 'text-slate-600 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {jobList.length === 0 ? (
            <div className={`text-center py-12 text-[11px] ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
              {sidebarSearch ? 'No jobs match your search' : 'No jobs yet'}
            </div>
          ) : jobList.map(num => {
            const jobMeta = jobs.find(j => j.jobNumber === num);
            const pc = (assetMap[num] || []).filter(a => a.type === 'photo').length;
            const tc = (assetMap[num] || []).filter(a => a.type === 'ticket').length;
            const isActive = activeJob === num;
            return (
              <div
                key={num}
                onClick={() => { setActiveJob(num); setTab('all'); }}
                className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all mb-0.5 ${
                  isActive
                    ? 'bg-brand text-slate-900'
                    : dark ? 'text-slate-300 hover:bg-white/[0.05]' : 'text-slate-700 hover:bg-white'
                }`}
              >
                {/* Folder icon */}
                <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center transition-colors ${
                  isActive ? 'bg-black/10' : dark ? 'bg-slate-700/60' : 'bg-slate-200'
                }`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] font-bold truncate">#{num}</span>
                    {jobMeta?.isComplete && (
                      <svg className={`w-3 h-3 shrink-0 ${isActive ? 'text-slate-900/50' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {jobMeta?.customer && (
                    <p className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-slate-900/55' : dark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {jobMeta.customer}
                    </p>
                  )}
                  <div className={`flex items-center gap-1 mt-0.5 ${isActive ? 'text-slate-900/40' : dark ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span className="text-[9px]">{pc}p</span>
                    <span className="text-[9px] opacity-50">·</span>
                    <span className="text-[9px]">{tc}t</span>
                  </div>
                </div>

                {/* Delete job (admin only, hover) */}
                {isAdmin && jobMeta && onDeleteJob && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (confirm(`Delete Job #${num} and all its data? This cannot be undone.`)) {
                        if (activeJob === num) setActiveJob(null);
                        onDeleteJob(jobMeta.id);
                      }
                    }}
                    title={`Delete Job #${num}`}
                    className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0 ${
                      isActive ? 'hover:bg-black/10 text-slate-900/40 hover:text-rose-700' : dark ? 'text-slate-600 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── MAIN AREA ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeJob ? (
          <>
            {/* Content header */}
            <div className={`shrink-0 border-b px-5 py-3 flex flex-col gap-2.5 ${dark ? 'border-white/[0.06] bg-[#0b1a2e]/60' : 'border-slate-100 bg-white'}`}>

              {/* Top row: job info + actions */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setActiveJob(null)}
                    className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-slate-500 hover:text-white hover:bg-white/[0.06]' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                    title="Back to overview"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={`text-[15px] font-bold leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>
                        Job #{activeJob}
                      </h2>
                      {activeJobMeta?.isComplete && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase tracking-wide">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                          Complete
                        </span>
                      )}
                    </div>
                    {activeJobMeta && (
                      <p className={`text-[10px] mt-0.5 truncate ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {[activeJobMeta.customer, activeJobMeta.address, activeJobMeta.city].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Search */}
                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[12px] ${dark ? 'bg-slate-800/60 border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                    <svg className={`w-3 h-3 shrink-0 ${dark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search…"
                      className="w-20 bg-transparent outline-none text-[11px] placeholder:text-slate-400"
                      value={gallerySearch}
                      onChange={e => setGallerySearch(e.target.value)}
                    />
                  </div>

                  {/* Bulk select toggle */}
                  <button
                    onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
                    title="Select multiple"
                    className={`p-2 rounded-xl border transition-all ${
                      selectMode
                        ? 'bg-brand border-brand text-slate-900'
                        : dark ? 'bg-slate-800/60 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>

                  {/* Upload button */}
                  {tab !== 'tickets' && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-slate-900 text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="hidden sm:inline">Upload</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tab row */}
              <div className={`flex items-center gap-0.5 p-0.5 rounded-xl w-fit ${dark ? 'bg-slate-800/60' : 'bg-slate-100'}`}>
                {(['all', 'photos', 'tickets'] as TabFilter[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-[10px] text-[11px] font-semibold transition-all ${
                      tab === t
                        ? dark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                        : dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t === 'all' ? `All (${pCount + tCount})` : t === 'photos' ? `Photos (${pCount})` : `Tickets (${tCount})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Gallery area */}
            <div
              ref={galleryAreaRef}
              className="flex-1 overflow-y-auto p-4"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {/* Drag overlay */}
              {dragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand/10 border-2 border-dashed border-brand rounded-2xl pointer-events-none">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-brand mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-brand font-bold text-sm">Drop photos to upload</p>
                  </div>
                </div>
              )}

              {visibleAssets.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visibleAssets.map((asset, idx) => {
                    const isSelected = selected.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => selectMode ? toggleSelect(asset.id) : setLightboxIdx(idx)}
                        className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 border ${
                          isSelected
                            ? 'ring-2 ring-brand border-brand shadow-lg shadow-brand/10'
                            : dark ? 'border-white/[0.06] hover:border-white/20' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className={`aspect-square overflow-hidden ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                          {isPdf(asset.url) ? (
                            <PdfThumb dark={dark} />
                          ) : (
                            <img
                              src={asset.url}
                              alt={asset.caption}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          )}

                          {/* Hover overlay (view mode) */}
                          {!selectMode && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                              <div className={`p-1.5 rounded-lg bg-white/20 backdrop-blur-sm`}>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </div>
                            </div>
                          )}

                          {/* Selection overlay */}
                          {selectMode && (
                            <div className={`absolute inset-0 flex items-start justify-end p-2 transition-colors ${isSelected ? 'bg-brand/15' : ''}`}>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-brand border-brand' : 'bg-white/30 border-white/80'}`}>
                                {isSelected && <svg className="w-3 h-3 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card footer */}
                        <div className={`px-2.5 py-2 ${dark ? 'bg-slate-900/80' : 'bg-white'}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${asset.type === 'ticket' ? 'bg-rose-500' : 'bg-brand'}`} />
                            <p className={`text-[11px] font-medium truncate ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{asset.caption}</p>
                          </div>
                          <p className={`text-[10px] mt-0.5 ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
                            {new Date(asset.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border-2 border-dashed ${dark ? 'border-white/[0.06] text-slate-600' : 'border-slate-200 text-slate-400'}`}>
                  <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className={`text-[13px] font-semibold ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                    {gallerySearch ? 'No results found' : tab === 'tickets' ? 'No ticket documents' : 'No photos yet'}
                  </p>
                  <p className="text-[11px] mt-1 opacity-60">
                    {gallerySearch
                      ? 'Try a different search term'
                      : tab === 'tickets'
                        ? 'Ticket documents appear here when tickets are created with a document attached'
                        : 'Click Upload or drag photos here to get started'}
                  </p>
                  {tab !== 'tickets' && !gallerySearch && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-slate-900 text-[11px] font-bold hover:opacity-90 transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload Photos
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── NO JOB SELECTED: OVERVIEW ─────────────────────────────── */
          <div className={`flex-1 flex flex-col overflow-y-auto`}>
            {/* Overview header */}
            <div className={`shrink-0 px-6 pt-6 pb-4 border-b ${dark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
              <h2 className={`text-[18px] font-black uppercase tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>Field Docs</h2>
              <p className={`text-[11px] mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                {photos.length} photo{photos.length !== 1 ? 's' : ''} · {Object.keys(assetMap).length} job{Object.keys(assetMap).length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Stats row */}
            <div className={`shrink-0 grid grid-cols-3 divide-x ${dark ? 'divide-white/[0.06]' : 'divide-slate-100'}`}>
              {[
                { label: 'Total Jobs', value: Object.keys(assetMap).length, icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
                { label: 'Site Photos', value: photos.length, icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { label: 'Ticket Docs', value: tickets.filter(t => !!t.documentUrl).length, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
              ].map(stat => (
                <div key={stat.label} className="px-6 py-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <svg className={`w-3.5 h-3.5 ${dark ? 'text-slate-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={stat.icon} />
                    </svg>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${dark ? 'text-slate-600' : 'text-slate-400'}`}>{stat.label}</span>
                  </div>
                  <span className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-900'}`}>{stat.value}</span>
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-10">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <svg className={`w-8 h-8 ${dark ? 'text-slate-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className={`text-[15px] font-bold ${dark ? 'text-slate-300' : 'text-slate-700'}`}>Select a job to get started</p>
              <p className={`text-[12px] mt-1.5 max-w-xs leading-relaxed ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
                Choose a job from the directory on the left to browse photos and ticket documents.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── BATCH ACTION BAR ─────────────────────────────────────────────── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100]">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-white/10 shadow-2xl">
            <span className="text-[11px] font-bold text-brand">{selected.size} selected</span>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-600 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
            <button
              onClick={() => { setSelectMode(false); setSelected(new Set()); }}
              className="px-3 py-1.5 rounded-lg text-slate-400 text-[11px] font-bold hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ─────────────────────────────────────────────────────── */}
      {lb && lightboxIdx !== null && (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-xl flex flex-col">

          {/* Lightbox header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLightboxIdx(null)}
                className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div>
                <p className="text-white font-bold text-[13px]">Job #{activeJob}</p>
                <p className="text-slate-500 text-[10px]">{lightboxIdx + 1} of {visibleAssets.length}</p>
              </div>
            </div>
            <a
              href={lb.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open
            </a>
          </div>

          {/* Lightbox body */}
          <div className="flex-1 flex items-stretch overflow-hidden min-h-0">

            {/* Prev arrow */}
            <button
              disabled={lightboxIdx === 0}
              onClick={() => setLightboxIdx(i => Math.max((i ?? 1) - 1, 0))}
              className="hidden lg:flex items-center justify-center w-14 shrink-0 text-white/25 hover:text-white disabled:opacity-0 transition-colors"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>

            {/* Main image */}
            <div className="flex-1 flex items-center justify-center p-4 min-w-0 overflow-hidden">
              {isPdf(lb.url) ? (
                <iframe
                  src={`${lb.url}#toolbar=0`}
                  className="w-full h-full rounded-xl border border-white/10 bg-white"
                  title={lb.caption}
                />
              ) : (
                <img
                  src={lb.url}
                  alt={lb.caption}
                  className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10 object-contain"
                />
              )}
            </div>

            {/* Info panel */}
            <div className="hidden lg:flex lg:w-60 xl:w-72 shrink-0 flex-col border-l border-white/[0.08] p-5 gap-5 overflow-y-auto">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em] mb-1">Caption</p>
                <p className="text-[13px] text-white font-medium leading-snug">{lb.caption}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em] mb-1">Date Added</p>
                <p className="text-[12px] text-slate-300">{new Date(lb.timestamp).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em] mb-1">Type</p>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${lb.type === 'ticket' ? 'bg-rose-500/10 text-rose-400' : 'bg-brand/10 text-brand'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${lb.type === 'ticket' ? 'bg-rose-500' : 'bg-brand'}`} />
                  {lb.type === 'ticket' ? 'Ticket Document' : 'Site Photo'}
                </span>
              </div>

              {lb.type === 'photo' && isAdmin && (
                <div className="pt-4 border-t border-white/[0.08] mt-auto">
                  <button
                    onClick={deleteLightboxPhoto}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[11px] font-semibold transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Photo
                  </button>
                </div>
              )}
            </div>

            {/* Next arrow */}
            <button
              disabled={lightboxIdx === visibleAssets.length - 1}
              onClick={() => setLightboxIdx(i => Math.min((i ?? 0) + 1, visibleAssets.length - 1))}
              className="hidden lg:flex items-center justify-center w-14 shrink-0 text-white/25 hover:text-white disabled:opacity-0 transition-colors"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Filmstrip */}
          <div className="shrink-0 hidden lg:flex items-center justify-center gap-1.5 px-5 py-3 border-t border-white/[0.08] overflow-x-auto">
            {visibleAssets.map((asset, i) => (
              <button
                key={asset.id}
                onClick={() => setLightboxIdx(i)}
                className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${lightboxIdx === i ? 'border-brand scale-110 opacity-100' : 'border-transparent opacity-30 hover:opacity-60'}`}
              >
                {isPdf(asset.url) ? (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <svg className="w-4 h-4 text-rose-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" /></svg>
                  </div>
                ) : (
                  <img src={asset.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── UPLOAD STATUS DRAWER ─────────────────────────────────────────── */}
      {uploadItems.length > 0 && (
        <div className="fixed bottom-20 right-4 w-72 z-[200]">
          <div className={`rounded-2xl border shadow-2xl overflow-hidden ${dark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
            {/* Drawer header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-white/[0.08]' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isUploading ? 'bg-brand' : uploadItems.some(q => q.status === 'error') ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                  {isUploading
                    ? <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    : uploadItems.some(q => q.status === 'error')
                      ? <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                      : <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  }
                </div>
                <p className={`text-[12px] font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>
                  {isUploading ? 'Uploading…' : uploadItems.some(q => q.status === 'error') ? 'Some uploads failed' : 'Upload complete'}
                </p>
              </div>
              <button onClick={() => setUploadItems([])} className={`p-1 rounded-lg transition-colors ${dark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* File list */}
            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
              {uploadItems.map(item => (
                <div key={item.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-medium truncate ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{item.file.name}</p>
                    <div className={`w-full h-1 rounded-full mt-1 overflow-hidden ${dark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                      <div
                        className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-rose-500' : 'bg-brand'}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                  {item.status === 'done' && <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                  {item.status === 'error' && <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>}
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
        ref={fileRef}
        className="hidden"
        accept="image/*"
        onChange={e => { processFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
      />
    </div>
  );
};

export default PhotoManager;
