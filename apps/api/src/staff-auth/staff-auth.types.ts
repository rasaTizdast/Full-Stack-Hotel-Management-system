import type { Request } from 'express';

export type StaffRole = 'ADMIN' | 'RECEPTIONIST';

export interface StaffPrincipal {
  id: string;
  username: string;
  email: string;
  role: StaffRole;
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
