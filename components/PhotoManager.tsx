
import React, { useState, useMemo } from 'react';
import { JobPhoto } from '../types.ts';

interface PhotoManagerProps {
  photos: JobPhoto[];
  initialSearch?: string;
  isDarkMode?: boolean;
  onAddPhoto: (photo: Omit<JobPhoto, 'id' | 'dataUrl'>, file: File) => void;
  onDeletePhoto: (id: string) => void;
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, initialSearch = '', isDarkMode, onAddPhoto, onDeletePhoto }) => {
  const [photoSearch, setPhotoSearch] = useState(initialSearch);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialSearch || null);
  
  const [uploadingJobNum, setUploadingJobNum] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Group photos by JobNumber for folder view
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

  const processFile = (file: File) => {
    if (!file || !uploadingJobNum) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    // Note: Progress is simulated for UX because Supabase JS client 
    // doesn't natively expose progress events easily without XMLHttpRequest
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    onAddPhoto({
      jobNumber: uploadingJobNum.trim(),
      timestamp: Date.now(),
      caption: caption.trim() || 'Site Photo'
    }, file);
    
    // We assume it completes if no error thrown from parent
    setTimeout(() => {
      clearInterval(interval);
      setUploadProgress(100);
      setIsUploading(false);
      setShowSuccess(true);
      setCaption('');
      setUploadingJobNum('');
      setTimeout(() => setShowSuccess(false), 2500);
    }, 1000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadingJobNum && !isUploading) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && uploadingJobNum && !isUploading) processFile(file);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Upload Section */}
      <div className={`${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} rounded-[2.5rem] shadow-sm border overflow-hidden`}>
        <div className={`p-8 border-b flex items-center justify-between ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50/30 border-slate-50'}`}>
          <div className="flex items-center gap-4">
            <div className="bg-brand p-2.5 rounded-2xl shadow-lg shadow-brand/20">
              <svg className="w-5 h-5 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            <div>
              <h2 className={`text-lg font-black tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Upload Documentation</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">Supabase Storage Secure Access</p>
            </div>
          </div>
          {showSuccess && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full border border-emerald-100 animate-in slide-in-from-right duration-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Saved to Cloud</span>
            </div>
          )}
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Destination Job #</label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-slate-300 font-bold text-sm">#</span>
                  <input 
                    type="text" 
                    placeholder="e.g. 25-001"
                    className={`w-full pl-9 pr-4 py-4 border rounded-2xl text-sm font-semibold outline-none focus:ring-4 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white focus:ring-white/5' : 'bg-slate-50 border-slate-100 text-slate-900 focus:ring-brand/10 focus:bg-white'}`}
                    value={uploadingJobNum}
                    onChange={e => setUploadingJobNum(e.target.value)}
                    disabled={isUploading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Caption / Description</label>
                <input 
                  type="text" 
                  placeholder="North property line view..."
                  className={`w-full px-5 py-4 border rounded-2xl text-sm font-semibold outline-none focus:ring-4 transition-all ${isDarkMode ? 'bg-black/20 border-white/10 text-white focus:ring-white/5' : 'bg-slate-50 border-slate-100 text-slate-900 focus:ring-brand/10 focus:bg-white'}`}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  disabled={isUploading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Media Source</label>
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative h-[134px] border-2 border-dashed rounded-[2rem] transition-all flex flex-col items-center justify-center gap-2 group
                  ${!uploadingJobNum ? (isDarkMode ? 'bg-black/10 border-white/5 cursor-not-allowed opacity-30' : 'bg-slate-50 border-slate-100 cursor-not-allowed opacity-50') : 
                    isDragging ? (isDarkMode ? 'bg-brand/10 border-brand' : 'bg-orange-50 border-orange-400') : 
                    (isDarkMode ? 'bg-black/20 border-white/10 hover:border-brand/40' : 'bg-slate-50/50 border-slate-200 hover:border-brand/40 hover:bg-slate-50')}
                `}
              >
                {!uploadingJobNum ? (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter Job # to Unlock</p>
                ) : isUploading ? (
                  <div className="flex flex-col items-center w-full px-12 gap-4">
                    <div className="w-full bg-slate-200/20 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-brand h-full transition-all duration-300 ease-out shadow-lg shadow-brand/40"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-black text-brand uppercase tracking-[0.2em]">Uploading to Cloud...</p>
                  </div>
                ) : (
                  <>
                    <svg className={`w-10 h-10 ${isDragging ? 'text-brand scale-110' : 'text-slate-400 group-hover:text-brand'} transition-all`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {isDragging ? 'Release to Upload' : 'Click to Upload or Drag & Drop'}
                    </p>
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept="image/*" 
                      disabled={!uploadingJobNum || isUploading} 
                      onChange={handleFileChange}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-4">
            {selectedFolder && (
              <button 
                onClick={() => setSelectedFolder(null)}
                className={`p-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-brand shadow-sm'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  {selectedFolder ? `Folder: ${selectedFolder}` : 'Project Library'}
                </h2>
                {selectedFolder && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isDarkMode ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-500'}`}>
                    {folderData[selectedFolder]?.length || 0} Files
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                {selectedFolder ? 'Viewing job-specific records' : `${Object.keys(folderData).length} Job Folders Registered`}
              </p>
            </div>
          </div>
          
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder={selectedFolder ? "Search in this folder..." : "Filter job numbers..."}
              className={`w-full pl-10 pr-4 py-3 border rounded-2xl text-sm shadow-sm outline-none focus:ring-4 font-semibold transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:ring-white/5' : 'bg-white border-slate-100 text-slate-900 focus:ring-brand/10'}`}
              value={photoSearch}
              onChange={e => setPhotoSearch(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        {selectedFolder ? (
          /* Single Folder View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 px-4 animate-in slide-in-from-right-4 duration-500">
            {displayedPhotos.map(photo => (
              <div key={photo.id} className={`group rounded-[2rem] overflow-hidden border transition-all duration-500 hover:-translate-y-2 ${isDarkMode ? 'bg-[#1e293b] border-white/5 hover:shadow-2xl hover:shadow-black/40' : 'bg-white border-slate-100 hover:shadow-2xl hover:shadow-brand/20'}`}>
                <div className="aspect-[4/3] relative overflow-hidden bg-black/5">
                  <img src={photo.dataUrl} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                  <button 
                    onClick={() => onDeletePhoto(photo.id)}
                    className="absolute top-3 right-3 p-2.5 bg-white/95 backdrop-blur text-slate-400 hover:text-rose-600 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-300 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <div className="p-5">
                  <h4 className={`text-xs font-black line-clamp-1 transition-colors uppercase tracking-tight ${isDarkMode ? 'text-slate-200 group-hover:text-brand' : 'text-slate-700 group-hover:text-brand'}`}>{photo.caption}</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">{new Date(photo.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {displayedPhotos.length === 0 && (
              <div className="col-span-full py-32 text-center opacity-30">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No matching photos in this folder</p>
              </div>
            )}
          </div>
        ) : (
          /* Folders Overview */
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 px-4 animate-in slide-in-from-left-4 duration-500">
            {filteredFolders.map(jobNum => (
              <button 
                key={jobNum}
                onClick={() => setSelectedFolder(jobNum)}
                className={`group flex flex-col items-center p-8 rounded-[2.5rem] border transition-all hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-[#1e293b] border-white/5 hover:bg-white/5' : 'bg-white border-slate-200 hover:border-brand/40 shadow-sm'}`}
              >
                <div className="relative mb-4">
                  <svg className={`w-16 h-16 ${isDarkMode ? 'text-slate-700 group-hover:text-brand/40' : 'text-slate-100 group-hover:text-brand/10'} transition-colors`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 18c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h5l2 2h7c1.1 0 2 .9 2 2v10z" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className={`w-7 h-7 ${isDarkMode ? 'text-slate-400 group-hover:text-brand' : 'text-slate-300 group-hover:text-brand'} transition-all group-hover:scale-110`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                </div>
                <span className={`text-xs font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-slate-300 group-hover:text-brand' : 'text-slate-700 group-hover:text-brand'}`}>Job #{jobNum}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">{folderData[jobNum].length} Records</span>
              </button>
            ))}
            {filteredFolders.length === 0 && (
              <div className="col-span-full py-40 text-center opacity-30">
                <svg className="w-20 h-20 mx-auto mb-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">No project folders found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoManager;
