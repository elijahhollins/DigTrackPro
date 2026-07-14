import React, { useState, useReducer, useRef, useCallback, useEffect } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Clock, Calendar, Pencil, Trash2, Users, GripHorizontal, RotateCcw, Search, Upload, MoreHorizontal, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.ts';
import ScheduleImportModal, { type ScheduleImportRow } from './ScheduleImportModal.tsx';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchedulerEmployee {
  id: number;
  name: string;
  role?: string;
}

export interface Crew {
  id: string;
  name: string;
  size: number;
  memberIds: number[];   // IDs of assigned employees
}

export interface JobOption {
  jobNumber: string;
  location: string;
  estimatedDays: number;
}

export interface ScheduleBlock {
  id: string;
  crewId: string;
  jobNumber: string;
  startDate: string;      // ISO YYYY-MM-DD
  durationDays: number;
  type: 'job' | 'delay';
  extended: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const CREW_COL_W    = 208; // px – sticky left column
const ROW_HEIGHT    = 78;  // px per crew row
const BLOCK_MARGIN  = 6;   // px gap between block edge and row edge
const HEADER_MONTH_H = 30; // px
const HEADER_DAY_H   = 40; // px

// Refined, harmonious crew palette — slightly desaturated jewel tones that read
// as professional rather than primary-bright. Each entry pairs a base color
// (block fill) with a soft tint (sidebar accent backgrounds).
const CREW_COLORS: string[] = [
  '#4f46e5', // indigo-600
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#e11d48', // rose-600
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

export const MOCK_CREWS: Crew[] = [
  { id: 'c1', name: 'Alpha Crew',  size: 4, memberIds: [] },
  { id: 'c2', name: 'Beta Crew',   size: 3, memberIds: [] },
  { id: 'c3', name: 'Gamma Crew',  size: 5, memberIds: [] },
];

export const MOCK_JOBS: JobOption[] = [
  { jobNumber: 'J-1001', location: '123 Main St, Springfield',  estimatedDays: 5 },
  { jobNumber: 'J-1002', location: '456 Oak Ave, Shelbyville',  estimatedDays: 3 },
  { jobNumber: 'J-1003', location: '789 Pine Rd, Capital City', estimatedDays: 7 },
  { jobNumber: 'J-1004', location: '321 Elm St, Shelbyville',   estimatedDays: 4 },
  { jobNumber: 'J-1005', location: '654 Maple Dr, Springfield', estimatedDays: 6 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const toISO = (d: Date): string => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (isoOrDate: string | Date, n: number): string => {
  const d = typeof isoOrDate === 'string' ? parseDate(isoOrDate) : new Date(isoOrDate);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const diffDays = (a: string, b: string): number =>
  Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);

const fmtShort = (iso: string): string =>
  parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtLong = (iso: string): string =>
  parseDate(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

const todayISO = toISO(new Date());

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKEND-AWARE SCHEDULING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
// When "skip weekends" is enabled, durations count working days (Mon–Fri) only
// and blocks never start on a Saturday or Sunday. Every helper accepts a `skip`
// flag and degrades to plain calendar math when it's false, so both modes share
// one code path through the reducer and render logic.

const isWeekendDate = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

/** Snap an ISO date forward to the next weekday (Monday) when it lands on a weekend. */
const snapToWeekday = (iso: string): string => {
  const d = parseDate(iso);
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1);
  return toISO(d);
};

/** Date of the n-th working day of a span, counting `start` as day 1 (start is snapped to a weekday). */
const nthWorkingDay = (start: string, n: number): string => {
  const d = parseDate(start);
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1);
  let count = 1;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    if (!isWeekendDate(d)) count++;
  }
  return toISO(d);
};

/** Count the working days in the inclusive calendar range [start, end]. */
const countWorkingDays = (start: string, end: string): number => {
  if (end < start) return 0;
  const d = parseDate(start);
  const last = parseDate(end);
  let count = 0;
  while (d <= last) {
    if (!isWeekendDate(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
};

/** Number of calendar columns a block occupies on the grid (spans weekends when skipping). */
const blockSpanDays = (start: string, durationDays: number, skip: boolean): number =>
  skip ? diffDays(nthWorkingDay(start, durationDays), start) + 1 : durationDays;

/**
 * Break a block into the contiguous runs of working days it covers, expressed as
 * calendar-column offsets from `start`. When weekend-skipping is off (or a block
 * never touches a weekend) this is a single run spanning the whole block. When a
 * block carries through a weekend it yields one run per work stretch so the bar
 * can be drawn with the weekend columns left empty.
 */
const workingDayRuns = (
  start: string, durationDays: number, skip: boolean,
): { offsetDays: number; lengthDays: number }[] => {
  if (!skip) return [{ offsetDays: 0, lengthDays: durationDays }];
  const totalCols = diffDays(nthWorkingDay(start, durationDays), start) + 1;
  const runs: { offsetDays: number; lengthDays: number }[] = [];
  let runStart = -1;
  for (let i = 0; i < totalCols; i++) {
    const weekend = isWeekendDate(parseDate(addDays(start, i)));
    if (!weekend && runStart === -1) {
      runStart = i;
    } else if (weekend && runStart !== -1) {
      runs.push({ offsetDays: runStart, lengthDays: i - runStart });
      runStart = -1;
    }
  }
  if (runStart !== -1) runs.push({ offsetDays: runStart, lengthDays: totalCols - runStart });
  return runs.length > 0 ? runs : [{ offsetDays: 0, lengthDays: Math.max(1, totalCols) }];
};

/** First calendar day after a block ends (its next available start), weekday-snapped when skipping. */
const blockEndExclusive = (start: string, durationDays: number, skip: boolean): string =>
  skip ? snapToWeekday(addDays(nthWorkingDay(start, durationDays), 1)) : addDays(start, durationDays);

/** Shift an ISO date forward by `n` working days (or calendar days when not skipping). */
const shiftSchedDays = (start: string, n: number, skip: boolean): string => {
  if (!skip || n <= 0) return addDays(start, n);
  const d = parseDate(start);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekendDate(d)) remaining--;
  }
  return toISO(d);
};

/** Returns true when two schedule intervals overlap, accounting for weekend skipping. */
const blocksOverlap = (
  aStart: string, aDays: number,
  bStart: string, bDays: number,
  skip: boolean,
): boolean => {
  const aEnd = blockEndExclusive(aStart, aDays, skip);
  const bEnd = blockEndExclusive(bStart, bDays, skip);
  return aStart < bEnd && bStart < aEnd;
};

/** Returns blocks of the same crew that overlap with the given interval, excluding excludeId. */
const findOverlapConflicts = (
  blocks: ScheduleBlock[],
  crewId: string,
  startDate: string,
  durationDays: number,
  skip: boolean,
  excludeId?: string,
): ScheduleBlock[] =>
  blocks.filter(
    b =>
      b.crewId === crewId &&
      b.id !== excludeId &&
      blocksOverlap(startDate, durationDays, b.startDate, b.durationDays, skip),
  );

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE  (mock blocks relative to today)
// ═══════════════════════════════════════════════════════════════════════════════

const INITIAL_BLOCKS: ScheduleBlock[] = [
  { id: 'b1', crewId: 'c1', jobNumber: 'J-1001', startDate: addDays(todayISO, -3), durationDays: 5, type: 'job', extended: false },
  { id: 'b2', crewId: 'c1', jobNumber: 'J-1002', startDate: addDays(todayISO,  3), durationDays: 3, type: 'job', extended: false },
  { id: 'b3', crewId: 'c2', jobNumber: 'J-1003', startDate: addDays(todayISO,  0), durationDays: 7, type: 'job', extended: false },
  { id: 'b4', crewId: 'c2', jobNumber: 'J-1004', startDate: addDays(todayISO,  8), durationDays: 4, type: 'job', extended: false },
  { id: 'b5', crewId: 'c3', jobNumber: 'J-1005', startDate: addDays(todayISO,  1), durationDays: 6, type: 'job', extended: false },
];

// IDs of the demo blocks above. These blocks reference mock crew IDs ('c1'–'c3')
// that are not in the database, so they must never be included in DB upserts or
// the foreign-key constraint on schedule_blocks.crew_id will reject the entire batch.
const MOCK_BLOCK_IDS = new Set(INITIAL_BLOCKS.map(b => b.id));

// ═══════════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════════

type BaseAction =
  | { type: 'MOVE_BLOCK';         id: string; crewId: string; startDate: string }
  | { type: 'MOVE_BLOCK_PUSH';    id: string; crewId: string; startDate: string; shiftDays: number }
  | { type: 'INSERT_DELAY';       blockId: string; days: number }
  | { type: 'EXTEND_JOB';         blockId: string; days: number }
  | { type: 'ADD_BLOCK';          block: ScheduleBlock }
  | { type: 'ADD_BLOCKS';         blocks: ScheduleBlock[] }
  | { type: 'ADD_BLOCK_PUSH';     block: ScheduleBlock; shiftDays: number }
  | { type: 'DELETE_BLOCK';       id: string }
  | { type: 'REPLACE_ALL';        blocks: ScheduleBlock[] }
  | { type: 'SHIFT_CREW';         crewId: string; fromDate: string; days: number };

// `skipWeekends` is injected at dispatch time so the pure reducer can do
// weekday-aware date math without reading component state directly.
type Action = BaseAction & { skipWeekends?: boolean };

/** Push all blocks for a crew that start on or after `fromDate` forward by `shiftDays`. */
function shiftAfter(
  blocks: ScheduleBlock[],
  crewId: string,
  fromDate: string,
  shiftDays: number,
  skip: boolean,
  excludeId?: string,
): ScheduleBlock[] {
  return blocks.map(b => {
    if (b.crewId === crewId && b.id !== excludeId && b.startDate >= fromDate) {
      return { ...b, startDate: shiftSchedDays(b.startDate, shiftDays, skip) };
    }
    return b;
  });
}

/** Working days a job has completed between its start and the interruption date (exclusive). */
const daysBeforeInterruption = (
  jobStart: string, interruptAt: string, skip: boolean,
): number =>
  skip ? countWorkingDays(jobStart, addDays(interruptAt, -1)) : diffDays(interruptAt, jobStart);

/**
 * Make room for a newly inserted/moved block by interrupting the schedule at
 * `newStart`. A job the new block lands inside of is *split* at the interruption:
 * the head keeps the days already worked, and a tail carrying the remaining days
 * resumes right after the new block ends. Every other crew block that starts on
 * or after the interruption is pushed forward by the inserted block's span, so
 * the whole downstream schedule slides into the future by the same amount and
 * relative gaps are preserved.
 */
function splitAndPushForward(
  blocks: ScheduleBlock[],
  crewId: string,
  newStart: string,
  newDuration: number,
  skip: boolean,
  excludeId?: string,
): ScheduleBlock[] {
  // Where the tail (and anything that used to sit at the interruption) resumes:
  // the first available day after the inserted block ends. This equals shifting
  // the interruption point forward by the inserted block's working-day span.
  const resumeAt = blockEndExclusive(newStart, newDuration, skip);

  const result: ScheduleBlock[] = [];
  const tails:  ScheduleBlock[] = [];

  for (const b of blocks) {
    if (b.crewId !== crewId || b.id === excludeId) {
      result.push(b);
      continue;
    }

    const bEnd = blockEndExclusive(b.startDate, b.durationDays, skip);

    if (b.type === 'job' && b.startDate < newStart && bEnd > newStart) {
      // The new block lands inside this job — split it at the interruption.
      const before    = Math.max(1, daysBeforeInterruption(b.startDate, newStart, skip));
      const remaining = b.durationDays - before;
      result.push({ ...b, durationDays: before });
      if (remaining > 0) {
        tails.push({
          ...b,
          id: `block-${crypto.randomUUID()}`,
          startDate: resumeAt,
          durationDays: remaining,
        });
      }
    } else if (b.startDate >= newStart) {
      // Starts at or after the interruption — slide it forward by the inserted span.
      result.push({ ...b, startDate: shiftSchedDays(b.startDate, newDuration, skip) });
    } else {
      // Finishes before the interruption — untouched.
      result.push(b);
    }
  }

  return [...result, ...tails];
}

function reducer(state: ScheduleBlock[], action: Action): ScheduleBlock[] {
  const skip = action.skipWeekends ?? false;
  switch (action.type) {
    case 'MOVE_BLOCK':
      return state.map(b =>
        b.id === action.id
          ? { ...b, crewId: action.crewId, startDate: action.startDate }
          : b,
      );

    case 'MOVE_BLOCK_PUSH': {
      // Move the block to its new position, then split any job it lands inside
      // and slide the rest of the crew's schedule forward to make room.
      const moved = state.map(b =>
        b.id === action.id
          ? { ...b, crewId: action.crewId, startDate: action.startDate }
          : b,
      );
      return splitAndPushForward(moved, action.crewId, action.startDate, action.shiftDays, skip, action.id);
    }

    case 'INSERT_DELAY': {
      const job = state.find(b => b.id === action.blockId);
      if (!job) return state;
      const delay: ScheduleBlock = {
        id: `delay-${crypto.randomUUID()}`,
        crewId: job.crewId,
        jobNumber: `Delay \u2013 ${action.days} day${action.days !== 1 ? 's' : ''}`,
        startDate: job.startDate,
        durationDays: action.days,
        type: 'delay',
        extended: false,
      };
      // Shift the target job AND every subsequent crew block forward by `days`
      const shifted = shiftAfter(state, job.crewId, job.startDate, action.days, skip);
      return [...shifted, delay];
    }

    case 'EXTEND_JOB': {
      const job = state.find(b => b.id === action.blockId);
      if (!job || job.type !== 'job') return state;
      const oldEnd = blockEndExclusive(job.startDate, job.durationDays, skip);
      const withExtended = state.map(b =>
        b.id === action.blockId
          ? { ...b, durationDays: b.durationDays + action.days, extended: true }
          : b,
      );
      // Shift blocks that begin at or after the job's original end date
      return shiftAfter(withExtended, job.crewId, oldEnd, action.days, skip, action.blockId);
    }

    case 'ADD_BLOCK':
      return [...state, action.block];

    case 'ADD_BLOCKS':
      return [...state, ...action.blocks];

    case 'ADD_BLOCK_PUSH': {
      // Split any job the new block lands inside and slide the rest of the
      // crew's schedule forward, then insert the new block in the gap.
      const shifted = splitAndPushForward(
        state, action.block.crewId, action.block.startDate, action.block.durationDays, skip,
      );
      return [...shifted, action.block];
    }

    case 'DELETE_BLOCK':
      return state.filter(b => b.id !== action.id);

    case 'REPLACE_ALL':
      return action.blocks;

    case 'SHIFT_CREW':
      return state.map(b =>
        b.crewId === action.crewId && b.startDate >= action.fromDate
          ? { ...b, startDate: shiftSchedDays(b.startDate, action.days, skip) }
          : b,
      );

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════════

interface TooltipState {
  block: ScheduleBlock;
  job: JobOption | undefined;
  crew: Crew | undefined;
  x: number;
  y: number;
}

const BlockTooltip = ({ tip, skipWeekends }: { tip: TooltipState; skipWeekends: boolean }) => {
  const { block, job, crew } = tip;
  const endDate = skipWeekends
    ? nthWorkingDay(block.startDate, block.durationDays)
    : addDays(block.startDate, block.durationDays - 1);
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: tip.x + 14,
        top: tip.y - 10,
        background: '#0a142d',
        color: 'white',
        borderRadius: 12,
        padding: '10px 13px',
        maxWidth: 220,
        fontSize: 11,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {block.type === 'delay' ? (
        <>
          <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>⏸ Delay Block</div>
          <div style={{ color: '#64748b' }}>
            {block.durationDays} day{block.durationDays !== 1 ? 's' : ''}
          </div>
          <div style={{ color: '#475569', marginTop: 4 }}>
            {fmtShort(block.startDate)} – {fmtShort(endDate)}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{block.jobNumber}</div>
          {job && <div style={{ color: '#cbd5e1', marginBottom: 3 }}>{job.location}</div>}
          {crew && <div style={{ color: '#94a3b8', marginBottom: 3 }}>Crew: {crew.name} &middot; {crew.size} workers</div>}
          <div style={{ color: '#94a3b8' }}>{fmtLong(block.startDate)}</div>
          <div style={{ color: '#94a3b8' }}>&rarr; {fmtLong(endDate)}</div>
          <div style={{ color: '#cbd5e1', marginTop: 4, fontWeight: 600 }}>
            {block.durationDays} day{block.durationDays !== 1 ? 's' : ''}
          </div>
          {block.extended && (
            <div style={{ color: '#fbbf24', marginTop: 4, fontWeight: 700 }}>&#9733; Extended</div>
          )}
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════════════════════════════════════════════

interface CtxMenuState {
  blockId: string;
  blockType: 'job' | 'delay';
  x: number;
  y: number;
}

const CtxMenu = ({
  menu,
  onDelay,
  onExtend,
  onDelete,
  onClose,
}: {
  menu: CtxMenuState;
  onDelay: () => void;
  onExtend: () => void;
  onDelete: () => void;
  onClose: () => void;
}) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-sm"
      style={{ left: menu.x, top: menu.y, minWidth: 176 }}
    >
      {menu.blockType === 'job' && (
        <>
          <button
            onClick={() => { onDelay(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-brand/10 hover:text-brand flex items-center gap-2 transition-colors"
          >
            <Clock className="w-4 h-4 shrink-0" /> Insert Delay&hellip;
          </button>
          <button
            onClick={() => { onExtend(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2 transition-colors"
          >
            <ChevronRight className="w-4 h-4 shrink-0" /> Extend Job&hellip;
          </button>
          <div className="border-t border-slate-100" />
        </>
      )}
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
      >
        <X className="w-4 h-4 shrink-0" /> Delete Block
      </button>
    </div>
  </>
);

// ═══════════════════════════════════════════════════════════════════════════════
// DAY PROMPT MODAL  (Insert Delay / Extend Job)
// ═══════════════════════════════════════════════════════════════════════════════

interface DayPromptState {
  action: 'delay' | 'extend' | 'crew_delay';
  blockId: string; // blockId for 'delay'/'extend'; crewId for 'crew_delay'
}

const DayPromptModal = ({
  state,
  skipWeekends,
  onConfirm,
  onClose,
}: {
  state: DayPromptState;
  skipWeekends: boolean;
  onConfirm: (days: number) => void;
  onClose: () => void;
}) => {
  const [days, setDays] = useState(1);
  const isDelay     = state.action === 'delay';
  const isCrewDelay = state.action === 'crew_delay';

  const title = isCrewDelay ? 'Push Crew Schedule' : isDelay ? 'Insert Delay' : 'Extend Job';
  const description = isCrewDelay
    ? 'All current and upcoming blocks for this crew will shift forward by the specified number of days.'
    : isDelay
    ? 'A delay block will be inserted before this job. The job and all subsequent crew blocks will shift forward.'
    : 'The job duration will increase and all subsequent crew blocks will shift forward automatically.';
  const btnLabel = isCrewDelay ? 'Push Schedule' : isDelay ? 'Insert Delay' : 'Extend';
  const btnClass = isCrewDelay
    ? 'bg-amber-500 hover:bg-amber-600'
    : isDelay
    ? 'bg-brand hover:opacity-90'
    : 'bg-green-600 hover:bg-green-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-xs text-slate-500 mb-4">{description}</p>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          {skipWeekends ? 'Number of Working Days' : 'Number of Days'}
        </label>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 mb-1.5 bg-white"
        >
          {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>
          ))}
        </select>
        {skipWeekends && (
          <p className="text-[11px] text-slate-400 mb-4">Counted in working days — weekends are skipped.</p>
        )}
        {!skipWeekends && <div className="mb-4" />}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(days); onClose(); }}
            className={`flex-1 py-2 text-white rounded-xl text-sm font-semibold transition-colors ${btnClass}`}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAP CONFIRM MODAL  (shown when a drag-drop or block-add causes a conflict)
// ═══════════════════════════════════════════════════════════════════════════════

const OverlapConfirmModal = ({
  jobLabel,
  newDate,
  crewName,
  conflictCount,
  willSplit,
  onConfirm,
  onCancel,
}: {
  jobLabel: string;
  newDate: string;
  crewName: string;
  conflictCount: number;
  willSplit: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h3 className="text-base font-bold text-slate-900 mb-2">Scheduling Conflict</h3>
      <p className="text-sm text-slate-600 mb-5">
        <span className="font-semibold text-slate-800">{jobLabel}</span> starting on{' '}
        <span className="font-semibold text-slate-800">{fmtShort(newDate)}</span> overlaps
        with{' '}
        {conflictCount === 1
          ? '1 existing block'
          : `${conflictCount} existing blocks`}{' '}
        for <span className="font-semibold text-slate-800">{crewName}</span>.
        <br />
        <br />
        {willSplit
          ? 'Split the interrupted job at this date, insert the new one in between, and push the remainder and everything after it into the future?'
          : `Push the conflicting block${conflictCount !== 1 ? 's' : ''} and everything after them into the future?`}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Push &amp; Reschedule
        </button>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// CREW MEMBER PICKER  (checkbox list used inside ManageCrewsModal)
// ═══════════════════════════════════════════════════════════════════════════════

const CrewMemberPicker = ({
  employees,
  selected,
  onChange,
}: {
  employees: SchedulerEmployee[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) => {
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  if (employees.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic py-2 px-1">No employees found.</p>
    );
  }
  return (
    <div
      className="border border-slate-200 rounded-lg overflow-y-auto divide-y divide-slate-100"
      style={{ maxHeight: 180 }}
    >
      {employees.map(emp => (
        <label
          key={emp.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={selected.includes(emp.id)}
            onChange={() => toggle(emp.id)}
            className="w-4 h-4 rounded accent-blue-600 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-800 font-medium truncate">{emp.name}</div>
            {emp.role && (
              <div className="text-[10px] text-slate-400 capitalize truncate">{emp.role}</div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE CREWS MODAL  (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

const ManageCrewsModal = ({
  crews,
  employees,
  onUpdate,
  onClose,
}: {
  crews: Crew[];
  employees: SchedulerEmployee[];
  onUpdate: (crews: Crew[]) => void;
  onClose: () => void;
}) => {
  const hasEmployees = employees.length > 0;

  const [local, setLocal]               = useState<Crew[]>(crews);
  const [editingId, setEditId]          = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [editSize, setEditSize]         = useState(1);
  const [editMemberIds, setEditMembers] = useState<number[]>([]);
  const [newName, setNewName]           = useState('');
  const [newSize, setNewSize]           = useState(2);
  const [newMemberIds, setNewMembers]   = useState<number[]>([]);

  const startEdit = (c: Crew) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditSize(c.size);
    setEditMembers(c.memberIds ?? []);
  };
  const cancelEdit = () => setEditId(null);
  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const finalSize = hasEmployees ? editMemberIds.length : Math.max(1, editSize);
    setLocal(prev => prev.map(c =>
      c.id === editingId
        ? { ...c, name: editName.trim(), size: finalSize, memberIds: editMemberIds }
        : c
    ));
    setEditId(null);
  };
  const deleteCrew = (id: string) => setLocal(prev => prev.filter(c => c.id !== id));
  const addCrew = () => {
    if (!newName.trim()) return;
    const finalSize = hasEmployees ? newMemberIds.length : Math.max(1, newSize);
    setLocal(prev => [...prev, {
      id: `crew-${crypto.randomUUID()}`,
      name: newName.trim(),
      size: finalSize,
      memberIds: newMemberIds,
    }]);
    setNewName('');
    setNewSize(2);
    setNewMembers([]);
  };

  const memberLabel = (c: Crew): string => {
    if (hasEmployees && c.memberIds.length > 0) {
      return `${c.memberIds.length} ${c.memberIds.length === 1 ? 'worker' : 'workers'}`;
    }
    return `${c.size} workers`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" />
            Manage Crews
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {local.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-6 italic">No crews yet. Add one below.</p>
          )}
          {local.map((c, i) => {
            const color = CREW_COLORS[i % CREW_COLORS.length];
            if (editingId === c.id) {
              return (
                <div key={c.id} className="p-3 bg-brand/10 rounded-xl border border-brand/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !hasEmployees && saveEdit()}
                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10 min-w-0"
                      placeholder="Crew name"
                    />
                    {!hasEmployees && (
                      <input
                        type="number" min={1} max={50}
                        value={editSize}
                        onChange={e => setEditSize(parseInt(e.target.value) || 1)}
                        className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand/10"
                      />
                    )}
                  </div>
                  {hasEmployees && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Members ({editMemberIds.length} selected)
                      </p>
                      <CrewMemberPicker
                        employees={employees}
                        selected={editMemberIds}
                        onChange={setEditMembers}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} className="flex-1 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors">Save</button>
                    <button onClick={cancelEdit} className="px-4 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={c.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{c.name}</div>
                  <div className="text-xs text-slate-400">{memberLabel(c)}</div>
                  {hasEmployees && c.memberIds.length > 0 && (() => {
                    const names = c.memberIds
                      .map(id => employees.find(e => e.id === id)?.name)
                      .filter(Boolean) as string[];
                    const display = names.length <= 2
                      ? names.join(', ')
                      : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
                    return (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5" title={names.join(', ')}>{display}</div>
                    );
                  })()}
                </div>
                <button onClick={() => startEdit(c)} title="Edit" className="p-1.5 text-slate-400 hover:text-brand transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteCrew(c.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-slate-100 space-y-3 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add New Crew</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !hasEmployees && addCrew()}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10 min-w-0"
              placeholder="Crew name"
            />
            {!hasEmployees && (
              <input
                type="number" min={1} max={50}
                value={newSize}
                onChange={e => setNewSize(parseInt(e.target.value) || 1)}
                className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand/10"
                placeholder="Size"
              />
            )}
          </div>
          {hasEmployees && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Select Members ({newMemberIds.length} selected)
              </p>
              <CrewMemberPicker
                employees={employees}
                selected={newMemberIds}
                onChange={setNewMembers}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={addCrew}
              disabled={!newName.trim()}
              className="flex-1 py-2 bg-brand hover:opacity-90 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Crew
            </button>
          </div>
          <button
            onClick={() => { onUpdate(local); onClose(); }}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADD BLOCK MODAL
// ═══════════════════════════════════════════════════════════════════════════════

const AddBlockModal = ({
  crews,
  jobs,
  skipWeekends,
  onAdd,
  onClose,
}: {
  crews: Crew[];
  jobs: JobOption[];
  skipWeekends: boolean;
  onAdd: (block: ScheduleBlock) => void;
  onClose: () => void;
}) => {
  const [crewId,       setCrewId]   = useState(crews[0]?.id ?? '');
  const [jobNum,       setJobNum]   = useState(jobs[0]?.jobNumber ?? '');
  const [startDate,    setStart]    = useState(todayISO);
  const [durationDays, setDuration] = useState(5);

  // Live job search state
  const [jobQuery,    setJobQuery]    = useState('');
  const [jobListOpen, setJobListOpen] = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const jobSearchRef = useRef<HTMLDivElement>(null);

  // Live crew search state
  const [crewQuery,    setCrewQuery]    = useState('');
  const [crewListOpen, setCrewListOpen] = useState(false);
  const [crewActiveIdx, setCrewActiveIdx] = useState(0);
  const crewSearchRef = useRef<HTMLDivElement>(null);

  const selectedJob  = jobs.find(j => j.jobNumber === jobNum);
  const selectedCrew = crews.find(c => c.id === crewId);

  const filteredJobs = (() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      j =>
        j.jobNumber.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q),
    );
  })();

  const filteredCrews = (() => {
    const q = crewQuery.trim().toLowerCase();
    if (!q) return crews;
    return crews.filter(c => c.name.toLowerCase().includes(q));
  })();

  // Close the job dropdown when clicking outside of it
  useEffect(() => {
    if (!jobListOpen) return;
    const handler = (e: MouseEvent) => {
      if (jobSearchRef.current && !jobSearchRef.current.contains(e.target as Node)) {
        setJobListOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [jobListOpen]);

  // Close the crew dropdown when clicking outside of it
  useEffect(() => {
    if (!crewListOpen) return;
    const handler = (e: MouseEvent) => {
      if (crewSearchRef.current && !crewSearchRef.current.contains(e.target as Node)) {
        setCrewListOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [crewListOpen]);

  const selectJob = (j: JobOption) => {
    setJobNum(j.jobNumber);
    setJobQuery('');
    setJobListOpen(false);
  };

  const selectCrew = (c: Crew) => {
    setCrewId(c.id);
    setCrewQuery('');
    setCrewListOpen(false);
  };

  const handleJobKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setJobListOpen(true);
      setActiveIdx(i => Math.min(i + 1, filteredJobs.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && jobListOpen) {
      e.preventDefault();
      const pick = filteredJobs[activeIdx];
      if (pick) selectJob(pick);
    } else if (e.key === 'Escape') {
      setJobListOpen(false);
    }
  };

  const handleCrewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCrewListOpen(true);
      setCrewActiveIdx(i => Math.min(i + 1, filteredCrews.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCrewActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && crewListOpen) {
      e.preventDefault();
      const pick = filteredCrews[crewActiveIdx];
      if (pick) selectCrew(pick);
    } else if (e.key === 'Escape') {
      setCrewListOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewId || !jobNum || !selectedJob) return;
    onAdd({
      id: `block-${crypto.randomUUID()}`,
      crewId,
      jobNumber: jobNum,
      startDate,
      durationDays: Math.max(1, durationDays),
      type: 'job',
      extended: false,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">Add Job Block</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Assign to Crew
            </label>
            <div ref={crewSearchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={crewListOpen ? crewQuery : (selectedCrew ? `${selectedCrew.name} (${selectedCrew.size} workers)` : '')}
                  onChange={e => { setCrewQuery(e.target.value); setCrewListOpen(true); setCrewActiveIdx(0); }}
                  onFocus={() => { setCrewQuery(''); setCrewListOpen(true); setCrewActiveIdx(0); }}
                  onKeyDown={handleCrewKeyDown}
                  placeholder="Search by crew name…"
                  autoComplete="off"
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 bg-white"
                />
              </div>
              {crewListOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                  {filteredCrews.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-400 italic">No matching crews</li>
                  ) : (
                    filteredCrews.map((c, i) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); selectCrew(c); }}
                          onMouseEnter={() => setCrewActiveIdx(i)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            i === crewActiveIdx ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-50'
                          } ${c.id === crewId ? 'font-semibold' : ''}`}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-slate-400"> ({c.size} workers)</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Job Number
            </label>
            <div ref={jobSearchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={jobListOpen ? jobQuery : (jobNum || '')}
                  onChange={e => { setJobQuery(e.target.value); setJobListOpen(true); setActiveIdx(0); }}
                  onFocus={() => { setJobQuery(''); setJobListOpen(true); setActiveIdx(0); }}
                  onKeyDown={handleJobKeyDown}
                  placeholder="Search by job number or location…"
                  autoComplete="off"
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 bg-white"
                />
              </div>
              {jobListOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                  {filteredJobs.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-400 italic">No matching jobs</li>
                  ) : (
                    filteredJobs.map((j, i) => (
                      <li key={j.jobNumber}>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); selectJob(j); }}
                          onMouseEnter={() => setActiveIdx(i)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            i === activeIdx ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-50'
                          } ${j.jobNumber === jobNum ? 'font-semibold' : ''}`}
                        >
                          <span className="font-medium">{j.jobNumber}</span>
                          <span className="text-slate-400"> — {j.location}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStart(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10"
                required
              />
            </div>

            <div style={{ width: 110 }}>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {skipWeekends ? 'Working days' : 'Duration (days)'}
              </label>
              <select
                value={durationDays}
                onChange={e => setDuration(parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 bg-white"
                required
              >
                {Array.from({ length: 60 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}d</option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule preview — makes clear the duration is counted in working
              days (Mon–Fri) and shows where the job lands with weekends skipped. */}
          {/^\d{4}-\d{2}-\d{2}$/.test(startDate) && durationDays >= 1 && (() => {
            const effStart = skipWeekends ? snapToWeekday(startDate) : startDate;
            const endISO   = skipWeekends
              ? nthWorkingDay(effStart, durationDays)
              : addDays(startDate, durationDays - 1);
            return (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                {skipWeekends ? (
                  <>
                    <span className="font-semibold text-slate-700">{durationDays} working day{durationDays !== 1 ? 's' : ''}</span>
                    {' · '}weekends skipped
                    <br />
                    {effStart !== startDate && (
                      <span className="text-amber-600">Starts {fmtLong(effStart)} (moved off weekend)<br /></span>
                    )}
                    Ends <span className="font-semibold text-slate-700">{fmtLong(endISO)}</span>
                  </>
                ) : (
                  <>Ends <span className="font-semibold text-slate-700">{fmtLong(endISO)}</span></>
                )}
              </p>
            );
          })()}

          {selectedJob && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              Location: <span className="font-semibold text-slate-700">{selectedJob.location}</span>
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-brand hover:opacity-90 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Add Block
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// JOB BLOCK  (draggable, right-click, tooltip)
// ═══════════════════════════════════════════════════════════════════════════════

interface JobBlockProps {
  key?: React.Key;
  block: ScheduleBlock;
  crew: Crew | undefined;
  job: JobOption | undefined;
  left: number;
  width: number;
  color: string;
  isDragging: boolean;
  isSettled?: boolean;
  isAdmin?: boolean;
  editMode?: boolean;
  onDelete?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  onResizeTouchStart?: (e: React.TouchEvent) => void;
  /** Visual segments (px offsets relative to the block's left). Multiple when a job carries through a weekend. */
  segments?: { left: number; width: number }[];
}

const JobBlock = ({
  block, job, left, width, color, isDragging, isSettled,
  isAdmin, editMode, onDelete,
  onDragStart, onDragEnd, onContextMenu,
  onMouseEnter, onMouseMove, onMouseLeave, onTouchStart,
  onResizeStart, onResizeTouchStart,
  segments,
}: JobBlockProps) => {
  const isDelay   = block.type === 'delay';
  const bgColor   = isDelay ? '#334155' : color;
  const blockH    = ROW_HEIGHT - BLOCK_MARGIN * 2;

  // Lightweight status from calendar dates (no scheduling logic — display only).
  const status = (() => {
    const endExclusive = addDays(block.startDate, block.durationDays); // inclusive-ish; display only
    if (todayISO >= block.startDate && todayISO < endExclusive) return { label: 'In progress', dot: '#bbf7d0' };
    if (block.startDate > todayISO) return { label: 'Upcoming', dot: 'rgba(255,255,255,0.85)' };
    return { label: 'Completed', dot: 'rgba(255,255,255,0.45)' };
  })();

  // Each segment is a contiguous run of working days. A block that carries
  // through a weekend has more than one, drawn with the weekend columns left
  // empty so the bar visually skips the weekend. Falls back to a single bar.
  const segs = segments && segments.length > 0
    ? segments
    : [{ left: BLOCK_MARGIN, width: Math.max(width - BLOCK_MARGIN * 2, 24) }];
  const lastIdx = segs.length - 1;

  // Confident "job card" fill: a directional gradient that deepens the crew
  // color toward the bottom-right for depth, with a crisp light edge up top.
  // Delay blocks keep a soft diagonal hatch so they read as "no work" at a glance.
  const fillImage = isDelay
    ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 1px, transparent 1px, transparent 9px)'
    : `linear-gradient(135deg, color-mix(in srgb, ${color} 86%, white) 0%, ${color} 46%, color-mix(in srgb, ${color} 80%, black) 100%)`;

  return (
    <div
      data-block-id={block.id}
      className={`dispatch-block${isDragging ? ' is-dragging' : ''}${isSettled ? ' is-settled' : ''}`}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchStart={editMode ? onTouchStart : undefined}
      style={{
        position: 'absolute',
        left,
        top: 0,
        width,
        height: ROW_HEIGHT,
        opacity: isDragging ? 0.4 : 1,
        cursor: editMode ? 'grab' : 'default',
        userSelect: 'none',
        touchAction: editMode ? 'none' : 'auto',
        transform: isDragging ? 'scale(0.98)' : undefined,
        transition: 'opacity 0.12s, transform 0.12s',
        zIndex: 5,
      }}
    >
      {segs.map((seg, i) => {
        const isFirst = i === 0;
        const isLast  = i === lastIdx;
        return (
          <div
            key={i}
            className="dispatch-seg"
            style={{
              position: 'absolute',
              left: seg.left,
              top: BLOCK_MARGIN,
              width: seg.width,
              height: blockH,
              backgroundColor: bgColor,
              backgroundImage: fillImage,
              borderRadius: 11,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 9px 0 16px',
              boxSizing: 'border-box',
              boxShadow: isDragging
                ? '0 10px 24px rgba(15,23,42,0.30)'
                : `inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 1px rgba(15,23,42,0.10), 0 4px 10px ${isDelay ? 'rgba(15,23,42,0.12)' : `color-mix(in srgb, ${color} 35%, transparent)`}`,
            }}
          >
            {/* Left identity tab — a bold light rail anchoring the card to its crew */}
            <div
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
                background: isDelay
                  ? 'rgba(255,255,255,0.32)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.55))',
                boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.10)',
                pointerEvents: 'none',
              }}
            />
            {/* Extended treatment: a soft amber inset ring on every segment so the
                whole job reads as extended, without the heavy dashed look. */}
            {block.extended && !isDelay && (
              <div
                style={{
                  position: 'absolute', inset: 1, borderRadius: 8,
                  border: '1.5px dashed rgba(251,191,36,0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.18)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Extended pill badge — on the final segment (the job's end) */}
            {block.extended && !isDelay && isLast && seg.width > 70 && (
              <div
                title="Extended"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  background: '#fbbf24', color: '#78350f',
                  fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em',
                  borderRadius: 5, padding: '1px 5px', lineHeight: 1.3,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              >
                EXT
              </div>
            )}

            {/* Edit mode drag handle — top-left of the first segment */}
            {editMode && isFirst && (
              <div
                className="dispatch-affordance"
                style={{
                  position: 'absolute', top: 4, left: 5,
                  color: 'rgba(255,255,255,0.78)',
                  pointerEvents: 'none',
                  lineHeight: 1,
                }}
              >
                <GripHorizontal style={{ width: 11, height: 11 }} />
              </div>
            )}

            {/* Resize handle — right edge of the final segment for job blocks.
                Wider hit area (20px) than its visual width so it's easy to grab;
                the grip itself stays visually slim. */}
            {editMode && !isDelay && isLast && (
              <div
                className="dispatch-resize-grip"
                onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart?.(e); }}
                onTouchStart={e => { e.stopPropagation(); e.preventDefault(); onResizeTouchStart?.(e); }}
                title="Drag to extend job duration"
                style={{
                  position: 'absolute',
                  right: -4, top: 0,
                  width: 20, height: '100%',
                  cursor: 'col-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: 3,
                  touchAction: 'none',
                  zIndex: 15,
                }}
              >
                <div
                  className="dispatch-resize-bar"
                  style={{
                    width: 4, height: 22, borderRadius: 3,
                    background: 'rgba(255,255,255,0.82)',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.18)',
                  }}
                />
              </div>
            )}

            {/* Admin delete button — top-right of the first segment, reveal-on-hover */}
            {isAdmin && onDelete && isFirst && (
              <button
                className="dispatch-affordance"
                onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDelete(); } }}
                title="Delete block"
                aria-label="Delete block"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: block.extended && !isDelay && isLast && seg.width > 70 ? 36 : 4,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(15,23,42,0.55)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  zIndex: 12,
                  lineHeight: 1,
                  color: '#fff',
                  backdropFilter: 'blur(2px)',
                }}
              >
                <X style={{ width: 10, height: 10 }} aria-hidden="true" />
              </button>
            )}

            {/* Labels — shown on every segment so each piece of a block that
                carries through a weekend still identifies its job. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              {/* Status dot — at-a-glance state from dates (first segment only) */}
              {!isDelay && isFirst && seg.width > 44 && (
                <span
                  title={status.label}
                  style={{
                    flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
                    background: status.dot,
                    boxShadow: `0 0 0 2px rgba(255,255,255,0.45)`,
                  }}
                />
              )}
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.01em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textShadow: '0 1px 2px rgba(0,0,0,0.32)', fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                {block.jobNumber}
              </span>
            </div>
            {!isDelay && job && seg.width > 70 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.88)', fontSize: 9.5, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textShadow: '0 1px 1px rgba(0,0,0,0.22)' }}>
                <MapPin style={{ width: 9, height: 9, flexShrink: 0, opacity: 0.85 }} />
                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{job.location}</span>
              </div>
            )}
            {/* Duration pill. */}
            {seg.width > 36 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.97)', fontSize: 9, fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
                  {block.durationDays}d
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCHEDULER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface SchedulerProps {
  crews?: Crew[];
  jobs?: JobOption[];
  initialBlocks?: ScheduleBlock[];
  onScheduleChange?: (schedule: ScheduleBlock[]) => void;
  userRole?: string;
  companyId?: string;
}

export default function Scheduler({
  crews: initialCrews = MOCK_CREWS,
  jobs: initialJobs   = MOCK_JOBS,
  initialBlocks = INITIAL_BLOCKS,
  onScheduleChange,
  userRole,
  companyId,
}: SchedulerProps) {
  const isAdmin = userRole === 'admin';
  const [crewsState, setCrewsState] = useState<Crew[]>(initialCrews);
  const [jobsState,  setJobsState]  = useState<JobOption[]>(initialJobs);
  const [employeeList,  setEmployeeList]  = useState<SchedulerEmployee[]>([]);
  const [blocks, dispatch] = useReducer(reducer, initialBlocks);
  const [view, setView]    = useState<'day' | 'week' | 'month'>('week');
  const [viewOffset, setViewOffset] = useState(0); // days from default start

  // Skip weekends: durations count working days (Mon–Fri) and blocks never start
  // on a weekend. Defaults on, persisted so the choice survives reloads. Can be
  // turned off for the occasional weekend crew.
  const [skipWeekends, setSkipWeekends] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('scheduler-skip-weekends');
    return saved === null ? true : saved === 'true';
  });
  useEffect(() => {
    try { window.localStorage.setItem('scheduler-skip-weekends', String(skipWeekends)); } catch { /* ignore */ }
  }, [skipWeekends]);
  const skipWeekendsRef = useRef(skipWeekends);
  skipWeekendsRef.current = skipWeekends;

  // Guards to avoid saving before the initial Supabase load completes
  const dbLoadedRef = useRef(false);

  // ── Load schedule data from Supabase on mount ──────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    Promise.all([
      supabase.from('schedule_crews').select('id, name, member_ids').eq('company_id', companyId).order('created_at'),
      supabase.from('schedule_blocks').select('id, crew_id, job_number, start_date, duration_days, type, extended').eq('company_id', companyId),
    ]).then(([crewsRes, blocksRes]) => {
      if (crewsRes.error)  console.error('[Scheduler] Failed to load crews:',  crewsRes.error.message);
      if (blocksRes.error) console.error('[Scheduler] Failed to load blocks:', blocksRes.error.message);

      // Only replace mock data when Supabase returns actual rows
      if (crewsRes.data && crewsRes.data.length > 0) {
        setCrewsState(crewsRes.data.map(r => ({
          id:        r.id,
          name:      r.name,
          size:      (r.member_ids ?? []).length,
          memberIds: r.member_ids ?? [],
        })));
      }
      if (blocksRes.data && blocksRes.data.length > 0) {
        const loaded: ScheduleBlock[] = blocksRes.data.map(r => ({
          id:            r.id,
          crewId:        r.crew_id,
          jobNumber:     r.job_number,
          startDate:     r.start_date,
          durationDays:  r.duration_days,
          type:          r.type as 'job' | 'delay',
          extended:      r.extended,
        }));
        dispatch({ type: 'REPLACE_ALL', blocks: loaded });
        dbBlockIdsRef.current = new Set(loaded.map(b => b.id));
      }

      dbLoadedRef.current = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Tracks block IDs that exist in the DB so we can diff-delete without a
  // round-trip SELECT on every state change.
  const dbBlockIdsRef = useRef<Set<string>>(new Set());

  // Ref that always holds the latest crewsState — used inside async callbacks
  // (block save effect) without adding crewsState to that effect's deps array.
  const crewsStateRef = useRef(crewsState);
  crewsStateRef.current = crewsState;

  // ── Persist crews to Supabase whenever they change (debounced 600 ms) ──────
  useEffect(() => {
    if (!companyId || !dbLoadedRef.current) return;
    const rows = crewsState.map(c => ({
      id:         c.id,
      company_id: companyId,
      name:       c.name,
      member_ids: c.memberIds,
    }));
    if (rows.length === 0) return;
    const t = setTimeout(() => {
      supabase.from('schedule_crews').upsert(rows, { onConflict: 'id' })
        .then(({ error }) => { if (error) console.error('[Scheduler] Failed to save crews:', error.message); });
    }, 600);
    return () => clearTimeout(t);
  }, [crewsState, companyId]);

  // Jobs on the board come from DigTrackPro's dig-ticket jobs (passed in as
  // initialJobs). Keep local state in sync as that list loads/changes, while
  // preserving any ad-hoc jobs added via CSV import (unioned by jobNumber).
  useEffect(() => {
    setJobsState(prev => {
      const seen = new Set(initialJobs.map(j => j.jobNumber));
      const extras = prev.filter(j => !seen.has(j.jobNumber));
      return [...initialJobs, ...extras];
    });
  }, [initialJobs]);

  // ── Persist blocks to Supabase whenever they change (debounced 600 ms) ─────
  useEffect(() => {
    if (!companyId || !dbLoadedRef.current) return;

    // Exclude demo blocks: they reference mock crew IDs ('c1'–'c3') that are
    // never in the DB, causing FK violations that silently fail the entire batch.
    const blocksToSave = blocks.filter(b => !MOCK_BLOCK_IDS.has(b.id));
    const rows = blocksToSave.map(b => ({
      id:            b.id,
      company_id:    companyId,
      crew_id:       b.crewId,
      job_number:    b.jobNumber,
      start_date:    b.startDate,
      duration_days: b.durationDays,
      type:          b.type,
      extended:      b.extended,
    }));

    const currentIds = new Set(blocksToSave.map(b => b.id));
    // Ids that were in the DB but are no longer in state → need deleting
    const toDelete = [...dbBlockIdsRef.current].filter(id => !currentIds.has(id));

    const t = setTimeout(() => {
      if (rows.length > 0) {
        // Upsert any crews referenced by these blocks before saving the blocks.
        // This ensures the FK constraint (schedule_blocks.crew_id → schedule_crews.id)
        // is satisfied even when blocks use crews that haven't been persisted yet
        // (e.g. mock crews 'c1'–'c3' or freshly-created crews).
        const referencedCrewIds = new Set(rows.map(r => r.crew_id));
        const crewRows = crewsStateRef.current
          .filter(c => referencedCrewIds.has(c.id))
          .map(c => ({
            id:         c.id,
            company_id: companyId,
            name:       c.name,
            member_ids: c.memberIds,
          }));
        const crewSave = crewRows.length > 0
          ? supabase.from('schedule_crews').upsert(crewRows, { onConflict: 'id' })
          : Promise.resolve({ error: null });
        crewSave.then(({ error: crewErr }) => {
          if (crewErr) {
            console.error('[Scheduler] Failed to save crews before blocks:', crewErr.message);
            return;
          }
          supabase.from('schedule_blocks').upsert(rows, { onConflict: 'id' })
            .then(({ error }) => {
              if (error) {
                console.error('[Scheduler] Failed to save blocks:', error.message);
              } else {
                // Update our local DB-id mirror
                dbBlockIdsRef.current = currentIds;
              }
            });
        });
      }
      if (toDelete.length > 0) {
        supabase.from('schedule_blocks').delete().in('id', toDelete)
          .then(({ error }) => {
            if (error) {
              console.error('[Scheduler] Failed to delete blocks:', error.message);
            } else {
              toDelete.forEach(id => dbBlockIdsRef.current.delete(id));
            }
          });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [blocks, companyId]);

  // Fetch employees from Supabase when companyId is available (admin use)
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('employees')
      .select('id, name, role')
      .eq('company_id', companyId)
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('[Scheduler] Failed to load employees:', error.message);
        else if (data) setEmployeeList(data as SchedulerEmployee[]);
      });
  }, [companyId]);

  // Per-view geometry. Day view uses wide, roomy columns over a short horizon so
  // each day is legible; week is the everyday planning span; month is the wide
  // overview. `leadDays` keeps today near the left edge of the initial window.
  const dayWidth  = view === 'day' ? 132 : view === 'week' ? 60 : 24;
  const totalDays = view === 'day' ? 14  : view === 'week' ? 28 : 90;
  const leadDays  = view === 'day' ? 2   : 7;
  // How far prev/next steps the window for each view.
  const navStep   = view === 'day' ? 7   : view === 'week' ? 14 : 30;

  // View window: start `leadDays` before today + navigation offset
  const viewStart = addDays(addDays(todayISO, -leadDays), viewOffset);
  const days = Array.from({ length: totalDays }, (_, i) => addDays(viewStart, i));
  const todayOffset = diffDays(todayISO, viewStart) * dayWidth;
  const totalGridWidth = totalDays * dayWidth;

  // Per-crew color lookup
  const crewColorMap = new Map<string, string>(
    crewsState.map((c, i) => [c.id, CREW_COLORS[i % CREW_COLORS.length]]),
  );

  // Drag state
  const [draggingId,    setDraggingId]    = useState<string | null>(null);
  const [dragOffsetDays, setDragOffsetDays] = useState(0);

  // Live drop preview (desktop + touch). While a block is being dragged we
  // compute the snapped target crew row + start date and render a translucent
  // placeholder there so the user sees exactly where the block will land before
  // releasing. Shape mirrors what the drop handlers ultimately dispatch, and the
  // snap math (weekday-snap when skipping) stays consistent with handleDrop.
  const [dragPreview, setDragPreview] = useState<{
    crewId:       string;
    startDate:    string;
    durationDays: number;
    conflict:     boolean;
  } | null>(null);

  // Block id that just settled after a drop — drives a brief "settle" pop so the
  // landing reads as deliberate. Cleared by a short timer.
  const [settledId, setSettledId] = useState<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flagSettled = useCallback((id: string) => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    setSettledId(id);
    settleTimerRef.current = setTimeout(() => setSettledId(null), 320);
  }, []);
  useEffect(() => () => { if (settleTimerRef.current) clearTimeout(settleTimerRef.current); }, []);

  // Resize-drag state (dragging the right edge of a job block to extend it)
  const [resizingId,      setResizingId]      = useState<string | null>(null);
  const [resizeDeltaDays, setResizeDeltaDays] = useState(0);
  // Live cursor position during a resize drag — anchors the floating duration /
  // end-date label that previews the new extent.
  const [resizeCursor, setResizeCursor] = useState<{ x: number; y: number } | null>(null);
  const resizeRef = useRef<{
    blockId:      string;
    startX:       number;
    origDuration: number;
    origStart:    string;
    crewId:       string;
  } | null>(null);

  // Edit mode (gates drag on desktop and enables touch-drag on mobile)
  const [editMode, setEditMode] = useState(false);

  // Hovered crew delay button (for hover styling)
  const [hoverDelayCrewId, setHoverDelayCrewId] = useState<string | null>(null);

  // Touch-drag state (ref for values needed inside non-React event listeners)
  const touchDragRef = useRef<{
    blockId: string;
    offsetDays: number;
    label: string;
    color: string;
  } | null>(null);
  const [touchGhostPos, setTouchGhostPos] = useState<{ x: number; y: number } | null>(null);

  // Overlay state
  const [ctxMenu,           setCtxMenu]           = useState<CtxMenuState | null>(null);
  const [dayPrompt,         setDayPrompt]         = useState<DayPromptState | null>(null);
  const [tooltip,           setTooltip]           = useState<TooltipState | null>(null);
  const [showAddModal,      setShowAddModal]      = useState(false);
  const [showImportModal,   setShowImportModal]   = useState(false);
  const [showManageCrews,   setShowManageCrews]   = useState(false);

  // Toolbar popover: the mobile overflow menu.
  const [showOverflow,      setShowOverflow]      = useState(false);
  const overflowRef   = useRef<HTMLDivElement>(null);

  // Close the overflow popover when clicking outside of it.
  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflow]);

  // Pending overlap-conflict confirmation (drag-move)
  const [pendingMove, setPendingMove] = useState<{
    blockId: string;
    crewId: string;
    startDate: string;
    jobLabel: string;
    crewName: string;
    conflictCount: number;
    shiftDays: number;
    willSplit: boolean;
  } | null>(null);

  // Pending overlap-conflict confirmation (add-block)
  const [pendingAdd, setPendingAdd] = useState<{
    block: ScheduleBlock;
    crewName: string;
    conflictCount: number;
    shiftDays: number;
    willSplit: boolean;
  } | null>(null);

  // Ref to the outer scroll container (needed for drop position calc)
  const scrollRef = useRef<HTMLDivElement>(null);
  // requestAnimationFrame ID for throttling tooltip mouse-move updates
  const tooltipRafRef = useRef<number | null>(null);

  // Ref that always holds the latest blocks state — used inside callbacks/effects
  // that can't take blocks as a dependency without causing excessive re-renders.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // ── Undo history ─────────────────────────────────────────────────────────────
  // Stores up to 20 snapshots of blocks state taken just before each user action.
  const undoHistoryRef = useRef<ScheduleBlock[][]>([]);
  const [canUndo, setCanUndo] = useState(false);

  /** Dispatch a user action while recording the current state for undo. */
  const dispatchWithHistory = useCallback((action: Action) => {
    undoHistoryRef.current = [...undoHistoryRef.current.slice(-19), blocksRef.current];
    setCanUndo(true);
    dispatch({ ...action, skipWeekends: skipWeekendsRef.current });
  }, [dispatch]);

  /** Restore the most recent snapshot from undo history. */
  const handleUndo = useCallback(() => {
    if (undoHistoryRef.current.length === 0) return;
    const prev = undoHistoryRef.current[undoHistoryRef.current.length - 1];
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    setCanUndo(undoHistoryRef.current.length > 0);
    dispatch({ type: 'REPLACE_ALL', blocks: prev });
  }, [dispatch]);

  // Keyboard shortcut: Ctrl+Z / Cmd+Z to undo (only active in edit mode)
  useEffect(() => {
    if (!editMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editMode, handleUndo]);

  // Notify parent when blocks change
  const prevRef = useRef(blocks);
  useEffect(() => {
    if (onScheduleChange && blocks !== prevRef.current) {
      onScheduleChange(blocks);
      prevRef.current = blocks;
    }
  }, [blocks, onScheduleChange]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, block: ScheduleBlock) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetDays = Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth));
    setDragOffsetDays(offsetDays);
    setDraggingId(block.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-block-id', block.id);
  }, [dayWidth]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragPreview(null);
  }, []);

  // Translate a pointer clientX into the snapped start date for the block being
  // dragged, using the same geometry the drop handlers use so the preview and
  // the eventual landing agree to the day. Returns null when no drag is active.
  const computeSnappedStart = useCallback((clientX: number): string | null => {
    const drag = blocksRef.current.find(b => b.id === draggingId);
    if (!drag || !scrollRef.current) return null;
    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const xInContent = clientX - containerRect.left + container.scrollLeft;
    const xInGrid    = xInContent - CREW_COL_W;
    const dayIndex   = Math.floor(xInGrid / dayWidth);
    const skip       = skipWeekendsRef.current;
    let   newStart   = addDays(viewStart, dayIndex - dragOffsetDays);
    if (skip) newStart = snapToWeekday(newStart);
    return newStart;
  }, [draggingId, dayWidth, viewStart, dragOffsetDays]);

  // Hovering a crew row while dragging: compute the snapped target and stash it
  // so the live placeholder + guide render at the exact landing spot.
  const handleDragOver = useCallback((e: React.DragEvent, crewId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const id = draggingId;
    if (!id) return;
    const newStart = computeSnappedStart(e.clientX);
    if (!newStart) return;
    const moving = blocksRef.current.find(b => b.id === id);
    if (!moving) return;
    const skip = skipWeekendsRef.current;
    const conflicts = findOverlapConflicts(blocksRef.current, crewId, newStart, moving.durationDays, skip, id);
    setDragPreview(prev => {
      if (prev && prev.crewId === crewId && prev.startDate === newStart && prev.conflict === (conflicts.length > 0)) {
        return prev;
      }
      return { crewId, startDate: newStart, durationDays: moving.durationDays, conflict: conflicts.length > 0 };
    });
  }, [draggingId, computeSnappedStart]);

  const handleDrop = useCallback((e: React.DragEvent, crewId: string) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('application/x-block-id');
    if (!blockId || !scrollRef.current) return;

    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    // Position within the full scrollable content
    const xInContent = e.clientX - containerRect.left + container.scrollLeft;
    // Position within the grid area (subtract the fixed crew-label column)
    const xInGrid    = xInContent - CREW_COL_W;
    const dayIndex   = Math.floor(xInGrid / dayWidth);
    const skip       = skipWeekendsRef.current;
    let   newStart   = addDays(viewStart, dayIndex - dragOffsetDays);
    if (skip) newStart = snapToWeekday(newStart);

    setDraggingId(null);
    setDragPreview(null);

    const allBlocks   = blocksRef.current;
    const movingBlock = allBlocks.find(b => b.id === blockId);
    if (!movingBlock) return;

    const conflicts = findOverlapConflicts(allBlocks, crewId, newStart, movingBlock.durationDays, skip, blockId);
    if (conflicts.length > 0) {
      const crew = crewsStateRef.current.find(c => c.id === crewId);
      setPendingMove({
        blockId,
        crewId,
        startDate: newStart,
        jobLabel:  movingBlock.jobNumber,
        crewName:  crew?.name ?? crewId,
        conflictCount: conflicts.length,
        shiftDays: movingBlock.durationDays,
        willSplit: conflicts.some(c => c.type === 'job' && c.startDate < newStart),
      });
    } else {
      dispatchWithHistory({ type: 'MOVE_BLOCK', id: blockId, crewId, startDate: newStart });
      flagSettled(blockId);
    }
  }, [dayWidth, viewStart, dragOffsetDays, dispatchWithHistory, flagSettled]);

  // ── Touch-drag handlers (mobile edit mode) ───────────────────────────────────

  const handleBlockTouchStart = useCallback((
    e: React.TouchEvent,
    block: ScheduleBlock,
    color: string,
  ) => {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetDays = Math.max(0, Math.floor((touch.clientX - rect.left) / dayWidth));
    touchDragRef.current = { blockId: block.id, offsetDays, label: block.jobNumber, color };
    setDraggingId(block.id);
    setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
  }, [editMode, dayWidth]);

  // Global touch-move / touch-end listeners while a touch drag is in progress
  const dayWidthRef    = useRef(dayWidth);
  const viewStartRef   = useRef(viewStart);
  const todayOffsetRef = useRef(todayOffset);
  dayWidthRef.current    = dayWidth;
  viewStartRef.current   = viewStart;
  todayOffsetRef.current = todayOffset;

  // ── Focus today ───────────────────────────────────────────────────────────
  // Horizontally scroll so today's column sits just inside the left edge (with a
  // day of lead-in for context). Past days remain reachable by scrolling left and
  // future days by scrolling right. Bumping `focusTodayNonce` re-triggers it.
  const [focusTodayNonce, setFocusTodayNonce] = useState(0);
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayOffsetRef.current - dayWidthRef.current);
  }, []);

  // Run on first paint and whenever the view granularity changes or the user
  // explicitly asks to jump back to today.
  useEffect(() => {
    const id = requestAnimationFrame(scrollToToday);
    return () => cancelAnimationFrame(id);
  }, [view, focusTodayNonce, scrollToToday]);

  useEffect(() => {
    if (!touchGhostPos) return; // nothing being dragged

    const handleTouchMove = (e: TouchEvent) => {
      const drag = touchDragRef.current;
      if (!drag || !scrollRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      setTouchGhostPos({ x: touch.clientX, y: touch.clientY });

      // Live target preview for touch — mirror the release math so the
      // placeholder + guide sit exactly where the block will land.
      const container = scrollRef.current;
      const containerRect = container.getBoundingClientRect();
      const yInView     = touch.clientY - containerRect.top;
      const crewAreaTop = HEADER_MONTH_H + HEADER_DAY_H;
      const crewIndex   = Math.floor((yInView - crewAreaTop) / ROW_HEIGHT);
      const crews       = crewsStateRef.current;
      const clampedIdx  = Math.min(Math.max(crewIndex, 0), crews.length - 1);
      const targetCrew  = crews[clampedIdx];
      const dw = dayWidthRef.current;
      const xInContent = touch.clientX - containerRect.left + container.scrollLeft;
      const xInGrid    = xInContent - CREW_COL_W;
      const dayIndex   = dw > 0 ? Math.floor(xInGrid / dw) : 0;
      const skip       = skipWeekendsRef.current;
      let   newStart   = addDays(viewStartRef.current, dayIndex - drag.offsetDays);
      if (skip) newStart = snapToWeekday(newStart);
      if (targetCrew) {
        const moving = blocksRef.current.find(b => b.id === drag.blockId);
        if (moving) {
          const conflicts = findOverlapConflicts(blocksRef.current, targetCrew.id, newStart, moving.durationDays, skip, drag.blockId);
          setDragPreview({ crewId: targetCrew.id, startDate: newStart, durationDays: moving.durationDays, conflict: conflicts.length > 0 });
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const drag = touchDragRef.current;
      if (!drag || !scrollRef.current) {
        touchDragRef.current = null;
        setDraggingId(null);
        setTouchGhostPos(null);
        setDragPreview(null);
        return;
      }

      const touch = e.changedTouches[0];
      const container = scrollRef.current;
      const containerRect = container.getBoundingClientRect();

      // Determine which crew row was released over
      const yInView    = touch.clientY - containerRect.top;
      const crewAreaTop = HEADER_MONTH_H + HEADER_DAY_H;
      const crewIndex   = Math.floor((yInView - crewAreaTop) / ROW_HEIGHT);
      const crews       = crewsStateRef.current;
      const clampedIdx  = Math.min(Math.max(crewIndex, 0), crews.length - 1);
      const targetCrew  = crews[clampedIdx];

      // Determine which date column was released over
      const dw = dayWidthRef.current;
      const xInContent = touch.clientX - containerRect.left + container.scrollLeft;
      const xInGrid    = xInContent - CREW_COL_W;
      const dayIndex   = dw > 0 ? Math.floor(xInGrid / dw) : 0;
      const skip       = skipWeekendsRef.current;
      let   newStart   = addDays(viewStartRef.current, dayIndex - drag.offsetDays);
      if (skip) newStart = snapToWeekday(newStart);

      if (targetCrew) {
        const allBlocks   = blocksRef.current;
        const movingBlock = allBlocks.find(b => b.id === drag.blockId);
        if (movingBlock) {
          const conflicts = findOverlapConflicts(
            allBlocks, targetCrew.id, newStart, movingBlock.durationDays, skip, drag.blockId,
          );
          if (conflicts.length > 0) {
            setPendingMove({
              blockId:       drag.blockId,
              crewId:        targetCrew.id,
              startDate:     newStart,
              jobLabel:      movingBlock.jobNumber,
              crewName:      targetCrew.name,
              conflictCount: conflicts.length,
              shiftDays:     movingBlock.durationDays,
              willSplit:     conflicts.some(c => c.type === 'job' && c.startDate < newStart),
            });
          } else {
            dispatchWithHistory({ type: 'MOVE_BLOCK', id: drag.blockId, crewId: targetCrew.id, startDate: newStart });
            flagSettled(drag.blockId);
          }
        }
      }
      touchDragRef.current = null;
      setDraggingId(null);
      setTouchGhostPos(null);
      setDragPreview(null);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [touchGhostPos, dispatchWithHistory, flagSettled]);

  // ── Resize-drag handlers (right-edge drag in edit mode) ─────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent, block: ScheduleBlock) => {
    resizeRef.current = {
      blockId:      block.id,
      startX:       e.clientX,
      origDuration: block.durationDays,
      origStart:    block.startDate,
      crewId:       block.crewId,
    };
    setResizingId(block.id);
    setResizeDeltaDays(0);
    setResizeCursor({ x: e.clientX, y: e.clientY });
  }, []);

  const handleResizeTouchStart = useCallback((e: React.TouchEvent, block: ScheduleBlock) => {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    resizeRef.current = {
      blockId:      block.id,
      startX:       touch.clientX,
      origDuration: block.durationDays,
      origStart:    block.startDate,
      crewId:       block.crewId,
    };
    setResizingId(block.id);
    setResizeDeltaDays(0);
    setResizeCursor({ x: touch.clientX, y: touch.clientY });
  }, [editMode]);

  useEffect(() => {
    if (!resizingId) return;

    // Convert a pixel drag (in calendar columns) into a working-day duration
    // delta so that dragging across a weekend doesn't add weekend days when
    // weekend-skipping is on.
    const toDurationDelta = (r: NonNullable<typeof resizeRef.current>, cols: number): number => {
      if (cols <= 0) return 0;
      if (!skipWeekendsRef.current) return cols;
      const origLast    = nthWorkingDay(r.origStart, r.origDuration);
      const targetEnd   = addDays(origLast, cols);
      const newDuration = countWorkingDays(r.origStart, targetEnd);
      return Math.max(0, newDuration - r.origDuration);
    };

    const onMouseMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r || dayWidthRef.current === 0) return;
      const cols = Math.max(0, Math.round((e.clientX - r.startX) / dayWidthRef.current));
      setResizeDeltaDays(toDurationDelta(r, cols));
      setResizeCursor({ x: e.clientX, y: e.clientY });
    };

    const onMouseUp = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dw = dayWidthRef.current;
      const cols = dw > 0 ? Math.max(0, Math.round((e.clientX - r.startX) / dw)) : 0;
      const days = toDurationDelta(r, cols);
      if (days > 0) {
        dispatch({ type: 'EXTEND_JOB', blockId: r.blockId, days, skipWeekends: skipWeekendsRef.current });
        flagSettled(r.blockId);
      }
      resizeRef.current = null;
      setResizingId(null);
      setResizeDeltaDays(0);
      setResizeCursor(null);
    };

    const onTouchMove = (e: TouchEvent) => {
      const r = resizeRef.current;
      if (!r || dayWidthRef.current === 0) return;
      e.preventDefault();
      const touch = e.touches[0];
      const cols = Math.max(0, Math.round((touch.clientX - r.startX) / dayWidthRef.current));
      setResizeDeltaDays(toDurationDelta(r, cols));
      setResizeCursor({ x: touch.clientX, y: touch.clientY });
    };

    const onTouchEnd = (e: TouchEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dw = dayWidthRef.current;
      const touch = e.changedTouches[0];
      const cols = dw > 0 ? Math.max(0, Math.round((touch.clientX - r.startX) / dw)) : 0;
      const days = toDurationDelta(r, cols);
      if (days > 0) {
        dispatch({ type: 'EXTEND_JOB', blockId: r.blockId, days, skipWeekends: skipWeekendsRef.current });
        flagSettled(r.blockId);
      }
      resizeRef.current = null;
      setResizingId(null);
      setResizeDeltaDays(0);
      setResizeCursor(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      document.removeEventListener('touchmove', onTouchMove, { passive: false } as EventListenerOptions);
      document.removeEventListener('touchend',  onTouchEnd);
    };
  }, [resizingId, dispatch, flagSettled]);

  // ── Context-menu actions ─────────────────────────────────────────────────────

  const handleDelayConfirm = (days: number) => {
    if (!dayPrompt) return;
    if (dayPrompt.action === 'crew_delay') {
      dispatchWithHistory({ type: 'SHIFT_CREW', crewId: dayPrompt.blockId, fromDate: todayISO, days });
    } else {
      dispatchWithHistory({ type: 'INSERT_DELAY', blockId: dayPrompt.blockId, days });
    }
  };

  const handleExtendConfirm = (days: number) => {
    if (!dayPrompt) return;
    dispatchWithHistory({ type: 'EXTEND_JOB', blockId: dayPrompt.blockId, days });
  };

  // ── Spreadsheet import ───────────────────────────────────────────────────────
  // Turn parsed rows into schedule blocks, creating any crews and job options
  // they reference that don't exist yet. Crew/job state updates auto-persist via
  // the existing save effects, and the block-save effect upserts referenced crews
  // before blocks so the FK constraint is always satisfied.
  const handleImport = useCallback((rows: ScheduleImportRow[]) => {
    const skip = skipWeekendsRef.current;

    // Resolve crews by name (case-insensitive), creating new ones as needed.
    const crewIdByName = new Map<string, string>(
      crewsState.map(c => [c.name.trim().toLowerCase(), c.id]),
    );
    const newCrews: Crew[] = [];
    for (const r of rows) {
      const key = r.crewName.trim().toLowerCase();
      if (!crewIdByName.has(key)) {
        const crew: Crew = { id: `crew-${crypto.randomUUID()}`, name: r.crewName.trim(), size: 1, memberIds: [] };
        crewIdByName.set(key, crew.id);
        newCrews.push(crew);
      }
    }

    // Collect new job options referenced by the import.
    const existingJobNums = new Set(jobsState.map(j => j.jobNumber.toLowerCase()));
    const newJobs: JobOption[] = [];
    const seenNewJobs = new Set<string>();
    for (const r of rows) {
      const key = r.jobNumber.toLowerCase();
      if (!existingJobNums.has(key) && !seenNewJobs.has(key)) {
        seenNewJobs.add(key);
        newJobs.push({ jobNumber: r.jobNumber, location: r.location, estimatedDays: r.durationDays });
      }
    }

    // Build the blocks, snapping start dates off weekends when that mode is on.
    const importedBlocks: ScheduleBlock[] = rows.map(r => ({
      id:           `block-${crypto.randomUUID()}`,
      crewId:       crewIdByName.get(r.crewName.trim().toLowerCase())!,
      jobNumber:    r.jobNumber,
      startDate:    skip ? snapToWeekday(r.startDate) : r.startDate,
      durationDays: Math.max(1, r.durationDays),
      type:         'job',
      extended:     false,
    }));

    if (newCrews.length > 0) setCrewsState(prev => [...prev, ...newCrews]);
    if (newJobs.length > 0)   setJobsState(prev => [...prev, ...newJobs]);
    if (importedBlocks.length > 0) dispatchWithHistory({ type: 'ADD_BLOCKS', blocks: importedBlocks });
  }, [crewsState, jobsState, dispatchWithHistory]);

  // ── Build month-label spans for header ──────────────────────────────────────

  const monthLabels: { label: string; startCol: number; span: number }[] = [];
  days.forEach((day, i) => {
    const d = parseDate(day);
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const last = monthLabels[monthLabels.length - 1];
    if (!last || last.label !== label) {
      monthLabels.push({ label, startCol: i, span: 1 });
    } else {
      last.span++;
    }
  });

  // Last calendar day of the visible window — used by the per-crew workload meter.
  const windowEndISO = addDays(viewStart, totalDays - 1);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="dispatch-shell flex flex-col select-none rounded-2xl overflow-hidden" style={{ height: 'calc(100svh - 220px)', minHeight: '420px', boxShadow: '0 18px 48px -12px rgba(11,19,38,0.45), 0 4px 12px rgba(11,19,38,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* ─── Toolbar ─── */}
      <div
        className="flex items-center gap-x-2.5 gap-y-2.5 px-4 sm:px-5 pt-3.5 sm:pt-4 pb-3 shrink-0 flex-wrap"
        style={{
          background: 'transparent',
        }}
      >
        {/* Branded title block */}
        <div className="flex items-center gap-3 mr-1">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 90%, white), var(--brand-primary))',
              boxShadow: '0 4px 14px var(--brand-shadow), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <Calendar className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="leading-tight hidden sm:block">
            <h2 className="font-display text-white font-bold text-[15px] tracking-tight">Dispatch Board</h2>
            <p className="text-[10px] text-slate-400 font-medium">Crew &amp; job scheduling</p>
          </div>
        </div>

        {/* ── Navigation group: view toggle · prev/Today/next · jump · range ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle — segmented control (Day · Week · Month) */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10">
            {(['day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); }}
                aria-pressed={view === v}
                className={`px-3 sm:px-3.5 py-1.5 text-xs font-semibold capitalize rounded-md transition-all ${
                  view === v
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation cluster — prev · Today · next */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10">
            <button
              onClick={() => setViewOffset(v => v - navStep)}
              aria-label="Previous period"
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setViewOffset(0); setFocusTodayNonce(n => n + 1); }}
              className="px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white rounded-md transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setViewOffset(v => v + navStep)}
              aria-label="Next period"
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Visible date range — reflects the window of the active view */}
          <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-md bg-white/5 text-slate-300 text-xs font-medium tabular-nums">
            {fmtShort(viewStart)} – {fmtShort(addDays(viewStart, totalDays - 1))}
          </span>
        </div>

        {/* ── Action group ── */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Skip-weekends toggle — when on, jobs span Mon–Fri and auto-skip Sat/Sun */}
          <button
            onClick={() => setSkipWeekends(s => !s)}
            aria-pressed={skipWeekends}
            aria-label={skipWeekends ? 'Weekends skipped — click to include weekends' : 'Weekends included — click to skip weekends'}
            title={skipWeekends
              ? 'Weekends skipped — jobs are scheduled Monday–Friday. Click to allow weekend work.'
              : 'Weekends included — jobs can run any day. Click to skip weekends.'}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${
              skipWeekends
                ? 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                : 'bg-amber-400 text-slate-900 border-amber-300 shadow-sm'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{skipWeekends ? 'Mon–Fri' : '7-Day'}</span>
          </button>
          {/* Edit mode toggle */}
          <button
            onClick={() => setEditMode(m => !m)}
            aria-pressed={editMode}
            aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode to drag blocks'}
            title={editMode ? 'Exit edit mode' : 'Edit: drag blocks to reschedule'}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${
              editMode
                ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-sm'
                : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" /><span className="hidden lg:inline">{editMode ? 'Editing' : 'Edit'}</span>
          </button>
          {/* Undo button — visible only in edit mode */}
          {editMode && (
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo last action"
              title="Undo last action (Ctrl+Z)"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                canUndo
                  ? 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                  : 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" /><span className="hidden lg:inline"> Undo</span>
            </button>
          )}

          {/* Divider before secondary/admin actions */}
          <span className="hidden md:inline-block w-px h-5 bg-white/10 mx-0.5" aria-hidden="true" />

          {/* Secondary / admin actions — shown inline on wide screens (md+),
              collapsed into the overflow menu on narrow screens. */}
          {isAdmin && (
            <button
              onClick={() => setShowManageCrews(true)}
              title="Manage crews"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-white/10"
            >
              <Users className="w-3.5 h-3.5" /><span className="hidden lg:inline"> Crews</span>
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            aria-label="Import schedule from spreadsheet"
            title="Import schedule from a CSV or spreadsheet"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-white/10"
          >
            <Upload className="w-3.5 h-3.5" /><span className="hidden lg:inline"> Import</span>
          </button>

          {/* Overflow menu — collapses secondary actions on narrow (< md) screens */}
          <div ref={overflowRef} className="relative md:hidden">
            <button
              onClick={() => setShowOverflow(o => !o)}
              aria-label="More actions"
              aria-expanded={showOverflow}
              title="More"
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors border ${
                showOverflow
                  ? 'bg-white/20 text-white border-white/20'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showOverflow && (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl bg-white shadow-2xl border border-slate-200 py-1.5"
                onMouseDown={e => e.stopPropagation()}
              >
                {isAdmin && (
                  <button
                    onClick={() => { setShowManageCrews(true); setShowOverflow(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-brand/10 hover:text-brand transition-colors"
                  >
                    <Users className="w-4 h-4 shrink-0" /> Manage Crews
                  </button>
                )}
                <button
                  onClick={() => { setShowImportModal(true); setShowOverflow(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-brand/10 hover:text-brand transition-colors"
                >
                  <Upload className="w-4 h-4 shrink-0" /> Import Schedule
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            aria-label="Add job"
            title="Add job"
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 bg-brand hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-all shadow-brand/20 hover:-translate-y-px"
          >
            <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Add Job</span>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{
          minHeight: 0,
          background: '#e7edf6',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 8px 18px -12px rgba(11,19,38,0.5)',
        }}
      >
        <div style={{ minWidth: CREW_COL_W + totalGridWidth }}>

          {/* Month header */}
          <div
            className="flex"
            style={{
              height: HEADER_MONTH_H,
              position: 'sticky', top: 0, zIndex: 30,
              background: 'linear-gradient(180deg, #f4f7fc 0%, #eef2f8 100%)',
              borderBottom: '1px solid #dde5f0',
            }}
          >
            <div
              style={{
                width: CREW_COL_W, minWidth: CREW_COL_W, height: HEADER_MONTH_H,
                borderRight: '1px solid #d8e0ec',
                flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 31,
                background: 'linear-gradient(180deg, #f4f7fc 0%, #eef2f8 100%)',
                boxShadow: '1px 0 0 rgba(203,213,225,0.7)',
              }}
            />
            <div style={{ position: 'relative', width: totalGridWidth, height: HEADER_MONTH_H }}>
              {monthLabels.map(ml => (
                <div
                  key={ml.label}
                  style={{
                    position: 'absolute',
                    left: ml.startCol * dayWidth,
                    width: ml.span * dayWidth,
                    height: HEADER_MONTH_H,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: 12, boxSizing: 'border-box',
                    borderRight: '1px solid #f1f5f9',
                    color: '#475569',
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}
                >
                  {ml.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day header */}
          <div
            className="flex"
            style={{
              height: HEADER_DAY_H,
              position: 'sticky', top: HEADER_MONTH_H, zIndex: 30,
              background: 'linear-gradient(180deg, #ffffff 0%, #f6f8fc 100%)',
              borderBottom: '1px solid #d8e0ec',
            }}
          >
            <div
              style={{
                width: CREW_COL_W, minWidth: CREW_COL_W, height: HEADER_DAY_H,
                borderRight: '1px solid #d8e0ec',
                display: 'flex', alignItems: 'center', gap: 7,
                paddingLeft: 14, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 31,
                background: 'linear-gradient(180deg, #ffffff 0%, #f6f8fc 100%)',
                boxShadow: '1px 0 0 rgba(203,213,225,0.7)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 6,
                  background: 'var(--brand-ring)', color: 'var(--brand-primary)',
                }}
              >
                <Users style={{ width: 11, height: 11 }} />
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#475569' }}>
                Roster
              </span>
            </div>
            <div style={{ position: 'relative', width: totalGridWidth, height: HEADER_DAY_H }}>
              {days.map((day, i) => {
                const d = parseDate(day);
                const isToday   = day === todayISO;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const showLabel = view !== 'month' || i % 3 === 0;
                const isDayView = view === 'day';
                return (
                  <div
                    key={day}
                    style={{
                      position: 'absolute',
                      left: i * dayWidth, width: dayWidth, height: HEADER_DAY_H,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 2,
                      borderRight: isWeekend ? '1px solid #eef2f7' : '1px solid #f1f5f9',
                      backgroundColor: isToday ? 'var(--brand-ring)' : isWeekend ? 'rgba(148,163,184,0.07)' : undefined,
                      boxSizing: 'border-box',
                    }}
                  >
                    {showLabel && (
                      <>
                        <span style={{ fontSize: isDayView ? 10 : 9, color: isToday ? 'var(--brand-primary)' : isWeekend ? '#b6c0cf' : '#94a3b8', fontWeight: isToday ? 700 : 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {d.toLocaleDateString('en-US', { weekday: isDayView ? 'short' : 'narrow' })}
                        </span>
                        {isToday ? (
                          <span
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              minWidth: 19, height: 19, padding: '0 5px',
                              borderRadius: 999,
                              background: 'var(--brand-primary)',
                              color: '#fff', fontSize: 10.5, fontWeight: 700,
                              boxShadow: '0 2px 6px var(--brand-shadow)',
                            }}
                          >
                            {d.getDate()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11.5, color: isWeekend ? '#b6c0cf' : '#334155', fontWeight: 600 }}>
                            {d.getDate()}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Crew rows */}
          {crewsState.map((crew, ci) => {
            const crewBlocks = blocks.filter(b => b.crewId === crew.id);
            const color = crewColorMap.get(crew.id) ?? CREW_COLORS[0];

            // Workload: fraction of working days in the visible window this crew
            // is booked across its job blocks (clamped, read-only).
            const workWindowDays = countWorkingDays(viewStart, windowEndISO) || totalDays;
            const bookedDays = crewBlocks.reduce((sum, b) => {
              if (b.type !== 'job') return sum;
              const s = b.startDate < viewStart ? viewStart : b.startDate;
              const endExcl = blockEndExclusive(b.startDate, b.durationDays, skipWeekends);
              const eIncl = addDays(endExcl, -1);
              const e = eIncl > windowEndISO ? windowEndISO : eIncl;
              if (e < s) return sum;
              return sum + countWorkingDays(s, e);
            }, 0);
            const workloadPct = Math.min(100, Math.round((bookedDays / Math.max(1, workWindowDays)) * 100));
            const workloadColor = workloadPct >= 90 ? '#e11d48' : workloadPct >= 60 ? color : workloadPct > 0 ? color : '#cbd5e1';

            // Live drop preview targeting this row (desktop drag or touch drag).
            // Geometry mirrors the block render below so the placeholder sits
            // exactly where the dragged block will land — to the day.
            const preview = dragPreview && dragPreview.crewId === crew.id ? dragPreview : null;
            const previewLeft = preview ? diffDays(preview.startDate, viewStart) * dayWidth : 0;
            const previewSegs = preview
              ? workingDayRuns(preview.startDate, preview.durationDays, skipWeekends).map(run => ({
                  left:  run.offsetDays * dayWidth + BLOCK_MARGIN,
                  width: Math.max(run.lengthDays * dayWidth - BLOCK_MARGIN * 2, 16),
                }))
              : [];
            const previewColor = preview?.conflict ? '#e11d48' : color;

            const memberNames = crew.memberIds.length > 0 && employeeList.length > 0
              ? crew.memberIds
                  .map(id => employeeList.find(e => e.id === id)?.name)
                  .filter(Boolean) as string[]
              : [];
            const workerCount = crew.memberIds.length || crew.size;

            return (
              <div key={crew.id} className="dispatch-lane flex" style={{ height: ROW_HEIGHT }}>
                {/* Sticky crew roster cell — designed identity card */}
                <div
                  className="dispatch-lane-cell"
                  style={{
                    width: CREW_COL_W, minWidth: CREW_COL_W, height: ROW_HEIGHT,
                    position: 'sticky', left: 0, zIndex: 20,
                    background: `linear-gradient(90deg, ${color}1f 0%, ${color}0d 36%, ${ci % 2 === 0 ? '#ffffff' : '#f8fafd'} 78%), ${ci % 2 === 0 ? '#ffffff' : '#f8fafd'}`,
                    borderRight: '1px solid #d8e0ec',
                    borderBottom: '1px solid #e3e9f2',
                    boxShadow: '1px 0 0 rgba(203,213,225,0.7)',
                    display: 'flex', alignItems: 'center',
                    padding: '0 9px 0 16px', gap: 10,
                    flexShrink: 0,
                  }}
                >
                  {/* Bold crew color identity band */}
                  <div
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
                      background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 78%, black))`,
                      boxShadow: `2px 0 8px ${color}40`,
                    }}
                  />
                  {/* Crew avatar — solid color identity */}
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 72%, black))`,
                      boxShadow: `0 3px 8px ${color}55, inset 0 1px 0 rgba(255,255,255,0.35)`,
                      color: '#fff',
                      fontSize: 15, fontWeight: 800,
                      fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                      letterSpacing: '0.02em',
                    }}
                  >
                    {crew.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ color: '#0f172a', fontSize: 13, fontWeight: 700, lineHeight: 1.15, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', letterSpacing: '-0.01em', fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                        {crew.name}
                      </span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 9.5, fontWeight: 600, marginTop: 2 }}>
                      <Users style={{ width: 9.5, height: 9.5, flexShrink: 0 }} />
                      {workerCount} {workerCount === 1 ? 'worker' : 'workers'}
                      {memberNames.length > 0 && (
                        <span style={{ color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 56 }} title={memberNames.join(', ')}>
                          · {memberNames[0].split(' ')[0]}{memberNames.length > 1 ? ` +${memberNames.length - 1}` : ''}
                        </span>
                      )}
                    </div>
                    {/* Workload meter — how booked this crew is in the window */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                      <div style={{ position: 'relative', flex: 1, height: 5, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', minWidth: 0 }}>
                        <div
                          className="dispatch-meter-fill"
                          style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${workloadPct}%`,
                            borderRadius: 999,
                            background: `linear-gradient(90deg, ${workloadColor}, color-mix(in srgb, ${workloadColor} 70%, white))`,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 800, color: workloadPct >= 90 ? '#e11d48' : '#64748b', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>
                        {workloadPct}%
                      </span>
                    </div>
                  </div>
                  {/* Per-crew delay button */}
                  <button
                    onClick={() => setDayPrompt({ action: 'crew_delay', blockId: crew.id })}
                    onMouseEnter={() => setHoverDelayCrewId(crew.id)}
                    onMouseLeave={() => setHoverDelayCrewId(null)}
                    title={`Push ${crew.name}'s schedule forward`}
                    aria-label={`Add delay to ${crew.name}'s schedule`}
                    style={{
                      flexShrink: 0,
                      width: 26, height: 26,
                      borderRadius: 8,
                      background: hoverDelayCrewId === crew.id ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.7)',
                      border: `1px solid ${hoverDelayCrewId === crew.id ? 'rgba(245,158,11,0.45)' : '#dce3ee'}`,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: hoverDelayCrewId === crew.id ? '#d97706' : '#94a3b8',
                      padding: 0,
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s',
                      transform: hoverDelayCrewId === crew.id ? 'scale(1.06)' : undefined,
                    }}
                  >
                    <Clock style={{ width: 13, height: 13 }} />
                  </button>
                </div>

                {/* Drop-zone row */}
                <div
                  style={{
                    position: 'relative',
                    width: totalGridWidth, height: ROW_HEIGHT,
                    background: preview
                      ? (preview.conflict
                          ? 'rgba(225,29,72,0.06)'
                          : `color-mix(in srgb, ${color} 9%, ${ci % 2 === 0 ? '#ffffff' : '#f6f8fc'})`)
                      : ci % 2 === 0
                        ? `linear-gradient(90deg, ${color}07 0%, #ffffff 22%)`
                        : `linear-gradient(90deg, ${color}09 0%, #f6f8fc 22%)`,
                    borderBottom: '1px solid #e3e9f2',
                    transition: 'background 0.12s ease',
                  }}
                  onDragOver={editMode ? e => handleDragOver(e, crew.id) : undefined}
                  onDrop={editMode ? e => handleDrop(e, crew.id) : undefined}
                >
                  {/* Day cells (grid lines + weekend shading + today column).
                      Weekend columns get a touch of shade; weekday gridlines are
                      lighter than week boundaries so the eye reads weeks cleanly. */}
                  {days.map((day, i) => {
                    const dow = parseDate(day).getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday   = day === todayISO;
                    const isWeekStart = dow === 1; // Monday — slightly stronger divider
                    return (
                      <div
                        key={day}
                        style={{
                          position: 'absolute',
                          left: i * dayWidth, top: 0,
                          width: dayWidth, height: ROW_HEIGHT,
                          borderRight: isWeekStart ? '1px solid #d4ddea' : '1px solid #e6ecf5',
                          backgroundColor: isToday
                            ? 'var(--brand-ring)'
                            : isWeekend ? 'rgba(100,116,139,0.07)' : undefined,
                          boxSizing: 'border-box',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  })}

                  {/* Today line — a slim brand-tinted rule. The pin marker on the
                      first row keeps it elegant without shouting red across rows. */}
                  {todayOffset >= 0 && todayOffset <= totalGridWidth && (
                    <>
                      <div
                        style={{
                          position: 'absolute', left: todayOffset - 0.5,
                          top: 0, width: 2, height: ROW_HEIGHT,
                          background: 'var(--brand-primary)',
                          opacity: 0.9,
                          zIndex: 8, pointerEvents: 'none',
                        }}
                      />
                      {ci === 0 && (
                        <div
                          style={{
                            position: 'absolute', left: todayOffset - 4.5,
                            top: -3, width: 9, height: 9, borderRadius: '50%',
                            background: 'var(--brand-primary)',
                            boxShadow: '0 0 0 2px #fff, 0 1px 4px var(--brand-shadow)',
                            zIndex: 9, pointerEvents: 'none',
                          }}
                        />
                      )}
                    </>
                  )}

                  {/* Live drop preview — a translucent placeholder at the snapped
                      target day, plus a vertical snap guide, so the landing spot
                      is obvious before release. Drawn under the dragged source. */}
                  {preview && (
                    <>
                      {/* Vertical snap guide at the target start column */}
                      <div
                        style={{
                          position: 'absolute',
                          left: previewLeft - 1, top: 0,
                          width: 2, height: ROW_HEIGHT,
                          background: previewColor,
                          opacity: 0.55,
                          zIndex: 6, pointerEvents: 'none',
                        }}
                      />
                      {previewSegs.map((seg, i) => (
                        <div
                          key={i}
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: previewLeft + seg.left,
                            top: BLOCK_MARGIN,
                            width: seg.width,
                            height: ROW_HEIGHT - BLOCK_MARGIN * 2,
                            borderRadius: 9,
                            background: `color-mix(in srgb, ${previewColor} 16%, transparent)`,
                            border: `2px dashed color-mix(in srgb, ${previewColor} 75%, transparent)`,
                            boxShadow: `0 0 0 1px color-mix(in srgb, ${previewColor} 18%, transparent)`,
                            boxSizing: 'border-box',
                            zIndex: 6,
                            pointerEvents: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                            padding: '0 10px',
                          }}
                        >
                          {i === 0 && seg.width > 54 && (
                            <span
                              style={{
                                fontSize: 10, fontWeight: 800, letterSpacing: '0.02em',
                                color: previewColor,
                                background: 'rgba(255,255,255,0.78)',
                                borderRadius: 6, padding: '1px 6px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {preview.conflict ? '⚠ ' : ''}{fmtShort(preview.startDate)}
                            </span>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Job/Delay blocks */}
                  {crewBlocks.map(block => {
                    const left  = diffDays(block.startDate, viewStart) * dayWidth;
                    const isResizing = resizingId === block.id;
                    const previewDuration = block.durationDays + (isResizing ? resizeDeltaDays : 0);
                    const width = blockSpanDays(block.startDate, previewDuration, skipWeekends) * dayWidth;
                    // Split the bar into per-work-stretch segments so a job that
                    // carries through a weekend renders with the weekend skipped.
                    const segments = workingDayRuns(block.startDate, previewDuration, skipWeekends).map(run => ({
                      left:  run.offsetDays * dayWidth + BLOCK_MARGIN,
                      width: Math.max(run.lengthDays * dayWidth - BLOCK_MARGIN * 2, 16),
                    }));
                    if (left + width < 0 || left > totalGridWidth) return null;
                    const job = jobsState.find(j => j.jobNumber === block.jobNumber);
                    return (
                      <JobBlock
                        key={block.id}
                        block={block}
                        crew={crew}
                        job={job}
                        left={left}
                        width={width}
                        segments={segments}
                        color={color}
                        isDragging={draggingId === block.id}
                        isSettled={settledId === block.id}
                        isAdmin={isAdmin}
                        editMode={editMode}
                        onDelete={() => dispatchWithHistory({ type: 'DELETE_BLOCK', id: block.id })}
                        onDragStart={e => handleDragStart(e, block)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={e => handleBlockTouchStart(e, block, color)}
                        onResizeStart={e => handleResizeStart(e, block)}
                        onResizeTouchStart={e => handleResizeTouchStart(e, block)}
                        onContextMenu={e => {
                          e.preventDefault();
                          setCtxMenu({ blockId: block.id, blockType: block.type, x: e.clientX, y: e.clientY });
                        }}
                        onMouseEnter={e => setTooltip({ block, job, crew, x: e.clientX, y: e.clientY })}
                        onMouseMove={e  => {
                          const x = e.clientX;
                          const y = e.clientY;
                          if (tooltipRafRef.current !== null) return;
                          tooltipRafRef.current = requestAnimationFrame(() => {
                            tooltipRafRef.current = null;
                            setTooltip(t => t ? { ...t, x, y } : t);
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state — no crews yet. Friendly prompt sits below the headers,
              pinned within the visible viewport so it reads even when scrolled. */}
          {crewsState.length === 0 && (
            <div
              style={{
                position: 'sticky', left: 0,
                width: 'min(100%, 520px)',
                margin: '0 auto',
                padding: '52px 24px 64px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 56, height: 56, borderRadius: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--brand-ring)',
                  border: '1px solid var(--brand-shadow)',
                  marginBottom: 16,
                }}
              >
                <Users className="text-brand" style={{ width: 26, height: 26 }} />
              </div>
              <h3 className="font-display" style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                No crews on the board yet
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 0', maxWidth: 360, lineHeight: 1.5 }}>
                Add a crew to start scheduling jobs. Each crew gets its own lane on
                the timeline where you can drag, drop, and extend work.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowManageCrews(true)}
                  className="bg-brand"
                  style={{
                    marginTop: 20,
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    padding: '9px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    boxShadow: '0 4px 14px var(--brand-shadow)',
                  }}
                >
                  <Plus style={{ width: 16, height: 16 }} /> Add your first crew
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Overlays ─── */}
      {tooltip && !draggingId && !resizingId && <BlockTooltip tip={tooltip} skipWeekends={skipWeekends} />}

      {/* Resize floating label — live new duration + end date near the cursor */}
      {resizingId && resizeCursor && (() => {
        const rb = blocks.find(b => b.id === resizingId);
        if (!rb) return null;
        const newDuration = rb.durationDays + resizeDeltaDays;
        const endISO = skipWeekends
          ? nthWorkingDay(rb.startDate, newDuration)
          : addDays(rb.startDate, newDuration - 1);
        return (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: resizeCursor.x + 16,
              top:  resizeCursor.y - 44,
              background: '#0a142d',
              color: '#fff',
              borderRadius: 10,
              padding: '7px 11px',
              fontSize: 11,
              fontWeight: 600,
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.12)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: '#5eead4', fontWeight: 800 }}>
              {newDuration} {skipWeekends ? 'working ' : ''}day{newDuration !== 1 ? 's' : ''}
            </span>
            {resizeDeltaDays > 0 && (
              <span style={{ color: '#94a3b8', marginLeft: 6 }}>(+{resizeDeltaDays})</span>
            )}
            <div style={{ color: '#cbd5e1', marginTop: 2, fontWeight: 500 }}>
              Ends {fmtLong(endISO)}
            </div>
          </div>
        );
      })()}

      {/* Touch drag ghost — a clearer floating chip that follows the finger and
          shows the snapped target date so the landing reads at a glance. */}
      {touchGhostPos && touchDragRef.current && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: touchGhostPos.x - 30,
            top:  touchGhostPos.y - 54,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 3,
            background: dragPreview?.conflict ? '#e11d48' : touchDragRef.current.color,
            color: '#fff',
            borderRadius: 10,
            padding: '7px 12px',
            fontSize: 13,
            fontWeight: 800,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.96,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            border: '1.5px solid rgba(255,255,255,0.35)',
            whiteSpace: 'nowrap',
            maxWidth: 190,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transform: 'scale(1.02)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 166 }}>
            {touchDragRef.current.label}
          </span>
          {dragPreview && (
            <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.95 }}>
              {dragPreview.conflict ? '⚠ ' : '→ '}{fmtShort(dragPreview.startDate)}
            </span>
          )}
        </div>
      )}

      {ctxMenu && (
        <CtxMenu
          menu={ctxMenu}
          onDelay={() => setDayPrompt({ action: 'delay',  blockId: ctxMenu.blockId })}
          onExtend={() => setDayPrompt({ action: 'extend', blockId: ctxMenu.blockId })}
          onDelete={() => dispatchWithHistory({ type: 'DELETE_BLOCK', id: ctxMenu.blockId })}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {dayPrompt && (
        <DayPromptModal
          state={dayPrompt}
          skipWeekends={skipWeekends}
          onConfirm={
            dayPrompt.action === 'extend'
              ? handleExtendConfirm
              : handleDelayConfirm
          }
          onClose={() => setDayPrompt(null)}
        />
      )}

      {/* Overlap conflict confirmation — triggered by drag-drop */}
      {pendingMove && (
        <OverlapConfirmModal
          jobLabel={pendingMove.jobLabel}
          newDate={pendingMove.startDate}
          crewName={pendingMove.crewName}
          conflictCount={pendingMove.conflictCount}
          willSplit={pendingMove.willSplit}
          onConfirm={() => {
            dispatchWithHistory({
              type: 'MOVE_BLOCK_PUSH',
              id:        pendingMove.blockId,
              crewId:    pendingMove.crewId,
              startDate: pendingMove.startDate,
              shiftDays: pendingMove.shiftDays,
            });
            setPendingMove(null);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {/* Overlap conflict confirmation — triggered by add-block */}
      {pendingAdd && (
        <OverlapConfirmModal
          jobLabel={pendingAdd.block.jobNumber}
          newDate={pendingAdd.block.startDate}
          crewName={pendingAdd.crewName}
          conflictCount={pendingAdd.conflictCount}
          willSplit={pendingAdd.willSplit}
          onConfirm={() => {
            dispatchWithHistory({
              type:      'ADD_BLOCK_PUSH',
              block:     pendingAdd.block,
              shiftDays: pendingAdd.shiftDays,
            });
            setPendingAdd(null);
          }}
          onCancel={() => setPendingAdd(null)}
        />
      )}

      {showAddModal && (
        <AddBlockModal
          crews={crewsState}
          jobs={jobsState}
          skipWeekends={skipWeekends}
          onAdd={rawBlock => {
            const block = skipWeekends
              ? { ...rawBlock, startDate: snapToWeekday(rawBlock.startDate) }
              : rawBlock;
            const conflicts = findOverlapConflicts(
              blocks, block.crewId, block.startDate, block.durationDays, skipWeekends,
            );
            if (conflicts.length > 0) {
              const crew = crewsState.find(c => c.id === block.crewId);
              setShowAddModal(false);
              setPendingAdd({
                block,
                crewName:      crew?.name ?? block.crewId,
                conflictCount: conflicts.length,
                shiftDays:     block.durationDays,
                willSplit:     conflicts.some(c => c.type === 'job' && c.startDate < block.startDate),
              });
            } else {
              dispatchWithHistory({ type: 'ADD_BLOCK', block });
            }
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showImportModal && (
        <ScheduleImportModal
          crews={crewsState}
          jobs={jobsState}
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showManageCrews && (
        <ManageCrewsModal
          crews={crewsState}
          employees={employeeList}
          onUpdate={setCrewsState}
          onClose={() => setShowManageCrews(false)}
        />
      )}

    </div>
  );
}
