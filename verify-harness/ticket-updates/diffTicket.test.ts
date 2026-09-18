// diffTicket unit checks. Run from the repo root:  npx tsx verify-harness/ticket-updates/diffTicket.test.ts
//
// The point of the first two cases: `isArchived` is normalised to a real
// boolean on every apiService read and write (`is_archived ?? false`), so a
// loaded ticket never has the key absent. An earlier harness fixture omitted
// it, which produced a phantom "Archived — → No" diff and looked like a
// product bug. It was not one — these cases pin both shapes.
import { DigTicket } from '../../types.ts';
import { diffTicket } from '../../utils/ticketUpdateUtils.ts';

const base = {
  id: 't1', companyId: 'c1', jobNumber: 'J1', ticketNo: 'B1',
  street: 'Main', crossStreet: '3rd', place: 'X', extent: 'Y', county: 'C',
  city: 'S', state: 'IL', callInDate: '2026-03-01', workDate: '2026-03-04',
  digByDate: '2026-03-11', expires: '2026-03-16', siteContact: 'P', createdAt: 0,
};

// Shape the REAL data layer produces: is_archived ?? false, work_begun ?? undefined
const fromApi: DigTicket = { ...base, isArchived: false, workBegun: undefined };
// Shape my harness fixture produced: both keys absent
const fromLiteral = { ...base } as DigTicket;

const show = (label: string, t: DigTicket) => {
  const d = diffTicket(t, { ...t });
  console.log(`${label.padEnd(34)} ${d.length === 0 ? 'no phantom diff' : 'PHANTOM: ' + JSON.stringify(d)}`);
};

console.log('--- current (fixed) displayValue ---');
show('apiService-shaped ticket', fromApi);
show('object-literal ticket (no keys)', fromLiteral);

// A real edit still registers
const edited: DigTicket = { ...fromApi, expires: '2026-04-12', isArchived: true };
console.log('real edit detected:', JSON.stringify(diffTicket(fromApi, edited).map(c => `${c.label} ${c.before}→${c.after}`)));

// workBegun tri-state: unset -> No must be a real change, and No -> No must not be
console.log('workBegun unset→No:', JSON.stringify(diffTicket(fromApi, { ...fromApi, workBegun: false }).map(c => `${c.label} ${c.before}→${c.after}`)));
console.log('workBegun No→No:   ', JSON.stringify(diffTicket({ ...fromApi, workBegun: false }, { ...fromApi, workBegun: false })));
