
// ─────────────────────────────────────────────────────────────────────────────
// Inbound Tickets — type declarations
// These are standalone types for the Inbound Tickets module and do not modify
// any existing types in types.ts.
// ─────────────────────────────────────────────────────────────────────────────

export enum InboundTicketStatus {
  UNASSIGNED = 'unassigned',
  ASSIGNED   = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED  = 'completed',
}

export interface InboundTicket {
  id:            string;
  createdAt:     string;
  companyId:     string;
  ticketNumber:  string;
  siteAddress:   string;
  digStartDate:  string;
  dueDate:       string;
  status:        InboundTicketStatus;
  assignedTo:    string | null;  // FK → profiles.id
  callerName:    string;
  callerPhone:   string;
  utilityTypes:  string[];
  notes:         string;
  createdBy:     string;        // FK → profiles.id
}

export interface InboundTicketPhoto {
  id:          string;
  ticketId:    string;
  storagePath: string;
  uploadedBy:  string | null;
  uploadedAt:  string;
  url?:        string;  // resolved public URL
}

export interface InboundTicketNote {
  id:         string;
  ticketId:   string;
  text:       string;
  authorId:   string | null;
  authorName: string;
  createdAt:  string;
}

export const INBOUND_UTILITIES = [
  'Electric',
  'Gas',
  'Water',
  'Telecom',
  'Sewer',
  'Cable',
  'Fiber',
  'Steam',
  'Other',
] as const;

export const INBOUND_STATUS_LABELS: Record<InboundTicketStatus, string> = {
  [InboundTicketStatus.UNASSIGNED]:  'Unassigned',
  [InboundTicketStatus.ASSIGNED]:    'Assigned',
  [InboundTicketStatus.IN_PROGRESS]: 'In Progress',
  [InboundTicketStatus.COMPLETED]:   'Completed',
};
