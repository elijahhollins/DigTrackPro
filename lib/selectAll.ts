import type { PostgrestError } from '@supabase/supabase-js';

// PostgREST caps every response at 1000 rows (Supabase's default max-rows), so
// a bare `.select('*')` silently drops everything past that. Worse, an
// unordered select returns rows in physical order and Postgres rewrites a row
// at the end of the table on UPDATE — so the rows that fall off are exactly the
// ones most recently touched (e.g. a ticket that just had a no-show logged).
export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Fetch every row of a query by paging with `.range()`.
 *
 * `page(from, to)` must build a fresh query each call and include an `.order()`
 * ending on a unique column (normally `id`) so pages don't overlap or skip.
 */
export async function selectAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
