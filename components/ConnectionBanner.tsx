import React, { useEffect, useState } from 'react';
import { WifiOff, AlertTriangle, CloudUpload, X } from 'lucide-react';
import { useConnection } from '../lib/connectivity.ts';
import {
  discardOp,
  failedCount,
  listOutbox,
  pendingCount,
  retryOp,
  subscribeOutbox,
  type OutboxOp,
} from '../lib/outbox.ts';

/**
 * Tells the user, in words, when the app is not talking to the server.
 *
 * This used to be invisible: a Supabase outage produced a normal-looking UI with empty lists, so
 * "the backend is down" and "you have no tickets today" looked identical. For a crew deciding
 * whether it is safe to dig, that is the wrong failure mode.
 */
export const ConnectionBanner: React.FC = () => {
  const state = useConnection();

  if (state === 'online') return null;

  const offline = state === 'offline';
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 text-white text-xs font-bold flex items-center justify-center gap-2 ${
        offline ? 'bg-slate-700' : 'bg-amber-600'
      }`}
    >
      <Icon size={14} className="shrink-0" />
      <span>
        {offline
          ? "You're offline. Showing saved data - changes can't be saved right now."
          : "Can't reach the server. Showing saved data - this is not a sign that your tickets are gone."}
      </span>
    </div>
  );
};

/**
 * Inline notice for a view whose data could not be loaded.
 *
 * Takes the thrown error so it can distinguish the three cases that matter: too old to trust,
 * never downloaded, and an ordinary failure. Showing nothing is safer than showing stale
 * clearance information, but only if we say why.
 */
export const DataLoadError: React.FC<{ error: unknown; onRetry?: () => void }> = ({
  error,
  onRetry,
}) => {
  const message =
    (error as { message?: string })?.message || 'Something went wrong loading this data.';
  const stale = Boolean(error && typeof error === 'object' && 'isStaleCache' in error);

  return (
    <div
      className={`m-4 p-4 rounded-xl border text-sm ${
        stale
          ? 'bg-red-50 border-red-300 text-red-900'
          : 'bg-amber-50 border-amber-300 text-amber-900'
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">{stale ? 'Data too old to trust' : "Couldn't load this data"}</p>
          <p className="mt-1 opacity-90">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-3 py-1.5 rounded-lg bg-white/70 border border-current/20 font-bold"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Shows writes that are waiting to sync, and -- more importantly -- writes that could not be
 * saved at all.
 *
 * A queued change that quietly fails is worse than one that never got queued: the user believes
 * their no-show report or ticket edit is recorded when it is not. Parked operations surface here
 * until someone deals with them.
 */
export const PendingWrites: React.FC = () => {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<OutboxOp[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const refresh = () => {
      void pendingCount().then(setPending);
      void listOutbox('failed').then(setFailed);
      void failedCount();
    };
    refresh();
    return subscribeOutbox(refresh);
  }, []);

  if (pending === 0 && failed.length === 0) return null;

  return (
    <div className="m-4 space-y-2">
      {pending > 0 && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold"
        >
          <CloudUpload size={14} className="shrink-0" />
          {pending} change{pending === 1 ? '' : 's'} saved on this device, waiting to sync.
        </div>
      )}

      {failed.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-300 text-red-900 text-sm">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 font-bold text-left"
          >
            <AlertTriangle size={14} className="shrink-0" />
            {failed.length} change{failed.length === 1 ? '' : 's'} couldn&apos;t be saved - review
            {expanded ? ' (hide)' : ''}
          </button>

          {expanded && (
            <ul className="px-4 pb-3 space-y-2">
              {failed.map((op) => (
                <li key={op.seq} className="border-t border-red-200 pt-2">
                  <p className="font-bold">{op.method}</p>
                  <p className="opacity-80 text-xs mt-0.5">{op.lastError}</p>
                  <p className="opacity-60 text-[11px] mt-0.5">
                    Queued {new Date(op.createdAt).toLocaleString()}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => void retryOp(op.seq!)}
                      className="px-2 py-1 rounded-lg bg-white border border-red-300 font-bold text-xs"
                    >
                      Try again
                    </button>
                    <button
                      onClick={() => void discardOp(op.seq!)}
                      className="px-2 py-1 rounded-lg bg-white border border-red-300 font-bold text-xs flex items-center gap-1"
                    >
                      <X size={11} /> Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
