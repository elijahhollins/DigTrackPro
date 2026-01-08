
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { JobPhoto, Job, DigTicket } from '../types.ts';

interface PhotoManagerProps {
  photos: JobPhoto[];
  jobs: Job[];
  tickets: DigTicket[];
  initialSearch?: string;
  isDarkMode?: boolean;
  onAddPhoto: (photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File) => Promise<JobPhoto>;
  onDeletePhoto: (id: string) => void;
}

interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, jobs, tickets, initialSearch = '', isDarkMode, onAddPhoto, onDeletePhoto }) => {
  const [photoSearch, setPhotoSearch] = useState(initialSearch);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialSearch || null);
  
  const [uploadingJobNum, setUploadingJobNum] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync internal job number if folder is selected
  useEffect(() => {
    if (selectedFolder) setUploadingJobNum(selectedFolder);
  }, [selectedFolder]);

  // Folder logic: Combine jobs and tickets to ensure every project has a directory
  const folderData = useMemo(() => {
    const groups: Record<string, JobPhoto[]> = {};
    jobs.forEach(j => { if (j.jobNumber && !groups[j.jobNumber]) groups[j.jobNumber] = []; });
    tickets.forEach(t => { if (t.jobNumber && !groups[t.jobNumber]) groups[t.jobNumber] = []; });
    photos.forEach(p => {
      if (!groups[p.jobNumber]) groups[p.jobNumber] = [];
      groups[p.jobNumber].push(p);
    });
    return groups;
  }, [photos, jobs, tickets]);

  const filteredFolders = useMemo(() => {
    return Object.keys(folderData).filter(num => 
      num.toLowerCase().includes(photoSearch.toLowerCase())
    ).sort((a, b) => b.localeCompare(a));
  }, [folderData, photoSearch]);

  const displayedPhotos = useMemo(() => {
    if (!selectedFolder) return [];
    return (folderData[selectedFolder] || []).filter(p => 
      p.caption.toLowerCase().includes(photoSearch.toLowerCase())
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [folderData, selectedFolder, photoSearch]);

  const processBatch = async (files: File[]) => {
    const jobNumToUse = selectedFolder || uploadingJobNum;
    if (!files.length) return;
    
    if (!jobNumToUse) {
      alert("Please specify a Job Number before uploading.");
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
        // Mock progress for smoother UI feel
        const pInterval = setInterval(() => {
          setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, progress: Math.min(q.progress + 10, 90) } : q));
        }, 100);

        await onAddPhoto({
          jobNumber: jobNumToUse.trim(),
          timestamp: Date.now(),
          caption: caption.trim() || `Site Photo ${new Date().toLocaleDateString()}`
        }, item.file);

        clearInterval(pInterval);
        setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, status: 'complete', progress: 100 } : q));
      } catch (err) {
        setUploadQueue(current => current.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
      }
    }

    setIsUploading(false);
    // Auto-clear completed items after a delay
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(q => q.status !== 'complete'));
    }, 5000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    processBatch(files);
    e.target.value = '';
  };

  const stats = useMemo(() => {
    const total = uploadQueue.length;
    const completed = uploadQueue.filter(q => q.status === 'complete').length;
    const active = uploadQueue.filter(q => q.status === 'uploading').length;
    return { total, completed, active };
  }, [uploadQueue]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-40">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <button onClick={() => setSelectedFolder(null)} className="hover:text-brand transition-colors">Library</button>
            {selectedFolder && (
              <>
                <svg className="w-2.5 h-2.5 opacity-30" fill="currentColor" viewBox="0 0 20 20"><path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" /></svg>
                <span className="text-brand">Job #{selectedFolder}</span>
              </>
            )}
          </div>
          <h2 className={`text-3xl font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {selectedFolder ? `Media Collection` : 'Project Assets'}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Search library..." 
              className={`pl-10 pr-4 py-2.5 text-xs font-bold rounded-2xl border outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}
              value={photoSearch}
              onChange={e => setPhotoSearch(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 transition-colors group-focus-within:text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          
          {selectedFolder && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-brand text-[#0f172a] px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
              Add Media
            </button>
          )}
        </div>
      </div>

      {/* DROP ZONE / UPLOAD CONFIG */}
      {!selectedFolder && (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); processBatch(Array.from(e.dataTransfer.files)); }}
          className={`${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-xl shadow-slate-200/50'} rounded-[2.5rem] border overflow-hidden p-8 transition-all`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                  <h3 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Smart Batch Uploader</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Drag photos into project directories</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Destination Job #</label>
                  <input 
                    type="text" 
                    placeholder="Enter Job ID..." 
                    className={`w-full px-4 py-3 rounded-2xl border text-xs font-black outline-none transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-4 focus:ring-brand/10'}`}
                    value={uploadingJobNum}
                    onChange={e => setUploadingJobNum(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Caption Default</label>
                  <input 
                    type="text" 
                    placeholder="Optional details..." 
                    className={`w-full px-4 py-3 rounded-2xl border text-xs font-bold outline-none transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-4 focus:ring-brand/10'}`}
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div 
              className={`relative h-[180px] rounded-[2rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 overflow-hidden group ${
                isDragging ? 'bg-brand/10 border-brand scale-[0.98]' : 'bg-black/5 border-slate-200 hover:border-brand/40'
              } ${!uploadingJobNum ? 'opacity-50 grayscale' : 'cursor-pointer'}`}
              onClick={() => uploadingJobNum && fileInputRef.current?.click()}
            >
              <div className={`p-4 rounded-full transition-all ${isDragging ? 'bg-brand text-white scale-110' : 'bg-white/10 text-slate-400 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {isDragging ? 'Drop to Upload' : 'Click or Drop Multiple Photos'}
              </p>
              {!uploadingJobNum && <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] flex items-center justify-center"><span className="text-[9px] font-black uppercase bg-slate-800 text-white px-3 py-1.5 rounded-full tracking-widest shadow-xl">Set Job # First</span></div>}
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN FILE INPUT */}
      <input 
        type="file" 
        multiple 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange} 
      />

      {/* FLOATING PROGRESS BAR (ACTIVE SESSION) */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-[200] animate-in slide-in-from-bottom">
          <div className={`${isDarkMode ? 'bg-[#1e293b]/95' : 'bg-white/95 shadow-2xl'} backdrop-blur-xl border border-white/10 p-5 rounded-3xl flex flex-col gap-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${stats.active > 0 ? 'bg-brand text-slate-900' : 'bg-emerald-500 text-white'}`}>
                  {stats.active > 0 ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest">
                    {stats.active > 0 ? `Uploading ${stats.active} of ${stats.total} items` : `Sync Complete • ${stats.total} Files`}
                  </h4>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Digital Asset Pipeline Active</p>
                </div>
              </div>
              <button onClick={() => setUploadQueue([])} className="p-2 text-slate-400 hover:text-slate-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {uploadQueue.map(item => (
                <div key={item.id} className="relative flex-shrink-0 w-12 h-12 rounded-xl border border-white/5 overflow-hidden group">
                  <img src={item.previewUrl} className="w-full h-full object-cover" />
                  <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${item.status === 'complete' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {item.status === 'complete' ? <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <span className="text-[9px] font-black text-white">{item.progress}%</span>}
                  </div>
                  {item.status === 'uploading' && <div className="absolute bottom-0 left-0 h-0.5 bg-brand transition-all" style={{ width: `${item.progress}%` }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      {!selectedFolder ? (
        /* PROJECT DIRECTORY VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 px-1">
          {filteredFolders.map(jobNum => {
            const photosCount = folderData[jobNum].length;
            const lastPhoto = photosCount > 0 ? folderData[jobNum][0].dataUrl : null;
            
            return (
              <div key={jobNum} className="group flex flex-col gap-3">
                <button 
                  onClick={() => setSelectedFolder(jobNum)} 
                  className="relative aspect-square w-full active:scale-95 transition-all"
                >
                  <div className={`absolute inset-0 translate-x-2 -translate-y-2 rounded-[2.5rem] border opacity-10 ${isDarkMode ? 'bg-white border-white' : 'bg-slate-400 border-slate-500'}`} />
                  
                  <div className={`relative h-full w-full rounded-[2.5rem] border-2 transition-all flex items-center justify-center overflow-hidden ${
                    isDarkMode ? 'bg-[#1e293b] border-white/10 group-hover:border-brand/50' : 'bg-white border-slate-200 shadow-md group-hover:border-brand/40 shadow-slate-200/50'
                  }`}>
                    {lastPhoto ? (
                      <>
                        <img src={lastPhoto} className="absolute inset-0 w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 group-hover:scale-110 transition-all duration-1000" alt="" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 opacity-20 group-hover:opacity-40 transition-opacity">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M20 18c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h5l2 2h7c1.1 0 2 .9 2 2v10z" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-widest">No Media</span>
                      </div>
                    )}
                    
                    {/* Badge */}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md text-[10px] font-black text-white uppercase tracking-widest border border-white/10">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" /></svg>
                      {photosCount}
                    </div>
                  </div>
                </button>

                <div className="px-2">
                  <p className={`text-[13px] font-black uppercase tracking-tight truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Job #{jobNum}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Project Directory</p>
                </div>
              </div>
            );
          })}
          
          {filteredFolders.length === 0 && (
            <div className="col-span-full py-32 text-center opacity-20">
              <svg className="w-20 h-20 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              <p className="text-lg font-black uppercase tracking-[0.3em]">Vault Empty</p>
              <p className="text-[10px] font-bold uppercase mt-2 tracking-widest">No matching project folders found</p>
            </div>
          )}
        </div>
      ) : (
        /* ASSET GALLERY VIEW */
        <div className="space-y-6">
          {displayedPhotos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
              {displayedPhotos.map(photo => (
                <div key={photo.id} className={`group relative rounded-[2.5rem] overflow-hidden border transition-all hover:shadow-2xl hover:-translate-y-1 ${
                  isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-lg shadow-slate-200/50'
                }`}>
                  <div className="aspect-[4/3] relative overflow-hidden bg-black/5">
                    <img 
                      src={photo.dataUrl} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                      loading="lazy" 
                      alt={photo.caption}
                    />
                    
                    {/* Controls Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                       <button 
                        onClick={() => { if(confirm("Permanently delete this project asset?")) onDeletePhoto(photo.id); }}
                        className="p-4 bg-rose-500 text-white rounded-3xl hover:scale-110 active:scale-95 transition-all shadow-2xl"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>

                    {/* Metadata Badges */}
                    <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1">
                      <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[8px] font-black text-white uppercase border border-white/10">
                        {new Date(photo.timestamp).toLocaleDateString()}
                      </div>
                      <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[8px] font-black text-white uppercase border border-white/10">
                        {new Date(photo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <p className={`text-xs font-black tracking-tight leading-tight truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                      {photo.caption}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Verified Log</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-40 text-center border-2 border-dashed border-slate-200/50 rounded-[4rem] flex flex-col items-center justify-center opacity-30">
              <div className="bg-slate-100 dark:bg-white/5 w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-lg font-black uppercase tracking-widest">Folder Empty</h3>
              <p className="text-[10px] font-bold mt-2 uppercase tracking-widest">Documentation required for Job #{selectedFolder}</p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 px-8 py-3 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                Upload First Photo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PhotoManager;
