// Seed data for the in-memory harness DB (see mockSupabase.ts).
// Rows are in database (snake_case) shape so the real service mappers run.

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID   = '22222222-2222-2222-2222-222222222222';
const CREW_ID    = '33333333-3333-3333-3333-333333333333';
const CREW2_ID   = '44444444-4444-4444-4444-444444444444';

export const SESSION_USER = {
  id: ADMIN_ID,
  email: 'admin@harness.test',
  name: 'Avery Admin',
  role: 'ADMIN',
  companyId: COMPANY_ID,
};

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const at = (offset: number, hour = 8) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return iso(d); };

/** Ticket rows spanning every status the dashboard can show. */
const ticket = (o: Partial<Record<string, unknown>> & { ticket_no: string; job_number: string }) => ({
  id: crypto.randomUUID(),
  company_id: COMPANY_ID,
  street: '', cross_street: '', place: '', extent: '', county: 'Travis', city: 'Austin', state: 'TX',
  site_contact: 'Sam Foreman  (512) 555-0100',
  refresh_requested: false, no_show_requested: false, is_archived: false,
  document_url: '', geotag_lat: null, geotag_lng: null,
  created_at: at(-20),
  ...o,
});

export const seedDb = (): Record<string, any[]> => {
  const tickets = [
    // VALID — work date passed, expiry comfortably out
    ticket({ ticket_no: '2607200123', job_number: 'J-1042', street: '1200 W 6th St', cross_street: 'Blanco St',
      place: 'Front of building', extent: '200ft north of pole', call_in_date: day(-12), work_date: day(-10),
      expires: day(9), geotag_lat: 30.2705, geotag_lng: -97.7574,
      bbox_lat1: 30.2712, bbox_lng1: -97.7581, bbox_lat2: 30.2712, bbox_lng2: -97.7566,
      bbox_lat3: 30.2698, bbox_lng3: -97.7566, bbox_lat4: 30.2698, bbox_lng4: -97.7581 }),
    // EXTENDABLE — inside the 3-day refresh window
    ticket({ ticket_no: '2607200124', job_number: 'J-1042', street: '1310 W 6th St', cross_street: 'Baylor St',
      call_in_date: day(-16), work_date: day(-14), expires: day(2),
      geotag_lat: 30.2711, geotag_lng: -97.7601 }),
    // REFRESH_NEEDED
    ticket({ ticket_no: '2607200125', job_number: 'J-1042', street: '905 Rio Grande St', cross_street: 'W 9th St',
      call_in_date: day(-18), work_date: day(-16), expires: day(4), refresh_requested: true,
      geotag_lat: 30.2745, geotag_lng: -97.7458 }),
    // EXPIRED
    ticket({ ticket_no: '2606110088', job_number: 'J-0987', street: '4501 Duval St', cross_street: 'E 45th St',
      call_in_date: day(-40), work_date: day(-38), expires: day(-9),
      geotag_lat: 30.3078, geotag_lng: -97.7261 }),
    // PENDING — work date in the future
    ticket({ ticket_no: '2607250199', job_number: 'J-1055', street: '3300 S Congress Ave', cross_street: 'Ramble Ln',
      call_in_date: day(-1), work_date: day(1), expires: day(15) }),
    // NO SHOW logged
    ticket({ ticket_no: '2607200126', job_number: 'J-1055', street: '2200 Manor Rd', cross_street: 'Coleto St',
      call_in_date: day(-8), work_date: day(-6), expires: day(12), no_show_requested: true,
      geotag_lat: 30.2818, geotag_lng: -97.7148 }),
    // Archived (superseded)
    ticket({ ticket_no: '2605010045', job_number: 'J-0987', street: '4501 Duval St', cross_street: 'E 45th St',
      call_in_date: day(-70), work_date: day(-68), expires: day(-40), is_archived: true }),
    // Belongs to a completed job — should be hidden from the active dashboard
    ticket({ ticket_no: '2604010011', job_number: 'J-0900', street: '77 Closed Rd', cross_street: 'Done St',
      call_in_date: day(-120), work_date: day(-118), expires: day(-100) }),
    // Dig-by prompt candidate: work_date + 9 days is yesterday, work_begun unanswered
    ticket({ ticket_no: '2607150077', job_number: 'J-1042', street: '600 Congress Ave', cross_street: 'W 6th St',
      call_in_date: day(-13), work_date: day(-11), expires: day(20) }),
    // Ticket with no coordinates at all (map geocoding path)
    ticket({ ticket_no: '2607220133', job_number: 'J-1055', street: '9500 Research Blvd', cross_street: 'Burnet Rd',
      call_in_date: day(-5), work_date: day(-3), expires: day(18), work_begun: true }),
  ];

  const jobs = [
    { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-1042', job_name: 'Sixth Street Fiber',
      customer: 'Metro Fiber Partners', site_contact: 'Sam Foreman', address: '1200 W 6th St', city: 'Austin',
      state: 'TX', county: 'Travis', is_complete: false, created_at: at(-25) },
    { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-1055', job_name: 'South Congress Water Main',
      customer: 'City of Austin', site_contact: 'Dana Ruiz', address: '3300 S Congress Ave', city: 'Austin',
      state: 'TX', county: 'Travis', is_complete: false, created_at: at(-10) },
    { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-0987', job_name: 'Duval Reconductor',
      customer: 'Hill Country Electric', site_contact: 'Pat Nguyen', address: '4501 Duval St', city: 'Austin',
      state: 'TX', county: 'Travis', is_complete: false, created_at: at(-60) },
    { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-0900', job_name: 'Closed Out Job',
      customer: 'Archived Client', site_contact: '', address: '77 Closed Rd', city: 'Austin',
      state: 'TX', county: 'Travis', is_complete: true, created_at: at(-130) },
  ];

  const noShowTicket = tickets.find(t => t.no_show_requested)!;

  return {
    companies: [{
      id: COMPANY_ID, name: 'Harness Excavation', brand_color: '#2563eb', city: 'Austin', state: 'TX',
      phone: '(512) 555-0134', created_at: at(-365), is_active: true,
      inbound_enabled: true, scheduling_enabled: true, time_tracking_enabled: true, inventory_enabled: true,
    }],
    profiles: [
      { id: ADMIN_ID, company_id: COMPANY_ID, name: 'Avery Admin', username: 'admin@harness.test', role: 'ADMIN', notify_email: 'alerts@harness.test' },
      { id: CREW_ID, company_id: COMPANY_ID, name: 'Chris Crew', username: 'chris@harness.test', role: 'CREW', notify_email: null },
      { id: CREW2_ID, company_id: COMPANY_ID, name: 'Robin Operator', username: 'robin@harness.test', role: 'CREW', notify_email: null },
    ],
    jobs,
    tickets,
    photos: [],
    notes: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-1042', ticket_id: tickets[0].id,
        text: 'Gas marked on the north side, still waiting on telecom.', author: 'Chris Crew', timestamp: Date.now() - 86400000 },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, job_number: 'J-1042', ticket_id: '',
        text: 'Traffic control set for the week of the 27th.', author: 'Avery Admin', timestamp: Date.now() - 43200000 },
    ],
    no_shows: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, ticket_id: noShowTicket.id, job_number: noShowTicket.job_number,
        utilities: ['Gas', 'Telecom'], companies: 'Texas Gas Service, Charter', notes: 'No paint or flags on site at 7:30am.',
        author: 'Chris Crew', timestamp: Date.now() - 7200000 },
    ],
    push_subscriptions: [],
    job_prints: [],
    print_markers: [],
    pdf_annotations: [],
    company_invites: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, token: '99999999-9999-9999-9999-999999999999', used_at: null, created_at: at(-3) },
    ],

    // ── Inbound module ─────────────────────────────────────────────────────
    inbound_tickets: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, ticket_number: 'IB-4401', site_address: '801 Barton Springs Rd, Austin TX',
        dig_start_date: day(1), due_date: day(2), status: 'unassigned', assigned_to: null, caller_name: 'Jordan Pike',
        caller_phone: '(512) 555-0180', utility_types: ['Water', 'Sewer'], notes: 'Meet the caller at the gate.',
        created_by: ADMIN_ID, created_at: at(-1) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, ticket_number: 'IB-4402', site_address: '1600 E Riverside Dr, Austin TX',
        dig_start_date: day(0), due_date: day(0), status: 'assigned', assigned_to: CREW_ID, caller_name: 'Lee Watts',
        caller_phone: '(512) 555-0181', utility_types: ['Electric'], notes: '', created_by: ADMIN_ID, created_at: at(-2) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, ticket_number: 'IB-4403', site_address: '2100 Guadalupe St, Austin TX',
        dig_start_date: day(-1), due_date: day(-1), status: 'in_progress', assigned_to: CREW2_ID, caller_name: 'Morgan Diaz',
        caller_phone: '(512) 555-0182', utility_types: ['Telecom', 'Gas'], notes: 'Locator on site.', created_by: ADMIN_ID, created_at: at(-3) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, ticket_number: 'IB-4399', site_address: '500 W 2nd St, Austin TX',
        dig_start_date: day(-4), due_date: day(-3), status: 'completed', assigned_to: CREW_ID, caller_name: 'Riley Chen',
        caller_phone: '(512) 555-0183', utility_types: ['Water'], notes: 'Cleared.', created_by: ADMIN_ID, created_at: at(-5) },
    ],
    inbound_ticket_photos: [],
    inbound_ticket_notes: [],
    inbound_ticket_time_entries: [],

    // ── Field Ops / scheduling ─────────────────────────────────────────────
    employees: [
      { id: 1, company_id: COMPANY_ID, name: 'Chris Crew', role: 'Operator', hourly_rate: 42, profile_id: CREW_ID, is_foreman: true },
      { id: 2, company_id: COMPANY_ID, name: 'Robin Operator', hourly_rate: 38, role: 'Laborer', profile_id: CREW2_ID, is_foreman: false },
      { id: 3, company_id: COMPANY_ID, name: 'Taylor Pipefitter', hourly_rate: 45, role: 'Pipefitter', profile_id: null, is_foreman: false },
    ],
    materials: [
      { id: 1, company_id: COMPANY_ID, name: '2" HDPE Pipe (ft)', unit_price: 3.25 },
      { id: 2, company_id: COMPANY_ID, name: 'Flowable Fill (yd³)', unit_price: 118 },
      { id: 3, company_id: COMPANY_ID, name: 'Cold Patch (ton)', unit_price: 165 },
    ],
    service_jobs: [
      { id: 1, company_id: COMPANY_ID, customer_name: 'Metro Fiber Partners', job_name: 'Sixth Street Fiber', job_number: 'J-1042',
        address: '1200 W 6th St, Austin TX', start_date: day(-10), end_date: day(12), notes: '', status: 'active', foreman_id: '1' },
      { id: 2, company_id: COMPANY_ID, customer_name: 'City of Austin', job_name: 'South Congress Water Main', job_number: 'J-1055',
        address: '3300 S Congress Ave, Austin TX', start_date: day(-2), end_date: day(20), notes: '', status: 'active', foreman_id: null },
    ],
    work_logs: [
      { id: 1, job_id: 1, date: day(-2), notes: 'Bored 180ft, hit rock near station 4.',
        data: { employees: [{ employeeId: 1, hours: 8, rate: 42 }, { employeeId: 2, hours: 8, rate: 38 }], equipment: [],
                materials: [{ materialId: 1, name: '2" HDPE Pipe (ft)', quantity: 180, unitPrice: 3.25 }] } },
      { id: 2, job_id: 1, date: day(-1), notes: 'Pulled fiber, backfilled.',
        data: { employees: [{ employeeId: 1, hours: 9, rate: 42 }], equipment: [],
                materials: [{ materialId: 2, name: 'Flowable Fill (yd\u00b3)', quantity: 4, unitPrice: 118 }] } },
      // Legacy/partial row: written before `rate` existed on labor lines.
      { id: 3, job_id: 2, date: day(-1), notes: 'Legacy row with a missing rate.',
        data: { employees: [{ employeeId: 3, hours: 6 }], equipment: [], materials: [] } },
    ],
    work_log_templates: [
      { id: 1, company_id: COMPANY_ID, name: 'Standard 2-man crew', data: { employees: [{ employeeId: 1, hours: 8, rate: 42 }, { employeeId: 2, hours: 8, rate: 38 }], equipment: [], materials: [] } },
    ],
    invoices: [
      { id: 1, company_id: COMPANY_ID, job_id: 1, invoice_number: 'INV-1001', date: day(-3), due_date: day(27), status: 'sent',
        labor_total: 2400, equipment_total: 1150, material_total: 585, grand_total: 4135, data: {} },
    ],
    invoice_settings: [
      { id: 1, company_id: COMPANY_ID, company_name: 'Harness Excavation', company_address: '4200 Industrial Blvd, Austin TX',
        company_phone: '(512) 555-0134', company_email: 'billing@harness.test', logo_initials: 'HE',
        payment_terms: 'Net 30', header_color: '#0a142d', accent_color: '#c49614' },
    ],
    schedule_crews: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'Crew A', member_ids: [1, 2], created_at: at(-30) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'Crew B', member_ids: [3], created_at: at(-29) },
    ],
    schedule_blocks: [],

    // ── Inventory ──────────────────────────────────────────────────────────
    inventory_locations: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'Main Yard', address: '4200 Industrial Blvd', city: 'Austin', state: 'TX', zip: '78744', lat: 30.2045, lng: -97.7395, created_at: at(-200) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'North Shop', address: '11000 Metric Blvd', city: 'Austin', state: 'TX', zip: '78758', lat: null, lng: null, created_at: at(-100) },
    ],
    inventory_items: [
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'CAT 305 Mini Excavator', item_type: 'EQUIPMENT', unit_number: 'EX-12',
        equipment_type: 'Excavator', year: 2022, make: 'Caterpillar', model: '305 CR', serial_number: 'CAT0305X1', license_plate: null,
        vin: null, asset_tag: 'A-1044', last_service_date: day(-45), next_service_due: day(15), odometer: 1820, hourly_rate: 95,
        quantity: 1, unit: 'each', current_location_id: null, current_job_id: null, current_assignee_id: null, notes: '',
        created_at: at(-300), updated_at: at(-10) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'Ditch Witch JT20', item_type: 'EQUIPMENT', unit_number: 'DD-03',
        equipment_type: 'Directional Drill', year: 2020, make: 'Ditch Witch', model: 'JT20', serial_number: 'DW20J0031',
        license_plate: null, vin: null, asset_tag: 'A-1045', last_service_date: day(-90), next_service_due: day(-5),
        odometer: 4400, hourly_rate: 150, quantity: 1, unit: 'each', current_location_id: null, current_job_id: null,
        current_assignee_id: null, notes: 'Service overdue', created_at: at(-400), updated_at: at(-30) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: 'Trench Shoring Box 6ft', item_type: 'MATERIAL', quantity: 4,
        unit: 'each', hourly_rate: 0, current_location_id: null, current_job_id: null, current_assignee_id: null,
        notes: '', created_at: at(-150), updated_at: at(-20) },
      { id: crypto.randomUUID(), company_id: COMPANY_ID, name: '2" HDPE Pipe', item_type: 'MATERIAL', quantity: 1200,
        unit: 'ft', hourly_rate: 0, current_location_id: null, current_job_id: null, current_assignee_id: null,
        notes: '', created_at: at(-150), updated_at: at(-2) },
    ],
    inventory_movements: [],

    // ── Time tracker ───────────────────────────────────────────────────────
    cost_codes: [
      { id: 1, company_id: COMPANY_ID, code: '01-100', description: 'Mobilization', is_active: true },
      { id: 2, company_id: COMPANY_ID, code: '02-200', description: 'Trenching', is_active: true },
      { id: 3, company_id: COMPANY_ID, code: '02-300', description: 'Boring', is_active: true },
      { id: 4, company_id: COMPANY_ID, code: '09-900', description: 'Cleanup', is_active: false },
    ],
    job_cost_codes: [
      { id: 1, company_id: COMPANY_ID, job_kind: 'dig', job_ref: 'J-1042', cost_code_id: 2 },
      { id: 2, company_id: COMPANY_ID, job_kind: 'dig', job_ref: 'J-1042', cost_code_id: 3 },
      { id: 3, company_id: COMPANY_ID, job_kind: 'service', job_ref: '1', cost_code_id: 1 },
    ],
    time_entries: [
      { id: 1, company_id: COMPANY_ID, employee_id: 1, job_kind: 'dig', job_ref: 'J-1042', job_label: 'J-1042 · Sixth Street Fiber',
        cost_code_id: 2, clocked_in_at: at(-2, 7), clocked_out_at: at(-2, 16), note: '', gps_lat: 30.27, gps_lng: -97.75,
        approved: true, approved_by: ADMIN_ID, approved_at: at(-1, 9) },
      { id: 2, company_id: COMPANY_ID, employee_id: 2, job_kind: 'dig', job_ref: 'J-1042', job_label: 'J-1042 · Sixth Street Fiber',
        cost_code_id: 2, clocked_in_at: at(-1, 7), clocked_out_at: at(-1, 15), note: 'Half day', gps_lat: null, gps_lng: null,
        approved: false, approved_by: null, approved_at: null },
      // Currently clocked in (open entry)
      { id: 3, company_id: COMPANY_ID, employee_id: 3, job_kind: 'service', job_ref: '1', job_label: 'Sixth Street Fiber',
        cost_code_id: 1, clocked_in_at: at(0, 7), clocked_out_at: null, note: '', gps_lat: null, gps_lng: null,
        approved: false, approved_by: null, approved_at: null },
    ],
    time_clock_crews: [
      { id: 1, company_id: COMPANY_ID, owner_profile_id: ADMIN_ID, name: 'My Crew', member_ids: [1, 2] },
    ],
    daily_reports: [
      { id: 1, company_id: COMPANY_ID, job_kind: 'dig', job_ref: 'J-1042', job_label: 'J-1042 · Sixth Street Fiber',
        report_date: day(-1), progress_summary: 'Bored 180ft and pulled fiber through vaults 3-5.',
        safety_notes: 'Tailgate meeting held at 7:00am.', locates_notes: 'Telecom locate still outstanding.',
        injuries_count: 0, photos: [], status: 'submitted', submitted_at: at(-1, 17), prepared_by_id: ADMIN_ID,
        prepared_by_name: 'Avery Admin', created_at: at(-1, 17), updated_at: at(-1, 17) },
    ],
    job_invoices: [],
    job_invoice_templates: [],
  };
};
