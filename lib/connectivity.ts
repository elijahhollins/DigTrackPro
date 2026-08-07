import { useEffect, useState } from 'react';
import { getEnv } from './supabaseClient';

/**
 * Connectivity state for the app.
 *
 * Three states, not two. `navigator.onLine` only reports link-layer status: it says `true` on a
 * captive portal, and it says `true` when Supabase itself is down. That second case is exactly the
 * one that used to render as "you have no tickets" -- a fully loaded UI showing an empty account.
 * `degraded` names it.
 */
export type ConnectionState = 'online' | 'offline' | 'degraded';

const PROBE_TIMEOUT_MS = 5000;
const DEGRADED_RECHECK_MS = 60_000;

let currentState: ConnectionState = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online';
let probeTimer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<(state: ConnectionState) => void>();

export const getConnectionState = (): ConnectionState => currentState;

/** True when reads should go to the network. Both other states mean "serve from cache". */
export const isReachable = (): boolean => currentState === 'online';

const setState = (next: ConnectionState) => {
  if (next === currentState) return;
  currentState = next;
  listeners.forEach((listener) => listener(next));

  // Only poll while something is wrong. A healthy app makes no extra requests.
  if (next === 'online' && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  } else if (next !== 'online' && !probeTimer) {
    probeTimer = setInterval(() => { void probe(); }, DEGRADED_RECHECK_MS);
  }
};

/**
 * Ask Supabase directly whether it is reachable. This is what distinguishes `degraded` from
 * `online` -- the browser can be perfectly connected while the backend is unreachable.
 */
export const probe = async (): Promise<ConnectionState> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState('offline');
    return 'offline';
  }

  const supabaseUrl = getEnv('SUPABASE_URL') || 'https://fusubnzndmngjfgatzrq.supabase.co';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    // GoTrue's health endpoint: cheap, unauthenticated, and unaffected by RLS.
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const next: ConnectionState = response.ok ? 'online' : 'degraded';
    setState(next);
    return next;
  } catch {
    setState('degraded');
    return 'degraded';
  } finally {
    clearTimeout(timer);
  }
};

/** Call once at app start. Safe to call more than once. */
export const initConnectivity = (): void => {
  if (typeof window === 'undefined') return;

  window.addEventListener('offline', () => setState('offline'));
  window.addEventListener('online', () => {
    // The `online` event only means the link came back. Confirm the backend is actually there
    // before telling the user they are online -- otherwise we would promise more than we have.
    void probe();
  });

  void probe();
};

export const subscribeConnection = (listener: (state: ConnectionState) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useConnection = (): ConnectionState => {
  const [state, setState_] = useState<ConnectionState>(currentState);
  useEffect(() => subscribeConnection(setState_), []);
  return state;
};

/**
 * Called by the offline wrapper when a request fails in a way that looks like a network problem,
 * so the UI reflects reality without waiting for the next poll.
 */
export const reportRequestFailure = (): void => {
  if (currentState === 'online') {
    setState('degraded');
    void probe();
  }
};

export const reportRequestSuccess = (): void => {
  if (currentState !== 'online') setState('online');
};
