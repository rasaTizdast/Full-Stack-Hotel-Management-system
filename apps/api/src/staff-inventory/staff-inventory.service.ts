import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import {
  StaffInventoryResponseDto,
  StaffInventoryRoomTypeOptionDto,
} from './dto/staff-inventory-response.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { parseStaffInventoryDateRange } from './date-range';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

type LockedInventoryRow = {
  heldRooms: number;
  bookedRooms: number;
};

@Injectable()
export class StaffInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findRoomTypeOptions(): Promise<StaffInventoryRoomTypeOptionDto[]> {
    return this.prisma.roomType.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }

  async findRange(query: StaffInventoryRangeQueryDto): Promise<StaffInventoryResponseDto> {
    const range = parseStaffInventoryDateRange(query);
    const roomType = await this.prisma.roomType.findUnique({
      where: { id: query.roomTypeId },
      select: { id: true, name: true, slug: true },
    });
    if (!roomType) {
      throw new NotFoundException('Room type not found.');
    }

    const inventory = await this.prisma.roomNightInventory.findMany({
      where: {
        roomTypeId: query.roomTypeId,
        stayDate: { gte: range.start, lt: range.end },
      },
      orderBy: { stayDate: 'asc' },
      select: {
        stayDate: true,
        totalRooms: true,
        heldRooms: true,
        bookedRooms: true,
        nightlyPriceToman: true,
      },
    });
    const inventoryByDate = new Map(
      inventory.map((night) => [night.stayDate.toISOString().slice(0, 10), night]),
    );

    return {
      roomType,
      startDate: range.startDate,
      endDate: range.endDate,
      nights: range.nights.map(({ dateString }) => {
        const night = inventoryByDate.get(dateString);
        return {
          stayDate: dateString,
          totalRooms: night?.totalRooms ?? null,
          heldRooms: night?.heldRooms ?? null,
          bookedRooms: night?.bookedRooms ?? null,
          availableRooms: night ? night.totalRooms - night.heldRooms - night.bookedRooms : null,
          nightlyPriceToman: night?.nightlyPriceToman.toString() ?? null,
        };
      }),
    };
  }

  async updateRange(dto: UpdateStaffInventoryDto): Promise<StaffInventoryResponseDto> {
    const range = parseStaffInventoryDateRange(dto);
    const nightlyPriceToman = BigInt(dto.nightlyPriceToman);
    if (nightlyPriceToman > MAX_POSTGRES_BIGINT) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        fields: [
          {
            field: 'nightlyPriceToman',
            messages: ['Must fit in a non-negative PostgreSQL bigint.'],
          },
        ],
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      const roomType = await transaction.roomType.findUnique({
        where: { id: dto.roomTypeId },
        select: { id: true },
      });
      if (!roomType) {
        throw new NotFoundException('Room type not found.');
      }

      await transaction.roomNightInventory.createMany({
        data: range.nights.map(({ date }) => ({
          roomTypeId: dto.roomTypeId,
          stayDate: date,
          totalRooms: 0,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 0n,
        })),
        skipDuplicates: true,
      });

      const lockedRows = await transaction.$queryRaw<LockedInventoryRow[]>`
        SELECT "held_rooms" AS "heldRooms", "booked_rooms" AS "bookedRooms"
        FROM "room_night_inventory"
        WHERE "room_type_id" = ${dto.roomTypeId}::uuid
          AND "stay_date" >= ${range.start}::date
          AND "stay_date" < ${range.end}::date
        ORDER BY "stay_date" ASC
        FOR UPDATE
      `;
      if (lockedRows.length !== range.nights.length) {
        throw new ConflictException('Inventory range could not be locked. Retry the update.');
      }

      const invalidCapacity = lockedRows.some(
        (night) => dto.totalRooms < night.heldRooms + night.bookedRooms,
      );
      if (invalidCapacity) {
        throw new ConflictException({
          code: 'CAPACITY_BELOW_RESERVED',
          message: 'Capacity cannot be lower than held plus booked rooms.',
        });
      }

      await transaction.roomNightInventory.updateMany({
        where: {
          roomTypeId: dto.roomTypeId,
          stayDate: { gte: range.start, lt: range.end },
        },
        data: { totalRooms: dto.totalRooms, nightlyPriceToman },
      });
    });

    return this.findRange(dto);
  }
}
