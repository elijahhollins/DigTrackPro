
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
  CREW = 'CREW',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export interface CompanyInvite {
  id: string;
  companyId: string;
  token: string;
  usedAt?: number;
  createdAt: number;
}

export interface Company {
  id: string;
  name: string;
  brandColor?: string;
  city?: string;
  state?: string;
  phone?: string;
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  username: string;
  companyId: string;
}

export interface UserRecord extends User {
  password?: string;
}

export interface Job {
  id: string;
  companyId: string;
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
  companyId: string;
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

export interface PdfAnnotation {
  id: string;
  printId: string;
  companyId: string;
  authorId: string;
  authorName: string;
  pageNumber: number;
  toolType:
    | 'select' | 'pan'
    | 'pen' | 'highlighter'
    | 'text' | 'callout' | 'stamp'
    | 'arrow' | 'double_arrow' | 'line' | 'dashed_line' | 'dimension'
    | 'rectangle' | 'filled_rectangle' | 'circle' | 'filled_circle' | 'cloud';
  color: string;
  strokeWidth: number;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface DigTicket {
  id: string;
  companyId: string;
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
  digByDate?: string;
  expires: string;
  siteContact: string;
  createdAt: number;
  refreshRequested?: boolean;
  noShowRequested?: boolean;
  isArchived?: boolean;
  workBegun?: boolean;
  documentUrl?: string;
  lat?: number;
  lng?: number;
  boundingBox?: Array<{ lat: number; lng: number }>;
}

export interface NoShowRecord {
  id: string;
  ticketId: string;
  companyId: string;
  jobNumber: string;
  utilities: string[];
  companies: string;
  author: string;
  timestamp: number;
}

export interface JobPhoto {
  id: string;
  companyId: string;
  jobNumber: string;
  dataUrl: string;
  timestamp: number;
  caption: string;
}

export interface JobNote {
  id: string;
  companyId: string;
  jobNumber: string;
  ticketId: string;
  text: string;
  author: string;
  timestamp: number;
}

export type SortField = keyof DigTicket | 'status';
export type SortOrder = 'asc' | 'desc';
export type AppView = 'dashboard' | 'calendar' | 'jobs' | 'photos' | 'team' | 'map';
