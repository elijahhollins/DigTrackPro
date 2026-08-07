import { isReachable, reportRequestFailure, reportRequestSuccess } from '../lib/connectivity';
import { cacheRead, cacheWrite } from '../lib/offlineCache';
import { enqueue, replayOutbox, setOutboxExecutor } from '../lib/outbox';
import { cacheKeyFor, policyFor } from './offlinePolicy';

/**
 * Wraps the apiService object so reads survive going offline.
 *
 * This wraps the exported object literal rather than the Supabase client. The client returns a
 * lazily-thenable query builder, so caching there would mean reimplementing PostgREST filter
 * semantics across every `.eq().in().order()` chain. apiService is already the right granularity:
 * coarse domain methods returning mapped application types.
 *
 * Because the export name is preserved, all ~100 existing call sites keep working untouched.
 */

/**
 * Does this look like the network failing rather than the request being rejected?
 *
 * Supabase surfaces genuine API errors (RLS denials, constraint violations) as resolved responses
 * with an `error` field, which the service methods turn into thrown errors carrying a status. A
 * thrown TypeError from `fetch`, or an explicit abort, is the network.
 */
const looksLikeNetworkFailure = (error: unknown): boolean => {
  if (!error) return false;
  const e = error as { name?: string; message?: string; status?: number; code?: string };

  if (e.name === 'AbortError' || e.name === 'TypeError') return true;
  if (e.status && e.status >= 500) return true;

  const message = String(e.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  );
};

type AnyFn = (...args: any[]) => Promise<any>;

const wrapCacheFirstRead = (method: string, fn: AnyFn, target: object): AnyFn =>
  async function (this: unknown, ...args: unknown[]) {
    const key = cacheKeyFor(method, args);

    // Offline or degraded: go straight to the cache. cacheRead throws when there is nothing
    // cached or the copy is past the staleness ceiling -- it never returns an empty result that
    // could be mistaken for "you have no tickets".
    if (!isReachable()) {
      return cacheRead(key);
    }

    try {
      const result = await fn.apply(target, args);
      reportRequestSuccess();
      // Write through so the next offline read has something recent.
      void cacheWrite(key, result);
      return result;
    } catch (error) {
      if (looksLikeNetworkFailure(error)) {
        // The connectivity probe hasn't noticed yet. Update it, then fall back to cache -- but
        // let a staleness refusal propagate rather than masking it with the network error.
        reportRequestFailure();
        try {
          return await cacheRead(key);
        } catch (cacheError) {
          throw cacheError;
        }
      }
      throw error;
    }
  };

const wrapOnlineOnly = (fn: AnyFn, target: object): AnyFn =>
  async function (this: unknown, ...args: unknown[]) {
    try {
      const result = await fn.apply(target, args);
      reportRequestSuccess();
      return result;
    } catch (error) {
      if (looksLikeNetworkFailure(error)) reportRequestFailure();
      throw error;
    }
  };

/** Thrown when a write was accepted into the outbox rather than sent. Not an error condition. */
export class QueuedOfflineError extends Error {
  readonly isQueuedOffline = true;

  constructor() {
    super("Saved on this device. It will sync when you're back online.");
    this.name = 'QueuedOfflineError';
  }
}

export const isQueuedOffline = (e: unknown): e is QueuedOfflineError =>
  Boolean(e && typeof e === 'object' && 'isQueuedOffline' in e);

const wrapQueueableWrite = (method: string, fn: AnyFn, target: object): AnyFn =>
  async function (this: unknown, ...args: unknown[]) {
    if (!isReachable()) {
      await enqueue(method, args);
      throw new QueuedOfflineError();
    }

    try {
      const result = await fn.apply(target, args);
      reportRequestSuccess();
      return result;
    } catch (error) {
      // Only queue when the network is the problem. An RLS denial or a validation error would
      // fail identically on replay, so queueing it would just defer the same failure and make it
      // look like the save worked.
      if (looksLikeNetworkFailure(error)) {
        reportRequestFailure();
        await enqueue(method, args);
        throw new QueuedOfflineError();
      }
      throw error;
    }
  };

/**
 * Returns a wrapped copy of `service`. Methods not covered by a policy still get connectivity
 * reporting, but no caching -- the fail-closed default.
 */
export const withOffline = <T extends Record<string, any>>(service: T): T => {
  const wrapped: Record<string, unknown> = {};

  for (const key of Object.keys(service)) {
    const value = service[key];

    if (typeof value !== 'function') {
      wrapped[key] = value;
      continue;
    }

    switch (policyFor(key)) {
      case 'cacheFirstRead':
        wrapped[key] = wrapCacheFirstRead(key, value as AnyFn, service);
        break;
      case 'queueableWrite':
        wrapped[key] = wrapQueueableWrite(key, value as AnyFn, service);
        break;
      case 'onlineOnly':
      default:
        wrapped[key] = wrapOnlineOnly(value as AnyFn, service);
        break;
    }
  }

  // Replay sends through the UNWRAPPED methods on purpose. Going back through the wrapper would
  // re-queue a failing operation instead of letting the outbox classify and park it.
  setOutboxExecutor(async (method, args) => {
    const fn = service[method];
    if (typeof fn !== 'function') throw new Error(`Unknown queued method: ${method}`);
    return fn.apply(service, args);
  });

  return wrapped as T;
};

export { replayOutbox };
