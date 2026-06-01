-- ================================================================
-- DigTrack Pro — Inbound Tickets Seed Data
-- ================================================================
-- PURPOSE
-- -------
-- Populates inbound_tickets, inbound_ticket_notes with realistic
-- sample data so you can exercise every dashboard feature:
--   • All four status values  (unassigned / assigned / in_progress / completed)
--   • All urgency buckets     (overdue / due today / due in ≤3 days / future)
--   • Multiple utility types
--   • Bulk-assign, inline status change, search, date filters
--
-- HOW TO RUN
-- ----------
-- 1. Open Supabase Dashboard → SQL Editor → New query
-- 2. Replace the two placeholder values below:
--      YOUR_COMPANY_ID  → your company's UUID  (companies.id)
--      YOUR_USER_ID     → your profile's UUID  (profiles.id)
-- 3. Optionally replace the second YOUR_USER_ID (v_crew) with a real crew profile UUID
--    (or leave it as-is — same value means "you" own the assigned tickets for testing)
-- 4. Run the query
--
-- SAFE TO RE-RUN: uses INSERT … ON CONFLICT DO NOTHING on the fixed
-- ticket UUIDs, so re-running will not create duplicates.
-- ================================================================

DO $$
DECLARE
  -- ── CHANGE THESE TWO VALUES ───────────────────────────────────
  v_company  uuid := 'YOUR_COMPANY_ID';   -- your companies.id
  v_admin    uuid := 'YOUR_USER_ID';      -- your profiles.id (admin)
  v_crew     uuid := 'YOUR_USER_ID';      -- profiles.id of a crew member
                                          -- (can be same as v_admin for testing)
  -- ─────────────────────────────────────────────────────────────

  -- Fixed ticket UUIDs so re-running is idempotent
  t1  uuid := 'a1000000-0000-0000-0000-000000000001';
  t2  uuid := 'a1000000-0000-0000-0000-000000000002';
  t3  uuid := 'a1000000-0000-0000-0000-000000000003';
  t4  uuid := 'a1000000-0000-0000-0000-000000000004';
  t5  uuid := 'a1000000-0000-0000-0000-000000000005';
  t6  uuid := 'a1000000-0000-0000-0000-000000000006';
  t7  uuid := 'a1000000-0000-0000-0000-000000000007';
  t8  uuid := 'a1000000-0000-0000-0000-000000000008';
  t9  uuid := 'a1000000-0000-0000-0000-000000000009';
  t10 uuid := 'a1000000-0000-0000-0000-000000000010';
  t11 uuid := 'a1000000-0000-0000-0000-000000000011';
  t12 uuid := 'a1000000-0000-0000-0000-000000000012';

  today      text := to_char(current_date,                  'YYYY-MM-DD');
  yesterday  text := to_char(current_date - interval '1 day',  'YYYY-MM-DD');
  minus3     text := to_char(current_date - interval '3 days', 'YYYY-MM-DD');
  minus5     text := to_char(current_date - interval '5 days', 'YYYY-MM-DD');
  plus1      text := to_char(current_date + interval '1 day',  'YYYY-MM-DD');
  plus2      text := to_char(current_date + interval '2 days', 'YYYY-MM-DD');
  plus3      text := to_char(current_date + interval '3 days', 'YYYY-MM-DD');
  plus7      text := to_char(current_date + interval '7 days', 'YYYY-MM-DD');
  plus5      text := to_char(current_date + interval '5 days', 'YYYY-MM-DD');
  plus10     text := to_char(current_date + interval '10 days','YYYY-MM-DD');
  plus14     text := to_char(current_date + interval '14 days','YYYY-MM-DD');

BEGIN

  -- ── TICKETS ───────────────────────────────────────────────────

  INSERT INTO inbound_tickets
    (id, company_id, ticket_number, site_address, dig_start_date,
     due_date, status, assigned_to, caller_name, caller_phone,
     utility_types, notes, created_by)
  VALUES

    -- 1. OVERDUE · unassigned · Electric + Gas
    (t1, v_company, 'IB-2026-0001',
     '412 Elm Street, Springfield',
     minus5, minus3, 'unassigned', NULL,
     'Sandra Kowalski', '(555) 201-4433',
     ARRAY['Electric','Gas'],
     'Homeowner reports smell of gas near meter. Needs urgent locate before contractor digs foundation footing.',
     v_admin),

    -- 2. OVERDUE · assigned · Water
    (t2, v_company, 'IB-2026-0002',
     '88 Birchwood Drive, Mapleton',
     minus5, yesterday, 'assigned', v_crew,
     'Tom Bellamy', '(555) 308-9921',
     ARRAY['Water'],
     'Water main break repair scheduled. Excavation crew on standby.',
     v_admin),

    -- 3. DUE TODAY · unassigned · Telecom + Fiber
    (t3, v_company, 'IB-2026-0003',
     '1720 Oak Avenue, Riverside',
     today, today, 'unassigned', NULL,
     'Maria Estrada', '(555) 412-6678',
     ARRAY['Telecom','Fiber'],
     'New fiber installation for commercial plaza. Time-sensitive — contractor starts today.',
     v_admin),

    -- 4. DUE TODAY · in_progress · Electric
    (t4, v_company, 'IB-2026-0004',
     '5 Commerce Blvd, Greenfield',
     today, today, 'in_progress', v_crew,
     'Ray Fitzgerald', '(555) 506-1144',
     ARRAY['Electric'],
     'Electrical vault relocation prior to road widening project.',
     v_admin),

    -- 5. DUE IN 1 DAY · unassigned · Sewer + Water
    (t5, v_company, 'IB-2026-0005',
     '330 Maple Court, Hillcrest',
     today, plus1, 'unassigned', NULL,
     'Deborah Yuen', '(555) 614-2295',
     ARRAY['Sewer','Water'],
     'Storm drain tie-in for new residential development.',
     v_admin),

    -- 6. DUE IN 2 DAYS · assigned · Gas
    (t6, v_company, 'IB-2026-0006',
     '9 Industrial Parkway, Northvale',
     plus1, plus2, 'assigned', v_crew,
     'Carlos Mendez', '(555) 703-8866',
     ARRAY['Gas'],
     'Gas service upgrade for manufacturing plant expansion.',
     v_admin),

    -- 7. DUE IN 3 DAYS · assigned · Electric + Water + Telecom
    (t7, v_company, 'IB-2026-0007',
     '601 Pine Ridge Road, Oakwood',
     plus1, plus3, 'assigned', v_crew,
     'Laura Simmons', '(555) 819-3347',
     ARRAY['Electric','Water','Telecom'],
     'Multi-utility corridor relocation for highway interchange project.',
     v_admin),

    -- 8. DUE IN 7 DAYS · unassigned · Cable + Fiber
    (t8, v_company, 'IB-2026-0008',
     '250 Willow Lane, Cedarburg',
     plus3, plus7, 'unassigned', NULL,
     'James Worthington', '(555) 922-5531',
     ARRAY['Cable','Fiber'],
     'Underground cable reroute around planned utility vault.',
     v_admin),

    -- 9. DUE IN 7 DAYS · in_progress · Sewer
    (t9, v_company, 'IB-2026-0009',
     '17 Clearwater Blvd, Lakeside',
     plus2, plus7, 'in_progress', v_crew,
     'Priya Nair', '(555) 104-7782',
     ARRAY['Sewer'],
     'Sanitary sewer lift station decommission. Crew on site Wednesday.',
     v_admin),

    -- 10. DUE IN 10 DAYS · unassigned · Electric + Gas + Water
    (t10, v_company, 'IB-2026-0010',
     '3300 Harbor View Drive, Portside',
     plus5, plus10, 'unassigned', NULL,
     'Brendan Walsh', '(555) 277-0055',
     ARRAY['Electric','Gas','Water'],
     'Major utility relocation for waterfront redevelopment. Three-utility corridor.',
     v_admin),

    -- 11. DUE IN 14 DAYS · assigned · Telecom
    (t11, v_company, 'IB-2026-0011',
     '44 Summit Trail, Alpine Heights',
     plus7, plus14, 'assigned', v_crew,
     'Gwen Holloway', '(555) 360-1123',
     ARRAY['Telecom'],
     'Telecom conduit installation for new cell tower base station.',
     v_admin),

    -- 12. COMPLETED · Electric + Steam
    (t12, v_company, 'IB-2026-0012',
     '800 University Avenue, Midtown',
     minus5, yesterday, 'completed', v_crew,
     'Frank Deluca', '(555) 481-9944',
     ARRAY['Electric','Steam'],
     'Campus steam tunnel crossing complete. Flagged for follow-up inspection.',
     v_admin)

  ON CONFLICT (id) DO NOTHING;

  -- ── NOTES ─────────────────────────────────────────────────────
  -- Add a note thread to a handful of tickets so the Notes tab
  -- has content to display in InboundTicketDetail.

  INSERT INTO inbound_ticket_notes (ticket_id, text, author_id, author_name)
  VALUES
    -- Ticket 1 (overdue, unassigned — escalation thread)
    (t1, 'Received locate request via 811 portal. Gas odor reported — marked HIGH PRIORITY.',
      v_admin, 'Dispatch'),
    (t1, 'Attempted to reach homeowner — no answer. Left voicemail.',
      v_admin, 'Dispatch'),
    (t1, 'Contractor confirmed they will hold excavation pending our locate.',
      v_admin, 'Dispatch'),

    -- Ticket 4 (due today, in progress)
    (t4, 'Crew departed yard at 07:45. ETA to site 08:30.',
      v_admin, 'Dispatch'),
    (t4, 'On site. Electric vault found 6 inches south of marked location.',
      v_crew, 'Field Crew'),

    -- Ticket 7 (due in 3 days, assigned)
    (t7, 'Three-utility corridor confirmed with engineering. Drawing set sent to crew.',
      v_admin, 'Dispatch'),

    -- Ticket 9 (due in 7 days, in progress)
    (t9, 'Sewer CCTV inspection done. Decommission plan approved by engineer.',
      v_crew, 'Field Crew'),
    (t9, 'Bypass pumping equipment staged on site.',
      v_crew, 'Field Crew'),

    -- Ticket 12 (completed)
    (t12, 'Locate complete — all utilities marked. Steam line depth 4.2 ft at crossings.',
      v_crew, 'Field Crew'),
    (t12, 'As-built sketch submitted to records office.',
      v_admin, 'Dispatch')

  ON CONFLICT DO NOTHING;

END $$;
