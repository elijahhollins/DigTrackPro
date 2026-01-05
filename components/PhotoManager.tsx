
import React, { useState, useMemo } from 'react';
import { JobPhoto } from '../types.ts';

interface PhotoManagerProps {
  photos: JobPhoto[];
  initialSearch?: string;
  isDarkMode?: boolean;
  onAddPhoto: (photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File) => Promise<JobPhoto>;
  onDeletePhoto: (id: string) => void;
}

// Define the structure for upload queue items to avoid inference issues
interface UploadQueueItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, initialSearch = '', isDarkMode, onAddPhoto, onDeletePhoto }) => {
  const [photoSearch, setPhotoSearch] = useState(initialSearch);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialSearch || null);
  
  const [uploadingJobNum, setUploadingJobNum] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const folderData = useMemo(() => {
    const groups: Record<string, JobPhoto[]> = {};
    photos.forEach(p => {
      if (!groups[p.jobNumber]) groups[p.jobNumber] = [];
      groups[p.jobNumber].push(p);
    });
    return groups;
  }, [photos]);

  const filteredFolders = useMemo(() => {
    return Object.keys(folderData).filter(num => 
      num.toLowerCase().includes(photoSearch.toLowerCase())
    ).sort((a, b) => b.localeCompare(a));
  }, [folderData, photoSearch]);

  const displayedPhotos = useMemo(() => {
    if (!selectedFolder) return [];
    return (folderData[selectedFolder] || []).filter(p => 
      p.caption.toLowerCase().includes(photoSearch.toLowerCase())
    );
  }, [folderData, selectedFolder, photoSearch]);

  const processBatch = async (files: File[]) => {
    if (!files.length || !uploadingJobNum) return;

    setIsUploading(true);
    // Explicitly type the new queue to allow status transitions
    const newQueue: UploadQueueItem[] = files.map(f => ({ 
      file: f, 
      progress: 0, 
      status: 'pending' 
    }));
    setUploadQueue(newQueue);

    for (let i = 0; i < newQueue.length; i++) {
      // Correctly assign status transitions
      newQueue[i].status = 'uploading';
      setUploadQueue([...newQueue]);

      try {
        // Simulation of progress
        const pInterval = setInterval(() => {
          newQueue[i].progress = Math.min(newQueue[i].progress + 15, 90);
          setUploadQueue([...newQueue]);
        }, 100);

        await onAddPhoto({
          jobNumber: uploadingJobNum.trim(),
          timestamp: Date.now(),
          caption: caption.trim() || `Site Photo ${i + 1}`
        }, newQueue[i].file);

        clearInterval(pInterval);
        newQueue[i].progress = 100;
        newQueue[i].status = 'complete';
      } catch (err) {
        newQueue[i].status = 'error';
      }
      setUploadQueue([...newQueue]);
    }

    setIsUploading(false);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setUploadQueue([]);
      setCaption('');
      setUploadingJobNum('');
    }, 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Cast to File[] to resolve unknown[] error
    const files = Array.from(e.target.files || []) as File[];
    processBatch(files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadingJobNum && !isUploading) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Cast to File[] to resolve unknown[] error
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length && uploadingJobNum && !isUploading) processBatch(files);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <div className={`${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} rounded-[2.5rem] shadow-sm border overflow-hidden`}>
        <div className={`p-8 border-b flex items-center justify-between ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50/30 border-slate-50'}`}>
          <div className="flex items-center gap-4">
            <div className="bg-brand p-2.5 rounded-2xl shadow-lg shadow-brand/20">
              <svg className="w-5 h-5 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            <div>
              <h2 className={`text-lg font-black tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Bulk Media Upload</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">Sequential Cloud Processing</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Destination Job #</label>
                <input type="text" placeholder="e.g. 25-001" className={`w-full px-5 py-4 border rounded-2xl text-sm font-semibold outline-none focus:ring-4 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} value={uploadingJobNum} onChange={e => setUploadingJobNum(e.target.value)} disabled={isUploading} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Default Caption</label>
                <input type="text" placeholder="Site progress view..." className={`w-full px-5 py-4 border rounded-2xl text-sm font-semibold outline-none focus:ring-4 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} value={caption} onChange={e => setCaption(e.target.value)} disabled={isUploading} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Drop Zone</label>
              <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`relative h-[134px] border-2 border-dashed rounded-[2rem] transition-all flex flex-col items-center justify-center gap-2 group ${!uploadingJobNum ? 'opacity-30 cursor-not-allowed' : isDragging ? 'bg-brand/10 border-brand' : 'bg-slate-50/50 border-slate-200 hover:border-brand/40'}`}>
                <svg className="w-10 h-10 text-slate-400 group-hover:text-brand transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select or Drop Multiple Photos</p>
                <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" disabled={!uploadingJobNum || isUploading} onChange={handleFileChange} />
              </div>
            </div>
          </div>

          {uploadQueue.length > 0 && (
            <div className="mt-8 space-y-4 animate-in fade-in duration-500">
               <div className="flex justify-between items-center px-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Processing Queue ({uploadQueue.filter(q => q.status === 'complete').length}/{uploadQueue.length})</p>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {uploadQueue.map((item, idx) => (
                    <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'}`}>
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${item.status === 'complete' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {item.status === 'uploading' ? <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : (idx + 1)}
                        </div>
                        <span className="text-[11px] font-bold truncate text-slate-500">{item.file.name}</span>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                         {item.status === 'complete' ? <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> : <span className="text-[9px] font-black text-slate-400">{item.progress}%</span>}
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-4">
            {selectedFolder && (
              <button onClick={() => setSelectedFolder(null)} className="p-3 rounded-2xl border bg-white border-slate-200 text-slate-400 hover:text-brand transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
            )}
            <div>
              <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{selectedFolder ? `Folder: ${selectedFolder}` : 'Project Library'}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Viewing verified project documentation</p>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <input type="text" placeholder="Filter jobs..." className={`w-full pl-10 pr-4 py-3 border rounded-2xl text-sm font-semibold outline-none focus:ring-4 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-100 text-slate-900'}`} value={photoSearch} onChange={e => setPhotoSearch(e.target.value)} />
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        {selectedFolder ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-4">
            {displayedPhotos.map(photo => (
              <div key={photo.id} className="group rounded-[2rem] overflow-hidden border bg-white border-slate-100 hover:shadow-2xl transition-all">
                <div className="aspect-[4/3] relative overflow-hidden bg-black/5">
                  <img src={photo.dataUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                  <button onClick={() => onDeletePhoto(photo.id)} className="absolute top-3 right-3 p-2 bg-white/95 rounded-xl text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
                <div className="p-4"><p className="text-xs font-black truncate text-slate-800">{photo.caption}</p></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 px-4">
            {filteredFolders.map(jobNum => (
              <button key={jobNum} onClick={() => setSelectedFolder(jobNum)} className={`group p-8 rounded-[2.5rem] border transition-all hover:scale-105 ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
                <div className="mb-4 text-slate-100 group-hover:text-brand/20 transition-colors">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M20 18c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h5l2 2h7c1.1 0 2 .9 2 2v10z" /></svg>
                </div>
                <span className={`text-xs font-black uppercase ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Job #{jobNum}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoManager;
