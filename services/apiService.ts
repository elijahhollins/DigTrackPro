
import { DigTicket, JobPhoto, JobNote, UserRecord, UserRole } from '../types';

const DB_KEYS = {
  TICKETS: 'dig_tickets_db_v1',
  PHOTOS: 'dig_photos_db_v1',
  NOTES: 'dig_notes_db_v1',
  USERS: 'dig_users_db_v1'
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const apiService = {
  async getUsers(): Promise<UserRecord[]> {
    const data = localStorage.getItem(DB_KEYS.USERS);
    if (!data) {
      const defaults = [
        { id: '1', name: 'Admin User', username: 'admin', password: 'admin123', role: UserRole.ADMIN },
        { id: '2', name: 'Field Tech', username: 'crew', password: 'crew123', role: UserRole.CREW }
      ];
      localStorage.setItem(DB_KEYS.USERS, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(data);
  },

  async addUser(user: UserRecord): Promise<UserRecord> {
    const users = await this.getUsers();
    users.push(user);
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
    return user;
  },

  async deleteUser(id: string): Promise<void> {
    const users = await this.getUsers();
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users.filter(u => u.id !== id)));
  },

  async getTickets(): Promise<DigTicket[]> {
    await delay(100);
    const data = localStorage.getItem(DB_KEYS.TICKETS);
    return data ? JSON.parse(data) : [];
  },

  async saveTicket(ticket: DigTicket): Promise<DigTicket> {
    const tickets = await this.getTickets();
    const index = tickets.findIndex(t => t.id === ticket.id);
    if (index > -1) {
      tickets[index] = ticket;
    } else {
      tickets.unshift(ticket);
    }
    localStorage.setItem(DB_KEYS.TICKETS, JSON.stringify(tickets));
    return ticket;
  },

  async deleteTicket(id: string): Promise<void> {
    const tickets = await this.getTickets();
    localStorage.setItem(DB_KEYS.TICKETS, JSON.stringify(tickets.filter(t => t.id !== id)));
  },

  async getPhotos(): Promise<JobPhoto[]> {
    const data = localStorage.getItem(DB_KEYS.PHOTOS);
    return data ? JSON.parse(data) : [];
  },

  async addPhoto(photo: JobPhoto): Promise<JobPhoto> {
    const photos = await this.getPhotos();
    photos.unshift(photo);
    localStorage.setItem(DB_KEYS.PHOTOS, JSON.stringify(photos));
    return photo;
  },

  async deletePhoto(id: string): Promise<void> {
    const photos = await this.getPhotos();
    localStorage.setItem(DB_KEYS.PHOTOS, JSON.stringify(photos.filter(p => p.id !== id)));
  },

  async getNotes(): Promise<JobNote[]> {
    const data = localStorage.getItem(DB_KEYS.NOTES);
    return data ? JSON.parse(data) : [];
  },

  async addNote(note: JobNote): Promise<JobNote> {
    const notes = await this.getNotes();
    notes.unshift(note);
    localStorage.setItem(DB_KEYS.NOTES, JSON.stringify(notes));
    return note;
  }
};
