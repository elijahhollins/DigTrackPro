import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarRange, Boxes, ClipboardList, Receipt } from 'lucide-react';
import Scheduler, { Crew, JobOption, ScheduleBlock } from '../components/scheduling/Scheduler.tsx';
import ResourcesManager from '../components/scheduling/ResourcesManager.tsx';
import WorkLogEditor from '../components/scheduling/WorkLogEditor.tsx';
import InvoiceView from '../components/scheduling/InvoiceView.tsx';
import '../index.css';

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };

const crews: Crew[] = [
  { id: 'c1', name: 'Alpha Crew',   size: 4, memberIds: [] },
  { id: 'c2', name: 'Bravo Crew',   size: 3, memberIds: [] },
  { id: 'c3', name: 'Charlie Crew', size: 5, memberIds: [] },
  { id: 'c4', name: 'Delta Crew',   size: 2, memberIds: [] },
  { id: 'c5', name: 'Echo Crew',    size: 3, memberIds: [] },
];
const jobs: JobOption[] = [
  { jobNumber: 'J-2041', location: '1180 Riverside Dr, Austin',     estimatedDays: 5 },
  { jobNumber: 'J-2042', location: '95 Industrial Pkwy, Round Rock', estimatedDays: 3 },
  { jobNumber: 'J-2043', location: '400 Lakeway Blvd, Lakeway',      estimatedDays: 7 },
  { jobNumber: 'J-2044', location: '77 Commerce St, Pflugerville',   estimatedDays: 4 },
  { jobNumber: 'J-2045', location: '2300 Oltorf St, Austin',         estimatedDays: 6 },
  { jobNumber: 'J-2046', location: '8 Quarry Rd, Cedar Park',        estimatedDays: 2 },
];
const blocks: ScheduleBlock[] = [
  { id: 'b1', crewId: 'c1', jobNumber: 'J-2041', startDate: addDays(-3), durationDays: 5, type: 'job', extended: false },
  { id: 'b2', crewId: 'c1', jobNumber: 'J-2042', startDate: addDays(3),  durationDays: 3, type: 'job', extended: false },
  { id: 'b3', crewId: 'c2', jobNumber: 'J-2043', startDate: addDays(-1), durationDays: 7, type: 'job', extended: true },
  { id: 'b4', crewId: 'c2', jobNumber: 'J-2044', startDate: addDays(8),  durationDays: 4, type: 'job', extended: false },
  { id: 'd1', crewId: 'c3', jobNumber: 'Delay – 2 days', startDate: addDays(0), durationDays: 2, type: 'delay', extended: false },
  { id: 'b5', crewId: 'c3', jobNumber: 'J-2045', startDate: addDays(2),  durationDays: 6, type: 'job', extended: false },
  { id: 'b6', crewId: 'c4', jobNumber: 'J-2046', startDate: addDays(1),  durationDays: 2, type: 'job', extended: false },
  { id: 'b7', crewId: 'c4', jobNumber: 'J-2042', startDate: addDays(5),  durationDays: 3, type: 'job', extended: false },
  { id: 'b8', crewId: 'c5', jobNumber: 'J-2043', startDate: addDays(-2), durationDays: 4, type: 'job', extended: false },
  { id: 'b9', crewId: 'c5', jobNumber: 'J-2041', startDate: addDays(4),  durationDays: 5, type: 'job', extended: false },
];

type Tab = 'board' | 'resources' | 'logs' | 'invoices';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'board',     label: 'Dispatch Board', icon: <CalendarRange size={16} /> },
  { id: 'resources', label: 'Resources',      icon: <Boxes size={16} /> },
  { id: 'logs',      label: 'Work Logs',      icon: <ClipboardList size={16} /> },
  { id: 'invoices',  label: 'Invoices',       icon: <Receipt size={16} /> },
];

function Preview() {
  const [tab, setTab] = useState<Tab>('board');
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '28px 24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
          Scheduling &amp; Field Ops
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
          Redesign preview · mock data · fully interactive
        </p>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl border bg-slate-100/70 border-slate-200" style={{ margin: '14px 0' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'board' && (
          <div style={{ height: 620 }}>
            <Scheduler crews={crews} jobs={jobs} initialBlocks={blocks} userRole="admin" />
          </div>
        )}
        {tab === 'resources' && <ResourcesManager companyId="demo" isAdmin isDarkMode={false} />}
        {tab === 'logs'      && <WorkLogEditor   companyId="demo" isAdmin isDarkMode={false} />}
        {tab === 'invoices'  && <InvoiceView     companyId="demo" companyName="Demo Underground Co." isAdmin isDarkMode={false} />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
