import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export type TransactionClient = Prisma.TransactionClient;

export type RoomCapacityProjection = {
  inventoryId: string;
  stayDate: Date;
  totalRooms: number;
  storedBlockedRooms: number;
  heldRooms: number;
  bookedRooms: number;
  activeRooms: number;
  blockedRooms: number;
};

export type DateCapacityProjection = {
  stayDate: Date;
  activeRooms: number;
  blockedRooms: number;
};

export function hotelBusinessDate(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));
  return new Date(Date.UTC(year, month - 1, day));
}

function capacityConflict(): ConflictException {
  return new ConflictException({
    code: 'CAPACITY_BELOW_RESERVED',
    message: 'Capacity cannot be lower than held plus booked rooms.',
  });
}

@Injectable()
export class RoomCapacityService {
  async getHotelBusinessDate(
    transaction: TransactionClient,
    roomTypeId: string,
  ): Promise<Date | null> {
    const rows = await transaction.$queryRaw<Array<{ businessDate: Date }>>`
      SELECT hotel."business_date" AS "businessDate"
      FROM "room_types" AS room_type
      JOIN "hotels" AS hotel ON hotel."id" = room_type."hotel_id"
      WHERE room_type."id" = ${roomTypeId}::uuid
    `;
    return rows[0]?.businessDate ?? null;
  }

  async lockRoomType(transaction: TransactionClient, roomTypeId: string): Promise<boolean> {
    // Serialize type mutations without blocking foreign-key checks from public booking inserts.
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "room_types"
      WHERE "id" = ${roomTypeId}::uuid
      FOR NO KEY UPDATE
    `;
    return rows.length > 0;
  }

  async lockRoom(transaction: TransactionClient, roomId: string): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "rooms"
      WHERE "id" = ${roomId}::uuid
      FOR UPDATE
    `;
  }

  async projectDateRange(
    transaction: TransactionClient,
    roomTypeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DateCapacityProjection[]> {
    return transaction.$queryRaw<DateCapacityProjection[]>`
      WITH requested_dates AS (
        SELECT generate_series(
          ${startDate}::date,
          ${endDate}::date - 1,
          interval '1 day'
        )::date AS "stayDate"
      )
      SELECT
        requested_dates."stayDate",
        (
          SELECT COUNT(*)::integer
          FROM "rooms" AS room
          WHERE room."room_type_id" = ${roomTypeId}::uuid
            AND room."is_active" = true
        ) AS "activeRooms",
        (
          SELECT COUNT(DISTINCT block."room_id")::integer
          FROM "room_blocks" AS block
          JOIN "rooms" AS blocked_room ON blocked_room."id" = block."room_id"
          WHERE blocked_room."room_type_id" = ${roomTypeId}::uuid
            AND blocked_room."is_active" = true
            AND block."is_active" = true
            AND block."start_date" <= requested_dates."stayDate"
            AND block."end_date" > requested_dates."stayDate"
        ) AS "blockedRooms"
      FROM requested_dates
      ORDER BY requested_dates."stayDate" ASC
    `;
  }

  async lockAndProjectInventory(
    transaction: TransactionClient,
    roomTypeId: string,
    startDate: Date,
    endDate?: Date,
  ): Promise<RoomCapacityProjection[]> {
    const rows = await transaction.$queryRaw<RoomCapacityProjection[]>`
      SELECT
        inventory."id" AS "inventoryId",
        inventory."stay_date" AS "stayDate",
        inventory."total_rooms" AS "totalRooms",
        inventory."blocked_rooms" AS "storedBlockedRooms",
        inventory."held_rooms" AS "heldRooms",
        inventory."booked_rooms" AS "bookedRooms",
        (
          SELECT COUNT(*)::integer
          FROM "rooms" AS room
          WHERE room."room_type_id" = inventory."room_type_id"
            AND room."is_active" = true
        ) AS "activeRooms",
        (
          SELECT COUNT(DISTINCT block."room_id")::integer
          FROM "room_blocks" AS block
          JOIN "rooms" AS blocked_room ON blocked_room."id" = block."room_id"
          WHERE blocked_room."room_type_id" = inventory."room_type_id"
            AND blocked_room."is_active" = true
            AND block."is_active" = true
            AND block."start_date" <= inventory."stay_date"
            AND block."end_date" > inventory."stay_date"
        ) AS "blockedRooms"
      FROM "room_night_inventory" AS inventory
      WHERE inventory."room_type_id" = ${roomTypeId}::uuid
        AND inventory."stay_date" >= ${startDate}::date
        AND (${endDate ?? null}::date IS NULL OR inventory."stay_date" < ${endDate ?? null}::date)
      ORDER BY inventory."stay_date" ASC
      FOR UPDATE OF inventory
    `;
    return rows;
  }

  async persistProjection(
    transaction: TransactionClient,
    rows: RoomCapacityProjection[],
  ): Promise<void> {
    for (const row of rows) {
      const projectedRooms = row.activeRooms - row.blockedRooms;
      if (projectedRooms < row.heldRooms + row.bookedRooms) {
        throw capacityConflict();
      }
      if (row.totalRooms !== projectedRooms || row.storedBlockedRooms !== row.blockedRooms) {
        await transaction.roomNightInventory.update({
          where: { id: row.inventoryId },
          data: { totalRooms: projectedRooms, blockedRooms: row.blockedRooms },
        });
      }
    }
  }
}
