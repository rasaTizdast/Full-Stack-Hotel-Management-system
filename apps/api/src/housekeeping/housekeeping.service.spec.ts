import { PrismaService } from '../database/prisma.service';
import type { StaffPrincipal } from '../staff-auth/staff-auth.types';
import { RoomCapacityService } from '../rooms/room-capacity.service';
import { HousekeepingService } from './housekeeping.service';

describe('HousekeepingService discrepancy report dates', () => {
  const roomId = 'b3105a64-ea72-4f5a-90fd-e72dff90ba4c';
  const roomTypeId = '29d923eb-75b7-477d-a466-ffebddfc5f9a';
  const actor = { id: 'manager-1', role: 'MANAGER' } as StaffPrincipal;
  const currentBusinessDate = new Date('2026-11-19T00:00:00.000Z');

  it.each(['2026-11-18', '2026-11-20'])(
    'rejects a %s occupancy observation before writing a discrepancy or audit event',
    async (requestedDate) => {
      const note = 'Occupancy was observed during the current shift.';
      const transaction = {
        room: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: roomId, roomTypeId })
            .mockResolvedValueOnce({ id: roomId, roomTypeId, isActive: true }),
        },
        roomAssignment: { count: jest.fn().mockResolvedValue(0) },
        housekeepingTask: { findFirst: jest.fn() },
        roomDiscrepancy: {
          create: jest.fn().mockResolvedValue({
            id: 'discrepancy-1',
            kind: 'SLEEP',
            expectedOccupied: false,
            observedOccupied: true,
            status: 'OPEN',
          }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'discrepancy-1',
            roomId,
            businessDate: new Date(requestedDate + 'T00:00:00.000Z'),
            kind: 'SLEEP',
            expectedOccupied: false,
            observedOccupied: true,
            status: 'OPEN',
            note,
            reportedAt: new Date('2026-11-19T10:00:00.000Z'),
            room: { roomNumber: '101', floor: '1' },
            reportedBy: { id: actor.id, username: 'manager-1' },
            resolvedBy: null,
            resolvedAt: null,
            resolutionReason: null,
          }),
        },
      };
      const prisma = {
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(transaction)),
      };
      const capacity = {
        lockRoomType: jest.fn(),
        lockRoom: jest.fn(),
        getHotelBusinessDate: jest.fn().mockResolvedValue(currentBusinessDate),
      };
      const audit = { record: jest.fn() };
      const service = new HousekeepingService(
        prisma as unknown as PrismaService,
        capacity as unknown as RoomCapacityService,
        audit,
      );

      await expect(
        service.reportDiscrepancy(actor, roomId, {
          businessDate: requestedDate,
          observedOccupied: true,
          note,
        }),
      ).rejects.toMatchObject({
        response: { code: 'BUSINESS_DATE_MISMATCH' },
      });

      expect(capacity.getHotelBusinessDate).toHaveBeenCalledTimes(1);
      expect(transaction.roomAssignment.count).not.toHaveBeenCalled();
      expect(transaction.roomDiscrepancy.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );
});
