import React from 'react';
import { createRoot } from 'react-dom/client';
import PdfMarkupEditor from '../components/PdfMarkupEditor.tsx';
import { JobPrint, User, UserRole } from '../types.ts';
import '../index.css';

const print: JobPrint = {
  id: 'print-1',
  jobNumber: 'J-1000',
  companyId: 'co-1',
  storagePath: 'test/test.pdf',
  fileName: 'test-plan.pdf',
  isPinned: false,
  createdAt: Date.now(),
};

const user: User = {
  id: 'u-1',
  name: 'Test User',
  role: 'admin' as UserRole,
  username: 'test',
  companyId: 'co-1',
};

createRoot(document.getElementById('root')!).render(
  <PdfMarkupEditor print={print} sessionUser={user} onClose={() => console.log('close')} />,
);
