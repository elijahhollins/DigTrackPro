import React, { useState, useReducer, useRef, useCallback, useEffect } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Clock, Calendar, Pencil, Trash2, Briefcase, Users, Wrench, GripHorizontal, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchedulerEmployee {
  id: number;
  name: string;
  role?: string;
}

export interface SchedulerEquipment {
  id: string;
  name: string;
  hourly_rate?: number;
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
  equipmentIds?: string[];  // IDs of equipment assigned to be on site
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

export const MOCK_EQUIPMENT: SchedulerEquipment[] = [
  { id: 'mock-1', name: 'Excavator',      hourly_rate: 150 },
  { id: 'mock-2', name: 'Dump Truck',     hourly_rate: 80  },
  { id: 'mock-3', name: 'Skid Steer',     hourly_rate: 70  },
  { id: 'mock-4', name: 'Concrete Mixer', hourly_rate: 45  },
  { id: 'mock-5', name: 'Compactor',      hourly_rate: 35  },
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

/** Returns true when two schedule intervals [aStart, aStart+aDays) and [bStart, bStart+bDays) overlap. */
const blocksOverlap = (
  aStart: string, aDays: number,
  bStart: string, bDays: number,
): boolean => {
  const aEnd = addDays(aStart, aDays);
  const bEnd = addDays(bStart, bDays);
  return aStart < bEnd && bStart < aEnd;
};

/** Returns blocks of the same crew that overlap with [startDate, startDate+durationDays), excluding excludeId. */
const findOverlapConflicts = (
  blocks: ScheduleBlock[],
  crewId: string,
  startDate: string,
  durationDays: number,
  excludeId?: string,
): ScheduleBlock[] =>
  blocks.filter(
    b =>
      b.crewId === crewId &&
      b.id !== excludeId &&
      blocksOverlap(startDate, durationDays, b.startDate, b.durationDays),
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

type Action =
  | { type: 'MOVE_BLOCK';         id: string; crewId: string; startDate: string }
  | { type: 'MOVE_BLOCK_PUSH';    id: string; crewId: string; startDate: string; shiftDays: number }
  | { type: 'INSERT_DELAY';       blockId: string; days: number }
  | { type: 'EXTEND_JOB';         blockId: string; days: number }
  | { type: 'ADD_BLOCK';          block: ScheduleBlock }
  | { type: 'ADD_BLOCK_PUSH';     block: ScheduleBlock; shiftDays: number }
  | { type: 'DELETE_BLOCK';       id: string }
  | { type: 'REPLACE_ALL';        blocks: ScheduleBlock[] }
  | { type: 'ASSIGN_EQUIPMENT';   blockId: string; equipmentId: string }
  | { type: 'UNASSIGN_EQUIPMENT'; blockId: string; equipmentId: string }
  | { type: 'SHIFT_CREW';         crewId: string; fromDate: string; days: number };

/** Push all blocks for a crew that start on or after `fromDate` forward by `shiftDays`. */
function shiftAfter(
  blocks: ScheduleBlock[],
  crewId: string,
  fromDate: string,
  shiftDays: number,
  excludeId?: string,
): ScheduleBlock[] {
  return blocks.map(b => {
    if (b.crewId === crewId && b.id !== excludeId && b.startDate >= fromDate) {
      return { ...b, startDate: addDays(b.startDate, shiftDays) };
    }
    return b;
  });
}

function reducer(state: ScheduleBlock[], action: Action): ScheduleBlock[] {
  switch (action.type) {
    case 'MOVE_BLOCK':
      return state.map(b =>
        b.id === action.id
          ? { ...b, crewId: action.crewId, startDate: action.startDate }
          : b,
      );

    case 'MOVE_BLOCK_PUSH': {
      // Move the block to its new position, then push all subsequent crew blocks
      // (starting on or after the new start date) forward to make room.
      const moved = state.map(b =>
        b.id === action.id
          ? { ...b, crewId: action.crewId, startDate: action.startDate }
          : b,
      );
      return shiftAfter(moved, action.crewId, action.startDate, action.shiftDays, action.id);
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
      const shifted = shiftAfter(state, job.crewId, job.startDate, action.days);
      return [...shifted, delay];
    }

    case 'EXTEND_JOB': {
      const job = state.find(b => b.id === action.blockId);
      if (!job || job.type !== 'job') return state;
      const oldEnd = addDays(job.startDate, job.durationDays);
      const withExtended = state.map(b =>
        b.id === action.blockId
          ? { ...b, durationDays: b.durationDays + action.days, extended: true }
          : b,
      );
      // Shift blocks that begin at or after the job's original end date
      return shiftAfter(withExtended, job.crewId, oldEnd, action.days, action.blockId);
    }

    case 'ADD_BLOCK':
      return [...state, action.block];

    case 'ADD_BLOCK_PUSH': {
      // Push all existing blocks of the crew that start on or after the new
      // block's start date forward to make room, then insert the new block.
      const shifted = shiftAfter(state, action.block.crewId, action.block.startDate, action.shiftDays);
      return [...shifted, action.block];
    }

    case 'DELETE_BLOCK':
      return state.filter(b => b.id !== action.id);

    case 'REPLACE_ALL':
      return action.blocks;

    case 'ASSIGN_EQUIPMENT':
      return state.map(b =>
        b.id === action.blockId
          ? { ...b, equipmentIds: [...new Set([...(b.equipmentIds ?? []), action.equipmentId])] }
          : b,
      );

    case 'UNASSIGN_EQUIPMENT':
      return state.map(b =>
        b.id === action.blockId
          ? { ...b, equipmentIds: (b.equipmentIds ?? []).filter(id => id !== action.equipmentId) }
          : b,
      );

    case 'SHIFT_CREW':
      return state.map(b =>
        b.crewId === action.crewId && b.startDate >= action.fromDate
          ? { ...b, startDate: addDays(b.startDate, action.days) }
          : b,
      );

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EQUIPMENT TRAY  (draggable equipment chips shown below the toolbar)
// ═══════════════════════════════════════════════════════════════════════════════

const EquipmentTray = ({
  equipment,
  onDragStart,
  onTouchStart,
  activeTouchId,
  editMode,
}: {
  equipment: SchedulerEquipment[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onTouchStart?: (e: React.TouchEvent, id: string) => void;
  activeTouchId?: string | null;
  editMode?: boolean;
}) => (
  <div
    role="toolbar"
    aria-label="Equipment palette — drag items onto job blocks"
    className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white shrink-0 overflow-x-auto no-scrollbar"
    style={{ minHeight: 52, touchAction: 'pan-x' }}
  >
    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0 mr-1">
      <Wrench className="w-3 h-3" /> Equipment
    </span>
    {equipment.length === 0 && (
      <span className="text-xs text-slate-400 italic">No equipment loaded</span>
    )}
    {equipment.map(eq => (
      <div
        key={eq.id}
        draggable
        onDragStart={e => onDragStart(e, eq.id)}
        onTouchStart={onTouchStart ? e => onTouchStart(e, eq.id) : undefined}
        title={eq.hourly_rate ? `$${eq.hourly_rate}/hr — drag to assign` : 'Drag to assign'}
        className={`flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg border text-xs font-semibold select-none shrink-0 transition-all ${
          activeTouchId === eq.id
            ? 'border-brand bg-brand/10 text-brand opacity-60'
            : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand/40 hover:text-brand hover:bg-brand/10 hover:-translate-y-px active:opacity-70'
        } ${editMode ? 'cursor-grab' : 'cursor-default'}`}
        style={{ userSelect: 'none', touchAction: editMode ? 'none' : 'pan-x' }}
      >
        <span className="flex items-center justify-center w-4 h-4 rounded-md bg-slate-100 text-slate-400 shrink-0">
          <Wrench className="w-2.5 h-2.5" />
        </span>
        {eq.name}
        {eq.hourly_rate !== undefined && (
          <span className="text-slate-400 font-medium">${eq.hourly_rate}/hr</span>
        )}
      </div>
    ))}
    {!editMode && equipment.length > 0 && (
      <span className="text-[11px] text-slate-400 italic ml-1 shrink-0">Enable edit mode to drag</span>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK EQUIPMENT MODAL  (view & manage equipment assigned to a specific block)
// ═══════════════════════════════════════════════════════════════════════════════

const BlockEquipmentModal = ({
  block,
  job,
  crew,
  equipmentList,
  onAssign,
  onUnassign,
  onClose,
}: {
  block: ScheduleBlock;
  job: JobOption | undefined;
  crew: Crew | undefined;
  equipmentList: SchedulerEquipment[];
  onAssign: (equipmentId: string) => void;
  onUnassign: (equipmentId: string) => void;
  onClose: () => void;
}) => {
  const assigned  = block.equipmentIds ?? [];
  const available = equipmentList.filter(eq => !assigned.includes(eq.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="equip-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 id="equip-modal-title" className="text-base font-bold text-slate-900">Equipment on Site</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {block.jobNumber}{job ? ` · ${job.location}` : ''}{crew ? ` · ${crew.name}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Assigned equipment */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Assigned ({assigned.length})
            </p>
            {assigned.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No equipment assigned yet — drag from the tray or add below.</p>
            ) : (
              <ul className="space-y-1.5">
                {assigned.map(id => {
                  const eq = equipmentList.find(e => e.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-3.5 h-3.5 text-brand shrink-0" />
                        <span className="text-sm font-medium text-slate-800">{eq?.name ?? `Equipment #${id}`}</span>
                        {eq?.hourly_rate !== undefined && (
                          <span className="text-xs text-slate-400">${eq.hourly_rate}/hr</span>
                        )}
                      </div>
                      <button
                        onClick={() => onUnassign(id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Remove"
                        aria-label={`Remove ${eq?.name ?? `equipment ${id}`}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Add more equipment */}
          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Equipment</p>
              <ul className="space-y-1.5">
                {available.map(eq => (
                  <li key={eq.id}>
                    <button
                      onClick={() => onAssign(eq.id)}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:border-brand/25 hover:bg-brand/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700">{eq.name}</span>
                        {eq.hourly_rate !== undefined && (
                          <span className="text-xs text-slate-400">${eq.hourly_rate}/hr</span>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-brand" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

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

const BlockTooltip = ({ tip }: { tip: TooltipState }) => {
  const { block, job, crew } = tip;
  const endDate = addDays(block.startDate, block.durationDays - 1);
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
  onConfirm,
  onClose,
}: {
  state: DayPromptState;
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
          Number of Days
        </label>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 mb-4 bg-white"
        >
          {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>
          ))}
        </select>
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
  onConfirm,
  onCancel,
}: {
  jobLabel: string;
  newDate: string;
  crewName: string;
  conflictCount: number;
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
        Push the conflicting block{conflictCount !== 1 ? 's' : ''} and everything after
        them into the future?
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
// MANAGE JOBS MODAL  (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

const ManageJobsModal = ({
  jobs,
  onUpdate,
  onClose,
}: {
  jobs: JobOption[];
  onUpdate: (jobs: JobOption[]) => void;
  onClose: () => void;
}) => {
  const blank: JobOption = { jobNumber: '', location: '', estimatedDays: 1 };
  const [local, setLocal]           = useState<JobOption[]>(jobs);
  const [editingNum, setEditNum]    = useState<string | null>(null);
  const [editJob, setEditJob]       = useState<JobOption>(blank);
  const [newJob, setNewJob]         = useState<JobOption>(blank);
  const [dupError, setDupError]     = useState('');

  const startEdit = (j: JobOption) => { setEditNum(j.jobNumber); setEditJob({ ...j }); };
  const cancelEdit = () => setEditNum(null);
  const saveEdit = () => {
    if (!editingNum || !editJob.jobNumber.trim()) return;
    const newNum = editJob.jobNumber.trim();
    // Guard against renaming to a job number already used by a different entry
    if (newNum !== editingNum && local.some(j => j.jobNumber === newNum)) {
      setDupError('Job number already exists');
      return;
    }
    setDupError('');
    setLocal(prev => prev.map(j => j.jobNumber === editingNum ? { ...editJob, jobNumber: newNum, location: editJob.location.trim() } : j));
    setEditNum(null);
  };
  const deleteJob = (num: string) => setLocal(prev => prev.filter(j => j.jobNumber !== num));
  const addJob = () => {
    if (!newJob.jobNumber.trim() || !newJob.location.trim()) return;
    if (local.some(j => j.jobNumber === newJob.jobNumber.trim())) { setDupError('Job number already exists'); return; }
    setDupError('');
    setLocal(prev => [...prev, { jobNumber: newJob.jobNumber.trim(), location: newJob.location.trim(), estimatedDays: 1 }]);
    setNewJob(blank);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-brand" />
            Manage Jobs
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {local.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-6 italic">No jobs yet. Add one below.</p>
          )}
          {local.map(j => {
            if (editingNum === j.jobNumber) {
              return (
                <div key={j.jobNumber} className="p-3 bg-brand/10 rounded-xl border border-brand/20 space-y-2">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editJob.jobNumber}
                      onChange={e => setEditJob(p => ({ ...p, jobNumber: e.target.value }))}
                      className="w-28 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10"
                      placeholder="Job #"
                    />
                    <input
                      value={editJob.location}
                      onChange={e => setEditJob(p => ({ ...p, location: e.target.value }))}
                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10 min-w-0"
                      placeholder="Location"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors">Save</button>
                    <button onClick={cancelEdit} className="px-4 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={j.jobNumber} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/20">{j.jobNumber}</span>
                  </div>
                  <div className="text-sm text-slate-700 truncate mt-0.5">{j.location}</div>
                </div>
                <button onClick={() => startEdit(j)} title="Edit" className="p-1.5 text-slate-400 hover:text-brand transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteJob(j.jobNumber)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-slate-100 space-y-3 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add New Job</p>
          {dupError && <p className="text-xs text-red-500">{dupError}</p>}
          <div className="flex gap-2">
            <input
              value={newJob.jobNumber}
              onChange={e => { setDupError(''); setNewJob(p => ({ ...p, jobNumber: e.target.value })); }}
              className="w-28 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10"
              placeholder="Job #"
            />
            <input
              value={newJob.location}
              onChange={e => setNewJob(p => ({ ...p, location: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addJob()}
              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/10 min-w-0"
              placeholder="Location"
            />
            <button
              onClick={addJob}
              disabled={!newJob.jobNumber.trim() || !newJob.location.trim()}
              className="px-3 py-2 bg-brand hover:opacity-90 text-white rounded-lg transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
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
  onAdd,
  onClose,
}: {
  crews: Crew[];
  jobs: JobOption[];
  onAdd: (block: ScheduleBlock) => void;
  onClose: () => void;
}) => {
  const [crewId,       setCrewId]   = useState(crews[0]?.id ?? '');
  const [jobNum,       setJobNum]   = useState(jobs[0]?.jobNumber ?? '');
  const [startDate,    setStart]    = useState(todayISO);
  const [durationDays, setDuration] = useState(5);

  const selectedJob = jobs.find(j => j.jobNumber === jobNum);

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
            <select
              value={crewId}
              onChange={e => setCrewId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 bg-white"
              required
            >
              {crews.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.size} workers)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Job Number
            </label>
            <select
              value={jobNum}
              onChange={e => setJobNum(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/10 bg-white"
              required
            >
              {jobs.map(j => (
                <option key={j.jobNumber} value={j.jobNumber}>
                  {j.jobNumber} — {j.location}
                </option>
              ))}
            </select>
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
                Duration (days)
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
  isAdmin?: boolean;
  editMode?: boolean;
  onDelete?: () => void;
  equipmentCount?: number;
  isEquipDragOver?: boolean;
  onEquipmentDrop?: (equipmentId: string) => void;
  onEquipmentDragOver?: () => void;
  onEquipmentDragLeave?: () => void;
  onEquipmentClick?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  onResizeTouchStart?: (e: React.TouchEvent) => void;
}

const JobBlock = ({
  block, job, left, width, color, isDragging,
  isAdmin, editMode, onDelete,
  equipmentCount, isEquipDragOver, onEquipmentDrop, onEquipmentDragOver, onEquipmentDragLeave, onEquipmentClick,
  onDragStart, onDragEnd, onContextMenu,
  onMouseEnter, onMouseMove, onMouseLeave, onTouchStart,
  onResizeStart, onResizeTouchStart,
}: JobBlockProps) => {
  const isDelay   = block.type === 'delay';
  const bgColor   = isDelay ? '#64748b' : color;
  const blockW    = Math.max(width - BLOCK_MARGIN * 2, 24);
  const blockH    = ROW_HEIGHT - BLOCK_MARGIN * 2;

  return (
    <div
      data-block-id={block.id}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchStart={editMode ? onTouchStart : undefined}
      onDragOver={e => {
        if (e.dataTransfer.types.includes('application/x-equip-id')) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          onEquipmentDragOver?.();
        }
      }}
      onDragLeave={e => {
        if (e.dataTransfer.types.includes('application/x-equip-id')) {
          onEquipmentDragLeave?.();
        }
      }}
      onDrop={e => {
        const equipId = e.dataTransfer.getData('application/x-equip-id');
        if (equipId) {
          e.stopPropagation();
          e.preventDefault();
          onEquipmentDrop?.(equipId);
          onEquipmentDragLeave?.();
        }
      }}
      style={{
        position: 'absolute',
        left: left + BLOCK_MARGIN,
        top: BLOCK_MARGIN,
        width: blockW,
        height: blockH,
        backgroundColor: bgColor,
        backgroundImage: isDelay
          ? 'repeating-linear-gradient(45deg, transparent, transparent 7px, rgba(255,255,255,0.10) 7px, rgba(255,255,255,0.10) 14px)'
          : 'linear-gradient(160deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 42%, rgba(0,0,0,0.14) 100%)',
        opacity: isDragging ? 0.4 : 1,
        borderRadius: 10,
        cursor: editMode ? 'grab' : 'default',
        userSelect: 'none',
        touchAction: editMode ? 'none' : 'auto',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 10px 0 13px',
        boxSizing: 'border-box',
        boxShadow: isEquipDragOver
          ? '0 0 0 2px #fff, 0 0 0 4px var(--brand-primary, #3b82f6)'
          : isDragging
            ? 'none'
            : 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(15,23,42,0.20), 0 4px 10px rgba(15,23,42,0.12)',
        transform: isDragging ? 'scale(0.98)' : undefined,
        transition: 'opacity 0.12s, box-shadow 0.12s, transform 0.12s',
        zIndex: 5,
      }}
    >
      {/* Left accent strip — adds visual structure / a "tab" feel */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          background: isDelay
            ? 'rgba(255,255,255,0.35)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.25))',
          pointerEvents: 'none',
        }}
      />
      {/* Extended dashed border */}
      {block.extended && !isDelay && (
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            border: '2px dashed rgba(251,191,36,0.85)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Extended corner badge */}
      {block.extended && !isDelay && (
        <div
          title="Extended"
          style={{
            position: 'absolute', top: 0, right: 0,
            width: 0, height: 0,
            borderStyle: 'solid',
            borderWidth: '0 16px 16px 0',
            borderColor: `transparent #fbbf24 transparent transparent`,
          }}
        />
      )}

      {/* Edit mode drag handle — visible on top-left of block in edit mode */}
      {editMode && (
        <div
          style={{
            position: 'absolute', top: 3, left: 3,
            color: 'rgba(255,255,255,0.65)',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          <GripHorizontal style={{ width: 10, height: 10 }} />
        </div>
      )}

      {/* Resize handle — visible on right edge in edit mode for job blocks */}
      {editMode && !isDelay && (
        <div
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart?.(e); }}
          onTouchStart={e => { e.stopPropagation(); e.preventDefault(); onResizeTouchStart?.(e); }}
          title="Drag to extend job duration"
          style={{
            position: 'absolute',
            right: 0, top: 0,
            width: 10, height: '100%',
            cursor: 'col-resize',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            zIndex: 15,
          }}
        >
          <div style={{ width: 2, height: 6, background: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
          <div style={{ width: 2, height: 6, background: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
          <div style={{ width: 2, height: 6, background: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
        </div>
      )}

      {/* Admin delete button — visible on block for mobile/touch accessibility */}
      {isAdmin && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDelete(); } }}
          title="Delete block"
          aria-label="Delete block"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.35)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: 10,
            lineHeight: 1,
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      )}

      {/* Equipment badge — bottom-left; clickable to open equipment modal */}
      {!isDelay && (equipmentCount ?? 0) > 0 && onEquipmentClick && (
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onEquipmentClick(); }}
          onMouseDown={e => e.stopPropagation()}
          title={`${equipmentCount} piece${equipmentCount !== 1 ? 's' : ''} of equipment on site — click to manage`}
          aria-label={`${equipmentCount} equipment assigned — click to manage`}
          style={{
            position: 'absolute',
            bottom: 3,
            left: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'rgba(0,0,0,0.35)',
            border: 'none',
            borderRadius: 4,
            padding: '1px 4px',
            cursor: 'pointer',
            zIndex: 10,
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          <Wrench style={{ width: 8, height: 8, flexShrink: 0 }} aria-hidden="true" />
          {equipmentCount}
        </button>
      )}

      {/* Label */}
      <div style={{ color: '#fff', fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.01em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textShadow: '0 1px 2px rgba(0,0,0,0.28)' }}>
        {block.jobNumber}
      </div>
      {!isDelay && job && blockW > 64 && (
        <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 9.5, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
          {job.location}
        </div>
      )}
      {blockW > 40 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', marginTop: 4, padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.20)', color: 'rgba(255,255,255,0.95)', fontSize: 9, fontWeight: 600, lineHeight: 1.3, backdropFilter: 'blur(2px)' }}>
          {block.durationDays}d
        </div>
      )}
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
  const [equipmentList, setEquipmentList] = useState<SchedulerEquipment[]>([]);
  const [blocks, dispatch] = useReducer(reducer, initialBlocks);
  const [view, setView]    = useState<'week' | 'month'>('week');
  const [viewOffset, setViewOffset] = useState(0); // days from default start

  // Guards to avoid saving before the initial Supabase load completes
  const dbLoadedRef = useRef(false);

  // ── Load schedule data from Supabase on mount ──────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    Promise.all([
      supabase.from('schedule_crews').select('id, name, member_ids').eq('company_id', companyId).order('created_at'),
      supabase.from('schedule_job_options').select('job_number, location, estimated_days').eq('company_id', companyId).order('created_at'),
      supabase.from('schedule_blocks').select('id, crew_id, job_number, start_date, duration_days, type, extended, equipment_ids').eq('company_id', companyId),
    ]).then(([crewsRes, jobsRes, blocksRes]) => {
      if (crewsRes.error)  console.error('[Scheduler] Failed to load crews:',  crewsRes.error.message);
      if (jobsRes.error)   console.error('[Scheduler] Failed to load jobs:',   jobsRes.error.message);
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
      {
        // Hybrid job source: union the board's own saved job options (DB) with
        // the jobs passed in from DigTrackPro (initialJobs), de-duped by
        // jobNumber with the saved DB row winning. This lets the board default
        // from existing DigTrackPro jobs while still allowing ad-hoc entries.
        const dbJobs = (jobsRes.data ?? []).map(r => ({
          jobNumber:     r.job_number,
          location:      r.location,
          estimatedDays: r.estimated_days,
        }));
        const seen = new Set(dbJobs.map(j => j.jobNumber));
        const merged = [...dbJobs, ...initialJobs.filter(j => !seen.has(j.jobNumber))];
        if (merged.length > 0) setJobsState(merged);
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
          equipmentIds:  r.equipment_ids ?? [],
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

  // ── Persist job options to Supabase whenever they change (debounced 600 ms)
  useEffect(() => {
    if (!companyId || !dbLoadedRef.current) return;
    const rows = jobsState.map(j => ({
      company_id:     companyId,
      job_number:     j.jobNumber,
      location:       j.location,
      estimated_days: j.estimatedDays,
    }));
    if (rows.length === 0) return;
    const t = setTimeout(() => {
      supabase.from('schedule_job_options').upsert(rows, { onConflict: 'company_id,job_number' })
        .then(({ error }) => { if (error) console.error('[Scheduler] Failed to save job options:', error.message); });
    }, 600);
    return () => clearTimeout(t);
  }, [jobsState, companyId]);

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
      equipment_ids: b.equipmentIds ?? [],
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

  // Fetch equipment from Supabase when companyId is available
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('inventory_items')
      .select('id, name, hourly_rate')
      .eq('company_id', companyId)
      .eq('item_type', 'EQUIPMENT')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('[Scheduler] Failed to load equipment:', error.message);
        else if (data && data.length > 0) setEquipmentList(data as SchedulerEquipment[]);
      });
  }, [companyId]);

  const dayWidth  = view === 'week' ? 60 : 24;
  const totalDays = view === 'week' ? 28 : 90;

  // View window: start 7 days before today + navigation offset
  const viewStart = addDays(addDays(todayISO, -7), viewOffset);
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

  // Resize-drag state (dragging the right edge of a job block to extend it)
  const [resizingId,      setResizingId]      = useState<string | null>(null);
  const [resizeDeltaDays, setResizeDeltaDays] = useState(0);
  const resizeRef = useRef<{
    blockId:      string;
    startX:       number;
    origDuration: number;
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
  const [showManageCrews,   setShowManageCrews]   = useState(false);
  const [showManageJobs,    setShowManageJobs]    = useState(false);

  // Equipment tray & block-equipment modal
  const [showEquipTray,    setShowEquipTray]    = useState(false);
  const [equipModalBlockId, setEquipModalBlockId] = useState<string | null>(null);
  const [equipDragOverBlockId, setEquipDragOverBlockId] = useState<string | null>(null);

  // Pending overlap-conflict confirmation (drag-move)
  const [pendingMove, setPendingMove] = useState<{
    blockId: string;
    crewId: string;
    startDate: string;
    jobLabel: string;
    crewName: string;
    conflictCount: number;
    shiftDays: number;
  } | null>(null);

  // Pending overlap-conflict confirmation (add-block)
  const [pendingAdd, setPendingAdd] = useState<{
    block: ScheduleBlock;
    crewName: string;
    conflictCount: number;
    shiftDays: number;
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
    dispatch(action);
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

  const handleDragEnd = useCallback(() => setDraggingId(null), []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

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
    const newStart   = addDays(viewStart, dayIndex - dragOffsetDays);

    setDraggingId(null);

    const allBlocks   = blocksRef.current;
    const movingBlock = allBlocks.find(b => b.id === blockId);
    if (!movingBlock) return;

    const conflicts = findOverlapConflicts(allBlocks, crewId, newStart, movingBlock.durationDays, blockId);
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
      });
    } else {
      dispatchWithHistory({ type: 'MOVE_BLOCK', id: blockId, crewId, startDate: newStart });
    }
  }, [dayWidth, viewStart, dragOffsetDays, dispatchWithHistory]);

  // ── Equipment drag handlers ──────────────────────────────────────────────────

  const handleEquipDragStart = useCallback((e: React.DragEvent, equipmentId: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-equip-id', String(equipmentId));
  }, []);

  const handleEquipDropOnBlock = useCallback((blockId: string, equipmentId: string) => {
    dispatchWithHistory({ type: 'ASSIGN_EQUIPMENT', blockId, equipmentId });
    setEquipDragOverBlockId(null);
  }, [dispatchWithHistory]);

  // ── Equipment touch-drag (mobile — mirrors job-block touch-drag) ────────────
  // Uses Touch Events (touchstart/touchmove/touchend) with passive:false so that
  // e.preventDefault() actually suppresses scroll — the same pattern job blocks
  // use and the one that works reliably on iOS Safari.

  const equipTouchRef = useRef<string | null>(null); // equipment id being touch-dragged
  const [equipTouchGhostPos, setEquipTouchGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [equipTouchActiveId, setEquipTouchActiveId] = useState<string | null>(null);

  const handleEquipTouchStart = useCallback((e: React.TouchEvent, equipmentId: string) => {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    equipTouchRef.current = equipmentId;
    setEquipTouchActiveId(equipmentId);
    setEquipTouchGhostPos({ x: touch.clientX, y: touch.clientY });
  }, [editMode]);

  useEffect(() => {
    if (!equipTouchGhostPos) return;

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      setEquipTouchGhostPos({ x: touch.clientX, y: touch.clientY });
      const els = document.elementsFromPoint(touch.clientX, touch.clientY);
      const blockEl = els.find(el => (el as HTMLElement).dataset?.blockId) as HTMLElement | undefined;
      setEquipDragOverBlockId(blockEl?.dataset.blockId ?? null);
    };

    const onEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const els = document.elementsFromPoint(touch.clientX, touch.clientY);
      const blockEl = els.find(el => (el as HTMLElement).dataset?.blockId) as HTMLElement | undefined;
      const targetBlockId = blockEl?.dataset.blockId;
      if (targetBlockId && equipTouchRef.current !== null) {
        dispatchWithHistory({ type: 'ASSIGN_EQUIPMENT', blockId: targetBlockId, equipmentId: equipTouchRef.current });
      }
      equipTouchRef.current = null;
      setEquipTouchActiveId(null);
      setEquipTouchGhostPos(null);
      setEquipDragOverBlockId(null);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove, { passive: false } as EventListenerOptions);
      window.removeEventListener('touchend', onEnd);
    };
  }, [equipTouchGhostPos, dispatchWithHistory]);

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
  dayWidthRef.current    = dayWidth;
  viewStartRef.current   = viewStart;

  useEffect(() => {
    if (!touchGhostPos) return; // nothing being dragged

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchDragRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const drag = touchDragRef.current;
      if (!drag || !scrollRef.current) {
        touchDragRef.current = null;
        setDraggingId(null);
        setTouchGhostPos(null);
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
      const newStart   = addDays(viewStartRef.current, dayIndex - drag.offsetDays);

      if (targetCrew) {
        const allBlocks   = blocksRef.current;
        const movingBlock = allBlocks.find(b => b.id === drag.blockId);
        if (movingBlock) {
          const conflicts = findOverlapConflicts(
            allBlocks, targetCrew.id, newStart, movingBlock.durationDays, drag.blockId,
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
            });
          } else {
            dispatchWithHistory({ type: 'MOVE_BLOCK', id: drag.blockId, crewId: targetCrew.id, startDate: newStart });
          }
        }
      }
      touchDragRef.current = null;
      setDraggingId(null);
      setTouchGhostPos(null);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [touchGhostPos]);

  // ── Resize-drag handlers (right-edge drag in edit mode) ─────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent, block: ScheduleBlock) => {
    resizeRef.current = {
      blockId:      block.id,
      startX:       e.clientX,
      origDuration: block.durationDays,
      crewId:       block.crewId,
    };
    setResizingId(block.id);
    setResizeDeltaDays(0);
  }, []);

  const handleResizeTouchStart = useCallback((e: React.TouchEvent, block: ScheduleBlock) => {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    resizeRef.current = {
      blockId:      block.id,
      startX:       touch.clientX,
      origDuration: block.durationDays,
      crewId:       block.crewId,
    };
    setResizingId(block.id);
    setResizeDeltaDays(0);
  }, [editMode]);

  useEffect(() => {
    if (!resizingId) return;

    const onMouseMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r || dayWidthRef.current === 0) return;
      const deltaX    = e.clientX - r.startX;
      const deltaDays = Math.max(0, Math.round(deltaX / dayWidthRef.current));
      setResizeDeltaDays(deltaDays);
    };

    const onMouseUp = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dw = dayWidthRef.current;
      const deltaDays = dw > 0
        ? Math.max(0, Math.round((e.clientX - r.startX) / dw))
        : 0;
      if (deltaDays > 0) {
        dispatch({ type: 'EXTEND_JOB', blockId: r.blockId, days: deltaDays });
      }
      resizeRef.current = null;
      setResizingId(null);
      setResizeDeltaDays(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      const r = resizeRef.current;
      if (!r || dayWidthRef.current === 0) return;
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX    = touch.clientX - r.startX;
      const deltaDays = Math.max(0, Math.round(deltaX / dayWidthRef.current));
      setResizeDeltaDays(deltaDays);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dw = dayWidthRef.current;
      const touch = e.changedTouches[0];
      const deltaDays = dw > 0
        ? Math.max(0, Math.round((touch.clientX - r.startX) / dw))
        : 0;
      if (deltaDays > 0) {
        dispatch({ type: 'EXTEND_JOB', blockId: r.blockId, days: deltaDays });
      }
      resizeRef.current = null;
      setResizingId(null);
      setResizeDeltaDays(0);
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
  }, [resizingId, dispatch]);

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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white select-none rounded-2xl border border-slate-200 overflow-hidden shadow-sm" style={{ minHeight: 0 }}>
      {/* ─── Toolbar ─── */}
      <div
        className="flex items-center gap-x-3 gap-y-2.5 px-5 py-3.5 shrink-0 flex-wrap"
        style={{
          background: 'linear-gradient(120deg, #0a142d 0%, #11244f 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)',
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
          <div className="leading-tight">
            <h2 className="font-display text-white font-bold text-[15px] tracking-tight">Dispatch Board</h2>
            <p className="text-[10px] text-slate-400 font-medium">Crew &amp; job scheduling</p>
          </div>
        </div>

        {/* View toggle — segmented control */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10">
          {(['week', 'month'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-xs font-semibold capitalize rounded-md transition-all ${
                view === v
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Navigation cluster */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10">
          <button
            onClick={() => setViewOffset(v => v - (view === 'week' ? 14 : 30))}
            aria-label="Previous"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewOffset(0)}
            className="px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white rounded-md transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setViewOffset(v => v + (view === 'week' ? 14 : 30))}
            aria-label="Next"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Visible date range */}
        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md bg-white/5 text-slate-300 text-xs font-medium tabular-nums">
          {fmtShort(viewStart)} – {fmtShort(addDays(viewStart, totalDays - 1))}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Edit mode toggle */}
          <button
            onClick={() => setEditMode(m => !m)}
            aria-pressed={editMode}
            aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode to drag blocks'}
            title={editMode ? 'Exit edit mode' : 'Edit: drag blocks to reschedule'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border ${
              editMode
                ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-sm'
                : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" /> {editMode ? 'Editing' : 'Edit'}
          </button>
          {/* Undo button — visible only in edit mode */}
          {editMode && (
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo last action"
              title="Undo last action (Ctrl+Z)"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                canUndo
                  ? 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                  : 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
          )}

          {/* Divider */}
          {isAdmin && <span className="w-px h-5 bg-white/10 mx-0.5" aria-hidden="true" />}

          {isAdmin && (
            <>
              <button
                onClick={() => setShowManageCrews(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-white/10"
              >
                <Users className="w-3.5 h-3.5" /> Crews
              </button>
              <button
                onClick={() => setShowManageJobs(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-white/10"
              >
                <Briefcase className="w-3.5 h-3.5" /> Jobs
              </button>
            </>
          )}
          <button
            onClick={() => setShowEquipTray(t => !t)}
            aria-pressed={showEquipTray}
            aria-label="Toggle equipment tray"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              showEquipTray
                ? 'bg-amber-500 text-white border-amber-400 shadow-sm'
                : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> Equipment
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-all shadow-brand/20 hover:-translate-y-px"
          >
            <Plus className="w-3.5 h-3.5" /> Add Job
          </button>
        </div>
      </div>

      {/* ─── Equipment Tray ─── */}
      {showEquipTray && (
        <EquipmentTray
          equipment={equipmentList}
          onDragStart={handleEquipDragStart}
          onTouchStart={handleEquipTouchStart}
          activeTouchId={equipTouchActiveId}
          editMode={editMode}
        />
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        <div style={{ minWidth: CREW_COL_W + totalGridWidth }}>

          {/* Month header */}
          <div
            className="flex"
            style={{
              height: HEADER_MONTH_H,
              position: 'sticky', top: 0, zIndex: 30,
              background: '#ffffff',
              borderBottom: '1px solid #eef2f7',
            }}
          >
            <div
              style={{
                width: CREW_COL_W, minWidth: CREW_COL_W, height: HEADER_MONTH_H,
                borderRight: '1px solid #e8edf3',
                flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 31,
                background: '#ffffff',
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
                    paddingLeft: 10, boxSizing: 'border-box',
                    borderRight: '1px solid #eef2f7',
                    color: '#64748b',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
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
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: CREW_COL_W, minWidth: CREW_COL_W, height: HEADER_DAY_H,
                borderRight: '1px solid #e8edf3',
                display: 'flex', alignItems: 'center',
                paddingLeft: 14, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 31,
                background: '#f8fafc',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>
                Crews
              </span>
            </div>
            <div style={{ position: 'relative', width: totalGridWidth, height: HEADER_DAY_H }}>
              {days.map((day, i) => {
                const d = parseDate(day);
                const isToday   = day === todayISO;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const showLabel = view === 'week' || i % 3 === 0;
                return (
                  <div
                    key={day}
                    style={{
                      position: 'absolute',
                      left: i * dayWidth, width: dayWidth, height: HEADER_DAY_H,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 1,
                      borderRight: '1px solid #eef2f7',
                      backgroundColor: isToday ? 'var(--brand-ring)' : isWeekend ? 'rgba(148,163,184,0.06)' : undefined,
                      boxSizing: 'border-box',
                    }}
                  >
                    {showLabel && (
                      <>
                        <span style={{ fontSize: 9, color: isToday ? 'var(--brand-primary)' : isWeekend ? '#cbd5e1' : '#94a3b8', fontWeight: isToday ? 700 : 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
                        </span>
                        {isToday ? (
                          <span
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              minWidth: 18, height: 18, padding: '0 5px',
                              borderRadius: 999,
                              background: 'var(--brand-primary)',
                              color: '#fff', fontSize: 10, fontWeight: 700,
                              boxShadow: '0 2px 6px var(--brand-shadow)',
                            }}
                          >
                            {d.getDate()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: isWeekend ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
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

            return (
              <div key={crew.id} className="flex" style={{ height: ROW_HEIGHT }}>
                {/* Sticky crew label */}
                <div
                  style={{
                    width: CREW_COL_W, minWidth: CREW_COL_W, height: ROW_HEIGHT,
                    position: 'sticky', left: 0, zIndex: 20,
                    background: ci % 2 === 0 ? '#ffffff' : '#fbfcfe',
                    borderRight: '1px solid #e8edf3',
                    borderBottom: '1px solid #eef2f7',
                    display: 'flex', alignItems: 'center',
                    padding: '0 10px 0 14px', gap: 10,
                    flexShrink: 0,
                  }}
                >
                  {/* Crew avatar chip */}
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${color}14`,
                      border: `1px solid ${color}33`,
                      color,
                      fontSize: 14, fontWeight: 700,
                      fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    }}
                  >
                    {crew.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {crew.name}
                    </div>
                    {(() => {
                      const memberNames = crew.memberIds.length > 0 && employeeList.length > 0
                        ? crew.memberIds
                            .map(id => employeeList.find(e => e.id === id)?.name)
                            .filter(Boolean) as string[]
                        : [];
                      const workerCount = crew.memberIds.length || crew.size;
                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 10, fontWeight: 500, marginTop: 2 }}>
                            <Users style={{ width: 10, height: 10, flexShrink: 0 }} />
                            {workerCount} {workerCount === 1 ? 'worker' : 'workers'}
                          </div>
                          {memberNames.length > 0 && (
                            <div
                              style={{ color: '#94a3b8', fontSize: 9, marginTop: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                              title={memberNames.join(', ')}
                            >
                              {memberNames.slice(0, 2).join(', ')}{memberNames.length > 2 ? ` +${memberNames.length - 2}` : ''}
                            </div>
                          )}
                        </>
                      );
                    })()}
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
                      width: 24, height: 24,
                      borderRadius: 7,
                      background: hoverDelayCrewId === crew.id ? 'rgba(245,158,11,0.14)' : '#f1f5f9',
                      border: `1px solid ${hoverDelayCrewId === crew.id ? 'rgba(245,158,11,0.4)' : '#e2e8f0'}`,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: hoverDelayCrewId === crew.id ? '#d97706' : '#94a3b8',
                      padding: 0,
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    }}
                  >
                    <Clock style={{ width: 12, height: 12 }} />
                  </button>
                </div>

                {/* Drop-zone row */}
                <div
                  style={{
                    position: 'relative',
                    width: totalGridWidth, height: ROW_HEIGHT,
                    background: ci % 2 === 0 ? '#ffffff' : '#fafbfd',
                    borderBottom: '1px solid #eef2f7',
                  }}
                  onDragOver={editMode ? handleDragOver : undefined}
                  onDrop={editMode ? e => handleDrop(e, crew.id) : undefined}
                >
                  {/* Day cells (grid lines + weekend shading + today column) */}
                  {days.map((day, i) => {
                    const isWeekend = [0, 6].includes(parseDate(day).getDay());
                    const isToday   = day === todayISO;
                    return (
                      <div
                        key={day}
                        style={{
                          position: 'absolute',
                          left: i * dayWidth, top: 0,
                          width: dayWidth, height: ROW_HEIGHT,
                          borderRight: '1px solid #eef2f7',
                          backgroundColor: isToday
                            ? 'var(--brand-ring)'
                            : isWeekend ? 'rgba(148,163,184,0.05)' : undefined,
                          boxSizing: 'border-box',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  })}

                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset <= totalGridWidth && (
                    <div
                      style={{
                        position: 'absolute', left: todayOffset,
                        top: 0, width: 2, height: ROW_HEIGHT,
                        background: 'linear-gradient(180deg, #f43f5e, #e11d48)',
                        boxShadow: '0 0 6px rgba(244,63,94,0.5)',
                        zIndex: 8, pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* Job/Delay blocks */}
                  {crewBlocks.map(block => {
                    const left  = diffDays(block.startDate, viewStart) * dayWidth;
                    const isResizing = resizingId === block.id;
                    const width = (block.durationDays + (isResizing ? resizeDeltaDays : 0)) * dayWidth;
                    if (left + width < 0 || left > totalGridWidth) return null;
                    const job = jobsState.find(j => j.jobNumber === block.jobNumber);
                    const eqCount = (block.equipmentIds ?? []).length;
                    return (
                      <JobBlock
                        key={block.id}
                        block={block}
                        crew={crew}
                        job={job}
                        left={left}
                        width={width}
                        color={color}
                        isDragging={draggingId === block.id}
                        isAdmin={isAdmin}
                        editMode={editMode}
                        onDelete={() => dispatchWithHistory({ type: 'DELETE_BLOCK', id: block.id })}
                        equipmentCount={eqCount}
                        isEquipDragOver={equipDragOverBlockId === block.id}
                        onEquipmentDrop={equipId => handleEquipDropOnBlock(block.id, equipId)}
                        onEquipmentDragOver={() => setEquipDragOverBlockId(block.id)}
                        onEquipmentDragLeave={() => setEquipDragOverBlockId(null)}
                        onEquipmentClick={() => setEquipModalBlockId(block.id)}
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
        </div>
      </div>

      {/* ─── Overlays ─── */}
      {tooltip && <BlockTooltip tip={tooltip} />}

      {/* Touch drag ghost */}
      {touchGhostPos && touchDragRef.current && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: touchGhostPos.x - 24,
            top:  touchGhostPos.y - 20,
            background: touchDragRef.current.color,
            color: '#fff',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 700,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.9,
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {touchDragRef.current.label}
        </div>
      )}

      {/* Equipment touch-drag ghost (mobile) */}
      {equipTouchGhostPos && equipTouchActiveId !== null && (() => {
        const eq = equipmentList.find(e => e.id === equipTouchActiveId);
        const onBlock = equipDragOverBlockId !== null;
        return (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: equipTouchGhostPos.x + 14,
              top:  equipTouchGhostPos.y + 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: onBlock ? '#2563eb' : '#1e293b',
              color: '#fff',
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap',
              transform: 'rotate(3deg)',
              transition: 'background 0.1s',
            }}
          >
            <Wrench style={{ width: 12, height: 12, flexShrink: 0 }} />
            {eq?.name ?? 'Equipment'}
          </div>
        );
      })()}

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
          onAdd={block => {
            const conflicts = findOverlapConflicts(
              blocks, block.crewId, block.startDate, block.durationDays,
            );
            if (conflicts.length > 0) {
              const crew = crewsState.find(c => c.id === block.crewId);
              setShowAddModal(false);
              setPendingAdd({
                block,
                crewName:      crew?.name ?? block.crewId,
                conflictCount: conflicts.length,
                shiftDays:     block.durationDays,
              });
            } else {
              dispatchWithHistory({ type: 'ADD_BLOCK', block });
            }
          }}
          onClose={() => setShowAddModal(false)}
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

      {showManageJobs && (
        <ManageJobsModal
          jobs={jobsState}
          onUpdate={setJobsState}
          onClose={() => setShowManageJobs(false)}
        />
      )}

      {equipModalBlockId && (() => {
        const eqBlock = blocks.find(b => b.id === equipModalBlockId);
        if (!eqBlock) return null;
        const eqJob  = jobsState.find(j => j.jobNumber === eqBlock.jobNumber);
        const eqCrew = crewsState.find(c => c.id === eqBlock.crewId);
        return (
          <BlockEquipmentModal
            block={eqBlock}
            job={eqJob}
            crew={eqCrew}
            equipmentList={equipmentList}
            onAssign={equipmentId => dispatchWithHistory({ type: 'ASSIGN_EQUIPMENT', blockId: equipModalBlockId, equipmentId })}
            onUnassign={equipmentId => dispatchWithHistory({ type: 'UNASSIGN_EQUIPMENT', blockId: equipModalBlockId, equipmentId })}
            onClose={() => setEquipModalBlockId(null)}
          />
        );
      })()}
    </div>
  );
}
