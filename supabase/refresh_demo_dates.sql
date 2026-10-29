-- ================================================================
-- DigTrack Pro — Re-anchor the demo account's dates to today
-- ================================================================
-- PURPOSE
-- -------
-- The "Example Excavating Inc." demo account (seeded in PR #169) is full of
-- internally-consistent dates: ticket call-in / work-valid / expiry dates, a
-- month of dispatch-board blocks, time-clock punches, daily reports, work logs
-- and invoices. Those dates were written as absolute values on the day the
-- seed ran, so the whole dataset ages: tickets expire, the dispatch board
-- empties out, and the urgency views stop demoing anything.
--
-- This script slides EVERY date in the demo dataset forward by the same number
-- of days, so the scenario reads as "today" again while keeping every interval
-- between rows intact.
--
-- WHY A UNIFORM SHIFT IS SAFE
-- ---------------------------
-- Ticket status is never stored — `utils/dateUtils.ts::getTicketStatus` derives
-- it from work_date, expires, dig_by_date, work_begun and refresh_requested.
-- Shifting those dates by a constant therefore preserves the exact status mix
-- the seed was built to show (pending / valid / extendable / refresh-needed /
-- expired by both expiry paths / archived / emergency).
--
-- HOW TO RUN
-- ----------
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Output arrives as NOTICE lines listing the shift and the rows touched.
--
-- SAFE TO RE-RUN: the shift is computed from the data itself, so running it
-- twice in a day is a no-op ("already current"). Run it whenever the demo
-- looks stale — there is no window in which it double-shifts.
--
-- WHAT IT WILL NOT TOUCH
-- ----------------------
--   * Any other company's data (everything is scoped to v_company).
--   * Rows added by hand in the app after the seed. Demo rows all landed in
--     one batch, so only rows created within v_seed_window of the dataset's
--     own anchor move; a ticket you create while clicking around stays put.
--   * companies.created_at — that is real account metadata, not demo content.
-- ================================================================

DO $$
DECLARE
  -- ── The demo company ──────────────────────────────────────────
  v_company      uuid := 'da0eea4d-b2c2-4b7f-b31a-5c5dd87f272d';  -- Example Excavating Inc.

  -- Rows inserted within this much of the dataset's anchor count as demo data.
  -- The PR #169 seed ran as a single batch, so a day is generous but tight.
  v_seed_window  interval := interval '1 day';

  -- Used only if the anchor cannot be read back from the data (see below).
  v_fallback     date := DATE '2026-07-03';   -- the day PR #169 seeded the account

  -- A plausible ISO day, so a value like 2026-13-45 is never treated as a
  -- date. Non-capturing groups only: regexp_matches must return whole matches.
  c_iso_date CONSTANT text := '\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])';

  v_anchor_ts    timestamptz;
  v_anchor       date;
  v_delta        integer;
  v_scope        text;
  v_guard        text;
  v_col          text;
  v_sets         text[];
  v_sql          text;
  v_rows         bigint;
  v_total        bigint := 0;
  v_json_rows    bigint := 0;
  v_dates        text[];
  v_txt          text;
  v_new          text;
  t              integer;   -- index into v_tables
  n              integer;   -- index into v_columns
  d              integer;   -- index into v_dates
  col            record;
  row_rec        record;

  -- (table, row scope, timestamp expression that dates the row) ---
  -- Every guard column below is itself shifted, so after a run the whole
  -- dataset sits at the new anchor and the next run sees delta = 0.
  v_tables CONSTANT text[][] := ARRAY[
    -- tbl                          scope                                                                           guard
    ['tickets',                     'company_id = $1',                                                              'created_at'],
    ['jobs',                        'company_id = $1',                                                              'created_at'],
    ['notes',                       'company_id = $1',                                                              'to_timestamp(timestamp/1000.0)'],
    ['no_shows',                    'company_id = $1',                                                              'created_at'],
    ['ticket_updates',              'company_id = $1',                                                              'created_at'],
    ['pdf_annotations',             'company_id = $1',                                                              'created_at'],
    ['job_prints',                  'company_id = $1',                                                              'created_at'],
    ['photos',                      'company_id = $1',                                                              'created_at'],
    ['print_markers',               'ticket_id in (select id from public.tickets where company_id = $1)',           'created_at'],
    ['inbound_tickets',             'company_id = $1',                                                              'created_at'],
    ['inbound_ticket_notes',        'ticket_id in (select id from public.inbound_tickets where company_id = $1)',   'created_at'],
    ['inbound_ticket_photos',       'ticket_id in (select id from public.inbound_tickets where company_id = $1)',   'uploaded_at'],
    ['inbound_ticket_time_entries', 'company_id = $1',                                                              'created_at'],
    ['inventory_items',             'company_id = $1',                                                              'created_at'],
    ['inventory_locations',         'company_id = $1',                                                              'created_at'],
    ['inventory_movements',         'company_id = $1',                                                              'created_at'],
    ['materials',                   'company_id = $1',                                                              'created_at'],
    ['cost_codes',                  'company_id = $1',                                                              'created_at'],
    ['job_cost_codes',              'company_id = $1',                                                              'created_at'],
    ['employees',                   'company_id = $1',                                                              'created_at'],
    ['schedule_crews',              'company_id = $1',                                                              'created_at'],
    ['schedule_blocks',             'company_id = $1',                                                              'created_at'],
    ['time_clock_crews',            'company_id = $1',                                                              'created_at'],
    ['time_entries',                'company_id = $1',                                                              'created_at'],
    ['daily_reports',               'company_id = $1',                                                              'created_at'],
    ['service_jobs',                'company_id = $1',                                                              'created_at'],
    ['work_logs',                   'job_id in (select id from public.service_jobs where company_id = $1)',         'created_at'],
    ['work_log_templates',          'company_id = $1',                                                              'created_at'],
    ['invoices',                    'company_id = $1',                                                              'created_at'],
    ['job_invoices',                'company_id = $1',                                                              'created_at'],
    ['job_invoice_templates',       'company_id = $1',                                                              'created_at'],
    ['invoice_settings',            'company_id = $1',                                                              'created_at']
  ];

  -- (table, column, kind) for every date-bearing column -----------
  --   d = date                    -> col + delta
  --   t = timestamptz             -> col + delta days (time of day preserved)
  --   s = text 'YYYY-MM-DD'
  --   e = bigint epoch milliseconds
  --   j = jsonb with embedded 'YYYY-MM-DD' strings
  v_columns CONSTANT text[][] := ARRAY[
    ['tickets','dig_by_date','d'],
    ['tickets','created_at','t'],
    ['tickets','call_in_date','s'],
    ['tickets','work_date','s'],
    ['tickets','expires','s'],
    ['jobs','created_at','t'],
    ['notes','timestamp','e'],
    ['no_shows','created_at','t'],
    ['no_shows','timestamp','e'],
    ['ticket_updates','created_at','t'],
    ['ticket_updates','timestamp','e'],
    ['ticket_updates','changes','j'],
    ['pdf_annotations','created_at','t'],
    ['pdf_annotations','data','j'],
    ['job_prints','created_at','t'],
    ['photos','created_at','t'],
    ['print_markers','created_at','t'],
    ['inbound_tickets','created_at','t'],
    ['inbound_tickets','dig_start_date','s'],
    ['inbound_tickets','due_date','s'],
    ['inbound_ticket_notes','created_at','t'],
    ['inbound_ticket_photos','uploaded_at','t'],
    ['inbound_ticket_time_entries','clocked_in_at','t'],
    ['inbound_ticket_time_entries','clocked_out_at','t'],
    ['inbound_ticket_time_entries','created_at','t'],
    ['inventory_items','last_service_date','d'],
    ['inventory_items','next_service_due','d'],
    ['inventory_items','created_at','t'],
    ['inventory_items','updated_at','t'],
    ['inventory_locations','created_at','t'],
    ['inventory_movements','created_at','t'],
    ['materials','created_at','t'],
    ['cost_codes','created_at','t'],
    ['job_cost_codes','created_at','t'],
    ['employees','created_at','t'],
    ['schedule_crews','created_at','t'],
    ['schedule_blocks','start_date','d'],
    ['schedule_blocks','created_at','t'],
    ['time_clock_crews','created_at','t'],
    ['time_clock_crews','updated_at','t'],
    ['time_entries','clocked_in_at','t'],
    ['time_entries','clocked_out_at','t'],
    ['time_entries','approved_at','t'],
    ['time_entries','created_at','t'],
    ['daily_reports','report_date','d'],
    ['daily_reports','created_at','t'],
    ['daily_reports','updated_at','t'],
    ['daily_reports','submitted_at','t'],
    ['daily_reports','photos','j'],
    ['service_jobs','start_date','d'],
    ['service_jobs','end_date','d'],
    ['service_jobs','created_at','t'],
    ['work_logs','date','d'],
    ['work_logs','created_at','t'],
    ['work_logs','data','j'],
    ['work_log_templates','created_at','t'],
    ['work_log_templates','data','j'],
    ['invoices','date','t'],
    ['invoices','due_date','t'],
    ['invoices','created_at','t'],
    ['invoices','data','j'],
    ['job_invoices','date','t'],
    ['job_invoices','due_date','t'],
    ['job_invoices','created_at','t'],
    ['job_invoices','data','j'],
    ['job_invoice_templates','created_at','t'],
    ['job_invoice_templates','updated_at','t'],
    ['invoice_settings','created_at','t'],
    ['invoice_settings','updated_at','t']
  ];
BEGIN
  -- ── 1. Work out how far to slide ────────────────────────────────
  -- The dataset's own oldest job is the anchor: the day the scenario
  -- describes. Reading it back from the data (rather than hardcoding it) is
  -- what makes this script re-runnable for the life of the demo account.
  SELECT min(created_at) INTO v_anchor_ts FROM public.jobs WHERE company_id = v_company;

  IF v_anchor_ts IS NULL THEN
    v_anchor_ts := v_fallback::timestamptz;
    RAISE NOTICE 'No demo jobs found for % — falling back to anchor %.', v_company, v_fallback;
    RAISE NOTICE 'If the demo data was wiped, run seed_demo_example_excavating.sql instead.';
  END IF;

  v_anchor := v_anchor_ts::date;
  v_delta  := current_date - v_anchor;

  RAISE NOTICE 'Demo anchor: %  ->  today: %  (shift % days)', v_anchor, current_date, v_delta;

  IF v_delta = 0 THEN
    RAISE NOTICE 'Demo data is already anchored to today. Nothing to do.';
    RETURN;
  END IF;

  -- ── 2. Shift dates embedded in jsonb payloads ──────────────────
  -- Invoice and work-log snapshots carry their own "date" strings, and the
  -- ticket audit log stores before/after values. Rewrite every YYYY-MM-DD in
  -- the document. Two passes via placeholders, so a shifted value can never be
  -- picked up and shifted a second time by a later replacement.
  --
  -- This runs BEFORE the typed columns below, because the row guard reads
  -- created_at — once that has been shifted, these rows would fall outside the
  -- window and their payloads would be left behind.
  FOR n IN 1 .. array_length(v_columns, 1) LOOP
    CONTINUE WHEN v_columns[n][3] <> 'j';

    SELECT v_tables[k][2], v_tables[k][3]
      INTO v_scope, v_guard
    FROM generate_subscripts(v_tables, 1) AS k
    WHERE v_tables[k][1] = v_columns[n][1];

    v_col := v_columns[n][2];

    FOR row_rec IN EXECUTE format(
      'SELECT id, %1$I::text AS txt FROM public.%2$I
        WHERE (%3$s) AND (%4$s <= $2 OR %4$s IS NULL)
          AND %1$I IS NOT NULL AND %1$I::text ~ $3',
      v_col, v_columns[n][1], v_scope, v_guard)
      USING v_company, v_anchor_ts + v_seed_window, c_iso_date
    LOOP
      BEGIN
        v_txt := row_rec.txt;

        -- The placeholder must not collide with real content.
        IF v_txt LIKE '%~~DT%' THEN
          RAISE NOTICE 'Skipped %.% id=% (contains the placeholder marker)',
                       v_columns[n][1], v_col, row_rec.id;
          CONTINUE;
        END IF;

        -- c_iso_date has no capture groups, so arr[1] is the whole match.
        SELECT array_agg(DISTINCT m.arr[1]) INTO v_dates
        FROM regexp_matches(v_txt, c_iso_date, 'g') AS m(arr);

        v_new := v_txt;
        FOR d IN 1 .. array_length(v_dates, 1) LOOP
          v_new := replace(v_new, v_dates[d], '~~DT' || d || '~~');
        END LOOP;
        FOR d IN 1 .. array_length(v_dates, 1) LOOP
          v_new := replace(v_new, '~~DT' || d || '~~',
                           to_char(v_dates[d]::date + v_delta, 'YYYY-MM-DD'));
        END LOOP;

        IF v_new <> v_txt THEN
          EXECUTE format('UPDATE public.%I SET %I = $1::jsonb WHERE id = $2',
                         v_columns[n][1], v_col)
            USING v_new, row_rec.id;
          v_json_rows := v_json_rows + 1;
        END IF;
      EXCEPTION WHEN others THEN
        -- A value that passes the pattern but is not a real day (2026-02-30)
        -- must not abort the whole refresh.
        RAISE NOTICE 'Skipped %.% id=%: %', v_columns[n][1], v_col, row_rec.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  -- ── 3. Shift the typed date columns, one UPDATE per table ──────
  FOR t IN 1 .. array_length(v_tables, 1) LOOP
    v_sets := ARRAY[]::text[];

    FOR col IN
      SELECT v_columns[k][2] AS name, v_columns[k][3] AS kind
      FROM generate_subscripts(v_columns, 1) AS k
      WHERE v_columns[k][1] = v_tables[t][1]
        AND v_columns[k][3] <> 'j'
    LOOP
      v_sets := v_sets || CASE col.kind
        -- date + integer stays a date
        WHEN 'd' THEN format('%1$I = %1$I + $2', col.name)
        -- whole days, so the clock time of day survives
        WHEN 't' THEN format('%1$I = %1$I + make_interval(days => $2)', col.name)
        -- ISO text, rewritten only where it really is an ISO date
        WHEN 's' THEN format(
          '%1$I = CASE WHEN %1$I ~ ''^\d{4}-\d{2}-\d{2}$''
                       THEN to_char(%1$I::date + $2, ''YYYY-MM-DD'') ELSE %1$I END', col.name)
        -- epoch milliseconds
        WHEN 'e' THEN format('%1$I = %1$I + ($2::bigint * 86400000)', col.name)
      END;
    END LOOP;

    CONTINUE WHEN array_length(v_sets, 1) IS NULL;

    v_guard := format('(%1$s <= $3 OR %1$s IS NULL)', v_tables[t][3]);
    v_sql := format('UPDATE public.%I SET %s WHERE (%s) AND %s',
                    v_tables[t][1], array_to_string(v_sets, ', '), v_tables[t][2], v_guard);

    EXECUTE v_sql USING v_company, v_delta, v_anchor_ts + v_seed_window;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    IF v_rows > 0 THEN
      RAISE NOTICE '  % rows  %', lpad(v_rows::text, 4), v_tables[t][1];
    END IF;
  END LOOP;

  RAISE NOTICE 'Done. % rows shifted % days, plus % jsonb payload(s). Demo now anchored to %.',
               v_total, v_delta, v_json_rows, current_date;
END $$;
