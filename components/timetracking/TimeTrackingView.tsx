import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Tags, ClipboardCheck, ClipboardList } from 'lucide-react';
import { Company, Job, User, UserRole } from '../../types.ts';
import { scheduleService } from '../../services/scheduleService.ts';
import { timeTrackingService } from '../../services/timeTrackingService.ts';
import { Employee, ServiceJob } from '../../services/schedulingTypes.ts';
import { CostCode, ClockableJob } from '../../services/timeTrackingTypes.ts';
import ClockPanel from './ClockPanel.tsx';
import CostCodeManager from './CostCodeManager.tsx';
import TimesheetView from './TimesheetView.tsx';
import DailyReportView from './DailyReportView.tsx';

type TimeTab = 'clock' | 'reports' | 'codes' | 'timesheets';

interface TimeTrackingViewProps {
  sessionUser: User;
  jobs: Job[];          // dig jobs (uuid ids), already loaded in App state
  companyName?: string;
  company?: Company;
  isDarkMode?: boolean;
}

/**
 * Top-level container for the Time Tracker module. Mounted only when the
 * company's `timeTrackingEnabled` flag is on (gated in App.tsx).
 *
 * Workers clock in/out against a specific job + cost code. Jobs come from BOTH
 * dig jobs (passed in) and service jobs (loaded here), merged into a single
 * searchable list. Admins manage cost codes and review/approve timesheets.
 */
export default function TimeTrackingView({ sessionUser, jobs, company, isDarkMode }: TimeTrackingViewProps) {
  const isAdmin = sessionUser.role === UserRole.ADMIN || sessionUser.role === UserRole.SUPER_ADMIN;
  const [tab, setTab] = useState<TimeTab>('clock');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceJobs, setServiceJobs] = useState<ServiceJob[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [emps, sjobs, codes] = await Promise.all([
      scheduleService.getEmployees(),
      scheduleService.getServiceJobs(),
      timeTrackingService.getCostCodes(),
    ]);
    setEmployees(emps);
    setServiceJobs(sjobs);
    setCostCodes(codes);
    setLoading(false);
  };

  useEffect(() => { reload().catch(err => { console.error('Time Tracker load failed:', err); setLoading(false); }); }, []);

  // Merge dig jobs + service jobs into one searchable picker list.
  const clockableJobs: ClockableJob[] = useMemo(() => {
    const dig: ClockableJob[] = jobs
      .filter(j => j.jobNumber)
      .map(j => ({
        kind: 'dig' as const,
        ref: j.id,
        label: `${j.jobNumber} — ${j.jobName || [j.address, j.city].filter(Boolean).join(', ') || 'Dig job'}`,
      }));
    const svc: ClockableJob[] = serviceJobs.map(j => ({
      kind: 'service' as const,
      ref: String(j.id),
      label: `${j.jobNumber || j.jobName || 'Service job'} — ${j.customerName || j.address || ''}`.replace(/ — $/, ''),
    }));
    return [...dig, ...svc];
  }, [jobs, serviceJobs]);

  // A foreman (login linked to an employee flagged isForeman) can file daily
  // reports even though their login is CREW role.
  const isForeman = useMemo(
    () => employees.some(e => e.profileId === sessionUser.id && e.isForeman),
    [employees, sessionUser.id],
  );

  const TABS: { id: TimeTab; label: string; icon: React.ReactNode; adminOnly?: boolean; foremanOrAdmin?: boolean }[] = [
    { id: 'clock',      label: 'Clock In / Out', icon: <Clock size={16} /> },
    { id: 'reports',    label: 'Daily Report',   icon: <ClipboardList size={16} />, foremanOrAdmin: true },
    { id: 'codes',      label: 'Cost Codes',     icon: <Tags size={16} />, adminOnly: true },
    { id: 'timesheets', label: 'Timesheets',     icon: <ClipboardCheck size={16} />, adminOnly: true },
  ];
  const visibleTabs = TABS.filter(t =>
    (!t.adminOnly || isAdmin) && (!t.foremanOrAdmin || isAdmin || isForeman),
  );

  if (loading) {
    return <div className={`p-6 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading time tracker…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map(t => (
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

      {tab === 'clock' && (
        <ClockPanel
          sessionUser={sessionUser}
          isAdmin={isAdmin}
          employees={employees}
          clockableJobs={clockableJobs}
          isDarkMode={isDarkMode}
        />
      )}
      {tab === 'reports' && (isAdmin || isForeman) && (
        <DailyReportView
          sessionUser={sessionUser}
          company={company}
          jobs={jobs}
          serviceJobs={serviceJobs}
          employees={employees}
          costCodes={costCodes}
          clockableJobs={clockableJobs}
          isDarkMode={isDarkMode}
        />
      )}
      {tab === 'codes' && isAdmin && (
        <CostCodeManager
          companyId={sessionUser.companyId}
          costCodes={costCodes}
          clockableJobs={clockableJobs}
          onChange={reload}
          isDarkMode={isDarkMode}
        />
      )}
      {tab === 'timesheets' && isAdmin && (
        <TimesheetView
          sessionUser={sessionUser}
          employees={employees}
          costCodes={costCodes}
          clockableJobs={clockableJobs}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}
