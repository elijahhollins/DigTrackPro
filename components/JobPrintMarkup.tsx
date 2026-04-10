
import React, { useState, useEffect, useRef } from 'react';
import { Job, JobPrint, User } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import PdfMarkupEditor from './PdfMarkupEditor.tsx';
import { PdfActionModal } from './PdfActionModal.tsx';

interface JobPrintMarkupProps {
  job: Job;
  isAdmin: boolean;
  sessionUser: User;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const JobPrintMarkup: React.FC<JobPrintMarkupProps> = ({ job, isAdmin, sessionUser, onClose }) => {
  const [prints, setPrints] = useState<JobPrint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [editingPrint, setEditingPrint] = useState<JobPrint | null>(null);
  const [actionModal, setActionModal] = useState<{ print: JobPrint; action: 'open' | 'download' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const brandColor = 'bg-brand';
  const brandText = 'text-brand';

  // Load all prints for this job
  useEffect(() => {
    const loadJobPrints = async () => {
      setIsLoading(true);
      try {
        const jobPrints = await apiService.getJobPrints(job.jobNumber);
        setPrints(jobPrints);
      } catch (err) {
        console.error("Failed to load job prints", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadJobPrints();
  }, [job.jobNumber]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.includes('pdf')) {
      alert('Please upload a PDF file');
      return;
    }
    setIsUploading(true);
    try {
      await apiService.uploadJobPrint(job.jobNumber, file, job.companyId);
      const updatedPrints = await apiService.getJobPrints(job.jobNumber);
      setPrints(updatedPrints);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert("Upload failed: " + msg);
    } finally {
      setIsUploading(false);
    }
  };


  if (editingPrint) {
    return (
      <PdfMarkupEditor
        print={editingPrint}
        sessionUser={sessionUser}
        onClose={() => setEditingPrint(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${brandColor} rounded-xl flex items-center justify-center text-slate-900 shadow-lg transition-all duration-500`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white text-sm font-black uppercase tracking-widest">Job Prints</h3>
            <p className={`${brandText} text-xs font-black uppercase tracking-tighter transition-all duration-500`}>Job #{job.jobNumber}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2 bg-brand text-slate-900 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Upload PDF"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {isUploading ? 'Uploading...' : 'Upload PDF'}
              </div>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 bg-rose-600 text-white rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className={`w-12 h-12 border-4 ${brandColor.replace('bg-', 'border-')} border-t-transparent rounded-full animate-spin mb-4 transition-colors`} />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading...</p>
          </div>
        ) : prints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-16 h-16 mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">No PDFs Uploaded</p>
            <p className="text-xs text-slate-500 mb-6 max-w-md">Upload PDF job prints to store and view them for this job.</p>
            {isAdmin && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-brand text-slate-900 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all hover:scale-105"
              >
                Upload First PDF
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {prints.map((print) => (
              <div
                key={print.id}
                className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-2xl p-6 hover:border-brand/40 transition-all"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-12 h-12 ${brandColor} rounded-xl flex items-center justify-center text-slate-900 flex-shrink-0`}>
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white text-sm font-bold mb-1 truncate" title={print.fileName}>
                      {print.fileName}
                    </h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {new Date(print.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setEditingPrint(print)}
                    className="flex-1 px-3 py-2.5 bg-brand text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5"
                    title="Open markup editor"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Markup
                  </button>
                  <button
                    onClick={() => setActionModal({ print, action: 'open' })}
                    className="px-3 py-2.5 bg-slate-800 text-white border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-slate-700 active:scale-95"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => setActionModal({ print, action: 'download' })}
                    className="px-3 py-2.5 bg-slate-800 text-white border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-slate-700 active:scale-95"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="application/pdf"
        onChange={handleFileUpload}
      />

      {actionModal && (
        <PdfActionModal
          print={actionModal.print}
          action={actionModal.action}
          onClose={() => setActionModal(null)}
        />
      )}
    </div>
  );
};

export default JobPrintMarkup;
