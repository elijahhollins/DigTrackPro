
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

type ActiveTab = 'all' | 'photos' | 'tickets';

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
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialSearch || null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSearch) {
      setSelectedFolder(initialSearch);
      setActiveTab('all');
    }
  }, [initialSearch]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setGallerySearch('');
  }, [selectedFolder, activeTab]);

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
          caption: `Ticket #${t.ticketNo}`,
          type: 'ticket',
          ticketNo: t.ticketNo,
        });
      }
    });
    return groups;
  }, [photos, jobs, tickets]);

  const filteredSidebarFolders = useMemo(() =>
    Object.keys(folderData)
      .filter(num => {
        const job = jobs.find(j => j.jobNumber === num);
        const q = sidebarSearch.toLowerCase();
        return num.toLowerCase().includes(q)
          || job?.customer?.toLowerCase().includes(q)
          || job?.address?.toLowerCase().includes(q);
      })
      .sort((a, b) => b.localeCompare(a)),
    [folderData, sidebarSearch, jobs]
  );

  const currentAssets = useMemo(() => {
    if (!selectedFolder) return [];
    let assets = folderData[selectedFolder] || [];
    if (activeTab === 'photos') assets = assets.filter(a => a.type === 'photo');
    else if (activeTab === 'tickets') assets = assets.filter(a => a.type === 'ticket');
    const q = gallerySearch.toLowerCase();
    if (q) assets = assets.filter(a => a.caption.toLowerCase().includes(q));
    return [...assets].sort((a, b) => b.timestamp - a.timestamp);
  }, [folderData, selectedFolder, activeTab, gallerySearch]);

  const selectedJob = useMemo(() => jobs.find(j => j.jobNumber === selectedFolder), [jobs, selectedFolder]);
  const photoCount = selectedFolder ? (folderData[selectedFolder] || []).filter(a => a.type === 'photo').length : 0;
  const ticketCount = selectedFolder ? (folderData[selectedFolder] || []).filter(a => a.type === 'ticket').length : 0;

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    const photoIds = Array.from(selectedIds).filter(id =>
      currentAssets.find(a => a.id === id && a.type === 'photo')
    );
    if (photoIds.length === 0) {
      alert('Ticket documents cannot be deleted from this view. Manage them via the ticket record.');
      return;
    }
    const hasTickets = Array.from(selectedIds).some(id =>
      currentAssets.find(a => a.id === id && a.type === 'ticket')
    );
    if (!confirm(`Permanently delete ${photoIds.length} photo${photoIds.length !== 1 ? 's' : ''}?${hasTickets ? ' Ticket documents in the selection will be skipped.' : ''}`)) return;
    for (const id of photoIds) await onDeletePhoto(id);
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const processBatch = async (files: File[]) => {
    if (!selectedFolder) { alert('Select a job folder first.'); return; }
    setIsUploading(true);
    const newItems: UploadQueueItem[] = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      previewUrl: URL.createObjectURL(f),
      progress: 0,
      status: 'pending',
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
    for (const item of newItems) {
      setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        const pInterval = setInterval(() => {
          setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, progress: Math.min(q.progress + 15, 90) } : q));
        }, 150);
        await onAddPhoto({ jobNumber: selectedFolder, timestamp: Date.now(), caption: `Site Photo ${new Date().toLocaleDateString()}` }, item.file);
        clearInterval(pInterval);
        setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'complete', progress: 100 } : q));
      } catch {
        setUploadQueue(cur => cur.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
      }
    }
    setIsUploading(false);
    setTimeout(() => setUploadQueue(prev => prev.filter(q => q.status !== 'complete')), 4000);
  };

  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;
    if (e.key === 'ArrowRight') setLightboxIndex(i => Math.min((i ?? 0) + 1, currentAssets.length - 1));
    else if (e.key === 'ArrowLeft') setLightboxIndex(i => Math.max((i ?? 0) - 1, 0));
    else if (e.key === 'Escape') setLightboxIndex(null);
  }, [lightboxIndex, currentAssets.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const tabLabel = (tab: ActiveTab) => {
    if (tab === 'all') return selectedFolder ? `All (${photoCount + ticketCount})` : 'All';
    if (tab === 'photos') return selectedFolder ? `Photos (${photoCount})` : 'Photos';
    return selectedFolder ? `Tickets (${ticketCount})` : 'Tickets';
  };

  const dark = isDarkMode;

  return (
    <div className="flex flex-col lg:flex-row gap-4 animate-in h-[calc(100vh-140px)] -mt-2 overflow-hidden">

      {/* SIDEBAR */}
      <aside className={`lg:w-64 xl:w-72 shrink-0 flex flex-col rounded-2xl border overflow-hidden ${dark ? 'bg-slate-900 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className={`px-4 pt-4 pb-3 border-b ${dark ? 'border-white/[0.08]' : 'border-slate-100'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Job Directory</p>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${dark ? 'bg-slate-800 border-white/[0.08]' : 'bg-slate-50 border-slate-200'}`}>
            <svg className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search jobs..."
              className={`flex-1 bg-transparent outline-none text-[12px] placeholder:text-slate-400 ${dark ? 'text-white' : 'text-slate-900'}`}
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch('')} className={`transition-colors ${dark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {filteredSidebarFolders.length === 0 ? (
            <p className={`text-center py-10 text-[11px] font-medium ${dark ? 'text-slate-600' : 'text-slate-400'}`}>No jobs found</p>
          ) : filteredSidebarFolders.map(num => {
            const isActive = selectedFolder === num;
            const jobEntity = jobs.find(j => j.jobNumber === num);
            const pCount = (folderData[num] || []).filter(a => a.type === 'photo').length;
            const tCount = (folderData[num] || []).filter(a => a.type === 'ticket').length;
            return (
              <div
                key={num}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                  isActive ? 'bg-brand text-slate-900' : dark ? 'text-slate-300 hover:bg-white/[0.06]' : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => { setSelectedFolder(num); setActiveTab('all'); }}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-black/10' : dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold truncate">#{num}</span>
                    {jobEntity?.isComplete && (
                      <svg className={`w-3 h-3 shrink-0 ${isActive ? 'text-slate-900/60' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {jobEntity?.customer && (
                    <p className={`text-[10px] truncate leading-tight mt-0.5 ${isActive ? 'text-slate-900/60' : dark ? 'text-slate-500' : 'text-slate-400'}`}>{jobEntity.customer}</p>
                  )}
                  <div className={`flex items-center gap-1.5 mt-1 ${isActive ? 'text-slate-900/50' : dark ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span className="text-[9px] font-medium">{pCount} photo{pCount !== 1 ? 's' : ''}</span>
                    <span className="text-[9px]">·</span>
                    <span className="text-[9px] font-medium">{tCount} ticket{tCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                {isAdmin && jobEntity && onDeleteJob && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Delete Job #${num} and all its data? This cannot be undone.`)) {
                        if (selectedFolder === num) setSelectedFolder(null);
                        onDeleteJob(jobEntity.id);
                      }
                    }}
                    className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0 ${isActive ? 'hover:bg-black/10 text-slate-900/50 hover:text-rose-700' : dark ? 'hover:bg-rose-500/10 text-slate-600 hover:text-rose-400' : 'hover:bg-rose-50 text-slate-400 hover:text-rose-500'}`}
                    title={`Delete Job #${num}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* MAIN PANEL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedFolder ? (
          <>
            {/* Header */}
            <div className={`shrink-0 mb-3 px-5 py-3.5 rounded-2xl border ${dark ? 'bg-slate-900 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`text-[15px] font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>Job #{selectedFolder}</h2>
                    {selectedJob?.isComplete && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                        Complete
                      </span>
                    )}
                  </div>
                  {selectedJob && (
                    <p className={`text-[11px] mt-0.5 truncate ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {[selectedJob.customer, selectedJob.address, selectedJob.city].filter(Boolean).join(' \u00b7 ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <div className={`flex items-center rounded-xl p-0.5 gap-0.5 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    {(['all', 'photos', 'tickets'] as ActiveTab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          activeTab === tab
                            ? dark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                            : dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tabLabel(tab)}
                      </button>
                    ))}
                  </div>

                  <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border ${dark ? 'bg-slate-800 border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                    <svg className={`w-3.5 h-3.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search..."
                      className="w-24 bg-transparent outline-none text-[12px] placeholder:text-slate-400"
                      value={gallerySearch}
                      onChange={e => setGallerySearch(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}
                    title="Bulk select"
                    className={`p-2 rounded-xl border transition-all ${
                      selectionMode
                        ? 'bg-brand border-brand text-slate-900'
                        : dark ? 'bg-slate-800 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>

                  {activeTab !== 'tickets' && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload site photos"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-slate-900 text-[11px] font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="hidden sm:inline">Upload</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Gallery */}
            <div className="flex-1 overflow-y-auto pb-10">
              {currentAssets.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {currentAssets.map((asset, idx) => {
                    const isSelected = selectedIds.has(asset.id);
                    const isTicketAsset = asset.type === 'ticket';
                    const isPdfAsset = isPdf(asset.dataUrl);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => selectionMode ? toggleSelection(asset.id) : setLightboxIndex(idx)}
                        className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'ring-2 ring-brand border-brand'
                            : dark ? 'bg-slate-800 border-white/[0.08] hover:border-white/20' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                        }`}
                      >
                        <div className={`relative aspect-square flex items-center justify-center overflow-hidden ${dark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                          {isPdfAsset ? (
                            <div className={`flex flex-col items-center justify-center gap-2 w-full h-full ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                              <svg className="w-10 h-10 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363zM12 2H5c-1.103 0-2 .897-2 2v16c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V9l-7-7z" />
                                <path d="M19 9h-7V2l7 7z" />
                              </svg>
                              <span className={`text-[9px] font-semibold uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>PDF</span>
                            </div>
                          ) : (
                            <img src={asset.dataUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                          )}

                          {!selectionMode && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </div>
                            </div>
                          )}

                          {selectionMode && (
                            <div className={`absolute inset-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-brand/20' : 'bg-transparent'}`}>
                              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-brand border-brand' : 'bg-white/20 border-white/60'}`}>
                                {isSelected && <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className={`px-2.5 py-2 ${dark ? 'bg-slate-800' : 'bg-white'}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isTicketAsset ? 'bg-rose-500' : 'bg-brand'}`} />
                            <p className={`text-[11px] font-medium truncate flex-1 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{asset.caption}</p>
                          </div>
                          <p className={`text-[10px] mt-0.5 ${dark ? 'text-slate-600' : 'text-slate-400'}`}>{new Date(asset.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center h-64 rounded-2xl border-2 border-dashed text-center ${dark ? 'border-white/[0.08] text-slate-600' : 'border-slate-200 text-slate-400'}`}>
                  <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <p className="text-[13px] font-semibold">
                    {gallerySearch ? 'No results found' : activeTab === 'photos' ? 'No photos yet' : activeTab === 'tickets' ? 'No ticket documents' : 'No files yet'}
                  </p>
                  <p className="text-[11px] mt-1 opacity-60">
                    {gallerySearch
                      ? 'Try a different search term'
                      : activeTab !== 'tickets'
                        ? 'Upload site photos using the Upload button'
                        : 'Ticket documents are attached when tickets are created'}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed ${dark ? 'border-white/[0.08] text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <svg className="w-7 h-7 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold">Select a job to get started</p>
            <p className="text-[12px] mt-1 max-w-[200px] leading-relaxed opacity-70">Choose a job from the directory to browse photos and documents.</p>
          </div>
        )}
      </main>

      {/* BATCH ACTION BAR */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom">
          <div className="bg-slate-950/95 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
            <span className="text-[11px] font-semibold text-brand">{selectedIds.size} selected</span>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-lg text-[11px] font-semibold hover:bg-rose-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
            <button
              onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
              className="px-3 py-1.5 text-slate-400 rounded-lg text-[11px] font-semibold hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightboxIndex !== null && currentAssets[lightboxIndex] && (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-5 py-3.5 shrink-0 border-b border-white/[0.08]">
            <div>
              <p className="text-white font-semibold text-sm">Job #{selectedFolder}</p>
              <p className="text-slate-500 text-[11px] mt-0.5">{lightboxIndex + 1} of {currentAssets.length}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={currentAssets[lightboxIndex].dataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open
              </a>
              <button
                onClick={() => setLightboxIndex(null)}
                className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-stretch overflow-hidden min-h-0">
            <button
              disabled={lightboxIndex === 0}
              onClick={() => setLightboxIndex(i => Math.max((i ?? 1) - 1, 0))}
              className="hidden lg:flex items-center justify-center w-14 shrink-0 text-white/30 hover:text-white disabled:opacity-0 transition-colors"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div className="flex-1 flex items-center justify-center p-4 lg:p-6 min-w-0 overflow-hidden">
              {isPdf(currentAssets[lightboxIndex].dataUrl) ? (
                <iframe
                  src={`${currentAssets[lightboxIndex].dataUrl}#toolbar=0`}
                  className="w-full h-full rounded-xl border border-white/10 bg-white"
                />
              ) : (
                <img
                  src={currentAssets[lightboxIndex].dataUrl}
                  className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10 object-contain"
                />
              )}
            </div>

            <div className="hidden lg:flex lg:w-64 shrink-0 flex-col border-l border-white/[0.08] p-5 gap-5 overflow-y-auto">
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Caption</p>
                <p className="text-[13px] text-white font-medium leading-snug">{currentAssets[lightboxIndex].caption}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Date Added</p>
                <p className="text-[12px] text-slate-300">{new Date(currentAssets[lightboxIndex].timestamp).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Type</p>
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${currentAssets[lightboxIndex].type === 'ticket' ? 'bg-rose-500/10 text-rose-400' : 'bg-brand/10 text-brand'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${currentAssets[lightboxIndex].type === 'ticket' ? 'bg-rose-500' : 'bg-brand'}`} />
                  {currentAssets[lightboxIndex].type === 'ticket' ? 'Ticket Document' : 'Site Photo'}
                </div>
              </div>
              {currentAssets[lightboxIndex].type === 'photo' && isAdmin && (
                <div className="pt-4 border-t border-white/[0.08] mt-auto">
                  <button
                    onClick={() => {
                      if (confirm('Permanently delete this photo?')) {
                        onDeletePhoto(currentAssets[lightboxIndex].id);
                        // currentAssets still contains the deleted photo at this point (parent hasn't re-rendered yet).
                        // After deletion there will be (length - 1) items, so valid indices are 0..length-2.
                        if (currentAssets.length <= 1) {
                          setLightboxIndex(null);
                        } else {
                          setLightboxIndex(Math.min(lightboxIndex, currentAssets.length - 2));
                        }
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[11px] font-semibold transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Photo
                  </button>
                </div>
              )}
            </div>

            <button
              disabled={lightboxIndex === currentAssets.length - 1}
              onClick={() => setLightboxIndex(i => Math.min((i ?? 0) + 1, currentAssets.length - 1))}
              className="hidden lg:flex items-center justify-center w-14 shrink-0 text-white/30 hover:text-white disabled:opacity-0 transition-colors"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div className="shrink-0 hidden lg:flex items-center justify-center gap-1.5 px-6 py-3 border-t border-white/[0.08] overflow-x-auto">
            {currentAssets.map((asset, i) => (
              <button
                key={asset.id}
                onClick={() => setLightboxIndex(i)}
                className={`w-11 h-11 rounded-lg overflow-hidden border-2 shrink-0 transition-all bg-slate-800 flex items-center justify-center ${
                  lightboxIndex === i ? 'border-brand opacity-100 scale-110' : 'border-transparent opacity-40 hover:opacity-70'
                }`}
              >
                {isPdf(asset.dataUrl) ? (
                  <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" /></svg>
                ) : (
                  <img src={asset.dataUrl} className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* UPLOAD STATUS */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-24 right-4 w-72 z-[200] animate-in slide-in-from-right">
          <div className={`rounded-2xl border overflow-hidden shadow-xl ${dark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-white/[0.08]' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isUploading ? 'bg-brand text-slate-900' : 'bg-emerald-500 text-white'}`}>
                  {isUploading
                    ? <div className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  }
                </div>
                <p className={`text-[12px] font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{isUploading ? 'Uploading...' : 'Upload complete'}</p>
              </div>
              <button onClick={() => setUploadQueue([])} className={`p-1 rounded-lg transition-colors ${dark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto p-2 space-y-1.5">
              {uploadQueue.map(item => (
                <div key={item.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                    <img src={item.previewUrl} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-medium truncate ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{item.file.name}</p>
                    <div className={`w-full h-1 rounded-full mt-1 overflow-hidden ${dark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                      <div className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-rose-500' : 'bg-brand'}`} style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                  {item.status === 'complete' && <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                  {item.status === 'error' && <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*"
        onChange={e => processBatch(Array.from(e.target.files || []))} />
    </div>
  );
};

export default PhotoManager;
