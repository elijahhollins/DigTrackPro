import React, { useState } from 'react';
import { useModalDismiss } from '../utils/useModalDismiss.ts';

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  isDarkMode?: boolean;
}

// A pure-React confirmation dialog used in place of window.confirm(), which is
// suppressed in sandboxed contexts (e.g. Vercel preview iframes) and would make
// confirm-gated actions silently do nothing. Errors are shown inline instead of
// via window.alert (also suppressed in those contexts).
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onClose, isDarkMode }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Escape / backdrop click cancel the dialog, but not while the action runs.
  const backdropRef = useModalDismiss<HTMLDivElement>(onClose, !isBusy);

  const handleConfirm = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[190] flex justify-center items-center p-4">
      <div className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="p-6 space-y-5">
          <p className={`text-[13px] font-bold text-center ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{message}</p>
          {error && <p className="text-[10px] font-bold text-center text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className={`flex-1 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 ${isDarkMode ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleConfirm}
              className="flex-1 bg-emerald-600 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isBusy ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Working...
                </>
              ) : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
