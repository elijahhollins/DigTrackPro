
import React, { useState, useMemo, useCallback } from 'react';
import { JobPhoto } from '../types';

interface PhotoManagerProps {
  photos: JobPhoto[];
  initialSearch?: string;
  onAddPhoto: (photo: JobPhoto) => void;
  onDeletePhoto: (id: string) => void;
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, initialSearch = '', onAddPhoto, onDeletePhoto }) => {
  const [photoSearch, setPhotoSearch] = useState(initialSearch);
  const [uploadingJobNum, setUploadingJobNum] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const filteredPhotos = useMemo(() => {
    return photos.filter(p => p.jobNumber.toLowerCase().includes(photoSearch.toLowerCase()));
  }, [photos, photoSearch]);

  const processFile = (file: File) => {
    if (!file || !uploadingJobNum) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    const reader = new FileReader();
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = (event) => {
      // Small delay to ensure the progress bar hits 100% and looks natural
      setTimeout(() => {
        const dataUrl = event.target?.result as string;
        const newPhoto: JobPhoto = {
          id: crypto.randomUUID(),
          jobNumber: uploadingJobNum.trim(),
          dataUrl,
          timestamp: Date.now(),
          caption: caption.trim() || 'Site Photo'
        };
        
        onAddPhoto(newPhoto);
        
        setIsUploading(false);
        setUploadProgress(0);
        setShowSuccess(true);
        setCaption('');
        
        // Reset success message after 2.5 seconds
        setTimeout(() => setShowSuccess(false), 2500);
      }, 300);
    };

    reader.onerror = () => {
      setIsUploading(false);
      setUploadProgress(0);
      alert("Error reading file.");
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ''; // Reset input
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
      {/* Refined Upload Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-4">
            <div className="bg-orange-600 p-2.5 rounded-2xl shadow-lg shadow-orange-100">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight leading-none">Photo Documentation</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">Site Verification Registry</p>
            </div>
          </div>
          {showSuccess && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full border border-emerald-100 animate-in slide-in-from-right duration-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Entry Saved</span>
            </div>
          )}
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reference Job #</label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-slate-300 font-bold text-sm">#</span>
                  <input 
                    type="text" 
                    placeholder="e.g. 25-001"
                    className="w-full pl-9 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-100/50 focus:bg-white transition-all"
                    value={uploadingJobNum}
                    onChange={e => setUploadingJobNum(e.target.value)}
                    disabled={isUploading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                <input 
                  type="text" 
                  placeholder="North-east property line, etc."
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-orange-100/50 focus:bg-white transition-all"
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
                  ${!uploadingJobNum ? 'bg-slate-50 border-slate-100 cursor-not-allowed opacity-50' : 
                    isDragging ? 'bg-orange-50 border-orange-400' : 'bg-slate-50/50 border-slate-200 hover:border-orange-300 hover:bg-slate-50'}
                `}
              >
                {!uploadingJobNum ? (
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Enter Job # to Unlock</p>
                ) : isUploading ? (
                  <div className="flex flex-col items-center w-full px-12 gap-4">
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className="bg-orange-600 h-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(234,88,12,0.4)]"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">{uploadProgress}% Complete</p>
                    </div>
                  </div>
                ) : showSuccess ? (
                  <div className="flex flex-col items-center gap-2 animate-in zoom-in duration-300">
                    <div className="bg-emerald-500 text-white p-2.5 rounded-full shadow-lg shadow-emerald-100">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Processing Complete</p>
                  </div>
                ) : (
                  <>
                    <svg className={`w-10 h-10 ${isDragging ? 'text-orange-500 scale-110' : 'text-slate-300 group-hover:text-orange-400'} transition-all`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {isDragging ? 'Release to Upload' : 'Drag & Drop or click to browse'}
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Site Records Library</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Viewing {filteredPhotos.length} Documented Locations</p>
          </div>
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Filter by Job Number..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm shadow-sm outline-none focus:ring-4 focus:ring-orange-100/50 font-semibold"
              value={photoSearch}
              onChange={e => setPhotoSearch(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {filteredPhotos.map(photo => (
            <div key={photo.id} className="group bg-white rounded-[2rem] overflow-hidden shadow-sm border border-slate-100 hover:shadow-2xl hover:shadow-orange-100/30 hover:-translate-y-2 transition-all duration-500 animate-in fade-in zoom-in slide-in-from-bottom-4">
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-50">
                <img src={photo.dataUrl} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute top-3 left-3">
                  <span className="px-3 py-1.5 bg-orange-600/90 backdrop-blur text-white text-[9px] font-black rounded-xl tracking-widest uppercase shadow-lg shadow-orange-900/20">
                    Job #{photo.jobNumber}
                  </span>
                </div>
                <button 
                  onClick={() => onDeletePhoto(photo.id)}
                  className="absolute top-3 right-3 p-2.5 bg-white/95 backdrop-blur text-slate-400 hover:text-rose-600 rounded-xl shadow-lg hover:bg-white transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-300"
                  title="Remove Site Photo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <div className="p-5">
                <h4 className="text-xs font-black text-slate-700 line-clamp-1 group-hover:text-orange-600 transition-colors uppercase tracking-tight">{photo.caption}</h4>
                <div className="flex items-center gap-2 mt-3 text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    {new Date(photo.timestamp).toLocaleDateString()} · {new Date(photo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filteredPhotos.length === 0 && (
            <div className="col-span-full py-40 text-center bg-white rounded-[3rem] border-4 border-dashed border-slate-50">
              <div className="flex flex-col items-center opacity-30">
                <svg className="w-20 h-20 mb-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">No Site Records Found</p>
                <p className="text-[10px] text-slate-300 mt-2 font-bold uppercase tracking-widest">Try filtering by a different job number or register a new upload</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoManager;
