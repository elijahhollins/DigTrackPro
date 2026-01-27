
export enum TicketStatus {
  PENDING = 'PENDING',
  VALID = 'VALID',
  EXTENDABLE = 'EXTENDABLE',
  REFRESH_NEEDED = 'REFRESH_NEEDED',
  EXPIRED = 'EXPIRED',
  OTHER = 'OTHER'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  CREW = 'CREW'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  username: string;
}

export interface UserRecord extends User {
  password?: string;
}

export interface Job {
  id: string;
  jobNumber: string;
  customer: string;
  address: string;
  city: string;
  state: string;
  county: string;
  createdAt: number;
  isComplete?: boolean;
}

export interface JobPrint {
  id: string;
  jobNumber: string;
  storagePath: string;
  fileName: string;
  isPinned: boolean;
  createdAt: number;
  url?: string;
}

export interface PrintMarker {
  id: string;
  printId: string;
  ticketId: string;
  xPercent: number;
  yPercent: number;
  pageNumber?: number;
  label?: string;
}

export interface DigTicket {
  id: string;
  jobNumber: string;
  ticketNo: string;
  street: string;
  crossStreet: string;
  place: string;
  extent: string;
  county: string;
  city: string;
  state: string;
  callInDate: string;
  workDate: string;
  expires: string;
  siteContact: string;
  createdAt: number;
  refreshRequested?: boolean;
  noShowRequested?: boolean;
  isArchived?: boolean;
  documentUrl?: string;
}

export interface NoShowRecord {
  id: string;
  ticketId: string;
  jobNumber: string;
  utilities: string[];
  companies: string;
  author: string;
  timestamp: number;
}

export interface JobPhoto {
  id: string;
  jobNumber: string;
  dataUrl: string;
  timestamp: number;
  caption: string;
}

export interface JobNote {
  id: string;
  jobNumber: string;
  text: string;
  author: string;
  timestamp: number;
}

export type SortField = keyof DigTicket | 'status';
export type SortOrder = 'asc' | 'desc';
export type AppView = 'dashboard' | 'calendar' | 'jobs' | 'photos' | 'team';
