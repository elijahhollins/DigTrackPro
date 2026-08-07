import { openDB, deleteDB, type IDBPDatabase } from 'idb';

/**
 * IndexedDB storage for the offline cache.
 *
 * ONE DATABASE PER USER, named `digtrack-cache-v1-<userId>`.
 *
 * This is the security-critical decision in the offline layer. Multi-tenancy in this app is
 * enforced entirely by Postgres RLS -- there are no application-level tenant checks. Once data is
 * cached on the device, RLS is no longer in the loop, so the cache has to provide that isolation
 * itself. A single shared database with a `userId` column would make correctness depend on every
 * query remembering to filter. Physically separate databases make cross-tenant leakage
 * structurally impossible instead.
 *
 * That matters concretely: these are shared truck tablets where several techs log in and out of the
 * same device.
 */

const DB_PREFIX = 'digtrack-cache-v1-';
const STORE = 'records';
const KNOWN_DBS_KEY = 'digtrack-cache-dbs';

export interface CachedEntry<T = unknown> {
  key: string;
  value: T;
  cachedAt: number;
  companyId: string | null;
}

let handle: IDBPDatabase | null = null;
let handleUserId: string | null = null;

const dbName = (userId: string) => `${DB_PREFIX}${userId}`;

/**
 * Firefox only shipped `indexedDB.databases()` in v126, so we keep our own index of database
 * names in localStorage. Without it, older browsers could not enumerate -- and therefore could not
 * purge -- another user's cache.
 */
const rememberDb = (name: string) => {
  try {
    const known = new Set<string>(JSON.parse(localStorage.getItem(KNOWN_DBS_KEY) || '[]'));
    known.add(name);
    localStorage.setItem(KNOWN_DBS_KEY, JSON.stringify([...known]));
  } catch {
    /* localStorage unavailable (private mode); purging falls back to indexedDB.databases() */
  }
};

const forgetDb = (name: string) => {
  try {
    const known: string[] = JSON.parse(localStorage.getItem(KNOWN_DBS_KEY) || '[]');
    localStorage.setItem(KNOWN_DBS_KEY, JSON.stringify(known.filter((n) => n !== name)));
  } catch {
    /* ignore */
  }
};

const listKnownDbs = async (): Promise<string[]> => {
  const names = new Set<string>();

  try {
    const known: string[] = JSON.parse(localStorage.getItem(KNOWN_DBS_KEY) || '[]');
    known.forEach((n) => names.add(n));
  } catch {
    /* ignore */
  }

  if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
    try {
      const dbs = await indexedDB.databases();
      dbs.forEach((d) => {
        if (d.name?.startsWith(DB_PREFIX)) names.add(d.name);
      });
    } catch {
      /* ignore */
    }
  }

  return [...names];
};

export const openCacheDb = async (userId: string): Promise<IDBPDatabase | null> => {
  if (typeof indexedDB === 'undefined') return null;

  if (handle && handleUserId === userId) return handle;
  if (handle) {
    handle.close();
    handle = null;
    handleUserId = null;
  }

  const name = dbName(userId);
  try {
    handle = await openDB(name, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          // Created here so a later schema version is not needed when the write queue lands.
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        }
      },
      blocked() {
        console.warn('[offline] Cache upgrade blocked by another open tab.');
      },
    });
    handleUserId = userId;
    rememberDb(name);
    return handle;
  } catch (error) {
    console.warn('[offline] Could not open cache database:', error);
    return null;
  }
};

export const readCache = async <T>(userId: string, key: string): Promise<CachedEntry<T> | null> => {
  const db = await openCacheDb(userId);
  if (!db) return null;
  try {
    return (await db.get(STORE, key)) ?? null;
  } catch {
    return null;
  }
};

export const writeCache = async <T>(
  userId: string,
  key: string,
  value: T,
  companyId: string | null
): Promise<void> => {
  const db = await openCacheDb(userId);
  if (!db) return;
  try {
    const entry: CachedEntry<T> = { key, value, cachedAt: Date.now(), companyId };
    await db.put(STORE, entry);
  } catch (error) {
    // A full quota should degrade the cache, never break the app.
    console.warn('[offline] Could not write to cache:', error);
  }
};

/**
 * Delete every cache database that does not belong to `currentUserId`. Pass null on sign-out to
 * remove all of them.
 *
 * Called from the auth state listener. This is what stops one tech's tickets from being readable
 * by the next person to log into the same tablet.
 */
export const purgeOtherUsers = async (currentUserId: string | null): Promise<void> => {
  const keep = currentUserId ? dbName(currentUserId) : null;
  const names = await listKnownDbs();

  await Promise.all(
    names
      .filter((name) => name !== keep)
      .map(async (name) => {
        if (handle && handleUserId && dbName(handleUserId) === name) {
          handle.close();
          handle = null;
          handleUserId = null;
        }
        try {
          await deleteDB(name);
          forgetDb(name);
        } catch (error) {
          console.warn(`[offline] Could not delete stale cache ${name}:`, error);
        }
      })
  );
};

/** Test/debug helper: which cache databases currently exist. */
export const listCacheDbs = listKnownDbs;
