
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { JobPhoto, Job, DigTicket } from '../types.ts';

interface PhotoManagerProps {
  photos: JobPhoto[];
  jobs: Job[];
  tickets: DigTicket[];
  initialSearch?: string | null;
  isDarkMode?: boolean;
  companyId: string; // Added companyId prop to handle multitenancy injection
  // Fixed: Prop type onAddPhoto now omits companyId to allow parent App.tsx to handle it
  onAddPhoto: (photo: Omit<JobPhoto, 'id' | 'dataUrl' | 'companyId'>, file: File) => Promise<JobPhoto>;
  onDeletePhoto: (id: string) => void;
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

type MediaSubFolder = 'all' | 'photos' | 'tickets';

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, jobs, tickets, initialSearch = null, isDarkMode, companyId, onAddPhoto, onDeletePhoto }) => {
  // Explorer State
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialSearch || null);
  const [selectedSubFolder, setSelectedSubFolder] = useState<MediaSubFolder>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  
  // Selection State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Lightbox State
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  
  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync folder selection to parent initial search if needed
  useEffect(() => {
    if (initialSearch) {
      setSelectedFolder(initialSearch);
      setSelectedSubFolder('all');
    }
  }, [initialSearch]);

  // Data Organization - Merging Photos and Ticket Documents
  const folderData = useMemo(() => {
    const groups: Record<string, UnifiedAsset[]> = {};
    
    // Ensure all jobs have a bucket
    jobs.forEach(j => { if (j.jobNumber && !groups[j.jobNumber]) groups[j.jobNumber] = []; });
    
    // Fill buckets with Photos
    photos.forEach(p => {
      if (!groups[p.jobNumber]) groups[p.jobNumber] = [];
      groups[p.jobNumber].push({ ...p, type: 'photo' });
    });

    // Fill buckets with Ticket Documents
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
          ticketNo: t.ticketNo
        });
      }
    });

    return groups;
  }, [photos, jobs, tickets]);

  const filteredSidebarFolders = useMemo(() => {
    return Object.keys(folderData)
      .filter(num => num.toLowerCase().includes(sidebarSearch.toLowerCase()))
      .sort((a, b) => b.localeCompare(a));
  }, [folderData, sidebarSearch]);

  const currentGalleryPhotos = useMemo(() => {
    if (!selectedFolder) return [];
    let assets = folderData[selectedFolder] || [];
    
    // Apply Subfolder Filter
    if (selectedSubFolder === 'photos') {
      assets = assets.filter(a => a.type === 'photo');
    } else if (selectedSubFolder === 'tickets') {
      assets = assets.filter(a => a.type === 'ticket');
    } else {
        // In "all" view, we don't show the gallery at all
        return [];
    }

    return assets.filter(p => 
      p.caption.toLowerCase().includes(gallerySearch.toLowerCase())
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [folderData, selectedFolder, gallerySearch, selectedSubFolder]);

  // Selection Logic
  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    const selectedPhotos = Array.from(selectedIds).filter(id => 
        currentGalleryPhotos.find(p => p.id === id && p.type === 'photo')
    );

    if (selectedPhotos.length === 0) {
      alert("Ticket documents cannot be deleted from the Media tab. Manage them in the Vault or Job Review sections.");
      return;
    }

    if (!confirm(`Permanently delete ${selectedPhotos.length} selected site photos? Ticket documents will be skipped.`)) return;
    
    for (const id of selectedPhotos) {
      await onDeletePhoto(id);
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  // Upload Logic
  const processBatch = async (files: File[]) => {
    if (!selectedFolder) {
      alert("Select a project folder first.");
      return;
    }

    setIsUploading(true);
    const newItems: UploadQueueItem[] = files.map(f => ({ 
      id: Math.random().toString(36).substr(2, 9),
      file: f, 
      previewUrl: URL.createObjectURL(f),
      progress: 0, 
      status: 'pending' 
    }));
    
    setUploadQueue(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        const pInterval = setInterval(() => {
          setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, progress: Math.min(q.progress + 15, 90) } : q));
        }, 150);

        // Fixed: PassingjobNumber, timestamp, caption correctly to match prop signature Omit JobPhoto 'id' | 'dataUrl' | 'companyId'
        await onAddPhoto({
          jobNumber: selectedFolder,
          timestamp: Date.now(),
          caption: `Site Photo ${new Date().toLocaleDateString()}`
        }, item.file);

        clearInterval(pInterval);
        setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, status: 'complete', progress: 100 } : q));
      } catch (err) {
        setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
      }
    }
    setIsUploading(false);
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(q => q.status !== 'complete'));
    }, 4000);
  };

  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-in h-[calc(100vh-140px)] -mt-2 overflow-hidden">
      
      {/* SIDEBAR EXPLORER */}
      <aside className={`lg:w-72 shrink-0 flex flex-col rounded-3xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="p-4 border-b border-black/5 bg-black/5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            Job Directory
          </h3>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search directory..." 
              className={`w-full pl-8 pr-3 py-2 text-[11px] font-bold rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-black/20 border-white/5 text-white' : 'bg-white border-slate-100'}`}
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
            <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
          {filteredSidebarFolders.map(num => {
            const count = folderData[num].length;
            const isActive = selectedFolder === num;
            return (
              <button
                key={num}
                onClick={() => {
                  setSelectedFolder(num);
                  setSelectedSubFolder('all');
                  setGallerySearch('');
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all group ${
                  isActive 
                    ? 'bg-brand text-slate-900 shadow-lg shadow-brand/10' 
                    : isDarkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isActive ? 'bg-white/20' : isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-tight">#{num}</span>
                </div>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg ${isActive ? 'bg-white/20' : 'bg-black/5 text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumb Header */}
        <div className={`mb-4 flex flex-col gap-4 p-4 rounded-3xl border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/5 text-brand' : 'bg-brand/10 text-brand'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest">{selectedFolder ? `Job #${selectedFolder}` : 'Asset Vault'}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                   <button 
                    onClick={() => { setSelectedSubFolder('all'); setGallerySearch(''); }}
                    className={`text-[9px] font-black uppercase tracking-tighter hover:text-brand transition-colors ${selectedSubFolder === 'all' ? 'text-brand underline underline-offset-4' : 'text-slate-400'}`}
                   >
                     Overview
                   </button>
                   {selectedSubFolder !== 'all' && (
                     <>
                        <span className="text-slate-700 text-[10px]">/</span>
                        <span className="text-[9px] font-black uppercase tracking-tighter text-brand">
                          {selectedSubFolder === 'photos' ? 'Site Photos' : 'Ticket Vault'}
                        </span>
                     </>
                   )}
                </div>
              </div>
            </div>

            {selectedFolder && selectedSubFolder !== 'all' && (
              <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-right">
                <div className="relative flex-1 sm:w-48">
                  <input 
                    type="text" 
                    placeholder="Search folder..." 
                    className={`w-full pl-8 pr-3 py-2 text-[11px] font-bold rounded-xl border outline-none transition-all ${isDarkMode ? 'bg-black/20 border-white/5 text-white' : 'bg-slate-50 border-slate-100'}`}
                    value={gallerySearch}
                    onChange={e => setGallerySearch(e.target.value)}
                  />
                  <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                
                <button 
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    setSelectedIds(new Set());
                  }}
                  className={`p-2 rounded-xl border transition-all ${selectionMode ? 'bg-brand border-brand text-slate-900 shadow-lg' : isDarkMode ? 'bg-white/5 border-white/5 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-100 text-slate-600 hover:text-brand'}`}
                  title="Bulk Selection"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </button>

                {selectedSubFolder === 'photos' && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl bg-brand border border-brand text-slate-900 shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Gallery Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
          {selectedFolder ? (
            <div className="animate-in fade-in duration-500">
              {/* Folder View (Visible only when no subfolder is selected) */}
              {selectedSubFolder === 'all' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                   <button 
                    onClick={() => setSelectedSubFolder('photos')}
                    className={`group p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-6 ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/40'}`}
                   >
                     <div className="w-16 h-16 rounded-[1.5rem] bg-brand/10 text-brand flex items-center justify-center transition-transform group-hover:scale-110">
                       <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     </div>
                     <div>
                       <h3 className="text-sm font-black uppercase tracking-[0.2em]">Site Photos</h3>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                         {folderData[selectedFolder]?.filter(a => a.type === 'photo').length || 0} Registered Assets
                       </p>
                     </div>
                   </button>
                   
                   <button 
                    onClick={() => setSelectedSubFolder('tickets')}
                    className={`group p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-6 ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/40'}`}
                   >
                     <div className="w-16 h-16 rounded-[1.5rem] bg-rose-500/10 text-rose-500 flex items-center justify-center transition-transform group-hover:scale-110">
                       <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                     </div>
                     <div>
                       <h3 className="text-sm font-black uppercase tracking-[0.2em]">Ticket Vault</h3>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                         {folderData[selectedFolder]?.filter(a => a.type === 'ticket').length || 0} Compliance PDFs
                       </p>
                     </div>
                   </button>
                </div>
              ) : (
                /* Subfolder Expanded Gallery */
                <>
                  <div className="flex items-center gap-4 mb-6 animate-in slide-in-from-left">
                     <button 
                      onClick={() => { setSelectedSubFolder('all'); setGallerySearch(''); }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-brand'}`}
                     >
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                       Exit Folder
                     </button>
                  </div>

                  {currentGalleryPhotos.length > 0 ? (
                    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                      {currentGalleryPhotos.map((asset, idx) => {
                        const isSelected = selectedIds.has(asset.id);
                        const isTicket = asset.type === 'ticket';
                        const isPdfAsset = isPdf(asset.dataUrl);

                        return (
                          <div 
                            key={asset.id}
                            onClick={() => selectionMode ? toggleSelection(asset.id) : setActivePhotoIndex(idx)}
                            className={`break-inside-avoid relative group rounded-[2rem] border overflow-hidden transition-all duration-500 cursor-pointer ${
                              isSelected 
                                ? 'ring-4 ring-brand border-brand scale-[0.98]' 
                                : isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'
                            }`}
                          >
                            <div className="relative aspect-auto min-h-[100px] overflow-hidden flex items-center justify-center bg-black/10">
                              {isPdfAsset ? (
                                <div className="w-full py-16 flex flex-col items-center justify-center bg-slate-800 text-white gap-3">
                                   <svg className="w-12 h-12 text-rose-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363zM12 2H5c-1.103 0-2 .897-2 2v16c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V9l-7-7z"/><path d="M19 9h-7V2l7 7z"/></svg>
                                   <span className="text-[10px] font-black uppercase tracking-widest opacity-60">PDF Document</span>
                                </div>
                              ) : (
                                <img src={asset.dataUrl} className="w-full h-auto object-cover group-hover:scale-110 transition-transform duration-1000" loading="lazy" />
                              )}
                            </div>
                            
                            <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center gap-2 ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              {selectionMode ? (
                                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-brand border-brand' : 'bg-white/20 border-white/40'}`}>
                                  {isSelected && <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                              ) : (
                                <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 text-white scale-90 group-hover:scale-100 transition-all">
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                              )}
                            </div>

                            <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                              <div className={`px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/10 text-[9px] font-black text-white uppercase tracking-widest max-w-[80%] truncate ${isTicket ? 'bg-rose-600/80' : 'bg-black/60'}`}>
                                {asset.caption}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center py-20">
                      <div className="w-20 h-20 rounded-[2.5rem] bg-brand/10 text-brand flex items-center justify-center mb-6">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Folder Empty</h3>
                      <p className="text-[10px] font-bold uppercase tracking-tighter mt-1">No assets match your search in this bucket</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
               <div className="relative mb-12 animate-bounce duration-[2000ms]">
                 <div className="w-32 h-32 rounded-[3.5rem] bg-brand/5 border-2 border-dashed border-brand/20 flex items-center justify-center">
                   <svg className="w-16 h-16 text-brand/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                 </div>
                 <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-brand rounded-full flex items-center justify-center text-slate-900 shadow-xl border-4 border-[#0f172a]">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                 </div>
               </div>
               <h2 className="text-lg font-black uppercase tracking-[0.2em] text-slate-500">Workspace Selection Required</h2>
               <p className="max-w-xs text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 leading-relaxed">Select a job directory from the explorer on the left to browse site photos and compliance documentation.</p>
            </div>
          )}
        </div>
      </main>

      {/* BATCH ACTION BAR */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-white/10 px-6 py-4 rounded-[2rem] shadow-2xl flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-brand uppercase tracking-widest">{selectedIds.size} Items Selected</span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Bulk Management</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex items-center gap-2">
              <button 
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-rose-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-600 transition-all flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete Selected
              </button>
              <button 
                onClick={() => setSelectionMode(false)}
                className="px-4 py-2 bg-white/5 text-slate-400 rounded-xl font-black text-[9px] uppercase tracking-widest hover:text-white transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX OVERLAY */}
      {activePhotoIndex !== null && (
        <div className="fixed inset-0 z-[250] bg-slate-950/98 backdrop-blur-xl flex flex-col animate-in fade-in zoom-in duration-300">
          <div className="flex justify-between items-center p-6 lg:p-10 shrink-0">
            <div className="flex flex-col">
              <h4 className="text-white font-black uppercase tracking-widest text-sm">Job #{selectedFolder} Media Archive</h4>
              <p className="text-brand text-[10px] font-black uppercase tracking-tighter mt-1">Professional Documentation Preview</p>
            </div>
            <button 
              onClick={() => setActivePhotoIndex(null)}
              className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all active:scale-90"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-6 gap-10 overflow-hidden">
            <button 
              disabled={activePhotoIndex === 0}
              onClick={() => setActivePhotoIndex(activePhotoIndex - 1)}
              className="hidden lg:flex p-6 rounded-full bg-white/5 text-white hover:bg-white/10 disabled:opacity-0 transition-all"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div className="relative group max-w-full max-h-full flex items-center justify-center flex-1">
              <div className="w-full max-w-5xl h-full flex items-center justify-center overflow-hidden">
                {isPdf(currentGalleryPhotos[activePhotoIndex].dataUrl) ? (
                  <iframe 
                    src={`${currentGalleryPhotos[activePhotoIndex].dataUrl}#toolbar=0`} 
                    className="w-full h-full min-h-[60vh] rounded-[2rem] border border-white/10 bg-white" 
                  />
                ) : (
                  <img 
                    src={currentGalleryPhotos[activePhotoIndex].dataUrl} 
                    className="max-w-full max-h-[70vh] rounded-[2rem] shadow-2xl border border-white/10 object-contain" 
                  />
                )}
              </div>
              
              <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 lg:relative lg:translate-x-0 lg:bottom-0 lg:ml-10 bg-slate-900/50 backdrop-blur-md border border-white/10 p-6 rounded-[2.5rem] w-full lg:w-80 shrink-0 animate-in slide-in-from-right">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Description</span>
                    <p className="text-xs font-bold text-white leading-relaxed">{currentGalleryPhotos[activePhotoIndex].caption}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Entry Date</span>
                      <p className="text-[10px] font-black text-brand uppercase">{new Date(currentGalleryPhotos[activePhotoIndex].timestamp).toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Category</span>
                      <p className={`text-[10px] font-black uppercase ${currentGalleryPhotos[activePhotoIndex].type === 'ticket' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {currentGalleryPhotos[activePhotoIndex].type === 'ticket' ? 'Ticket PDF' : 'Site Photo'}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex gap-2">
                    <a 
                      href={currentGalleryPhotos[activePhotoIndex].dataUrl} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 rounded-2xl bg-brand text-slate-900 font-black text-[9px] uppercase tracking-widest text-center hover:scale-105 transition-all"
                    >
                      Open Full Asset
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <button 
              disabled={activePhotoIndex === currentGalleryPhotos.length - 1}
              onClick={() => setActivePhotoIndex(activePhotoIndex + 1)}
              className="hidden lg:flex p-6 rounded-full bg-white/5 text-white hover:bg-white/10 disabled:opacity-0 transition-all"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          
          {/* Filmstrip View */}
          <div className="p-8 hidden lg:flex items-center justify-center gap-2 overflow-x-auto no-scrollbar">
            {currentGalleryPhotos.map((p, i) => (
              <button 
                key={p.id}
                onClick={() => setActivePhotoIndex(i)}
                className={`w-14 h-14 rounded-xl border-2 transition-all shrink-0 overflow-hidden flex items-center justify-center ${activePhotoIndex === i ? 'border-brand scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'} bg-slate-800`}
              >
                {isPdf(p.dataUrl) ? (
                   <svg className="w-6 h-6 text-rose-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z"/></svg>
                ) : (
                   <img src={p.dataUrl} className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* UPLOAD STATUS DRAWER */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-24 right-6 w-80 z-[200] animate-in slide-in-from-right">
          <div className={`${isDarkMode ? 'bg-slate-900/95 border-white/10' : 'bg-white border-slate-200 shadow-2xl'} backdrop-blur-xl border rounded-[2rem] overflow-hidden`}>
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between bg-black/5">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isUploading ? 'bg-brand text-slate-900' : 'bg-emerald-500 text-white'}`}>
                  {isUploading ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest">{isUploading ? 'Syncing...' : 'Sync Complete'}</h4>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Documentation Pipeline</p>
                </div>
              </div>
              <button onClick={() => setUploadQueue([])} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="max-h-60 overflow-y-auto no-scrollbar p-3 space-y-2">
              {uploadQueue.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-2xl bg-black/5 border border-black/5">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-black/10">
                    <img src={item.previewUrl} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-tight truncate">{item.file.name}</p>
                    <div className="w-full h-1 bg-black/10 rounded-full mt-1 overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-rose-500' : 'bg-brand'}`} style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                  {item.status === 'complete' && <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN INPUTS */}
      <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => processBatch(Array.from(e.target.files || []))} />

    </div>
  );
};

export default PhotoManager;
