
import React, { useState } from 'react';
import { JobPrint } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { exportPdfWithAnnotations } from '../utils/pdfExport.ts';

interface PdfActionModalProps {
  print: JobPrint;
  action: 'open' | 'download';
  onClose: () => void;
  isDarkMode?: boolean;
}

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const PdfActionModal: React.FC<PdfActionModalProps> = ({ print, action, onClose, isDarkMode }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = action === 'open' ? 'Open' : 'Download';

  const handleWithoutAnnotations = () => {
    if (!print.url) return;
    if (action === 'open') {
      window.open(print.url, '_blank');
    } else {
      const baseUrl = print.url.split('?')[0];
      const downloadUrl = `${baseUrl}?download=${encodeURIComponent(print.fileName)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = print.fileName;
      if (isMobile) {
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 100);
      } else {
        link.click();
      }
    }
    onClose();
  };

  const handleWithAnnotations = async () => {
    if (!print.url) return;
    setIsGenerating(true);
    setError(null);
    try {
      const annotations = await apiService.getAnnotations(print.id);
      const blob = await exportPdfWithAnnotations(print.url, annotations, (page, total) => {
        setProgress({ page, total });
      });
      const objectUrl = URL.createObjectURL(blob);
      if (action === 'open') {
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        const nameParts = print.fileName.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop() : 'pdf';
        link.download = `${nameParts.join('.')}_annotated.${ext}`;
        if (isMobile) {
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(objectUrl); }, 100);
        } else {
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate annotated PDF');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!isGenerating ? onClose : undefined} />
      <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl border p-6 ${
        isDarkMode
          ? 'bg-slate-900 border-white/10'
          : 'bg-white border-slate-200'
      }`}>
        <h3 className={`text-sm font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
          {label} PDF
        </h3>
        <p className={`text-xs mb-5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} title={print.fileName}>
          {print.fileName}
        </p>

        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            <p className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {progress
                ? `Rendering page ${progress.page} of ${progress.total}…`
                : 'Loading annotations…'}
            </p>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-xs text-rose-500 mb-4 font-bold">{error}</p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleWithAnnotations}
                className="w-full px-4 py-3 bg-brand text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                With Annotations
              </button>
              <button
                onClick={handleWithoutAnnotations}
                className={`w-full px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border ${
                  isDarkMode
                    ? 'bg-slate-800 text-white border-white/10 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Without Annotations
              </button>
              <button
                onClick={onClose}
                className={`w-full px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${
                  isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PdfActionModal;
