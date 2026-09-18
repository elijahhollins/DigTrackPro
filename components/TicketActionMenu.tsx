import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DigTicket } from '../types.ts';

interface TicketActionMenuProps {
  ticket: DigTicket;
  isAdmin: boolean;
  isDarkMode?: boolean;
  onNotes: () => void;
  onNoShow: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  onUpdate: () => void;
  onArchive: (e: React.MouseEvent) => void;
  onHistory: () => void;
}

type MenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: (e: React.MouseEvent) => void;
  tone: 'default' | 'rose' | 'amber';
  adminOnly?: boolean;
};

/**
 * Per-row "⋯" action menu on the dashboard. Replaces the hover-only icon strip:
 * the trigger is always visible (so it works on touch), and the crew actions
 * plus the admin-only Update / Archive entries live in one dropdown.
 *
 * The panel is rendered in a fixed-position layer anchored to the trigger so it
 * escapes the table's overflow clipping, and flips above the trigger when there
 * isn't room below.
 */
const TicketActionMenu: React.FC<TicketActionMenuProps> = ({
  ticket, isAdmin, isDarkMode, onNotes, onNoShow, onRefresh, onUpdate, onArchive, onHistory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => { setIsOpen(false); setPosition(null); };

  // Close on outside click, Escape, scroll or resize — the panel is fixed, so it
  // would otherwise drift away from its row.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  const MENU_WIDTH = 208;

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12
      ? rect.top - panelHeight - 6
      : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPosition({ top, left });
  }, [isOpen]);

  const allItems: MenuItem[] = [
    {
      key: 'notes', label: 'Add / View Notes', tone: 'default', onSelect: () => onNotes(),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
    },
    {
      key: 'history', label: 'Update History', tone: 'default', onSelect: () => onHistory(),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
    },
    {
      key: 'noshow', label: 'Log No Show', tone: 'rose', onSelect: () => onNoShow(),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />,
    },
    {
      key: 'refresh', label: ticket.refreshRequested ? 'Clear Refresh' : 'Request Refresh', tone: 'amber', onSelect: (e: React.MouseEvent) => onRefresh(e),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    },
    {
      key: 'update', label: 'Update Ticket', tone: 'default', adminOnly: true, onSelect: () => onUpdate(),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    },
    {
      key: 'archive', label: ticket.isArchived ? 'Restore Ticket' : 'Archive Ticket', tone: 'default', adminOnly: true, onSelect: (e: React.MouseEvent) => onArchive(e),
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />,
    },
  ];

  const items = allItems.filter(item => isAdmin || !item.adminOnly);

  const toneCls = (tone: MenuItem['tone']) => {
    if (tone === 'rose') return 'text-rose-500 hover:bg-rose-500/10';
    if (tone === 'amber') return isDarkMode ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-600 hover:bg-amber-500/10';
    return isDarkMode ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100';
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Ticket actions"
        onClick={(e) => { e.stopPropagation(); setIsOpen(prev => !prev); }}
        className={`p-1.5 rounded-lg transition-all ${
          isOpen
            ? 'text-brand bg-brand/10'
            : isDarkMode ? 'text-slate-500 hover:text-brand hover:bg-brand/10' : 'text-slate-400 hover:text-brand hover:bg-brand/10'
        }`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="menu"
          onClick={e => e.stopPropagation()}
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: MENU_WIDTH, visibility: position ? 'visible' : 'hidden' }}
          className={`fixed z-[200] rounded-xl border shadow-2xl overflow-hidden py-1 ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}
        >
          {items.map(item => (
            <button
              key={item.key}
              role="menuitem"
              type="button"
              onClick={(e) => { e.stopPropagation(); close(); item.onSelect(e); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[11px] font-bold transition-colors ${toneCls(item.tone)}`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
              <span className="truncate">{item.label}</span>
              {item.adminOnly && (
                <span className={`ml-auto text-[8px] font-black uppercase tracking-widest shrink-0 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Admin</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default TicketActionMenu;
