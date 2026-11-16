import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { BookingStatus } from './booking-lifecycle';

export type LockedBooking = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  checkIn: Date;
  expiresAt: Date;
  roomTypeId: string;
  roomQuantity: number;
};

export async function lockBookingByReference(
  transaction: Prisma.TransactionClient,
  reference: string,
): Promise<LockedBooking> {
  const rows = await transaction.$queryRaw<LockedBooking[]>`
    SELECT
      id::text AS id,
      public_reference AS "publicReference",
      status::text AS status,
      check_in AS "checkIn",
      expires_at AS "expiresAt",
      room_type_id::text AS "roomTypeId",
      room_quantity AS "roomQuantity"
    FROM bookings
    WHERE public_reference = ${reference}
    FOR UPDATE
  `;
  if (!rows[0]) {
    throw new NotFoundException({
      code: 'BOOKING_NOT_FOUND',
      message: 'The booking was not found.',
    });
  }
  return rows[0];
}
