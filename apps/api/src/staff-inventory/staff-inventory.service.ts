import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RoomCapacityService } from '../rooms/room-capacity.service';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import {
  StaffInventoryResponseDto,
  StaffInventoryRoomTypeOptionDto,
} from './dto/staff-inventory-response.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { parseStaffInventoryDateRange } from './date-range';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

@Injectable()
export class StaffInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: RoomCapacityService,
  ) {}

  async findRoomTypeOptions(): Promise<StaffInventoryRoomTypeOptionDto[]> {
    return this.prisma.roomType.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }

  async findRange(query: StaffInventoryRangeQueryDto): Promise<StaffInventoryResponseDto> {
    const range = parseStaffInventoryDateRange(query);
    return this.prisma.$transaction(
      async (transaction) => {
        const roomType = await transaction.roomType.findUnique({
          where: { id: query.roomTypeId },
          select: { id: true, name: true, slug: true },
        });
        if (!roomType) throw new NotFoundException('Room type not found.');

        const inventory = await transaction.roomNightInventory.findMany({
          where: {
            roomTypeId: query.roomTypeId,
            stayDate: { gte: range.start, lt: range.end },
          },
          orderBy: { stayDate: 'asc' },
          select: {
            stayDate: true,
            heldRooms: true,
            bookedRooms: true,
            nightlyPriceToman: true,
          },
        });
        const projection = await this.capacity.projectDateRange(
          transaction,
          query.roomTypeId,
          range.start,
          range.end,
        );
        const inventoryByDate = new Map(
          inventory.map((night) => [night.stayDate.toISOString().slice(0, 10), night]),
        );
        const projectionByDate = new Map(
          projection.map((night) => [night.stayDate.toISOString().slice(0, 10), night]),
        );

        return {
          roomType,
          startDate: range.startDate,
          endDate: range.endDate,
          nights: range.nights.map(({ dateString }) => {
            const night = inventoryByDate.get(dateString);
            const dateCapacity = projectionByDate.get(dateString);
            const heldRooms = night?.heldRooms ?? 0;
            const bookedRooms = night?.bookedRooms ?? 0;
            const blockedRooms = dateCapacity?.blockedRooms ?? 0;
            const totalRooms = Math.max(0, (dateCapacity?.activeRooms ?? 0) - blockedRooms);
            return {
              stayDate: dateString,
              totalRooms,
              heldRooms,
              bookedRooms,
              blockedRooms,
              availableRooms: totalRooms - heldRooms - bookedRooms,
              nightlyPriceToman: night?.nightlyPriceToman.toString() ?? null,
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
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
      if (!(await this.capacity.lockRoomType(transaction, dto.roomTypeId))) {
        throw new NotFoundException('Room type not found.');
      }

      const projection = await this.capacity.projectDateRange(
        transaction,
        dto.roomTypeId,
        range.start,
        range.end,
      );
      await transaction.roomNightInventory.createMany({
        data: projection.map(({ stayDate, activeRooms, blockedRooms }) => ({
          roomTypeId: dto.roomTypeId,
          stayDate,
          totalRooms: Math.max(0, activeRooms - blockedRooms),
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 0n,
        })),
        skipDuplicates: true,
      });

      const lockedInventory = await this.capacity.lockAndProjectInventory(
        transaction,
        dto.roomTypeId,
      );
      if (lockedInventory.length < range.nights.length) {
        throw new ConflictException('Inventory range could not be locked. Retry the update.');
      }
      await this.capacity.persistProjection(transaction, lockedInventory);
      await transaction.roomNightInventory.updateMany({
        where: {
          roomTypeId: dto.roomTypeId,
          stayDate: { gte: range.start, lt: range.end },
        },
        data: { nightlyPriceToman },
      });
    });

    return this.findRange(dto);
  }
}
