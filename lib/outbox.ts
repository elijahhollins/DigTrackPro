import { supabase } from './supabaseClient';
import { openCacheDb } from './offlineDb';
import { getCacheIdentity } from './offlineCache';

/**
 * Offline write queue.
 *
 * Mutations made while the backend is unreachable are recorded here and replayed on reconnect.
 * The guiding rule is that a write must never silently disappear: everything either lands, or is
 * parked where the user can see it.
 */

export type OutboxStatus = 'pending' | 'failed';

export interface OutboxOp {
  seq?: number;
  userId: string;
  companyId: string | null;
  method: string;
  args: unknown[];
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: OutboxStatus;
}

const STORE = 'outbox';

/** Backoff schedule for transient failures, in ms. Caps rather than growing forever. */
const BACKOFF_MS = [0, 2_000, 10_000, 60_000, 300_000];

let replaying = false;
const listeners = new Set<() => void>();

export const subscribeOutbox = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((l) => l());

const db = async () => {
  const { userId } = getCacheIdentity();
  return userId ? openCacheDb(userId) : null;
};

export const enqueue = async (method: string, args: unknown[]): Promise<void> => {
  const { userId, companyId } = getCacheIdentity();
  if (!userId) throw new Error('Cannot queue a change while signed out.');

  const handle = await db();
  if (!handle) throw new Error('Offline storage is unavailable, so this change cannot be saved.');

  const op: OutboxOp = {
    userId,
    companyId,
    method,
    args,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  };

  await handle.add(STORE, op);
  notify();
};

export const listOutbox = async (status?: OutboxStatus): Promise<OutboxOp[]> => {
  const handle = await db();
  if (!handle) return [];
  const all: OutboxOp[] = await handle.getAll(STORE);
  return status ? all.filter((op) => op.status === status) : all;
};

export const pendingCount = async (): Promise<number> => (await listOutbox('pending')).length;
export const failedCount = async (): Promise<number> => (await listOutbox('failed')).length;

/** Discard a parked operation the user has decided not to keep. */
export const discardOp = async (seq: number): Promise<void> => {
  const handle = await db();
  if (!handle) return;
  await handle.delete(STORE, seq);
  notify();
};

/** Move a parked operation back into the queue, e.g. after the user fixed the underlying problem. */
export const retryOp = async (seq: number): Promise<void> => {
  const handle = await db();
  if (!handle) return;
  const op: OutboxOp | undefined = await handle.get(STORE, seq);
  if (!op) return;
  await handle.put(STORE, { ...op, status: 'pending', attempts: 0, lastError: undefined });
  notify();
  void replayOutbox();
};

/**
 * Is this failure worth retrying, or is it never going to succeed?
 *
 * Retrying a deterministic 400 forever is as bad as dropping it: the queue never drains and the
 * user is never told. Network failures and 5xx are transient; RLS denials, constraint violations
 * and validation errors are not.
 */
const isTransient = (error: unknown): boolean => {
  const e = error as { name?: string; message?: string; status?: number; code?: string };
  if (!e) return false;

  if (e.name === 'AbortError' || e.name === 'TypeError') return true;
  if (typeof e.status === 'number') return e.status >= 500 || e.status === 408 || e.status === 429;

  const message = String(e.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('timeout')
  );
};

/**
 * A duplicate-key error on replay means the row we intended to create is already there.
 *
 * Every queued insert carries a client-generated id, so this is the success case for a retry --
 * the original attempt landed and we simply never saw the response. Treating it as a failure
 * would park operations that actually succeeded.
 */
const isAlreadyApplied = (error: unknown): boolean => {
  const e = error as { code?: string; message?: string };
  const message = String(e?.message || '').toLowerCase();
  return e?.code === '23505' || message.includes('duplicate key') || message.includes('already exists');
};

/**
 * For ticket edits only: has anyone changed this ticket since the edit was queued?
 *
 * Everything else in the queue is last-write-wins, matching the database's own upsert semantics.
 * Tickets are the exception because silently overwriting a refresh request or a no-show report
 * loses safety-relevant information that somebody deliberately recorded.
 */
const ticketChangedSinceQueued = async (op: OutboxOp): Promise<boolean> => {
  if (op.method !== 'saveTicket') return false;

  const ticket = op.args[0] as { id?: string } | undefined;
  if (!ticket?.id) return false;

  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('updated_at')
      .eq('id', ticket.id)
      .maybeSingle();

    if (error || !data?.updated_at) return false; // Can't tell -- fall through to last-write-wins.
    return new Date(data.updated_at).getTime() > op.createdAt;
  } catch {
    return false;
  }
};

type Executor = (method: string, args: unknown[]) => Promise<unknown>;

let executor: Executor | null = null;

/**
 * Supplied by services/apiService.ts at import time. Injected rather than imported directly to
 * avoid a cycle: apiService wraps itself with the offline layer, which owns this queue.
 */
export const setOutboxExecutor = (fn: Executor): void => {
  executor = fn;
};

/**
 * Drain the queue.
 *
 * Strictly in `seq` order, one at a time, stopping at the first transient failure. That ordering
 * preserves causality -- create a job, then add tickets to it -- which parallel replay would
 * break by reordering dependent writes.
 */
export const replayOutbox = async (): Promise<{ sent: number; parked: number }> => {
  if (replaying || !executor) return { sent: 0, parked: 0 };

  const handle = await db();
  if (!handle) return { sent: 0, parked: 0 };

  const identity = getCacheIdentity();
  if (!identity.userId) return { sent: 0, parked: 0 };

  replaying = true;
  let sent = 0;
  let parked = 0;

  try {
    const ops: OutboxOp[] = (await handle.getAll(STORE))
      .filter((op: OutboxOp) => op.status === 'pending')
      .sort((a: OutboxOp, b: OutboxOp) => (a.seq ?? 0) - (b.seq ?? 0));

    for (const op of ops) {
      // Never replay one user's queued writes while a different user is signed in. Park them
      // instead -- they belong to someone else's session and are not ours to send.
      if (op.userId !== identity.userId) {
        await handle.put(STORE, {
          ...op,
          status: 'failed',
          lastError: 'Queued by a different user; not replayed.',
        });
        parked += 1;
        continue;
      }

      if (await ticketChangedSinceQueued(op)) {
        await handle.put(STORE, {
          ...op,
          status: 'failed',
          lastError:
            'This ticket was changed by someone else while you were offline. Review before re-applying.',
        });
        parked += 1;
        continue;
      }

      try {
        await executor(op.method, op.args);
        await handle.delete(STORE, op.seq!);
        sent += 1;
      } catch (error) {
        if (isAlreadyApplied(error)) {
          // Already landed on an earlier attempt.
          await handle.delete(STORE, op.seq!);
          sent += 1;
          continue;
        }

        const message = String((error as { message?: string })?.message || error);

        if (isTransient(error)) {
          // Still offline, or the server is struggling. Leave it queued and stop -- continuing
          // would replay later operations ahead of this one and break ordering.
          await handle.put(STORE, { ...op, attempts: op.attempts + 1, lastError: message });
          break;
        }

        // Deterministic failure: it will never succeed on its own. Park it where the user can see
        // it rather than retrying forever or dropping it silently.
        await handle.put(STORE, { ...op, status: 'failed', lastError: message });
        parked += 1;
      }
    }
  } finally {
    replaying = false;
    notify();
  }

  return { sent, parked };
};

/** How long to wait before the next replay attempt, given how many times an op has failed. */
export const backoffFor = (attempts: number): number =>
  BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
