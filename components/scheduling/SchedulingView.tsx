import React, { useMemo, useState } from 'react';
import { CalendarRange, Boxes, ClipboardList, Receipt } from 'lucide-react';
import Scheduler, { JobOption } from './Scheduler.tsx';
import ResourcesManager from './ResourcesManager.tsx';
import WorkLogEditor from './WorkLogEditor.tsx';
import InvoiceView from './InvoiceView.tsx';
import { Job, User, UserRole } from '../../types.ts';

type SchedulingTab = 'board' | 'resources' | 'logs' | 'invoices';

interface SchedulingViewProps {
  sessionUser: User;
  jobs: Job[];
  companyName?: string;
  isDarkMode?: boolean;
}

/**
 * Top-level container for the Scheduling & Field Ops module. Mounted only when
 * the company's `schedulingEnabled` flag is on (gated in App.tsx). Hosts the
 * Gantt dispatch board and the resource manager.
 *
 * Hybrid job source: existing DigTrackPro jobs are mapped to scheduler
 * JobOptions and passed into the board, which merges them with any ad-hoc job
 * options saved on the board itself.
 */
export default function SchedulingView({ sessionUser, jobs, companyName, isDarkMode }: SchedulingViewProps) {
  const [tab, setTab] = useState<SchedulingTab>('board');
  const isAdmin = sessionUser.role === UserRole.ADMIN || sessionUser.role === UserRole.SUPER_ADMIN;

  // Map DigTrackPro jobs -> scheduler job options (hybrid seed).
  const jobOptions: JobOption[] = useMemo(
    () =>
      jobs
        .filter(j => j.jobNumber)
        .map(j => ({
          jobNumber: j.jobNumber,
          location: [j.address, j.city, j.state].filter(Boolean).join(', '),
          estimatedDays: 1,
        })),
    [jobs],
  );

  const TABS: { id: SchedulingTab; label: string; icon: React.ReactNode }[] = [
    { id: 'board',     label: 'Dispatch Board', icon: <CalendarRange size={16} /> },
    { id: 'resources', label: 'Resources',      icon: <Boxes size={16} /> },
    { id: 'logs',      label: 'Work Logs',      icon: <ClipboardList size={16} /> },
    { id: 'invoices',  label: 'Invoices',       icon: <Receipt size={16} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto no-scrollbar shrink-0">
        <div
          className={`inline-flex items-center gap-1 p-1 rounded-xl border ${
            isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-100/70 border-slate-200'
          }`}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0 ${
                tab === t.id
                  ? 'bg-brand text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'board' && (
        <Scheduler
          jobs={jobOptions}
          crews={[]}
          initialBlocks={[]}
          userRole={isAdmin ? 'admin' : 'foreman'}
          companyId={sessionUser.companyId}
        />
      )}

      {tab === 'resources' && (
        <ResourcesManager companyId={sessionUser.companyId} isAdmin={isAdmin} isDarkMode={isDarkMode} />
      )}

      {tab === 'logs' && (
        <WorkLogEditor companyId={sessionUser.companyId} isAdmin={isAdmin} isDarkMode={isDarkMode} />
      )}

      {tab === 'invoices' && (
        <InvoiceView companyId={sessionUser.companyId} companyName={companyName} isAdmin={isAdmin} isDarkMode={isDarkMode} />
      )}
    </div>
  );
}
