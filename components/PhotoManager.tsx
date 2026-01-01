
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
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const filteredPhotos = useMemo(() => {
    return photos.filter(p => p.jobNumber.toLowerCase().includes(photoSearch.toLowerCase()));
  }, [photos, photoSearch]);

  const processFile = (file: File) => {
    if (!file || !uploadingJobNum) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newPhoto: JobPhoto = {
        id: crypto.randomUUID(),
        jobNumber: uploadingJobNum.trim(),
        dataUrl,
        timestamp: Date.now(),
        caption: caption.trim() || 'Site Photo'
      };
      
      onAddPhoto(newPhoto);
      
      // Feedback Loop
      setIsUploading(false);
      setShowSuccess(true);
      setCaption('');
      
      // Reset success message after 2 seconds
      setTimeout(() => setShowSuccess(false), 2000);
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
    if (uploadingJobNum) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && uploadingJobNum) processFile(file);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Refined Upload Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            Upload Site Photos
          </h2>
          {uploadingJobNum && (
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Ready for {uploadingJobNum}
            </span>
          )}
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Required Information</label>
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-400 font-bold text-sm">#</span>
                  <input 
                    type="text" 
                    placeholder="Job Number (e.g. 24-101)"
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold"
                    value={uploadingJobNum}
                    onChange={e => setUploadingJobNum(e.target.value)}
                  />
                </div>
                <input 
                  type="text" 
                  placeholder="What are we looking at? (Optional)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photo Attachment</label>
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative h-[116px] border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-2 group
                  ${!uploadingJobNum ? 'bg-slate-50 border-slate-100 cursor-not-allowed opacity-50' : 
                    isDragging ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/50 border-slate-200 hover:border-blue-300 hover:bg-slate-50'}
                `}
              >
                {!uploadingJobNum ? (
                  <p className="text-xs font-medium text-slate-400">Enter Job # to enable upload</p>
                ) : isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-bold text-blue-600">Processing Photo...</p>
                  </div>
                ) : showSuccess ? (
                  <div className="flex flex-col items-center gap-1 animate-in zoom-in duration-300">
                    <div className="bg-emerald-100 p-2 rounded-full">
                      <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-xs font-bold text-emerald-600">Photo Added!</p>
                  </div>
                ) : (
                  <>
                    <svg className={`w-8 h-8 ${isDragging ? 'text-blue-500 scale-110' : 'text-slate-300 group-hover:text-blue-400'} transition-all`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <p className="text-xs font-bold text-slate-500">
                      {isDragging ? 'Drop photo here' : 'Drop photo or click to browse'}
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
            <h2 className="text-xl font-bold text-slate-900">Photo Library</h2>
            <p className="text-xs text-slate-500 font-medium">Viewing {filteredPhotos.length} site records</p>
          </div>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by Job #..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={photoSearch}
              onChange={e => setPhotoSearch(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredPhotos.map(photo => (
            <div key={photo.id} className="group bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                <img src={photo.dataUrl} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-1 bg-slate-900/80 backdrop-blur text-white text-[9px] font-black rounded-lg tracking-widest uppercase">
                    Job #{photo.jobNumber}
                  </span>
                </div>
                <button 
                  onClick={() => onDeletePhoto(photo.id)}
                  className="absolute top-2 right-2 p-2 bg-rose-600 text-white rounded-xl shadow-lg hover:bg-rose-700 transition-colors opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-200"
                  title="Delete Photo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <div className="p-4">
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">{photo.caption}</h4>
                <div className="flex items-center gap-1.5 mt-2">
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-[10px] font-medium text-slate-400">
                    {new Date(photo.timestamp).toLocaleDateString()} at {new Date(photo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filteredPhotos.length === 0 && (
            <div className="col-span-full py-32 text-center bg-white rounded-2xl border-2 border-dashed border-slate-100">
              <div className="flex flex-col items-center opacity-40">
                <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No photos found</p>
                <p className="text-xs text-slate-400 mt-1">Try a different job number or upload a new site record.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoManager;
