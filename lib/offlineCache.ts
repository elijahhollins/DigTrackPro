import { readCache, writeCache, type CachedEntry } from './offlineDb';

/**
 * Read-through cache for offline use.
 *
 * The rule is deliberately strict: **online reads always hit the network**. This is not
 * stale-while-revalidate. An online user never sees cached data, which removes an entire class of
 * "why is it showing the old thing" bugs and, more importantly, means stale data is only ever
 * served when we have already told the user they are offline.
 */

/**
 * How long cached ticket data stays usable offline.
 *
 * SAFETY-CRITICAL, AND A JUDGMENT CALL -- NOT A DERIVED NUMBER.
 *
 * This is utility locating: a crew acting on stale clearance information can dig on a ticket that
 * has since been marked for refresh, or that a newer ticket has superseded. Past this window the
 * app refuses to show tickets at all, because showing nothing is safer than showing something
 * wrong.
 *
 * 12 hours covers a normal shift: a tech who started the day connected keeps working all day, and
 * overnight data is refused. If crews routinely work multi-day stretches with no signal this will
 * lock them out mid-shift -- revisit it deliberately with the people doing the digging, and update
 * docs/OFFLINE.md. Do not quietly raise it to make a support ticket go away.
 */
export const STALE_CEILING_MS = 12 * 60 * 60 * 1000;

/** Thrown when cached data exists but is too old to be safe to act on. */
export class StaleCacheError extends Error {
  readonly cachedAt: number;
  readonly isStaleCache = true;

  constructor(cachedAt: number) {
    const hours = Math.floor((Date.now() - cachedAt) / 3_600_000);
    super(
      `You're offline and this data is ${hours} hours old, which is too old to rely on. ` +
        `Reconnect before digging.`
    );
    this.name = 'StaleCacheError';
    this.cachedAt = cachedAt;
  }
}

/** Thrown when we are offline and have nothing cached at all. */
export class OfflineNoCacheError extends Error {
  readonly isOfflineNoCache = true;

  constructor() {
    super("You're offline and this hasn't been downloaded yet. Reconnect to load it.");
    this.name = 'OfflineNoCacheError';
  }
}

export const isStaleCacheError = (e: unknown): e is StaleCacheError =>
  Boolean(e && typeof e === 'object' && 'isStaleCache' in e);

export const isOfflineNoCacheError = (e: unknown): e is OfflineNoCacheError =>
  Boolean(e && typeof e === 'object' && 'isOfflineNoCache' in e);

export interface CacheIdentity {
  userId: string | null;
  companyId: string | null;
}

let identity: CacheIdentity = { userId: null, companyId: null };

/** Set from the auth state listener whenever the session user changes. */
export const setCacheIdentity = (next: CacheIdentity): void => {
  identity = next;
};

export const getCacheIdentity = (): CacheIdentity => identity;

export const cacheWrite = async <T>(key: string, value: T): Promise<void> => {
  if (!identity.userId) return;
  await writeCache(identity.userId, key, value, identity.companyId);
};

/**
 * Read from cache, enforcing both the tenancy check and the staleness ceiling.
 * Throws rather than returning empty -- returning `[]` here is the bug this whole layer exists to
 * fix, because "no tickets" and "couldn't load tickets" look identical to a crew.
 */
export const cacheRead = async <T>(key: string): Promise<T> => {
  if (!identity.userId) throw new OfflineNoCacheError();

  const entry = (await readCache<T>(identity.userId, key)) as CachedEntry<T> | null;
  if (!entry) throw new OfflineNoCacheError();

  // Belt and braces on top of the per-user database: if the cached company does not match the
  // live session, refuse it rather than risk showing another tenant's data.
  if (entry.companyId && identity.companyId && entry.companyId !== identity.companyId) {
    console.warn('[offline] Cached entry belongs to a different company; refusing it.');
    throw new OfflineNoCacheError();
  }

  if (Date.now() - entry.cachedAt > STALE_CEILING_MS) {
    throw new StaleCacheError(entry.cachedAt);
  }

  return entry.value;
};

/** When the cached copy was written, for the "showing data from 2:14 PM" banner. */
export const cacheAge = async (key: string): Promise<number | null> => {
  if (!identity.userId) return null;
  const entry = await readCache(identity.userId, key);
  return entry ? entry.cachedAt : null;
};
