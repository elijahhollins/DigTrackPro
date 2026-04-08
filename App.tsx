
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, JobNote, User, UserRole, Job, UserRecord, Company } from './types.ts';
import { getTicketStatus, getStatusColor, addDaysToDateStr, formatDateStr } from './utils/dateUtils.ts';
import { apiService } from './services/apiService.ts';
import { supabase, isSupabaseConfigured, getEnv } from './lib/supabaseClient.ts';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import { JobSummaryModal } from './components/JobSummaryModal.tsx';
import JobPrintMarkup from './components/JobPrintMarkup.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import TeamManagement from './components/TeamManagement.tsx';
import NoShowForm from './components/NoShowForm.tsx';
import TicketNotesModal from './components/TicketNotesModal.tsx';
import Login from './components/Login.tsx';
import CompanyRegistration from './components/CompanyRegistration.tsx';
import MapView from './components/MapView.tsx';
import { AsBuiltView } from './components/AsBuiltView.tsx';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    process?: { env: Record<string, string> };
  }
}

const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [showCompanyRegistration, setShowCompanyRegistration] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('dig_theme_mode') === 'dark');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string>('');
  const [isProcessing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  
  const [hasApiKey, setHasApiKey] = useState(() => {
    const key = getEnv('API_KEY');
    return key.length > 20 && key !== 'undefined';
  });
  
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);
  const [mediaFolderFilter, setMediaFolderFilter] = useState<string | null>(null);
  
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [selectedJobSummary, setSelectedJobSummary] = useState<Job | null>(null);
  const [showMarkup, setShowMarkup] = useState<Job | null>(null);
  const [editingTicket, setEditingTicket] = useState<DigTicket | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [noShowTicket, setNoShowTicket] = useState<DigTicket | null>(null);
  const [notesTicket, setNotesTicket] = useState<DigTicket | null>(null);
  const [digConfirmTicket, setDigConfirmTicket] = useState<DigTicket | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<TicketStatus | 'NO_SHOW' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc'
  });

  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [highlightedTicketId, setHighlightedTicketId] = useState<string | null>(null);
  const initRef = useRef(false);

  const applyThemeColor = (hex: string, save: boolean = false) => {
    document.documentElement.style.setProperty('--brand-primary', hex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--brand-ring', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.documentElement.style.setProperty('--brand-shadow', `rgba(${r}, ${g}, ${b}, 0.25)`);
    if (save) {
      localStorage.setItem('dig_theme_color', hex);
    }
  };

  // Fixed: Added missing handleNavigate function
  const handleNavigate = (view: AppView) => {
    setShowTicketForm(false);
    setEditingTicket(null);
    setShowJobForm(false);
    setEditingJob(null);
    setSelectedJobSummary(null);
    setShowMarkup(null);
    setNoShowTicket(null);
    setNotesTicket(null);
    setViewingDocUrl(null);
    if (view !== 'photos') setMediaFolderFilter(null);
    setActiveView(view);
  };

  const DEFAULT_NEW_USER_NAME = 'New User';

  const initApp = async () => {
    if (initRef.current) return;
    initRef.current = true;
    if (!isSupabaseConfigured()) { 
      setIsLoading(false); 
      initRef.current = false;
      return; 
    }
    setAuthError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { 
        setSessionUser(null); 
        setIsLoading(false); 
        initRef.current = false;
        return; 
      }
      
      const [allUsersRes] = await Promise.all([apiService.getUsers()]);
      const fetchedUsers = allUsersRes;
      setUsers(fetchedUsers);

      const matchedProfile = fetchedUsers.find(u => u.id === session.user.id);
      if (matchedProfile) {
        // Check if profile exists but is missing companyId when user has invite metadata
        const meta = (session.user.user_metadata as Record<string, string>) || {};
        const inviteCompanyId = typeof meta.company_id === 'string' && meta.company_id.trim() !== '' ? meta.company_id.trim() : undefined;
        const inviteToken = meta.invite_token;
        const displayName = typeof meta.display_name === 'string' && meta.display_name.trim() !== '' ? meta.display_name.trim() : undefined;
        
        // If user has invite metadata but profile doesn't have companyId, update the profile
        if (inviteCompanyId && !matchedProfile.companyId) {
          console.log('Updating profile with invite company ID:', inviteCompanyId);
          await apiService.addUser({ 
            id: session.user.id, 
            name: displayName || matchedProfile.name, 
            username: session.user.email || matchedProfile.username, 
            role: UserRole.CREW, 
            companyId: inviteCompanyId 
          });
          if (inviteToken) { 
            try { 
              await apiService.markInviteUsed(inviteToken); 
            } catch (e) { 
              console.warn('markInviteUsed failed:', e); 
            } 
          }
          // Re-initialize to load the updated profile
          initRef.current = false;
          await initApp();
          return;
        }
        
        setSessionUser(matchedProfile);
        // Load Company Data - fetches the company associated with this user
        // The company name will be displayed in the top-left header (line 389)
        if (matchedProfile.companyId) {
          const companyData = await apiService.getCompany(matchedProfile.companyId);
          setCompany(companyData);
          if (companyData?.brandColor) applyThemeColor(companyData.brandColor);
        }
        // Super-admin needs the full company list for the platform admin panel
        if (matchedProfile.role === UserRole.SUPER_ADMIN) {
          const allCos = await apiService.getAllCompanies();
          setAllCompanies(allCos);
        }
      } else {
        // New user — auto-create profile using metadata stored during signup
        const meta = (session.user.user_metadata as Record<string, string>) || {};
        const inviteCompanyId = typeof meta.company_id === 'string' && meta.company_id.trim() !== '' ? meta.company_id.trim() : undefined;
        const inviteToken = meta.invite_token;
        const companyNameMeta = meta.company_name;
        const displayName = typeof meta.display_name === 'string' && meta.display_name.trim() !== '' ? meta.display_name.trim() : undefined;

        if (inviteCompanyId) {
          // Invited user: create profile as CREW of the specified company
          console.log('Creating new crew profile for invite company ID:', inviteCompanyId);
          if (!displayName) {
            console.error('Invite signup failed: display_name missing from user metadata');
            throw new Error('User name is missing from signup metadata. Please sign up again with your full name.');
          }
          await apiService.addUser({ id: session.user.id, name: displayName, username: session.user.email || '', role: UserRole.CREW, companyId: inviteCompanyId });
          if (inviteToken) { try { await apiService.markInviteUsed(inviteToken); } catch (e) { console.warn('markInviteUsed failed:', e); } }
          initRef.current = false;
          await initApp();
          return;
        } else if (companyNameMeta) {
          // Crew signup: look up company by name and join as CREW
          const found = await apiService.getCompanyByName(companyNameMeta);
          if (found) {
            await apiService.addUser({ id: session.user.id, name: displayName || DEFAULT_NEW_USER_NAME, username: session.user.email || '', role: UserRole.CREW, companyId: found.id });
            initRef.current = false;
            await initApp();
            return;
          }
        }
        // Fallback: show company registration (bootstrap / first super-admin setup)
        console.log('No company association found, showing company registration modal. User metadata:', meta);
        setSessionUser({ id: session.user.id, name: displayName || DEFAULT_NEW_USER_NAME, username: session.user.email || '', role: UserRole.CREW, companyId: '' });
        setShowCompanyRegistration(true);
      }

      // Fetch operational data - Supabase RLS handles the company filtering automatically now!
      const [allTicketsRes, allJobsRes, allPhotosRes, allNotesRes] = await Promise.allSettled([
        apiService.getTickets(),
        apiService.getJobs(),
        apiService.getPhotos(),
        apiService.getNotes()
      ]);

      setTickets(allTicketsRes.status === 'fulfilled' ? allTicketsRes.value : []);
      setJobs(allJobsRes.status === 'fulfilled' ? allJobsRes.value : []);
      setPhotos(allPhotosRes.status === 'fulfilled' ? allPhotosRes.value : []);
      setNotes(allNotesRes.status === 'fulfilled' ? allNotesRes.value : []);

    } catch (error) { 
      console.error("Critical Init Error:", error);
      setAuthError((error as any)?.message || 'Failed to load your profile. Please try logging in again.');
    } finally { 
      setIsLoading(false); 
      initRef.current = false; 
    }
  };

  useEffect(() => {
    initApp();
    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_IN') setIsLoading(true);
      initApp();
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionUser || (sessionUser.role !== UserRole.ADMIN && sessionUser.role !== UserRole.SUPER_ADMIN)) return;
    const channel = supabase
      .channel('admin-ticket-alerts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `company_id=eq.${sessionUser.companyId}` }, (payload) => {
        const n = payload.new as Record<string, unknown>;
        const o = payload.old as Record<string, unknown>;
        if (n.refresh_requested && !o.refresh_requested) {
          sendAdminNotification('Refresh Request', `Ticket #${n.ticket_no ?? 'unknown'} needs a refresh.`);
        }
        if (n.no_show_requested && !o.no_show_requested) {
          sendAdminNotification('No Show Alert', `Ticket #${n.ticket_no ?? 'unknown'} has a no-show reported.`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionUser?.id, sessionUser?.role, sessionUser?.companyId]);

  // Prompt the user about any unarchived tickets that are on day 9 after their call-in date
  // and haven't yet been answered about whether work has begun.
  useEffect(() => {
    if (digConfirmTicket) return;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const pending = tickets.find(t => {
      if (t.isArchived || t.workBegun !== undefined) return false;
      if (!t.callInDate) return false;
      const day9Str = addDaysToDateStr(t.callInDate, 9);
      if (!day9Str) return false;
      const [y, m, d] = day9Str.split('-').map(Number);
      const day9Start = new Date(y, m - 1, d);
      return todayStart >= day9Start;
    });
    if (pending) setDigConfirmTicket(pending);
  }, [tickets, digConfirmTicket]);

  useEffect(() => {
    if (!highlightedTicketId || activeView !== 'dashboard') return;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-ticket-id="${highlightedTicketId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    const clearTimer = setTimeout(() => setHighlightedTicketId(null), 2500);
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [highlightedTicketId, activeView]);

  // Fixed: Added missing ensureJobExists function
  const ensureJobExists = async (ticketData: Omit<DigTicket, 'id' | 'createdAt' | 'companyId'>): Promise<Job> => {
    const existingJob = jobs.find(j => j.jobNumber === ticketData.jobNumber);
    if (existingJob) return existingJob;
    const newJob: Job = { 
      id: crypto.randomUUID(), 
      companyId: sessionUser!.companyId,
      jobNumber: ticketData.jobNumber, 
      customer: ticketData.siteContact || 'Auto-Detected Client', 
      address: ticketData.street, 
      city: ticketData.city, 
      state: ticketData.state, 
      county: ticketData.county, 
      createdAt: Date.now(), 
      isComplete: false 
    };
    const savedJob = await apiService.saveJob(newJob);
    setJobs(prev => [...prev, savedJob]);
    return savedJob;
  };

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt' | 'companyId'>, archiveOld: boolean = false) => {
    if (!sessionUser?.companyId) { setShowCompanyRegistration(true); return; }
    try {
      const ticketData = { ...data, companyId: sessionUser.companyId };
      await ensureJobExists(ticketData);
      const ticket: DigTicket = (editingTicket && !archiveOld) ? { ...editingTicket, ...ticketData } : { ...ticketData, id: crypto.randomUUID(), createdAt: Date.now(), isArchived: false };
      const saved = await apiService.saveTicket(ticket, archiveOld);
      setTickets(prev => {
        if (archiveOld) return [saved, ...prev.map(t => (t.ticketNo === saved.ticketNo && t.jobNumber === saved.jobNumber && t.id !== saved.id) ? { ...t, isArchived: true } : t)];
        const index = prev.findIndex(t => t.id === saved.id);
        if (index > -1) return prev.map(t => t.id === saved.id ? saved : t);
        return [saved, ...prev];
      });
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    await apiService.deleteTicket(id);
    setTickets(prev => prev.filter(t => t.id !== id));
    setEditingTicket(null);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try { 
      await supabase.auth.signOut(); 
      setSessionUser(null); 
    } catch (error: any) { 
      console.error("Sign out error:", error.message);
      alert("Sign out failed. Please try again.");
      setIsSigningOut(false);
    }
  };

  const handleCompanyCreation = async (companyName: string, brandColor: string, city: string = '', state: string = '', phone: string = '') => {
    if (!sessionUser) return;
    const newCompany: Company = {
      id: crypto.randomUUID(),
      name: companyName,
      brandColor,
      city,
      state,
      phone,
      createdAt: Date.now()
    };
    const createdCompany = await apiService.createCompany(newCompany);
    // Set user as ADMIN when they create a new company
    await apiService.addUser({
      id: sessionUser.id,
      name: sessionUser.name,
      username: sessionUser.username,
      role: UserRole.ADMIN,
      companyId: createdCompany.id
    });
    setCompany(createdCompany);
    setSessionUser(prev => prev ? { ...prev, companyId: createdCompany.id, role: UserRole.ADMIN } : prev);
    if (createdCompany.brandColor) applyThemeColor(createdCompany.brandColor);
    setShowCompanyRegistration(false);
    // Reset the guard so initApp can run again to load the new company's data
    initRef.current = false;
    await initApp();
  };

  const handleUpdateCompany = async (id: string, updates: { name?: string; city?: string; state?: string; phone?: string }) => {
    const updated = await apiService.updateCompany(id, updates);
    setAllCompanies(prev => prev.map(co => co.id === id ? updated : co));
    if (company?.id === id) setCompany(updated);
  };

  const handleToggleArchive = async (ticket: DigTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    const willArchive = !ticket.isArchived;
    if (willArchive && !confirm(`Archive Ticket #${ticket.ticketNo}?`)) return;
    try {
      const updated = { ...ticket, isArchived: willArchive };
      const saved = await apiService.saveTicket(updated);
      setTickets(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (error: any) { alert("Archive failed: " + error.message); }
  };

  const sendAdminNotification = (title: string, body: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  const handleRefreshRequest = async (ticket: DigTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    if (ticket.refreshRequested) {
      if (!confirm(`Clear the Refresh Request for Ticket #${ticket.ticketNo}?`)) return;
    }
    try {
      const updated = { ...ticket, refreshRequested: !ticket.refreshRequested };
      const saved = await apiService.saveTicket(updated);
      setTickets(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (error: any) {
      alert('Refresh request failed: ' + error.message);
    }
  };

  const handleDigConfirm = async (workBegun: boolean) => {
    if (!digConfirmTicket) return;
    try {
      const updated = { ...digConfirmTicket, workBegun };
      const saved = await apiService.saveTicket(updated);
      setTickets(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (error: any) {
      alert('Failed to update ticket: ' + error.message);
    } finally {
      setDigConfirmTicket(null);
    }
  };

  const handleJobSelection = async (jobNumber: string, jobEntity?: Job) => {
    if (jobEntity) { setSelectedJobSummary(jobEntity); return; }
    const existing = jobs.find(j => j.jobNumber === jobNumber);
    if (existing) { setSelectedJobSummary(existing); return; }
    const jobTickets = tickets.filter(t => t.jobNumber === jobNumber && !t.isArchived);
    if (jobTickets.length === 0) return;
    const firstTkt = jobTickets[0];
    const newJob: Job = { id: crypto.randomUUID(), companyId: sessionUser!.companyId, jobNumber: jobNumber, customer: firstTkt.siteContact || 'Client', address: firstTkt.street, city: firstTkt.city, state: firstTkt.state, county: firstTkt.county, createdAt: Date.now(), isComplete: false };
    try {
      const saved = await apiService.saveJob(newJob);
      setJobs(prev => [...prev, saved]);
      setSelectedJobSummary(saved);
    } catch (err: any) { alert("Job init failed: " + err.message); }
  };

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('dig_theme_mode', next ? 'dark' : 'light');
  };

  const handleOpenSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    } else {
      alert("Missing AI credentials.");
    }
  };

  const activeTicketsList = useMemo(() => {
    const completedNumbers = new Set(jobs.filter(j => j.isComplete).map(j => j.jobNumber));
    return tickets.filter(t => !completedNumbers.has(t.jobNumber) && (showArchived || !t.isArchived));
  }, [tickets, jobs, showArchived]);

  const filteredTickets = useMemo(() => {
    let res = activeTicketsList.filter(t => {
      const s = String(globalSearch || '').toLowerCase().trim();
      if (s && !String(t.ticketNo || '').toLowerCase().includes(s) && !String(t.street || '').toLowerCase().includes(s) && !String(t.jobNumber || '').toLowerCase().includes(s)) return false;
      if (activeFilter) {
        if (activeFilter === 'NO_SHOW') return !!t.noShowRequested;
        return getTicketStatus(t) === activeFilter;
      }
      return true;
    });
    res.sort((a, b) => {
      let vA: any = sortConfig.field === 'status' ? getTicketStatus(a) : a[sortConfig.field as keyof DigTicket];
      let vB: any = sortConfig.field === 'status' ? getTicketStatus(b) : b[sortConfig.field as keyof DigTicket];
      const f = sortConfig.order === 'asc' ? 1 : -1;
      if (typeof vA === 'string') return f * String(vA || '').localeCompare(String(vB || ''));
      return f * ((Number(vA) || 0) - (Number(vB) || 0));
    });
    return res;
  }, [activeTicketsList, globalSearch, sortConfig, activeFilter]);

  const groupedTicketsMap = useMemo(() => {
    const map = new Map<string, DigTicket[]>();
    filteredTickets.forEach(t => {
      const group = map.get(t.jobNumber) || [];
      group.push(t);
      map.set(t.jobNumber, group);
    });
    return map;
  }, [filteredTickets]);

  const ticketIdsWithNotes = useMemo(() => new Set(notes.map(n => n.ticketId).filter(Boolean)), [notes]);

  const toggleJobExpansion = (jobNumber: string) => {
    const next = new Set(expandedJobs);
    if (next.has(jobNumber)) next.delete(jobNumber);
    else next.add(jobNumber);
    setExpandedJobs(next);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#07101f] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-brand/15 border border-brand/25 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!sessionUser) return <Login authError={authError} />;
  if (showCompanyRegistration) return <CompanyRegistration onComplete={handleCompanyCreation} isDarkMode={isDarkMode} />;

  const isSuperAdmin = sessionUser.role === UserRole.SUPER_ADMIN;
  const isAdmin = sessionUser.role === UserRole.ADMIN || isSuperAdmin;
  const NAV_ITEMS: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Tickets', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
    { id: 'calendar', label: 'Schedule', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { id: 'map', label: 'Map', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'photos', label: 'Field Docs', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { id: 'team', label: 'Crew', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
    { id: 'asbuilt', label: 'As Built', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
  ];

  return (
    <div className={`flex h-screen overflow-hidden ${isDarkMode ? 'bg-[#07101f] text-slate-100' : 'bg-slate-100 text-slate-900'} transition-colors duration-300`}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className={`hidden sm:flex flex-col shrink-0 w-[68px] lg:w-[220px] transition-all duration-300 ${isDarkMode ? 'bg-[#0b1629] border-white/[0.05]' : 'bg-white border-slate-200'} border-r`}>

        {/* Logo */}
        <div
          className={`flex items-center gap-3 px-3 lg:px-4 h-16 cursor-pointer group shrink-0 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-slate-100'}`}
          onClick={() => handleNavigate('dashboard')}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all bg-brand/15 border border-brand/25 group-hover:scale-105 ${isProcessing ? 'animate-pulse' : ''}`}>
            <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="hidden lg:block overflow-hidden">
            <p className={`text-[13px] font-black uppercase tracking-tight font-display truncate group-hover:text-brand transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {company?.name || 'DigTrack Pro'}
            </p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] leading-none mt-0.5">Locate System</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-center lg:justify-start gap-3 px-0 lg:px-3 py-3 rounded-xl transition-all relative group ${
                  isActive
                    ? isDarkMode
                      ? 'bg-brand/10 text-brand border border-brand/20 sidebar-active'
                      : 'bg-brand text-white shadow-md shadow-brand/20'
                    : isDarkMode
                    ? 'text-slate-600 hover:text-slate-200 hover:bg-white/[0.04]'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span className={`transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>{item.icon}</span>
                <span className="hidden lg:block text-[10px] font-black uppercase tracking-[0.12em]">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Admin CTA buttons */}
        {isAdmin && (
          <div className="hidden lg:flex flex-col gap-2 px-3 mb-3">
            <button
              onClick={() => { setEditingTicket(null); setShowTicketForm(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 shadow-lg shadow-brand/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
              New Ticket
            </button>
            <button
              onClick={() => { setEditingJob(null); setShowJobForm(true); }}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${isDarkMode ? 'border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:text-brand hover:border-brand/30'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              New Job
            </button>
          </div>
        )}

        {/* User row */}
        <div className={`border-t p-3 ${isDarkMode ? 'border-white/[0.05]' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand/15 border border-brand/20 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black text-brand">{(sessionUser.name || 'U')[0].toUpperCase()}</span>
            </div>
            <div className="hidden lg:block flex-1 overflow-hidden">
              <p className={`text-[10px] font-black uppercase tracking-wide truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{sessionUser.name || 'User'}</p>
              <p className={`text-[9px] truncate ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{sessionUser.username || ''}</p>
            </div>
            <div className="hidden lg:flex items-center gap-0.5 ml-auto shrink-0">
              <button onClick={toggleDarkMode} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-slate-600 hover:text-amber-400 hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`} title="Toggle theme">
                {isDarkMode ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
              </button>
              <button onClick={handleSignOut} disabled={isSigningOut} className={`p-1.5 rounded-lg transition-colors ${isSigningOut ? 'opacity-30 cursor-not-allowed' : 'text-slate-600 hover:text-rose-500 hover:bg-white/5'}`} title="Sign out">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className={`app-header shrink-0 h-14 border-b flex items-center gap-3 px-5 z-30 relative ${isDarkMode ? 'bg-[#07101f]/90 border-white/[0.05]' : 'bg-white/90 border-slate-200'} backdrop-blur-xl`}>
          {/* Mobile: company name */}
          <div className="sm:hidden flex-1">
            <p className={`text-sm font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{company?.name || 'DigTrack Pro'}</p>
          </div>
          {/* Desktop: view name */}
          <div className="hidden sm:flex flex-1 items-center gap-2">
            <span className="text-brand opacity-50">{NAV_ITEMS.find(n => n.id === activeView)?.icon}</span>
            <span className={`text-sm font-black uppercase tracking-[0.1em] ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{NAV_ITEMS.find(n => n.id === activeView)?.label}</span>
          </div>

          {/* Search (dashboard only, desktop) */}
          {activeView === 'dashboard' && (
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search tickets, jobs, addresses..."
                className={`pl-9 pr-4 py-2 border rounded-xl text-[11px] font-medium outline-none transition-all w-56 focus:w-72 ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          )}

          {/* AI key warning */}
          {!hasApiKey && (
            <button onClick={handleOpenSelectKey} className="hidden sm:flex items-center gap-1.5 bg-amber-500 text-slate-900 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg shadow-lg shadow-amber-500/20 hover:scale-105 transition-all">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              AI Setup
            </button>
          )}

          {/* Mobile action buttons */}
          <div className="sm:hidden flex items-center gap-1">
            {isAdmin && (
              <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#07101f] p-2 rounded-xl shadow-lg shadow-brand/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
              </button>
            )}
            <button onClick={toggleDarkMode} className={`p-2 rounded-xl ${isDarkMode ? 'text-amber-400' : 'text-slate-500'}`}>
              {isDarkMode ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
            </button>
            <button onClick={handleSignOut} disabled={isSigningOut} className={`p-2 rounded-xl ${isSigningOut ? 'opacity-30' : 'text-slate-500 hover:text-rose-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>

          {/* Tablet (sm–lg): show admin buttons in topbar since sidebar is icon-only */}
          <div className="hidden sm:flex lg:hidden items-center gap-1">
            {isAdmin && (
              <>
                <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-brand'}`} title="New Job">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </button>
                <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#07101f] p-2 rounded-xl shadow-lg shadow-brand/20 hover:scale-105 transition-all" title="New Ticket">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <main key={activeView} className="flex-1 overflow-y-auto view-transition pb-20 sm:pb-0">
          <div className="max-w-[1400px] mx-auto px-5 py-6">

            {activeView === 'dashboard' && (
              <div className="space-y-6">

                {/* Page header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Active Tickets
                    </h2>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {groupedTicketsMap.size} job{groupedTicketsMap.size !== 1 ? 's' : ''} · Real-Time Field Compliance
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowArchived(!showArchived)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        showArchived
                          ? isDarkMode ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-800 border-slate-800 text-white'
                          : isDarkMode ? 'border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20' : 'border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                      {showArchived ? 'History On' : 'History'}
                    </button>
                    {/* Mobile search */}
                    <div className="relative md:hidden">
                      <input type="text" placeholder="Search..." className={`pl-8 pr-3 py-2 border rounded-xl text-[11px] font-medium outline-none w-32 ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-900'}`} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
                      <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                  </div>
                </div>

                {/* Stat cards */}
                <StatCards tickets={activeTicketsList.filter(t => !t.isArchived)} isDarkMode={isDarkMode} activeFilter={activeFilter} onFilterClick={setActiveFilter} />

                {/* Tickets table */}
                <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className={`border-b ${isDarkMode ? 'border-white/[0.05] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/80'}`}>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Job #</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Tickets</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Client / Location</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-center ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Status</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-right ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Dig By</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-center ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Dig Begun?</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-right ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Expiry</th>
                          <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-right ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-white/[0.03]' : 'divide-slate-50'}`}>
                        {Array.from(groupedTicketsMap.keys()).map((jobNum: string) => {
                          const jobTickets = groupedTicketsMap.get(jobNum)!;
                          const jobEntity = jobs.find(j => j.jobNumber === jobNum);
                          const isExpanded = expandedJobs.has(jobNum);
                          const statuses = jobTickets.filter(t => !t.isArchived).map(t => getTicketStatus(t));
                          let aggregateStatus = TicketStatus.VALID;
                          if (statuses.includes(TicketStatus.EXPIRED)) aggregateStatus = TicketStatus.EXPIRED;
                          else if (statuses.includes(TicketStatus.REFRESH_NEEDED) || statuses.includes(TicketStatus.EXTENDABLE)) aggregateStatus = TicketStatus.REFRESH_NEEDED;
                          const dotClr = aggregateStatus === TicketStatus.EXPIRED ? '#ef4444' : aggregateStatus === TicketStatus.REFRESH_NEEDED ? '#f59e0b' : '#10b981';

                          return (
                            <React.Fragment key={jobNum}>
                              <tr
                                onClick={() => toggleJobExpansion(jobNum)}
                                className={`cursor-pointer group transition-colors border-l-2 ${isExpanded ? 'border-l-brand' : 'border-l-transparent'} ${isDarkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70'}`}
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 ${isExpanded ? 'bg-brand/15 text-brand border border-brand/20 rotate-90' : isDarkMode ? 'bg-white/[0.04] text-slate-600 border border-white/[0.06]' : 'bg-slate-100 text-slate-400'}`}>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleJobSelection(jobNum, jobEntity); }} className={`text-[13px] font-black hover:text-brand transition-colors text-left font-display ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                      #{jobNum}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${isDarkMode ? 'bg-white/[0.04] text-slate-500' : 'bg-slate-100 text-slate-500'}`}>{jobTickets.length}</span>
                                </td>
                                <td className="px-5 py-4">
                                  <p className={`text-[12px] font-bold truncate max-w-[200px] ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{jobEntity?.customer || 'Direct Client'}</p>
                                  <p className={`text-[10px] truncate max-w-[200px] mt-0.5 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{jobEntity?.city || 'Field Location'}</p>
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <div className="inline-flex items-center justify-center">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ background: dotClr, boxShadow: `0 0 8px ${dotClr}60` }} />
                                  </div>
                                </td>
                                <td className={`px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>
                                  {isExpanded ? '▲' : '▼'}
                                </td>
                                <td className="px-5 py-4" />
                                <td className="px-5 py-4" />

                                <td className="px-5 py-4 text-right">
                                  {isAdmin && (
                                    <button onClick={(e) => { e.stopPropagation(); jobEntity && apiService.deleteJob(jobEntity.id).then(() => initApp()); }} className="p-1.5 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {isExpanded && jobTickets.map((ticket: DigTicket) => {
                                const status = getTicketStatus(ticket);
                                return (
                                  <tr key={ticket.id} data-ticket-id={ticket.id} onClick={() => isAdmin && setEditingTicket(ticket)} className={`group transition-all border-l-2 border-brand/25 ${isAdmin ? 'cursor-pointer' : ''} ${highlightedTicketId === ticket.id ? isDarkMode ? 'bg-brand/20 border-brand' : 'bg-brand/10 border-brand' : isDarkMode ? 'bg-black/20 hover:bg-white/[0.02]' : 'bg-slate-50/50 hover:bg-brand/5'} ${ticket.isArchived ? 'opacity-40' : ''}`}>
                                    <td className="px-5 py-3 pl-14">
                                      <div className="flex items-center gap-2.5">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ticket.isArchived ? 'bg-slate-600' : 'bg-brand'}`} style={!ticket.isArchived ? { boxShadow: '0 0 4px var(--brand-shadow)' } : {}} />
                                        <button onClick={(e) => { e.stopPropagation(); if (ticket.documentUrl) setViewingDocUrl(ticket.documentUrl); }} title={`Ticket ${ticket.ticketNo}`} className={`text-[11px] font-mono font-bold tracking-tight transition-colors ${ticket.documentUrl ? 'text-brand hover:underline' : isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                          {ticket.ticketNo}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); window.open(`https://newtin.julie1call.com/responsedisplay/?ticket=${ticket.ticketNo}`, '_blank', 'noopener,noreferrer'); }} title="Check Positive Response" className={`p-1 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0 ${isDarkMode ? 'text-slate-500 hover:text-brand hover:bg-brand/10' : 'text-slate-400 hover:text-brand hover:bg-brand/10'}`}>
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                                        </button>
                                        {ticketIdsWithNotes.has(ticket.id) && (
                                          <span title="Has notes" className="text-brand shrink-0">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h14l4 4V4a2 2 0 00-2-2zm-2 10H6v-2h12v2zm0-3H6V7h12v2z"/></svg>
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-3" />
                                    <td className="px-5 py-3">
                                      <p className={`text-[11px] font-semibold truncate max-w-[220px] ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>{ticket.street}</p>
                                      <p className={`text-[9px] font-black uppercase tracking-widest truncate max-w-[220px] mt-0.5 ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>{ticket.crossStreet ? `@ ${ticket.crossStreet}` : ''}</p>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${ticket.isArchived ? isDarkMode ? 'bg-white/5 text-slate-600 border-white/10' : 'bg-slate-100 text-slate-400 border-slate-200' : getStatusColor(status)}`}>
                                        {ticket.isArchived ? 'ARCHIVED' : status}
                                      </span>
                                    </td>
                                    <td className={`px-5 py-3 text-[11px] font-semibold text-right tabular-nums ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                      {(ticket.callInDate || ticket.digByDate) ? formatDateStr(ticket.digByDate || addDaysToDateStr(ticket.callInDate, 10)) : <span className={`text-[10px] ${isDarkMode ? 'text-slate-700' : 'text-slate-400'}`}>—</span>}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                      {ticket.workBegun === true ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                          Yes
                                        </span>
                                      ) : ticket.workBegun === false ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                          No
                                        </span>
                                      ) : (
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${isDarkMode ? 'bg-white/5 text-slate-600 border border-white/10' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className={`px-5 py-3 text-[11px] font-semibold text-right tabular-nums ${isDarkMode ? 'text-slate-600' : 'text-slate-500'}`}>
                                      {formatDateStr(ticket.expires)}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={(e) => { e.stopPropagation(); setNotesTicket(ticket); }} className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-slate-500 hover:text-brand hover:bg-brand/10' : 'text-slate-400 hover:text-brand hover:bg-brand/10'}`} title="Notes">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setNoShowTicket(ticket); }} className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-rose-600 hover:text-rose-400 hover:bg-rose-500/10' : 'text-rose-400 hover:text-rose-600 hover:bg-rose-50'}`} title="Log No Show">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                        </button>
                                        <button onClick={(e) => handleRefreshRequest(ticket, e)} title={ticket.refreshRequested ? "Clear Refresh" : "Request Refresh"} className={`p-1.5 rounded-lg transition-all ${ticket.refreshRequested ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500 hover:text-white' : isDarkMode ? 'text-amber-600 hover:text-amber-400 hover:bg-amber-500/10' : 'text-amber-500 hover:bg-amber-50'}`}>
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleToggleArchive(ticket, e); }} className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-slate-700 hover:text-brand hover:bg-brand/10' : 'text-slate-400 hover:text-brand hover:bg-brand/10'}`} title="Archive">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        {groupedTicketsMap.size === 0 && (
                          <tr>
                            <td colSpan={6} className="py-20 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/[0.03] border border-white/[0.05]' : 'bg-slate-100'}`}>
                                  <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <p className={`text-[11px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No Active Tickets</p>
                                <p className={`text-[10px] ${isDarkMode ? 'text-slate-700' : 'text-slate-500'}`}>All clear — or create a new ticket to get started.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'calendar' && <CalendarView tickets={tickets} onEditTicket={setEditingTicket} onViewDoc={setViewingDocUrl} onManageNoShow={setNoShowTicket} isDarkMode={isDarkMode} />}
            {activeView === 'map' && <MapView
              tickets={activeTicketsList}
              isDarkMode={isDarkMode}
              onEditTicket={isAdmin ? setEditingTicket : undefined}
              onViewTicket={setViewingDocUrl}
              onTicketGeocoded={(id, lat, lng) => {
                setTickets(prev => prev.map(t => t.id === id ? { ...t, lat, lng } : t));
              }}
              onPinMoved={isAdmin ? (id, lat, lng) => {
                setTickets(prev => prev.map(t => t.id === id ? { ...t, lat, lng } : t));
                apiService.updateTicketCoords(id, lat, lng).catch((err) => console.error('Failed to save adjusted pin coordinates:', err));
              } : undefined}
              onOpenInDashboard={(ticket) => {
                handleNavigate('dashboard');
                setExpandedJobs(prev => new Set([...prev, ticket.jobNumber]));
                setHighlightedTicketId(ticket.id);
              }}
            />}
            {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} isAdmin={isAdmin} isDarkMode={isDarkMode} onJobSelect={(job: Job) => handleJobSelection(job.jobNumber, job)} onViewDoc={setViewingDocUrl} />}
            {activeView === 'photos' && <PhotoManager photos={photos} jobs={jobs} tickets={tickets} isDarkMode={isDarkMode} isAdmin={isAdmin} companyId={sessionUser.companyId} onAddPhoto={(data, file) => apiService.addPhoto({ ...data, companyId: sessionUser.companyId }, file)} onDeletePhoto={(id: string) => apiService.deletePhoto(id)} onDeleteJob={async (id) => { await apiService.deleteJob(id); initApp(); }} initialSearch={mediaFolderFilter} />}
            {activeView === 'team' && <TeamManagement users={users} sessionUser={sessionUser} company={company || undefined} isDarkMode={isDarkMode} isSuperAdmin={isSuperAdmin} allCompanies={allCompanies} onCompanyCreated={(co) => setAllCompanies(prev => [...prev, co])} onCompanyUpdated={handleUpdateCompany} onAddUser={async (u) => { await apiService.addUser({ ...u, companyId: sessionUser.companyId }); initApp(); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); initApp(); }} onToggleRole={async (u) => { await apiService.updateUserRole(u.id, u.role === UserRole.ADMIN ? UserRole.CREW : UserRole.ADMIN); initApp(); }} onUpdateUserName={async (id, name) => { await apiService.updateUserName(id, name); initApp(); }} onSendPasswordReset={async (email) => { await apiService.sendPasswordReset(email); }} onUpdateCurrentUserPassword={async (password) => { await apiService.updateCurrentUserPassword(password); }} />}
            {activeView === 'asbuilt' && <AsBuiltView jobs={jobs} sessionUser={sessionUser} isAdmin={isAdmin} isDarkMode={isDarkMode} onDeleteJob={async (id) => { await apiService.deleteJob(id); initApp(); }} />}
          </div>
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-2 pt-2 pb-6 border-t backdrop-blur-xl ${isDarkMode ? 'bg-[#0b1629]/95 border-white/[0.05]' : 'bg-white/95 border-slate-200'}`}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button key={item.id} onClick={() => handleNavigate(item.id)} className={`flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl ${isActive ? 'text-brand' : isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
              <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-brand/10' : ''}`}>{item.icon}</div>
              <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── MODALS ── */}
      {(showTicketForm || editingTicket) && <TicketForm onSave={handleSaveTicket} onDelete={editingTicket ? handleDeleteTicket : undefined} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket} isDarkMode={isDarkMode} existingTickets={tickets} />}
      {(showJobForm || editingJob) && <JobForm onSave={async (data) => { const job: Job = editingJob ? { ...editingJob, ...data } : { ...data, id: crypto.randomUUID(), companyId: sessionUser.companyId, createdAt: Date.now(), isComplete: false }; const saved = await apiService.saveJob(job); setJobs(prev => [...prev.filter(j => j.id !== saved.id), saved]); setShowJobForm(false); setEditingJob(null); }} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} isDarkMode={isDarkMode} />}
      {selectedJobSummary && <JobSummaryModal job={selectedJobSummary} onClose={() => setSelectedJobSummary(null)} onEdit={() => { setEditingJob(selectedJobSummary); setShowJobForm(true); setSelectedJobSummary(null); }} onDelete={() => { apiService.deleteJob(selectedJobSummary.id).then(() => initApp()); setSelectedJobSummary(null); }} onToggleComplete={async () => { await apiService.saveJob({ ...selectedJobSummary, isComplete: !selectedJobSummary.isComplete }); initApp(); }} onViewMedia={() => { setMediaFolderFilter(selectedJobSummary.jobNumber); handleNavigate('photos'); }} onViewMarkup={() => { setShowMarkup(selectedJobSummary); setSelectedJobSummary(null); }} isDarkMode={isDarkMode} />}
      {showMarkup && <JobPrintMarkup job={showMarkup} isAdmin={isAdmin} sessionUser={sessionUser} onClose={() => setShowMarkup(null)} isDarkMode={isDarkMode} />}
      {noShowTicket && <NoShowForm ticket={noShowTicket} userName={sessionUser?.name || ''} onSave={async (record) => { await apiService.addNoShow(record); initApp(); }} onDelete={async () => { await apiService.deleteNoShow(noShowTicket.id); initApp(); return true; }} onClose={() => setNoShowTicket(null)} isDarkMode={isDarkMode} />}
      {notesTicket && <TicketNotesModal ticket={notesTicket} userName={sessionUser?.name || ''} isAdmin={isAdmin} onClose={() => { setNotesTicket(null); apiService.getNotes().then(setNotes).catch((err) => console.error('Failed to refresh notes:', err)); }} isDarkMode={isDarkMode} />}
      {digConfirmTicket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-[2rem] shadow-2xl border p-8 space-y-6 ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Dig Check — Day 9</p>
                <p className={`text-[13px] font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ticket #{digConfirmTicket.ticketNo}</p>
              </div>
            </div>
            <div className={`text-xs font-semibold leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <p>{digConfirmTicket.street}{digConfirmTicket.crossStreet ? ` @ ${digConfirmTicket.crossStreet}` : ''}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Called in: {digConfirmTicket.callInDate} · Dig by: {formatDateStr(digConfirmTicket.digByDate || addDaysToDateStr(digConfirmTicket.callInDate || '', 10))}
              </p>
              <p className="mt-3 font-bold text-sm">Has work begun on this ticket?</p>
              <p className="mt-1 text-[10px] text-slate-400">If no, this ticket will be marked expired. If yes, it remains valid until the expiration date.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleDigConfirm(false)}
                className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${isDarkMode ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'}`}
              >
                No — Not Dug
              </button>
              <button
                onClick={() => handleDigConfirm(true)}
                className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95"
              >
                Yes — Work Begun
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingDocUrl && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4">
          <button onClick={() => setViewingDocUrl(null)} className="absolute top-5 right-5 p-3 bg-white/10 rounded-xl text-white hover:bg-rose-500/80 transition-all z-10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="w-full max-w-5xl h-[90vh] rounded-2xl bg-slate-900 shadow-2xl overflow-hidden border border-white/10 relative">
            <iframe src={viewingDocUrl} className="w-full h-full bg-white" title="Document Preview" />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
