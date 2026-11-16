import { STAFF_CAPABILITIES_BY_ROLE } from './staff-capabilities';

type StaffRole = 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';

type Capability =
  | 'MANAGE_STAFF'
  | 'MANAGE_INVENTORY'
  | 'MANAGE_BOOKINGS'
  | 'MANAGE_ROOM_CATALOG'
  | 'VIEW_ROOM_BOARD'
  | 'VIEW_ASSIGNED_ROOM_WORK'
  | 'UPDATE_HOUSEKEEPING'
  | 'MANAGE_MAINTENANCE'
  | 'VIEW_FOLIOS'
  | 'POST_FOLIO'
  | 'ADJUST_FOLIOS'
  | 'CHECKOUT'
  | 'NIGHT_CLOSE_REPORTS'
  | 'VIEW_FOLIO_ROOM_NUMBER';

const expected: Record<StaffRole, Capability[]> = {
  ADMIN: [
    'MANAGE_STAFF',
    'MANAGE_INVENTORY',
    'MANAGE_BOOKINGS',
    'MANAGE_ROOM_CATALOG',
    'VIEW_ROOM_BOARD',
    'VIEW_ASSIGNED_ROOM_WORK',
    'UPDATE_HOUSEKEEPING',
    'MANAGE_MAINTENANCE',
    'VIEW_FOLIOS',
    'POST_FOLIO',
    'ADJUST_FOLIOS',
    'CHECKOUT',
    'NIGHT_CLOSE_REPORTS',
    'VIEW_FOLIO_ROOM_NUMBER',
  ],
  MANAGER: [
    'MANAGE_INVENTORY',
    'MANAGE_BOOKINGS',
    'MANAGE_ROOM_CATALOG',
    'VIEW_ROOM_BOARD',
    'VIEW_ASSIGNED_ROOM_WORK',
    'UPDATE_HOUSEKEEPING',
    'MANAGE_MAINTENANCE',
    'VIEW_FOLIOS',
    'POST_FOLIO',
    'ADJUST_FOLIOS',
    'CHECKOUT',
    'NIGHT_CLOSE_REPORTS',
  ],
  RECEPTIONIST: ['MANAGE_BOOKINGS', 'VIEW_ROOM_BOARD', 'VIEW_FOLIOS', 'CHECKOUT'],
  HOUSEKEEPER: ['VIEW_ASSIGNED_ROOM_WORK', 'UPDATE_HOUSEKEEPING'],
  CASHIER: ['VIEW_FOLIOS', 'POST_FOLIO', 'CHECKOUT', 'VIEW_FOLIO_ROOM_NUMBER'],
};

describe('explicit staff capability matrix', () => {
  it('grants only the capabilities accepted for each named role', () => {
    for (const role of Object.keys(expected) as StaffRole[]) {
      expect([...STAFF_CAPABILITIES_BY_ROLE[role]].sort()).toEqual([...expected[role]].sort());
    }
  });
});
