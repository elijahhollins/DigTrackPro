import { useState, useEffect } from 'react';
import { InboundTimeEntry } from '../services/inboundTypes.ts';

/** Format elapsed seconds as h:mm:ss (or mm:ss when under an hour). */
export const fmtElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Format a duration in minutes as a human-readable string (e.g. "1h 23m"). */
export const fmtMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/**
 * Returns the duration in minutes for a time entry.
 * Uses now() as the end time when the entry is still open.
 */
export const computeDurationMinutes = (entry: InboundTimeEntry): number => {
  const end = entry.clockedOutAt ? new Date(entry.clockedOutAt) : new Date();
  return (end.getTime() - new Date(entry.clockedInAt).getTime()) / 60_000;
};

/**
 * React hook that returns the number of elapsed seconds since `startIso`.
 * Updates every second. Returns 0 when `startIso` is null.
 */
export function useElapsedSeconds(startIso: string | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startIso) { setElapsed(0); return; }
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}
