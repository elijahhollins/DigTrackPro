// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake Supabase client for driving the WHOLE app without a backend.
//
// `test-harness/vite.config.ts` aliases `lib/supabaseClient.ts` to this module,
// so every service (apiService, scheduleService, timeTrackingService,
// inboundTicketService, dailyReportService, …) and every component runs its real
// code against this fake. That means the harness exercises the actual mapping,
// filtering and rendering logic — only the network is replaced.
//
// It emulates the slice of PostgREST/GoTrue/Storage the app actually uses:
//   from().select/insert/upsert/update/delete + eq/neq/in/is/gte/lte/gt/lt/
//   ilike/contains/match/order/limit/single/maybeSingle
//   auth.getSession/onAuthStateChange/signIn/signUp/signOut/resend/updateUser
//   storage.from().upload/getPublicUrl/download/remove/list, createBucket
//   rpc(), functions.invoke(), channel()/removeChannel()
//
// Run it with:  npx vite --config test-harness/vite.config.ts   (port 5200)
// ─────────────────────────────────────────────────────────────────────────────

import { seedDb, SESSION_USER } from './seed.ts';

type Row = Record<string, any>;
export const db: Record<string, Row[]> = seedDb();

// Tables whose primary key is a bigint identity rather than a uuid.
const NUMERIC_ID_TABLES = new Set([
  'employees', 'materials', 'service_jobs', 'work_logs', 'work_log_templates',
  'invoices', 'invoice_settings', 'cost_codes', 'job_cost_codes', 'time_entries',
  'time_clock_crews', 'daily_reports', 'job_invoices', 'job_invoice_templates',
]);

const nextId = (table: string): string | number => {
  if (NUMERIC_ID_TABLES.has(table)) {
    const rows = db[table] || [];
    return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
  }
  return crypto.randomUUID();
};

const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

interface Filter { kind: string; col: string; val: any }

const matches = (row: Row, f: Filter): boolean => {
  const v = row[f.col];
  switch (f.kind) {
    case 'eq':   return String(v) === String(f.val);
    case 'neq':  return String(v) !== String(f.val);
    case 'in':   return (f.val as any[]).some(x => String(x) === String(v));
    case 'is':   return f.val === null ? v == null : v === f.val;
    case 'gte':  return v >= f.val;
    case 'lte':  return v <= f.val;
    case 'gt':   return v > f.val;
    case 'lt':   return v < f.val;
    case 'ilike': {
      const re = new RegExp('^' + String(f.val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
      return re.test(String(v ?? ''));
    }
    case 'contains':
      return Array.isArray(v) && (f.val as any[]).every(x => v.includes(x));
    default: return true;
  }
};

class QueryBuilder implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orderings: Array<{ col: string; asc: boolean }> = [];
  private limitN: number | null = null;
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private wantsRows = false;   // .select() chained onto a write
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private onConflict = 'id';

  constructor(private table: string) {}

  private rows(): Row[] {
    if (!db[this.table]) db[this.table] = [];
    return db[this.table];
  }

  select(_cols?: string, _opts?: unknown) {
    if (this.op !== 'select') this.wantsRows = true;
    return this;
  }
  insert(payload: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    if (opts?.onConflict) this.onConflict = opts.onConflict;
    return this;
  }
  update(payload: Row) { this.op = 'update'; this.payload = [payload]; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(col: string, val: any) { this.filters.push({ kind: 'eq', col, val }); return this; }
  neq(col: string, val: any) { this.filters.push({ kind: 'neq', col, val }); return this; }
  in(col: string, val: any[]) { this.filters.push({ kind: 'in', col, val }); return this; }
  is(col: string, val: any) { this.filters.push({ kind: 'is', col, val }); return this; }
  gte(col: string, val: any) { this.filters.push({ kind: 'gte', col, val }); return this; }
  lte(col: string, val: any) { this.filters.push({ kind: 'lte', col, val }); return this; }
  gt(col: string, val: any) { this.filters.push({ kind: 'gt', col, val }); return this; }
  lt(col: string, val: any) { this.filters.push({ kind: 'lt', col, val }); return this; }
  ilike(col: string, val: string) { this.filters.push({ kind: 'ilike', col, val }); return this; }
  contains(col: string, val: any[]) { this.filters.push({ kind: 'contains', col, val }); return this; }
  match(obj: Row) { Object.entries(obj).forEach(([col, val]) => this.eq(col, val)); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderings.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  private stamp(row: Row): Row {
    const out = { ...row };
    if (out.id == null) out.id = nextId(this.table);
    if (out.created_at == null) out.created_at = new Date().toISOString();
    if (this.table === 'inventory_items' && out.updated_at == null) out.updated_at = new Date().toISOString();
    if (this.table === 'company_invites' && out.token == null) out.token = crypto.randomUUID();
    return out;
  }

  private run(): { data: any; error: any } {
    const rows = this.rows();
    let affected: Row[] = [];

    if (this.op === 'select') {
      affected = rows.filter(r => this.filters.every(f => matches(r, f)));
    } else if (this.op === 'insert') {
      affected = this.payload.map(p => this.stamp(p));
      rows.push(...affected);
    } else if (this.op === 'upsert') {
      affected = this.payload.map(p => {
        const stamped = this.stamp(p);
        const idx = rows.findIndex(r => String(r[this.onConflict]) === String(stamped[this.onConflict]));
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...stamped };
          return rows[idx];
        }
        rows.push(stamped);
        return stamped;
      });
    } else if (this.op === 'update') {
      affected = rows.filter(r => this.filters.every(f => matches(r, f)));
      affected.forEach(r => Object.assign(r, this.payload[0]));
    } else if (this.op === 'delete') {
      affected = rows.filter(r => this.filters.every(f => matches(r, f)));
      db[this.table] = rows.filter(r => !affected.includes(r));
    }

    for (const o of [...this.orderings].reverse()) {
      affected = [...affected].sort((a, b) => {
        const av = a[o.col], bv = b[o.col];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av > bv ? 1 : -1) * (o.asc ? 1 : -1);
      });
    }
    if (this.limitN != null) affected = affected.slice(0, this.limitN);

    if (this.mode === 'single' || this.mode === 'maybe') {
      if (affected.length === 0) {
        if (this.mode === 'maybe') return { data: null, error: null };
        return { data: null, error: { message: 'No rows found', code: 'PGRST116', details: '', hint: '' } };
      }
      return { data: clone(affected[0]), error: null };
    }

    // A write without .select() resolves with null data, like PostgREST.
    if (this.op !== 'select' && !this.wantsRows) return { data: null, error: null };
    return { data: clone(affected), error: null };
  }

  then<TR1 = any, TR2 = never>(
    onfulfilled?: ((value: any) => TR1 | PromiseLike<TR1>) | null,
    onrejected?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    // Small async delay so components see a real loading tick.
    return new Promise(resolve => setTimeout(() => resolve(this.run()), 0)).then(onfulfilled, onrejected);
  }
}

// ── storage ──────────────────────────────────────────────────────────────────

const buckets: Record<string, Map<string, Blob>> = {};
const bucketOf = (name: string) => (buckets[name] ||= new Map());

const storageApi = {
  from(bucket: string) {
    const b = bucketOf(bucket);
    return {
      async upload(path: string, file: Blob) { b.set(path, file); return { data: { path }, error: null }; },
      getPublicUrl(path: string) {
        const f = b.get(path);
        return { data: { publicUrl: f ? URL.createObjectURL(f) : `blob:missing/${bucket}/${path}` } };
      },
      async download(path: string) {
        const f = b.get(path);
        return f ? { data: f, error: null } : { data: null, error: { message: `Object not found: ${path}` } };
      },
      async remove(paths: string[]) { paths.forEach(p => b.delete(p)); return { data: null, error: null }; },
      async list(prefix = '') {
        return { data: [...b.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), error: null };
      },
      async createSignedUrl(path: string) {
        const f = b.get(path);
        return { data: { signedUrl: f ? URL.createObjectURL(f) : '' }, error: null };
      },
    };
  },
  async createBucket(name: string) { bucketOf(name); return { data: { name }, error: null }; },
  async getBucket(name: string) { return { data: { name }, error: null }; },
};

// ── auth ─────────────────────────────────────────────────────────────────────

type AuthCb = (event: string, session: any) => void;
const authCbs = new Set<AuthCb>();

let session: any = {
  access_token: 'harness-token',
  user: { id: SESSION_USER.id, email: SESSION_USER.email, user_metadata: { display_name: SESSION_USER.name } },
};

const emit = (event: string) => authCbs.forEach(cb => cb(event, session));

const authApi = {
  async getSession() { return { data: { session }, error: null }; },
  async getUser() { return { data: { user: session?.user ?? null }, error: null }; },
  onAuthStateChange(cb: AuthCb) {
    authCbs.add(cb);
    return { data: { subscription: { unsubscribe: () => authCbs.delete(cb) } } };
  },
  async signOut() { session = null; emit('SIGNED_OUT'); return { error: null }; },
  async signInWithPassword({ email }: { email: string }) {
    session = { access_token: 'harness-token', user: { id: SESSION_USER.id, email, user_metadata: { display_name: SESSION_USER.name } } };
    setTimeout(() => emit('SIGNED_IN'), 0);
    return { data: { session, user: session.user }, error: null };
  },
  async signUp({ email, options }: { email: string; options?: { data?: Record<string, unknown> } }) {
    const user = { id: crypto.randomUUID(), email, user_metadata: options?.data ?? {} };
    return { data: { user, session: null }, error: null };
  },
  async resend() { return { data: {}, error: null }; },
  async resetPasswordForEmail() { return { data: {}, error: null }; },
  async updateUser() { return { data: { user: session?.user }, error: null }; },
};

// ── rpc / edge functions / realtime ──────────────────────────────────────────

const rpcHandlers: Record<string, (args: any) => any> = {
  validate_invite_token: ({ p_token }) => {
    const inv = (db.company_invites || []).find(i => i.token === p_token && !i.used_at);
    if (!inv) return [];
    const co = (db.companies || []).find(c => c.id === inv.company_id);
    return [{ company_id: inv.company_id, company_name: co?.name ?? '' }];
  },
  get_company_by_name: ({ p_name }) => {
    const co = (db.companies || []).find(c => String(c.name).toLowerCase() === String(p_name).toLowerCase());
    return co ? [{ company_id: co.id, company_name: co.name, brand_color: co.brand_color }] : [];
  },
  get_alert_emails: ({ p_company_id }) =>
    (db.profiles || [])
      .filter(p => p.company_id === p_company_id && p.notify_email)
      .map(p => ({ notify_email: p.notify_email })),
  get_user_company_id: () => SESSION_USER.companyId,
  is_company_admin: () => true,
  is_super_admin: () => SESSION_USER.role === 'SUPER_ADMIN',
};

export const supabase = {
  from: (table: string) => new QueryBuilder(table),
  auth: authApi,
  storage: storageApi,
  async rpc(name: string, args?: Record<string, unknown>) {
    const handler = rpcHandlers[name];
    if (!handler) return { data: null, error: { message: `Unknown rpc ${name}` } };
    return { data: handler(args ?? {}), error: null };
  },
  functions: {
    async invoke(name: string, opts?: { body?: unknown }) {
      // eslint-disable-next-line no-console
      console.log('[harness] functions.invoke', name, opts?.body);
      return { data: { sent: 1, errors: [] }, error: null };
    },
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
    return ch;
  },
  removeChannel() {},
} as any;

export const getEnv = (_key: string): string => '';
export const isSupabaseConfigured = () => true;

// Expose the fake DB for assertions from Playwright.
(window as any).__harness = { db, supabase };
