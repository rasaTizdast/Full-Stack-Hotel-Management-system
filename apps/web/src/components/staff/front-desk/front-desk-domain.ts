import type { StaffRoomBoardItem, StaffRole } from '@/lib/staff-api';
import type { StaffStayWorklistItem } from '@/lib/staff-front-desk-api';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';

export const ROOM_STATUS: Record<
  StaffStayWorklistItem['assignedRooms'][number]['housekeepingStatus'],
  string
> = {
  DIRTY: 'نیازمند نظافت',
  CLEAN: 'نظافت‌شده؛ نیازمند بازرسی',
  INSPECTED: 'بازرسی‌شده',
};

export function nextIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function dateLabel(date: string): string {
  return formatGregorianAsJalali(date) ?? date;
}

export function isManager(role: StaffRole | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function assignmentsOnDate(stay: StaffStayWorklistItem, date: string) {
  return stay.assignedRooms.filter((room) => room.startDate <= date && date < room.endDate);
}

export function isStayActiveOn(stay: StaffStayWorklistItem, date: string): boolean {
  return stay.checkIn <= date && date < stay.checkOut;
}

export function assignmentSummary(stay: StaffStayWorklistItem, businessDate: string): string {
  const assigned = assignmentsOnDate(stay, businessDate).length;
  return `${formatPersianInteger(assigned)} از ${formatPersianInteger(stay.roomQuantity)} اتاق تخصیص یافته`;
}

export function canMoveTo(room: StaffRoomBoardItem, sourceRoomNumbers: string[]): boolean {
  return (
    room.isActive &&
    room.housekeepingStatus === 'INSPECTED' &&
    room.occupancy === 'VACANT' &&
    room.blocks.length === 0 &&
    !sourceRoomNumbers.includes(room.roomNumber)
  );
}
