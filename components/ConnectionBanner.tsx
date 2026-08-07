import React from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { useConnection } from '../lib/connectivity.ts';

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
