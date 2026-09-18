// Simulates TicketForm.handleSubmit -> App.handleSaveTicket merge for an EDIT,
// checking that an archived ticket survives a plain edit.
const buildSubmitData = (formData, initialData) => ({
  ...formData,
  isArchived: initialData?.isArchived ?? false,   // the line just added
});
const handleSaveTicket = (editingTicket, ticketData, archiveOld = false) =>
  (editingTicket && !archiveOld) ? { ...editingTicket, ...ticketData }
                                 : { ...ticketData, id: 'new', createdAt: 1, isArchived: false };

const archived = { id: 't1', ticketNo: 'B1', expires: '2026-03-16', isArchived: true };
const active   = { id: 't2', ticketNo: 'B2', expires: '2026-03-16', isArchived: false };
const form     = { ticketNo: 'B1', expires: '2026-04-12' };   // user edits the expiry

const editArchived = handleSaveTicket(archived, buildSubmitData(form, archived));
const editActive   = handleSaveTicket(active,   buildSubmitData({ ...form, ticketNo: 'B2' }, active));
const created      = handleSaveTicket(null,     buildSubmitData(form, null));

const check = (n, c) => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`);
check('editing an archived ticket keeps it archived', editArchived.isArchived === true);
check('editing an active ticket keeps it active',     editActive.isArchived === false);
check('a newly created ticket is not archived',       created.isArchived === false);
check('the edit still applies (expiry changed)',      editArchived.expires === '2026-04-12');

// Regression guard: the naive fix would have un-archived it.
const naive = handleSaveTicket(archived, { ...form, isArchived: false });
check('naive `isArchived: false` WOULD have un-archived (guard)', naive.isArchived === false);
