
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole, Job } from '../types';

const DB_KEYS = {
  TICKETS: 'dig_tickets_db_v1',
  PHOTOS: 'dig_photos_db_v1',
  NOTES: 'dig_notes_db_v1',
  USERS: 'dig_users_db_v1',
  JOBS: 'dig_jobs_db_v1'
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const getRelativeDate = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
};

const getRelativeDateTime = (daysOffset: number, hoursOffset: number = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(d.getHours() + hoursOffset);
  return d.toISOString().substring(0, 16);
};

// Tiny transparent pixel base64 placeholders for sample photos
const SAMPLE_PHOTO_1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SAMPLE_PHOTO_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Safely saves to localStorage and handles QuotaExceededError
 */
const safeSave = (key: string, value: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e: any) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      const msg = "Database Full: Your browser's storage quota has been exceeded. Please delete old photos or jobs to make room.";
      alert(msg);
      console.error(msg, e);
    } else {
      console.error("Storage Error:", e);
    }
    return false;
  }
};

export const apiService = {
  async getUsers(): Promise<UserRecord[]> {
    const data = localStorage.getItem(DB_KEYS.USERS);
    if (!data) {
      const defaults = [
        { id: '1', name: 'Admin User', username: 'admin', password: 'admin123', role: UserRole.ADMIN },
        { id: '2', name: 'Field Tech', username: 'crew', password: 'crew123', role: UserRole.CREW },
        { id: '3', name: 'Jane Doe', username: 'jane', password: 'jane123', role: UserRole.CREW }
      ];
      safeSave(DB_KEYS.USERS, defaults);
      return defaults;
    }
    return JSON.parse(data);
  },

  async addUser(user: UserRecord): Promise<UserRecord> {
    const users = await this.getUsers();
    users.push(user);
    safeSave(DB_KEYS.USERS, users);
    return user;
  },

  async deleteUser(id: string): Promise<void> {
    const users = await this.getUsers();
    safeSave(DB_KEYS.USERS, users.filter(u => u.id !== id));
  },

  async getJobs(): Promise<Job[]> {
    const data = localStorage.getItem(DB_KEYS.JOBS);
    if (!data) {
      const sampleJobs: Job[] = [
        {
          id: 'job-1',
          jobNumber: '25-001',
          customer: 'City of Springfield',
          address: '742 Evergreen Terrace',
          city: 'Springfield',
          state: 'IL',
          county: 'Sangamon',
          createdAt: Date.now() - 86400000 * 10,
          isComplete: false
        },
        {
          id: 'job-2',
          jobNumber: '25-002',
          customer: 'Wayne Enterprises',
          address: '1007 Mountain Drive',
          city: 'Gotham',
          state: 'NJ',
          county: 'Gotham County',
          createdAt: Date.now() - 86400000 * 5,
          isComplete: false
        },
        {
          id: 'job-3',
          jobNumber: '24-999',
          customer: 'Daily Planet',
          address: '5th Ave & 42nd St',
          city: 'Metropolis',
          state: 'NY',
          county: 'New York',
          createdAt: Date.now() - 86400000 * 30,
          isComplete: true
        },
        {
          id: 'job-4',
          jobNumber: '25-003',
          customer: 'Star Labs',
          address: 'Central City Square',
          city: 'Central City',
          state: 'MO',
          county: 'Central County',
          createdAt: Date.now(),
          isComplete: false
        }
      ];
      safeSave(DB_KEYS.JOBS, sampleJobs);
      return sampleJobs;
    }
    return JSON.parse(data);
  },

  async saveJob(job: Job): Promise<Job> {
    const jobs = await this.getJobs();
    const index = jobs.findIndex(j => j.id === job.id);
    if (index > -1) {
      jobs[index] = job;
    } else {
      jobs.unshift(job);
    }
    safeSave(DB_KEYS.JOBS, jobs);
    return job;
  },

  async deleteJob(id: string): Promise<void> {
    const jobs = await this.getJobs();
    safeSave(DB_KEYS.JOBS, jobs.filter(j => j.id !== id));
  },

  async getTickets(): Promise<DigTicket[]> {
    await delay(100);
    const data = localStorage.getItem(DB_KEYS.TICKETS);
    if (!data) {
      const sampleTickets: DigTicket[] = [
        // Valid Ticket (Green)
        {
          id: 't-1',
          jobNumber: '25-001',
          ticketNo: '250101001',
          address: '742 Evergreen Terrace (Front Yard)',
          county: 'Sangamon',
          city: 'Springfield',
          state: 'IL',
          callInDate: getRelativeDate(-10),
          digStart: getRelativeDateTime(-8, 8),
          expirationDate: getRelativeDate(14),
          siteContact: 'crew',
          createdAt: Date.now() - 1000000
        },
        // Extendable Ticket (Orange - expires in 2 days)
        {
          id: 't-2',
          jobNumber: '25-001',
          ticketNo: '250101002',
          address: '742 Evergreen Terrace (Back Alley)',
          county: 'Sangamon',
          city: 'Springfield',
          state: 'IL',
          callInDate: getRelativeDate(-25),
          digStart: getRelativeDateTime(-23, 7),
          expirationDate: getRelativeDate(2),
          siteContact: 'crew',
          createdAt: Date.now() - 2000000
        },
        // Expired Ticket (Red)
        {
          id: 't-3',
          jobNumber: '25-002',
          ticketNo: '250202999',
          address: '1007 Mountain Drive (North Gate)',
          county: 'Gotham County',
          city: 'Gotham',
          state: 'NJ',
          callInDate: getRelativeDate(-40),
          digStart: getRelativeDateTime(-38, 9),
          expirationDate: getRelativeDate(-1),
          siteContact: 'jane',
          createdAt: Date.now() - 3000000
        },
        // Pending Ticket (Gray - dig start in future)
        {
          id: 't-4',
          jobNumber: '25-003',
          ticketNo: '250303001',
          address: 'Central City Square (Plaza)',
          county: 'Central County',
          city: 'Central City',
          state: 'MO',
          callInDate: getRelativeDate(-1),
          digStart: getRelativeDateTime(2, 8),
          expirationDate: getRelativeDate(28),
          siteContact: 'admin',
          createdAt: Date.now()
        },
        // Another Valid Ticket
        {
          id: 't-5',
          jobNumber: '25-002',
          ticketNo: '250202888',
          address: '1007 Mountain Drive (Bat Cave Entrance)',
          county: 'Gotham County',
          city: 'Gotham',
          state: 'NJ',
          callInDate: getRelativeDate(-5),
          digStart: getRelativeDateTime(-3, 10),
          expirationDate: getRelativeDate(20),
          siteContact: 'jane',
          createdAt: Date.now() - 500000
        }
      ];
      safeSave(DB_KEYS.TICKETS, sampleTickets);
      return sampleTickets;
    }
    return JSON.parse(data);
  },

  async saveTicket(ticket: DigTicket): Promise<DigTicket> {
    const tickets = await this.getTickets();
    const index = tickets.findIndex(t => t.id === ticket.id);
    if (index > -1) {
      tickets[index] = ticket;
    } else {
      tickets.unshift(ticket);
    }
    safeSave(DB_KEYS.TICKETS, tickets);
    return ticket;
  },

  async deleteTicket(id: string): Promise<void> {
    const tickets = await this.getTickets();
    safeSave(DB_KEYS.TICKETS, tickets.filter(t => t.id !== id));
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const data = localStorage.getItem(DB_KEYS.PHOTOS);
    if (!data) {
      const samplePhotos: JobPhoto[] = [
        {
          id: 'p-1',
          jobNumber: '25-001',
          dataUrl: SAMPLE_PHOTO_1,
          timestamp: Date.now() - 86400000 * 2,
          caption: 'Pre-dig utility marks'
        },
        {
          id: 'p-2',
          jobNumber: '25-002',
          dataUrl: SAMPLE_PHOTO_2,
          timestamp: Date.now() - 86400000 * 1,
          caption: 'Gas line clear zone'
        }
      ];
      safeSave(DB_KEYS.PHOTOS, samplePhotos);
      return samplePhotos;
    }
    return JSON.parse(data);
  },

  async addPhoto(photo: JobPhoto): Promise<JobPhoto> {
    const photos = await this.getPhotos();
    photos.unshift(photo);
    if (safeSave(DB_KEYS.PHOTOS, photos)) {
      return photo;
    }
    throw new Error("Quota Exceeded");
  },

  async deletePhoto(id: string): Promise<void> {
    const photos = await this.getPhotos();
    safeSave(DB_KEYS.PHOTOS, photos.filter(p => p.id !== id));
  },

  async getNotes(): Promise<JobNote[]> {
    const data = localStorage.getItem(DB_KEYS.NOTES);
    if (!data) {
      const sampleNotes: JobNote[] = [
        {
          id: 'n-1',
          jobNumber: '25-001',
          text: 'Utilities marked on time. Blue and Red paint clearly visible.',
          author: 'crew',
          timestamp: Date.now() - 86400000 * 3
        },
        {
          id: 'n-2',
          jobNumber: '25-002',
          text: 'URGENT: Locate ticket expired. Excavation halted until renewal.',
          author: 'admin',
          timestamp: Date.now() - 3600000
        }
      ];
      safeSave(DB_KEYS.NOTES, sampleNotes);
      return sampleNotes;
    }
    return JSON.parse(data);
  },

  async addNote(note: JobNote): Promise<JobNote> {
    const notes = await this.getNotes();
    notes.unshift(note);
    safeSave(DB_KEYS.NOTES, notes);
    return note;
  }
};
