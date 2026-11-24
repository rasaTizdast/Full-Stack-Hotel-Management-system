import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { Prisma as PrismaTypes } from '../generated/prisma/client';
import { addDays, parseDateOnly } from '../availability/date-range';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FoliosService } from '../folios/folios.service';
import type { StaffPrincipal } from '../staff-auth/staff-auth.types';
import type {
  NightCloseConfirmationDto,
  NightClosePreviewDto,
  NightCloseResultDto,
  RunNightCloseDto,
  StaffOperationsReportDto,
  StaffReportStayDto,
} from './dto/operations.dto';

type TransactionClient = Prisma.TransactionClient;
type CloseSignal = { code: string; count: number; references: string[] };
type PlannedRoomNight = { bookingId: string; roomAssignmentId: string; amountToman: bigint };
type ReportStayRecord = {
  publicReference: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  roomQuantity: number;
  roomType: { name: string };
  assignments: Array<{ room: { roomNumber: string } }>;
};

const hotelOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function amountString(value: bigint): string {
  return value.toString();
}

function conflict(code: string, message: string, details?: Record<string, unknown>) {
  return new ConflictException({ code, message, ...details });
}

function addSignal(
  signals: Map<string, Set<string>>,
  code: string,
  references: string | string[],
): void {
  const values = signals.get(code) ?? new Set<string>();
  for (const reference of Array.isArray(references) ? references : [references]) {
    values.add(reference);
  }
  signals.set(code, values);
}

function toSignals(signals: Map<string, Set<string>>): CloseSignal[] {
  return [...signals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, references]) => ({ code, count: references.size, references: [...references] }));
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly folios: FoliosService,
    private readonly audit: AuditService,
  ) {}

  async previewClose(): Promise<NightClosePreviewDto> {
    return this.prisma.$transaction(async (transaction) => {
      const hotel = await this.primaryHotel(transaction);
      return (await this.computeClosePreview(transaction, hotel)).dto;
    });
  }

  async runNightClose(actor: StaffPrincipal, dto: RunNightCloseDto): Promise<NightCloseResultDto> {
    const requestedDate = parseDateOnly(dto.businessDate);
    return this.prisma.$transaction(
      async (transaction) => {
        const hotelId = await this.lockPrimaryHotel(transaction);
        const hotel = await transaction.hotel.findUnique({
          where: { id: hotelId },
          select: {
            id: true,
            name: true,
            timezone: true,
            businessDate: true,
          },
        });
        if (!hotel) throw new NotFoundException({ code: 'HOTEL_NOT_FOUND' });

        const existing = await transaction.nightCloseRun.findUnique({
          where: { hotelId_businessDate: { hotelId, businessDate: requestedDate } },
        });
        if (existing?.status === 'COMPLETED' && existing.completedAt) {
          return this.toCloseResult(existing, true);
        }
        if (existing) {
          throw conflict('PREVIOUS_CLOSE_INCOMPLETE', 'A prior close run is unfinished.');
        }

        const currentDate = dateString(hotel.businessDate);
        if (currentDate !== dto.businessDate) {
          throw conflict(
            'BUSINESS_DATE_CHANGED',
            'Refresh the preview for the current business date.',
            {
              businessDate: currentDate,
            },
          );
        }

        await this.lockHotelBookingsAndFolios(transaction, hotelId);
        const computation = await this.computeClosePreview(transaction, hotel);
        if (computation.dto.blockers.length > 0) {
          throw conflict('NIGHT_CLOSE_BLOCKED', 'Resolve the listed exceptions before closing.', {
            blockers: computation.dto.blockers,
          });
        }
        this.assertConfirmation(dto.confirmation, computation.dto);

        const run = await transaction.nightCloseRun.create({
          data: {
            hotelId,
            businessDate: requestedDate,
            nextBusinessDate: parseDateOnly(computation.dto.nextBusinessDate),
            status: 'RUNNING',
            warningCount: computation.dto.warningCount,
            actorStaffUserId: actor.id,
          },
        });

        let roomNightCount = 0;
        let accommodationAmount = 0n;
        for (const planned of computation.plannedRoomNights) {
          const posted = await this.folios.postAccommodationNight(transaction, {
            ...planned,
            stayDate: requestedDate,
            actorStaffUserId: actor.id,
          });
          if (!posted.idempotent) {
            roomNightCount += 1;
            accommodationAmount += posted.amountToman;
          }
        }

        const completedAt = await this.databaseNow(transaction);
        const completed = await transaction.nightCloseRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            roomNightCount,
            accommodationAmountToman: accommodationAmount,
            completedAt,
          },
        });
        await transaction.hotel.update({
          where: { id: hotelId },
          data: { businessDate: parseDateOnly(computation.dto.nextBusinessDate) },
        });
        await this.audit.record(transaction, {
          actorStaffUserId: actor.id,
          eventName: 'NIGHT_CLOSE_COMPLETED',
          targetType: 'NIGHT_CLOSE_RUN',
          targetId: completed.id,
          after: {
            businessDate: dto.businessDate,
            nextBusinessDate: computation.dto.nextBusinessDate,
            roomNightCount,
            amountToman: accommodationAmount.toString(),
            warningCount: computation.dto.warningCount,
          },
        });
        return this.toCloseResult(completed, false);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  async getReport(dateInput?: string): Promise<StaffOperationsReportDto> {
    return this.prisma.$transaction(
      async (transaction) => {
        const hotel = await this.primaryHotel(transaction);
        const selectedDate = dateInput ? parseDateOnly(dateInput) : hotel.businessDate;
        const selectedDateString = dateString(selectedDate);

        const staySelect = {
          publicReference: true,
          guestName: true,
          checkIn: true,
          checkOut: true,
          actualDepartureDate: true,
          roomQuantity: true,
          roomType: { select: { name: true } },
          assignments: {
            where: { startDate: { lte: selectedDate }, endDate: { gt: selectedDate } },
            orderBy: [{ startDate: 'asc' as const }, { roomId: 'asc' as const }],
            select: { room: { select: { roomNumber: true } } },
          },
        } satisfies PrismaTypes.BookingSelect;

        const arrivals = await transaction.booking.findMany({
          where: {
            roomType: { hotelId: hotel.id },
            checkIn: selectedDate,
            status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          },
          orderBy: [{ checkIn: 'asc' }, { publicReference: 'asc' }],
          select: staySelect,
        });
        const departures = await transaction.booking.findMany({
          where: {
            roomType: { hotelId: hotel.id },
            status: 'CHECKED_OUT',
            actualDepartureDate: selectedDate,
          },
          orderBy: [{ actualDepartureDate: 'asc' }, { publicReference: 'asc' }],
          select: staySelect,
        });
        const inHouse = await transaction.booking.findMany({
          where: {
            roomType: { hotelId: hotel.id },
            checkIn: { lte: selectedDate },
            OR: [
              { status: 'CHECKED_IN', checkOut: { gt: selectedDate } },
              { status: 'CHECKED_OUT', actualDepartureDate: { gt: selectedDate } },
            ],
          },
          orderBy: [{ checkOut: 'asc' }, { publicReference: 'asc' }],
          select: staySelect,
        });
        const pendingReservations = await transaction.booking.count({
          where: { roomType: { hotelId: hotel.id }, status: 'PENDING_CONFIRMATION' },
        });
        const pendingMaintenance = await transaction.maintenanceRequest.count({
          where: { status: 'OPEN', room: { hotelId: hotel.id } },
        });
        const rooms = await transaction.room.findMany({
          where: { hotelId: hotel.id, isActive: true },
          select: { id: true, housekeepingStatus: true },
        });
        const assignments = await transaction.roomAssignment.findMany({
          where: {
            startDate: { lte: selectedDate },
            endDate: { gt: selectedDate },
            booking: {
              roomType: { hotelId: hotel.id },
              checkIn: { lte: selectedDate },
              OR: [
                {
                  status: 'CHECKED_IN',
                  checkOut: { gt: selectedDate },
                },
                {
                  status: 'CHECKED_OUT',
                  actualDepartureDate: { gt: selectedDate },
                },
              ],
            },
          },
          select: { roomId: true },
        });
        const blocks = await transaction.roomBlock.findMany({
          where: {
            isActive: true,
            startDate: { lte: selectedDate },
            endDate: { gt: selectedDate },
            room: { hotelId: hotel.id },
          },
          select: { kind: true },
        });
        const folios = await transaction.folio.findMany({
          where: { booking: { roomType: { hotelId: hotel.id } }, status: { not: 'CLOSED' } },
          select: {
            entries: { select: { direction: true, amountToman: true } },
            booking: { select: { publicReference: true, guestName: true } },
          },
        });
        const entries = await transaction.folioEntry.findMany({
          where: {
            serviceDate: selectedDate,
            folio: { booking: { roomType: { hotelId: hotel.id } } },
          },
          select: { direction: true, amountToman: true },
        });

        const occupiedRoomIds = new Set(assignments.map(({ roomId }) => roomId));
        const totalRooms = rooms.length;
        const occupied = occupiedRoomIds.size;
        const outOfOrder = blocks.filter(({ kind }) => kind === 'OUT_OF_ORDER').length;
        const capacityClosed = blocks.filter(({ kind }) => kind === 'CAPACITY_CLOSED').length;
        const openBalanceItems = folios
          .map((folio) => {
            const balance = folio.entries.reduce(
              (total, entry) =>
                total + (entry.direction === 'DEBIT' ? entry.amountToman : -entry.amountToman),
              0n,
            );
            return {
              reference: folio.booking.publicReference,
              guestName: folio.booking.guestName,
              balance,
            };
          })
          .filter((folio) => folio.balance > 0n)
          .sort((left, right) => left.reference.localeCompare(right.reference));
        const debits = entries
          .filter(({ direction }) => direction === 'DEBIT')
          .reduce((sum, entry) => sum + entry.amountToman, 0n);
        const credits = entries
          .filter(({ direction }) => direction === 'CREDIT')
          .reduce((sum, entry) => sum + entry.amountToman, 0n);

        return {
          date: selectedDateString,
          businessDate: dateString(hotel.businessDate),
          arrivals: arrivals.map((booking) => this.toReportStay(booking)),
          departures: departures.map((booking) => this.toReportStay(booking)),
          inHouse: inHouse.map((booking) => this.toReportStay(booking)),
          rooms: {
            total: totalRooms,
            occupied,
            available: Math.max(0, totalRooms - occupied),
            occupancyPercent: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
            readiness: {
              inspected: rooms.filter(
                ({ housekeepingStatus }) => housekeepingStatus === 'INSPECTED',
              ).length,
              clean: rooms.filter(({ housekeepingStatus }) => housekeepingStatus === 'CLEAN')
                .length,
              dirty: rooms.filter(({ housekeepingStatus }) => housekeepingStatus === 'DIRTY')
                .length,
            },
          },
          blocks: { outOfOrder, capacityClosed, total: blocks.length },
          pendingRequests: { reservations: pendingReservations, maintenance: pendingMaintenance },
          openBalances: {
            count: openBalanceItems.length,
            balanceToman: amountString(
              openBalanceItems.reduce((sum, item) => sum + item.balance, 0n),
            ),
            items: openBalanceItems.map((item) => ({
              reference: item.reference,
              guestName: item.guestName,
              balanceToman: amountString(item.balance),
            })),
          },
          dailyTotals: { debitsToman: amountString(debits), creditsToman: amountString(credits) },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async computeClosePreview(
    transaction: TransactionClient,
    hotel: { id: string; name: string; timezone: string; businessDate: Date },
  ): Promise<{ dto: NightClosePreviewDto; plannedRoomNights: PlannedRoomNight[] }> {
    const date = hotel.businessDate;
    const nextDateString = addDays(dateString(date), 1);
    const previousRun = await transaction.nightCloseRun.findFirst({
      where: { hotelId: hotel.id, OR: [{ status: 'RUNNING' }, { completedAt: null }] },
      select: { id: true },
    });
    const bookings = await transaction.booking.findMany({
      where: {
        roomType: { hotelId: hotel.id },
        OR: [{ status: 'CONFIRMED' }, { status: 'CHECKED_IN' }],
      },
      orderBy: [{ checkIn: 'asc' }, { publicReference: 'asc' }],
      select: {
        id: true,
        publicReference: true,
        status: true,
        checkIn: true,
        checkOut: true,
        roomQuantity: true,
        nights: {
          where: { stayDate: date },
          select: { nightlyPriceToman: true, roomQuantity: true },
        },
        assignments: {
          where: { isActive: true, startDate: { lte: date }, endDate: { gt: date } },
          orderBy: [{ roomId: 'asc' }, { id: 'asc' }],
          select: { id: true, roomId: true },
        },
        folio: {
          select: {
            id: true,
            status: true,
            entries: {
              where: { serviceDate: date, source: 'ROOM_NIGHT' },
              select: { roomAssignmentId: true, idempotencyKey: true },
            },
          },
        },
      },
    });
    const folios = await transaction.folio.findMany({
      where: { booking: { roomType: { hotelId: hotel.id } }, status: { not: 'CLOSED' } },
      select: {
        booking: { select: { publicReference: true } },
        entries: { select: { direction: true, amountToman: true } },
      },
    });
    const rooms = await transaction.room.findMany({
      where: { hotelId: hotel.id, isActive: true },
      select: { roomNumber: true, housekeepingStatus: true },
    });
    const blocks = await transaction.roomBlock.findMany({
      where: {
        isActive: true,
        startDate: { lte: date },
        endDate: { gt: date },
        room: { hotelId: hotel.id },
      },
      select: { id: true },
    });

    const blockers = new Map<string, Set<string>>();
    const warnings = new Map<string, Set<string>>();
    const plannedRoomNights: PlannedRoomNight[] = [];
    let amountToman = 0n;
    const dateValue = date.getTime();

    if (previousRun) addSignal(blockers, 'PREVIOUS_CLOSE_INCOMPLETE', previousRun.id);

    for (const booking of bookings) {
      const isDueIn = booking.status === 'CONFIRMED' && booking.checkIn.getTime() <= dateValue;
      const isUpcoming = booking.status === 'CONFIRMED' && booking.checkIn > date;
      const isDueOut = booking.status === 'CHECKED_IN' && booking.checkOut <= date;
      const isInHouse =
        booking.status === 'CHECKED_IN' && booking.checkIn <= date && booking.checkOut > date;

      if (isDueIn) addSignal(blockers, 'UNRESOLVED_DUE_IN', booking.publicReference);
      if (isDueOut) addSignal(blockers, 'UNHANDLED_DUE_OUT', booking.publicReference);
      if (isUpcoming) addSignal(warnings, 'UPCOMING_ARRIVAL', booking.publicReference);
      if (!isInHouse) continue;

      addSignal(warnings, 'ACTIVE_IN_HOUSE', booking.publicReference);
      const activeAssignments = booking.assignments;
      const distinctRooms = new Set(activeAssignments.map(({ roomId }) => roomId));
      if (
        activeAssignments.length < booking.roomQuantity ||
        distinctRooms.size < booking.roomQuantity
      ) {
        addSignal(blockers, 'MISSING_CHECKED_IN_ASSIGNMENT', booking.publicReference);
        continue;
      }
      if (
        activeAssignments.length !== booking.roomQuantity ||
        distinctRooms.size !== booking.roomQuantity
      ) {
        addSignal(blockers, 'FAILED_INVARIANT', booking.publicReference);
        continue;
      }
      if (
        !booking.folio ||
        booking.folio.status !== 'OPEN' ||
        booking.nights.length !== 1 ||
        booking.nights[0].roomQuantity !== booking.roomQuantity ||
        booking.nights[0].nightlyPriceToman <= 0n
      ) {
        addSignal(blockers, 'FAILED_INVARIANT', booking.publicReference);
        continue;
      }

      const postedAssignments = new Set(
        booking.folio.entries
          .filter((entry) => entry.roomAssignmentId && entry.idempotencyKey)
          .map(({ roomAssignmentId }) => roomAssignmentId!),
      );
      if (booking.folio.entries.some((entry) => !entry.roomAssignmentId || !entry.idempotencyKey)) {
        addSignal(blockers, 'FAILED_INVARIANT', booking.publicReference);
        continue;
      }
      for (const assignment of activeAssignments) {
        if (postedAssignments.has(assignment.id)) continue;
        plannedRoomNights.push({
          bookingId: booking.id,
          roomAssignmentId: assignment.id,
          amountToman: booking.nights[0].nightlyPriceToman,
        });
        amountToman += booking.nights[0].nightlyPriceToman;
      }
    }

    const openReceivables = folios.filter((folio) => {
      const balance = folio.entries.reduce(
        (total, entry) =>
          total + (entry.direction === 'DEBIT' ? entry.amountToman : -entry.amountToman),
        0n,
      );
      return balance > 0n;
    });
    if (openReceivables.length) {
      addSignal(
        warnings,
        'OPEN_RECEIVABLE',
        openReceivables.map((folio) => folio.booking.publicReference),
      );
    }
    const dirtyRooms = rooms.filter(({ housekeepingStatus }) => housekeepingStatus === 'DIRTY');
    if (dirtyRooms.length) {
      addSignal(
        warnings,
        'DIRTY_ROOM',
        dirtyRooms.map(({ roomNumber }) => roomNumber),
      );
    }
    if (blocks.length)
      addSignal(
        warnings,
        'MAINTENANCE_BLOCK',
        blocks.map(({ id }) => id),
      );

    const blockerSignals = toSignals(blockers);
    const warningSignals = toSignals(warnings);
    const warningCount = warningSignals.reduce((total, warning) => total + warning.count, 0);
    const dto: NightClosePreviewDto = {
      hotelName: hotel.name,
      timezone: hotel.timezone,
      businessDate: dateString(date),
      nextBusinessDate: nextDateString,
      blockers: blockerSignals,
      warnings: warningSignals,
      warningCount,
      accommodation: {
        roomNightCount: plannedRoomNights.length,
        amountToman: amountString(amountToman),
      },
      canClose: blockerSignals.length === 0,
    };
    return {
      dto,
      plannedRoomNights: plannedRoomNights.sort((left, right) =>
        `${left.bookingId}:${left.roomAssignmentId}`.localeCompare(
          `${right.bookingId}:${right.roomAssignmentId}`,
        ),
      ),
    };
  }

  private assertConfirmation(
    confirmation: NightCloseConfirmationDto,
    preview: NightClosePreviewDto,
  ): void {
    if (
      confirmation.businessDate !== preview.businessDate ||
      confirmation.nextBusinessDate !== preview.nextBusinessDate ||
      confirmation.roomNightCount !== preview.accommodation.roomNightCount ||
      confirmation.accommodationAmountToman !== preview.accommodation.amountToman ||
      confirmation.warningCount !== preview.warningCount
    ) {
      throw conflict(
        'NIGHT_CLOSE_CONFIRMATION_STALE',
        'The operational preview changed. Review the current date, charges, advance, and warnings.',
        { preview },
      );
    }
  }

  private async primaryHotel(transaction: TransactionClient) {
    const hotel = await transaction.hotel.findFirst({
      orderBy: hotelOrder,
      select: { id: true, name: true, timezone: true, businessDate: true },
    });
    if (!hotel) throw new NotFoundException({ code: 'HOTEL_NOT_FOUND' });
    return hotel;
  }

  private async lockPrimaryHotel(transaction: TransactionClient): Promise<string> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM hotels
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException({ code: 'HOTEL_NOT_FOUND' });
    return rows[0].id;
  }

  private async lockHotelBookingsAndFolios(
    transaction: TransactionClient,
    hotelId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT booking.id::text AS id
      FROM bookings AS booking
      JOIN room_types AS room_type ON room_type.id = booking.room_type_id
      WHERE room_type.hotel_id = ${hotelId}::uuid
      ORDER BY booking.id ASC
      FOR UPDATE OF booking
    `;
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT folio.id::text AS id
      FROM folios AS folio
      JOIN bookings AS booking ON booking.id = folio.booking_id
      JOIN room_types AS room_type ON room_type.id = booking.room_type_id
      WHERE room_type.hotel_id = ${hotelId}::uuid
      ORDER BY booking.id ASC, folio.id ASC
      FOR UPDATE OF folio
    `;
  }

  private async databaseNow(transaction: TransactionClient): Promise<Date> {
    const rows = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    return rows[0].now;
  }

  private toCloseResult(
    run: {
      businessDate: Date;
      nextBusinessDate: Date;
      status: string;
      roomNightCount: number;
      accommodationAmountToman: bigint;
      warningCount: number;
      completedAt: Date | null;
    },
    replayed: boolean,
  ): NightCloseResultDto {
    if (run.status !== 'COMPLETED' || !run.completedAt) {
      throw conflict('PREVIOUS_CLOSE_INCOMPLETE', 'A prior close run is unfinished.');
    }
    return {
      businessDate: dateString(run.businessDate),
      nextBusinessDate: dateString(run.nextBusinessDate),
      status: 'COMPLETED',
      roomNightCount: run.roomNightCount,
      accommodationAmountToman: amountString(run.accommodationAmountToman),
      warningCount: run.warningCount,
      completedAt: run.completedAt.toISOString(),
      replayed,
    };
  }

  private toReportStay(record: ReportStayRecord): StaffReportStayDto {
    return {
      reference: record.publicReference,
      guestName: record.guestName,
      checkIn: dateString(record.checkIn),
      checkOut: dateString(record.checkOut),
      roomTypeName: record.roomType.name,
      roomQuantity: record.roomQuantity,
      rooms: record.assignments.map(({ room }) => room.roomNumber),
    };
  }
}
