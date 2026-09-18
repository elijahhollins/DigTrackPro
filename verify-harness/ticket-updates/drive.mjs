// Playwright pass over the ticket action menu, update modal and update log.
// Start the harness first, from the repo root:
//   npx vite --config verify-harness/ticket-updates/vite.config.ts
//   node verify-harness/ticket-updates/drive.mjs
// Screenshots land in OUT; exits non-zero if any check fails.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.SHOT_DIR || '/tmp/ticket-update-shots';
const URL = 'http://localhost:5198/verify-harness/ticket-updates/index.html';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const newPage = async (query = '') => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => check('no page errors', false, e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('404')) check('no console errors', false, m.text());
  });
  await page.goto(URL + query, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="ticket-no"]');
  return page;
};

// ── 1. admin menu, dark ────────────────────────────────────────────────────
let page = await newPage();
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.waitForSelector('[role="menu"]');
let items = await page.$$eval('[role="menu"] button', bs => bs.map(b => b.innerText.replace(/\s+/g,' ').trim()));
check('admin menu lists all 6 actions', items.length === 6, items.join(' | '));
await page.screenshot({ path: `${OUT}/01-menu-admin-dark.png` });

// ── 2. flip-up near the viewport floor ────────────────────────────────────
await page.keyboard.press('Escape');
await page.click('[data-testid="row-bottom-wrap"] button[title="Ticket actions"]');
await page.waitForSelector('[role="menu"]');
const geo = await page.evaluate(() => {
  const m = document.querySelector('[role="menu"]').getBoundingClientRect();
  const t = document.querySelector('[data-testid="row-bottom-wrap"] button[title="Ticket actions"]').getBoundingClientRect();
  return { menuBottom: m.bottom, menuTop: m.top, trigTop: t.top, vh: innerHeight };
});
check('menu flips above trigger at viewport floor', geo.menuBottom <= geo.trigTop + 1, `menu bottom ${Math.round(geo.menuBottom)} <= trigger top ${Math.round(geo.trigTop)}`);
check('menu stays fully on screen', geo.menuTop >= 0 && geo.menuBottom <= geo.vh, `top ${Math.round(geo.menuTop)}, bottom ${Math.round(geo.menuBottom)}, vh ${geo.vh}`);
await page.screenshot({ path: `${OUT}/02-menu-flip-up.png` });
await page.keyboard.press('Escape');

// ── 3. update modal: opens clean, Save disabled with no changes ───────────
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.click('[role="menu"] >> text=Update Ticket');
await page.waitForSelector('#tu-expires');
check('menu closes after selecting an item', (await page.$('[role="menu"]')) === null);
check('Save disabled when nothing changed', await page.isDisabled('button[type="submit"]'));
let diff = await page.$$eval('[class*="rounded-xl"] li', ls => ls.map(l => l.innerText.trim()));
check('no phantom diff on open', diff.length === 0, `${diff.length} rows`);
await page.screenshot({ path: `${OUT}/03-update-modal-clean.png` });

// ── 4. live diff preview ──────────────────────────────────────────────────
await page.fill('#tu-expires', '2026-04-12');
await page.click('button:has-text("Yes")');
await page.waitForTimeout(150);
diff = await page.$$eval('[class*="rounded-xl"] li', ls => ls.map(l => l.innerText.replace(/\s+/g,' ').trim()));
check('diff preview shows only changed fields', diff.length === 2 && diff[0].startsWith('Expires') && diff[1].startsWith('Work Begun'), diff.join(' | '));
check('Save enabled once something changed', !(await page.isDisabled('button[type="submit"]')));
await page.screenshot({ path: `${OUT}/04-update-modal-diff.png` });

// ── 5. reason is required ─────────────────────────────────────────────────
await page.click('button[type="submit"]');
await page.waitForTimeout(250);
const err = await page.textContent('p.text-rose-500').catch(() => '');
check('save blocked without a reason', /reason is required/i.test(err || ''), err);
check('modal stays open on validation failure', (await page.$('#tu-expires')) !== null);
await page.screenshot({ path: `${OUT}/05-update-modal-reason-required.png` });

// ── 6. save persists + logs ───────────────────────────────────────────────
await page.fill('#tu-reason', 'Julie extended the locate through 4/12');
await page.click('button[type="submit"]');
await page.waitForSelector('#tu-expires', { state: 'detached' });
check('ticket row reflects the new expiry', (await page.textContent('[data-testid="ticket-expires"]')).includes('2026-04-12'));
check('UPDATED event logged', (await page.textContent('[data-testid="event-log"]')).includes('UPDATED'));

// ── 7. remaining event kinds ──────────────────────────────────────────────
for (const label of ['Log No Show', 'Request Refresh', 'Archive Ticket']) {
  await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
  await page.click(`[role="menu"] >> text=${label}`);
  await page.waitForTimeout(250);
}
const evLog = await page.textContent('[data-testid="event-log"]');
check('all four event kinds logged', ['UPDATED','NO_SHOW_LOGGED','REFRESH_REQUESTED','ARCHIVED'].every(k => evLog.includes(k)), evLog);

await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
items = await page.$$eval('[role="menu"] button', bs => bs.map(b => b.innerText.replace(/\s+/g,' ').trim()));
check('Archive flips to Restore once archived', items.some(i => i.startsWith('Restore Ticket')), items.filter(i => /Restore|Archive/.test(i)).join(' | '));

// ── 8. history tab ────────────────────────────────────────────────────────
await page.click('[role="menu"] >> text=Update History');
await page.waitForTimeout(450);
const entries = await page.$$eval('.flex-1.overflow-y-auto > div', ds => ds.map(d => d.innerText.replace(/\s+/g,' ').trim()));
check('history renders all 4 entries', entries.length === 4, `${entries.length} entries`);
check('history is newest-first', /archived/i.test(entries[0]), entries[0].slice(0, 40));
check('diff lines rendered in history', entries.some(e => e.includes('2026-03-16 → 2026-04-12')));
check('reason rendered in history', entries.some(e => e.includes('Julie extended the locate')));
await page.screenshot({ path: `${OUT}/06-history-dark.png` });

// ── 9. notes tab still works ──────────────────────────────────────────────
await page.click('button:has-text("Notes")');
await page.fill('textarea', 'Crew on site, waiting on the gas locate.');
await page.click('button:has-text("Add Note")');
await page.waitForTimeout(350);
check('note added on the notes tab', (await page.textContent('.flex-1.overflow-y-auto')).includes('waiting on the gas locate'));
await page.screenshot({ path: `${OUT}/07-notes-dark.png` });

// ── 10. dismissal paths ───────────────────────────────────────────────────
// TicketNotesModal's header close button (pre-existing markup: no aria-label,
// and the modal has no Escape handler), so target the header button directly.
await page.click('div.px-6.py-4.border-b button');
await page.waitForSelector('.fixed.inset-0', { state: 'detached' });
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escape closes the menu', (await page.$('[role="menu"]')) === null);
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.mouse.click(1150, 500);
await page.waitForTimeout(200);
check('outside click closes the menu', (await page.$('[role="menu"]')) === null);
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(200);
check('resize closes the menu', (await page.$('[role="menu"]')) === null);
await page.close();

// ── 11. crew (non-admin) ──────────────────────────────────────────────────
page = await newPage('?crew=1');
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.waitForSelector('[role="menu"]');
items = await page.$$eval('[role="menu"] button', bs => bs.map(b => b.innerText.replace(/\s+/g,' ').trim()));
check('crew sees only the 4 non-admin actions', items.length === 4, items.join(' | '));
check('crew cannot see Update Ticket', !items.some(i => i.includes('Update Ticket')));
check('crew cannot see Archive', !items.some(i => /Archive|Restore/.test(i)));
await page.screenshot({ path: `${OUT}/08-menu-crew-dark.png` });
await page.close();

// ── 12. light theme ───────────────────────────────────────────────────────
page = await newPage('?light=1');
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.waitForSelector('[role="menu"]');
await page.screenshot({ path: `${OUT}/09-menu-admin-light.png` });
await page.click('[role="menu"] >> text=Update Ticket');
await page.waitForSelector('#tu-expires');
await page.fill('#tu-expires', '2026-05-01');
await page.fill('#tu-reason', 'Locate extended after the utility re-mark');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/10-update-modal-light.png` });
await page.click('button[type="submit"]');
await page.waitForSelector('#tu-expires', { state: 'detached' });
check('light-mode save works', (await page.textContent('[data-testid="event-log"]')).includes('UPDATED'));
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.click('[role="menu"] >> text=Update History');
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/11-history-light.png` });
await page.close();

// ── 13. narrow / phone width ──────────────────────────────────────────────
page = await browser.newPage({ viewport: { width: 390, height: 780 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="ticket-no"]');
await page.click('[data-testid="row-top"] button[title="Ticket actions"]');
await page.waitForSelector('[role="menu"]');
const narrow = await page.evaluate(() => {
  const m = document.querySelector('[role="menu"]').getBoundingClientRect();
  return { left: m.left, right: m.right, vw: innerWidth };
});
check('menu stays on screen at phone width', narrow.left >= 0 && narrow.right <= narrow.vw, `left ${Math.round(narrow.left)}, right ${Math.round(narrow.right)}, vw ${narrow.vw}`);
await page.screenshot({ path: `${OUT}/12-menu-phone.png` });
await page.click('[role="menu"] >> text=Update Ticket');
await page.waitForSelector('#tu-expires');
await page.screenshot({ path: `${OUT}/13-update-modal-phone.png` });
await page.close();

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILURES:'); failed.forEach(f => console.log(' -', f.name, f.detail)); process.exit(1); }
