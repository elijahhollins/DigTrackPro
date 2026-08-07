/**
 * Which apiService methods participate in the offline layer.
 *
 * FAIL CLOSED: anything not listed here is online-only. That default is the safety property --
 * a method added next year is automatically conservative without anyone having to remember this
 * file exists. Do not add a catch-all.
 */

export type OfflinePolicy = 'cacheFirstRead' | 'queueableWrite' | 'onlineOnly';

/**
 * Reads cached for offline use.
 *
 * Chosen for what a crew actually needs while standing in a field: which tickets are mine, where
 * are they, what state are they in, what did we note last time, whose job is this.
 *
 * Deliberately excluded: getAllCompanies and anything else super-admin/cross-tenant. Caching
 * cross-company data on a device would defeat the per-user database isolation.
 */
export const CACHE_FIRST_READS = [
  'getTickets',
  'getJobs',
  'getNotes',
  'getPhotos',
  'getUsers',
  'getCompany',
  'getNoShows',
  'getJobPrints',
] as const;

/**
 * Writes that can be queued while offline and replayed on reconnect.
 *
 * Every one of these is either an idempotent upsert or an insert with a client-generated id, so
 * replaying one twice is a no-op rather than a duplicate.
 *
 * DELETES ARE DELIBERATELY ABSENT AND MUST STAY ABSENT. Replaying a delete after the row has
 * changed server-side destroys data someone meant to keep, and the queue cannot tell the
 * difference. Deletes stay online-only.
 */
export const QUEUEABLE_WRITES = [
  'saveTicket',
  'saveJob',
  'addNote',
  'addNoShow',
  'updateTicketCoords',
] as const;

const cacheFirst = new Set<string>(CACHE_FIRST_READS);
const queueable = new Set<string>(QUEUEABLE_WRITES);

export const policyFor = (method: string): OfflinePolicy => {
  if (cacheFirst.has(method)) return 'cacheFirstRead';
  if (queueable.has(method)) return 'queueableWrite';
  return 'onlineOnly';
};

/**
 * Cache key for a read. Arguments are part of the key because some reads are parameterised
 * (getCompany(id), getJobPrints(jobId)) and must not collide.
 */
export const cacheKeyFor = (method: string, args: unknown[]): string =>
  args.length === 0 ? method : `${method}:${JSON.stringify(args)}`;
