import type { Request } from 'express';

export type StaffRole = 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';

export interface StaffPrincipal {
  id: string;
  username: string;
  email: string;
  role: StaffRole;
  mustChangePassword: boolean;
}

export type PublicStaff = Omit<StaffPrincipal, 'id'>;

export interface StaffSessionContext {
  id: string;
  csrfTokenHash: string;
}

export interface StaffRequest extends Request {
  staff?: StaffPrincipal;
  staffSession?: StaffSessionContext;
}
