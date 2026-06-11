import React, { useMemo, useState } from 'react';
import { CalendarRange, Boxes } from 'lucide-react';
import Scheduler, { JobOption } from './Scheduler.tsx';
import ResourcesManager from './ResourcesManager.tsx';
import { Job, User, UserRole } from '../../types.ts';

type SchedulingTab = 'board' | 'resources';

interface SchedulingViewProps {
  sessionUser: User;
  jobs: Job[];
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
export default function SchedulingView({ sessionUser, jobs, isDarkMode }: SchedulingViewProps) {
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
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
              tab === t.id
                ? 'bg-brand text-white border-transparent'
                : isDarkMode
                  ? 'bg-slate-800 text-slate-100 border-slate-700'
                  : 'bg-white text-slate-900 border-slate-200'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
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
    </div>
  );
}
