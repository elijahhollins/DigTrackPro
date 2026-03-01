
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, Job, UserRecord, Company } from './types.ts';
import { getTicketStatus, getStatusColor } from './utils/dateUtils.ts';
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
import Login from './components/Login.tsx';
import CompanyRegistration from './components/CompanyRegistration.tsx';

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
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('dig_theme_mode') !== 'light');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
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
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<TicketStatus | 'NO_SHOW' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc'
  });

  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
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
            role: UserRole.ADMIN, 
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
          // Invited admin: create profile as ADMIN of the specified company
          console.log('Creating new admin profile for invite company ID:', inviteCompanyId);
          if (!displayName) {
            console.error('Invite signup failed: display_name missing from user metadata');
            throw new Error('User name is missing from signup metadata. Please sign up again with your full name.');
          }
          await apiService.addUser({ id: session.user.id, name: displayName, username: session.user.email || '', role: UserRole.ADMIN, companyId: inviteCompanyId });
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
      const [allTicketsRes, allJobsRes, allPhotosRes] = await Promise.allSettled([
        apiService.getTickets(),
        apiService.getJobs(),
        apiService.getPhotos()
      ]);

      setTickets(allTicketsRes.status === 'fulfilled' ? allTicketsRes.value : []);
      setJobs(allJobsRes.status === 'fulfilled' ? allJobsRes.value : []);
      setPhotos(allPhotosRes.status === 'fulfilled' ? allPhotosRes.value : []);

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

  const toggleJobExpansion = (jobNumber: string) => {
    const next = new Set(expandedJobs);
    if (next.has(jobNumber)) next.delete(jobNumber);
    else next.add(jobNumber);
    setExpandedJobs(next);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Connecting Vault...</p>
      </div>
    );
  }

  if (!sessionUser) return <Login authError={authError} />;
  if (showCompanyRegistration) return <CompanyRegistration onComplete={handleCompanyCreation} isDarkMode={isDarkMode} />;

  const isSuperAdmin = sessionUser.role === UserRole.SUPER_ADMIN;
  const isAdmin = sessionUser.role === UserRole.ADMIN || isSuperAdmin;
  const NAV_ITEMS: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Vault', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
    { id: 'jobs', label: 'Projects', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" /></svg> },
    { id: 'calendar', label: 'Schedule', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { id: 'photos', label: 'Media', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { id: 'team', label: 'Team', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
  ];

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-50 text-black'} transition-all duration-500 pb-20 sm:pb-0`}>
      <header className={`${isDarkMode ? 'bg-[#1e293b]/95 border-white/5 shadow-2xl shadow-black/20' : 'bg-white/95 border-slate-200 shadow-sm'} backdrop-blur-xl border-b sticky top-0 z-40 h-16 transition-all duration-500`}>
        <div className="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer group shrink-0" onClick={() => { handleNavigate('dashboard'); }}>
            <div className={`p-2.5 rounded-2xl shadow-lg transition-all duration-500 glow-brand ${isProcessing ? 'bg-purple-500 shadow-purple-500/30' : 'bg-brand shadow-brand/20'} group-hover:scale-110 active:scale-95`}>
              <svg className={`w-5 h-5 text-[#0f172a] ${isProcessing ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div className="hidden lg:block">
              {/* Display the company name associated with the logged-in user. 
                  Company is loaded from database based on user's companyId (see lines 125-128).
                  Falls back to 'DigTrack Pro' if company data is unavailable. */}
              <h1 className="text-sm font-black uppercase tracking-tight group-hover:text-brand transition-colors">{company?.name || 'DigTrack Pro'}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Enterprise Locate Hub</p>
            </div>
          </div>
          
          <nav className="hidden sm:flex items-center gap-1 bg-black/5 p-1 rounded-2xl border border-black/5 mx-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button key={item.id} onClick={() => handleNavigate(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative ${isActive ? 'bg-brand text-slate-900 shadow-lg shadow-brand/10 nav-item-active' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-brand'}`}
                >
                  {item.icon}
                  <span className="hidden md:inline">{item.label}</span>
                  {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-slate-900 rounded-full" />}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1">
               {isAdmin && (
                <>
                  <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-900 hover:text-brand'}`} title="New Job">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </button>
                  <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#0f172a] p-2 rounded-xl shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all" title="New Ticket">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </>
              )}
            </div>
            <div className="w-px h-6 bg-black/10 mx-1 hidden sm:block" />
            <button onClick={toggleDarkMode} className={`p-2.5 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 text-amber-300' : 'bg-slate-100 text-slate-900'}`}>
              {isDarkMode ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
            </button>
            <button onClick={handleSignOut} disabled={isSigningOut} className={`p-2.5 transition-colors ${isSigningOut ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-rose-500'}`}>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main key={activeView} className="max-w-[1400px] mx-auto px-4 py-8 view-transition overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 4rem - 5rem)' }}>
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Locate Vault</h2>
                <div className="flex items-center gap-2 mt-1">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Real-time Field Compliance</p>
                  {!hasApiKey && (
                    <button onClick={handleOpenSelectKey} className="bg-brand text-slate-900 text-[9px] font-black uppercase px-3 py-1 rounded-lg shadow-lg shadow-brand/20 animate-pulse hover:scale-105 transition-all">
                      ⚠️ Connect Paid AI Project
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${showArchived ? 'bg-slate-900 text-white border-slate-900' : isDarkMode ? 'bg-white/5 border-white/5 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  {showArchived ? 'History Included' : 'View History'}
                </button>
                <div className="relative w-full sm:w-64 group">
                  <input type="text" placeholder="Filter vault..." className={`w-full pl-9 pr-4 py-2 border rounded-2xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 shadow-sm text-black'}`} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
                  <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 group-focus-within:text-brand transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
            </div>
            <StatCards tickets={tickets.filter(t => !t.isArchived)} isDarkMode={isDarkMode} activeFilter={activeFilter} onFilterClick={setActiveFilter} />
            <div className={`${isDarkMode ? 'bg-[#1e293b] border-white/5 shadow-2xl shadow-black/40' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'} rounded-[2.5rem] border overflow-hidden`}>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                  <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50/80'} border-b border-black/5`}>
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Project Details</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tickets</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Location Info</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-center text-slate-500">State</th>
                      <th className={`px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right ${isDarkMode ? 'text-slate-500' : 'text-slate-700'}`}>Expiry</th>
                      <th className={`px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right ${isDarkMode ? 'text-slate-500' : 'text-slate-700'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                    {Array.from(groupedTicketsMap.keys()).map((jobNum: string) => {
                      const jobTickets = groupedTicketsMap.get(jobNum)!;
                      const jobEntity = jobs.find(j => j.jobNumber === jobNum);
                      const isExpanded = expandedJobs.has(jobNum);
                      const statuses = jobTickets.filter(t => !t.isArchived).map(t => getTicketStatus(t));
                      let aggregateStatus = TicketStatus.VALID;
                      if (statuses.includes(TicketStatus.EXPIRED)) aggregateStatus = TicketStatus.EXPIRED;
                      else if (statuses.includes(TicketStatus.REFRESH_NEEDED) || statuses.includes(TicketStatus.EXTENDABLE)) aggregateStatus = TicketStatus.REFRESH_NEEDED;
                      return (
                        <React.Fragment key={jobNum}>
                          <tr onClick={() => toggleJobExpansion(jobNum)} className={`transition-all cursor-pointer border-l-4 ${isExpanded ? 'border-brand' : 'border-transparent'} ${isDarkMode ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/80'}`}>
                            <td className="px-8 py-6 flex items-center gap-4">
                              <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${isExpanded ? 'bg-brand/10 border-brand/20 text-brand rotate-90' : 'bg-black/5 border-transparent opacity-40'}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); handleJobSelection(jobNum, jobEntity); }} className={`text-[13px] font-black hover:text-brand transition-colors text-left ${isDarkMode ? 'text-white' : 'text-black'}`}>JOB #{jobNum}</button>
                            </td>
                            <td className="px-8 py-6"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{jobTickets.length} Assets</span></td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col">
                                <span className={`text-[11px] font-black uppercase tracking-tight truncate max-w-[200px] ${isDarkMode ? 'text-white' : 'text-black'}`}>{jobEntity?.customer || 'Direct Client'}</span>
                                <span className={`text-[9px] font-black truncate max-w-[200px] ${isDarkMode ? 'opacity-40' : 'text-slate-900'}`}>{jobEntity?.city || 'Field Location'}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-center"><div className={`w-2.5 h-2.5 rounded-full mx-auto ring-4 ${aggregateStatus === TicketStatus.EXPIRED ? 'bg-rose-500 ring-rose-500/10' : aggregateStatus === TicketStatus.REFRESH_NEEDED ? 'bg-amber-500 ring-amber-500/10' : 'bg-emerald-500 ring-emerald-500/10'}`} /></td>
                            <td className={`px-8 py-6 text-right font-black text-[10px] ${isDarkMode ? 'opacity-30 text-slate-400' : 'opacity-60 text-slate-900'}`}>{isExpanded ? 'COLLAPSE' : 'DETAILS'}</td>
                            <td className="px-8 py-6 text-right">{isAdmin && <button onClick={(e) => { e.stopPropagation(); jobEntity && apiService.deleteJob(jobEntity.id).then(() => initApp()); }} className="p-2.5 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}</td>
                          </tr>
                          {isExpanded && jobTickets.map((ticket: DigTicket) => {
                            const status = getTicketStatus(ticket);
                            return (
                              <tr key={ticket.id} onClick={() => isAdmin && setEditingTicket(ticket)} className={`animate-in transition-all group ${isAdmin ? 'cursor-pointer' : ''} ${isDarkMode ? 'bg-white/[0.01]' : 'bg-slate-50/30'} border-l-4 border-slate-500/10 ${ticket.isArchived ? 'opacity-50 grayscale' : ''}`}>
                                <td className="px-8 py-4 pl-16"><div className="flex items-center gap-3"><div className={`w-2 h-2 rounded-full ${ticket.isArchived ? 'bg-slate-400' : 'bg-brand'}`} /><button onClick={(e) => { e.stopPropagation(); if (ticket.documentUrl) setViewingDocUrl(ticket.documentUrl); }} className={`text-[11px] font-mono font-bold tracking-tight transition-colors ${ticket.documentUrl ? 'hover:text-brand hover:underline text-brand' : 'opacity-40'}`}>{ticket.ticketNo}</button></div></td>
                                <td className="px-8 py-4"></td>
                                <td className="px-8 py-4">
                                  <div className="flex flex-col">
                                    <span className={`text-[11px] font-bold truncate max-w-[300px] ${isDarkMode ? 'text-slate-300' : 'text-slate-950'}`}>{ticket.street}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest truncate max-w-[300px] ${isDarkMode ? 'opacity-40 text-slate-500' : 'text-slate-950'}`}>{ticket.crossStreet ? `at ${ticket.crossStreet}` : 'No Cross Street'}</span>
                                  </div>
                                </td>
                                <td className="px-8 py-4 text-center"><span className={`inline-flex px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border tracking-widest ${ticket.isArchived ? 'bg-slate-100 text-slate-500 border-slate-200' : getStatusColor(status)}`}>{ticket.isArchived ? 'ARCHIVED' : status}</span></td>
                                <td className={`px-8 py-4 text-[11px] font-bold text-right ${isDarkMode ? 'opacity-60 text-slate-300' : 'opacity-100 text-slate-900'}`}>{new Date(ticket.expires).toLocaleDateString()}</td>
                                <td className="px-8 py-4 text-right flex items-center justify-end gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); setNoShowTicket(ticket); }} className="p-2 rounded-xl transition-all border bg-rose-500/5 text-rose-500 border-rose-500/10 hover:bg-rose-500 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleToggleArchive(ticket, e); }} className="p-2 rounded-xl transition-all border bg-slate-100 text-slate-500 hover:text-brand"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg></button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeView === 'calendar' && <CalendarView tickets={tickets} onEditTicket={setEditingTicket} onViewDoc={setViewingDocUrl} />}
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} isAdmin={isAdmin} isDarkMode={isDarkMode} onJobSelect={(job: Job) => handleJobSelection(job.jobNumber, job)} onViewDoc={setViewingDocUrl} />}
        {activeView === 'photos' && <PhotoManager photos={photos} jobs={jobs} tickets={tickets} isDarkMode={isDarkMode} companyId={sessionUser.companyId} onAddPhoto={(data, file) => apiService.addPhoto({ ...data, companyId: sessionUser.companyId }, file)} onDeletePhoto={(id: string) => apiService.deletePhoto(id)} initialSearch={mediaFolderFilter} />}
        {activeView === 'team' && <TeamManagement users={users} sessionUser={sessionUser} company={company || undefined} isDarkMode={isDarkMode} hasApiKey={hasApiKey} isSuperAdmin={isSuperAdmin} allCompanies={allCompanies} onCompanyCreated={(co) => setAllCompanies(prev => [...prev, co])} onCompanyUpdated={handleUpdateCompany} onAddUser={async (u) => { await apiService.addUser({ ...u, companyId: sessionUser.companyId }); initApp(); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); initApp(); }} onThemeChange={applyThemeColor} onToggleRole={async (u) => { await apiService.updateUserRole(u.id, u.role === UserRole.ADMIN ? UserRole.CREW : UserRole.ADMIN); initApp(); }} onOpenSelectKey={handleOpenSelectKey} onUpdateUserName={async (id, name) => { await apiService.updateUserName(id, name); initApp(); }} onSendPasswordReset={async (email) => { await apiService.sendPasswordReset(email); }} onUpdateCurrentUserPassword={async (password) => { await apiService.updateCurrentUserPassword(password); }} />}
        {(showTicketForm || editingTicket) && <TicketForm onSave={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket} isDarkMode={isDarkMode} existingTickets={tickets} />}
        {(showJobForm || editingJob) && <JobForm onSave={async (data) => { const job: Job = editingJob ? { ...editingJob, ...data } : { ...data, id: crypto.randomUUID(), companyId: sessionUser.companyId, createdAt: Date.now(), isComplete: false }; const saved = await apiService.saveJob(job); setJobs(prev => [...prev.filter(j => j.id !== saved.id), saved]); setShowJobForm(false); setEditingJob(null); }} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} isDarkMode={isDarkMode} />}
        {selectedJobSummary && <JobSummaryModal job={selectedJobSummary} onClose={() => setSelectedJobSummary(null)} onEdit={() => { setEditingJob(selectedJobSummary); setShowJobForm(true); setSelectedJobSummary(null); }} onDelete={() => { apiService.deleteJob(selectedJobSummary.id).then(() => initApp()); setSelectedJobSummary(null); }} onToggleComplete={async () => { await apiService.saveJob({ ...selectedJobSummary, isComplete: !selectedJobSummary.isComplete }); initApp(); }} onViewMedia={() => { setMediaFolderFilter(selectedJobSummary.jobNumber); handleNavigate('photos'); }} onViewMarkup={() => { setShowMarkup(selectedJobSummary); setSelectedJobSummary(null); }} isDarkMode={isDarkMode} />}
        {showMarkup && <JobPrintMarkup job={showMarkup} tickets={tickets.filter(t => t.jobNumber === showMarkup.jobNumber)} onClose={() => setShowMarkup(null)} onViewTicket={(url) => setViewingDocUrl(url)} isDarkMode={isDarkMode} />}
        {noShowTicket && <NoShowForm ticket={noShowTicket} userName={sessionUser?.name || ''} onSave={async (record) => { await apiService.addNoShow(record); initApp(); }} onDelete={async () => { await apiService.deleteNoShow(noShowTicket.id); initApp(); return true; }} onClose={() => setNoShowTicket(null)} isDarkMode={isDarkMode} />}
        {viewingDocUrl && (
          <div className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4">
            <button onClick={() => setViewingDocUrl(null)} className="absolute top-6 right-6 p-4 bg-white/10 rounded-full text-white hover:bg-rose-500 transition-all z-10">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="w-full max-w-5xl h-[90vh] rounded-[2rem] bg-slate-900 shadow-2xl overflow-hidden border border-white/5 relative">
              <iframe src={viewingDocUrl} className="w-full h-full bg-white" title="Document Preview" />
            </div>
          </div>
        )}
      </main>
      <nav className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-3 backdrop-blur-xl border-t flex justify-between items-center ${isDarkMode ? 'bg-[#1e293b]/95 border-white/5' : 'bg-white/95 border-slate-200'}`}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return <button key={item.id} onClick={() => handleNavigate(item.id)} className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-brand scale-110' : 'text-slate-500 opacity-60'}`}><div className={`p-2 rounded-xl ${isActive ? 'bg-brand/10' : ''}`}>{item.icon}</div><span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span></button>;
        })}
      </nav>
    </div>
  );
};

export default App;
