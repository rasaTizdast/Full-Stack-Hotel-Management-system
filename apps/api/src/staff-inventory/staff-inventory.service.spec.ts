import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { RoomCapacityService } from '../rooms/room-capacity.service';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { StaffInventoryService } from './staff-inventory.service';

describe('StaffInventoryService', () => {
  let service: StaffInventoryService;
  let moduleFixture: TestingModule;
  let prisma: {
    roomType: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let transaction: {
    roomType: { findUnique: jest.Mock };
    roomNightInventory: { findMany: jest.Mock; createMany: jest.Mock; updateMany: jest.Mock };
  };
  let capacity: {
    lockRoomType: jest.Mock;
    getHotelBusinessDate: jest.Mock;
    projectDateRange: jest.Mock;
    lockAndProjectInventory: jest.Mock;
    persistProjection: jest.Mock;
  };

  const roomType = {
    id: '30cd1675-e815-42b2-91ed-037bd00553f5',
    name: 'Deluxe',
    slug: 'deluxe',
  };
  const firstDate = new Date('2027-01-02T00:00:00.000Z');
  const secondDate = new Date('2027-01-03T00:00:00.000Z');

  beforeEach(async () => {
    transaction = {
      roomType: { findUnique: jest.fn().mockResolvedValue(roomType) },
      roomNightInventory: {
        findMany: jest.fn().mockResolvedValue([
          {
            stayDate: firstDate,
            totalRooms: 2,
            blockedRooms: 1,
            heldRooms: 1,
            bookedRooms: 0,
            nightlyPriceToman: 3_500_000n,
          },
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    prisma = {
      roomType: {
        findMany: jest.fn().mockResolvedValue([
          { ...roomType, isActive: true },
          {
            id: '50cd1675-e815-42b2-91ed-037bd00553f5',
            name: 'Closed',
            slug: 'closed',
            isActive: false,
          },
        ]),
      },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    capacity = {
      lockRoomType: jest.fn().mockResolvedValue(true),
      getHotelBusinessDate: jest.fn().mockResolvedValue(new Date('2026-11-15T00:00:00.000Z')),
      projectDateRange: jest.fn().mockResolvedValue([
        { stayDate: firstDate, activeRooms: 3, blockedRooms: 1 },
        { stayDate: secondDate, activeRooms: 3, blockedRooms: 0 },
      ]),
      lockAndProjectInventory: jest.fn().mockResolvedValue([
        {
          inventoryId: 'inventory-1',
          stayDate: firstDate,
          totalRooms: 2,
          storedBlockedRooms: 1,
          heldRooms: 1,
          bookedRooms: 0,
          activeRooms: 3,
          blockedRooms: 1,
        },
        {
          inventoryId: 'inventory-2',
          stayDate: secondDate,
          totalRooms: 3,
          storedBlockedRooms: 0,
          heldRooms: 0,
          bookedRooms: 0,
          activeRooms: 3,
          blockedRooms: 0,
        },
      ]),
      persistProjection: jest.fn().mockResolvedValue(undefined),
    };

    moduleFixture = await Test.createTestingModule({
      providers: [
        StaffInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: RoomCapacityService, useValue: capacity },
      ],
    }).compile();
    service = moduleFixture.get(StaffInventoryService);
  });

  afterEach(async () => {
    await moduleFixture.close();
  });

  it('lists active and inactive room types as ordered inventory options', async () => {
    await expect(service.findRoomTypeOptions()).resolves.toEqual([
      { ...roomType, isActive: true },
      {
        id: '50cd1675-e815-42b2-91ed-037bd00553f5',
        name: 'Closed',
        slug: 'closed',
        isActive: false,
      },
    ]);
    expect(prisma.roomType.findMany).toHaveBeenCalledWith({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true, isActive: true },
    });
  });

  it('returns projected capacity and empty counters for dates without a price row', async () => {
    const query: StaffInventoryRangeQueryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
    };

    const result = await service.findRange(query);

    expect(result.roomType).toEqual(roomType);
    expect(result.nights).toEqual([
      {
        stayDate: '2027-01-02',
        capacitySource: 'PROJECTED',
        totalRooms: 2,
        heldRooms: 1,
        bookedRooms: 0,
        blockedRooms: 1,
        availableRooms: 1,
        nightlyPriceToman: '3500000',
      },
      {
        stayDate: '2027-01-03',
        capacitySource: 'PROJECTED',
        totalRooms: 3,
        heldRooms: 0,
        bookedRooms: 0,
        blockedRooms: 0,
        availableRooms: 3,
        nightlyPriceToman: null,
      },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('creates missing rate rows at projected capacity and updates only their prices', async () => {
    const dto: UpdateStaffInventoryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
      nightlyPriceToman: '4500000',
    };

    const result = await service.updateRange(dto);

    expect(capacity.lockRoomType).toHaveBeenCalledWith(transaction, roomType.id);
    expect(transaction.roomNightInventory.createMany).toHaveBeenCalledWith({
      data: [
        {
          roomTypeId: roomType.id,
          stayDate: firstDate,
          totalRooms: 2,
          blockedRooms: 1,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 0n,
        },
        {
          roomTypeId: roomType.id,
          stayDate: secondDate,
          totalRooms: 3,
          blockedRooms: 0,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: 0n,
        },
      ],
      skipDuplicates: true,
    });
    expect(capacity.persistProjection).toHaveBeenCalledTimes(1);
    expect(capacity.lockAndProjectInventory).toHaveBeenCalledWith(
      transaction,
      roomType.id,
      firstDate,
      new Date('2027-01-04T00:00:00.000Z'),
    );
    expect(transaction.roomNightInventory.updateMany).toHaveBeenCalledWith({
      where: {
        roomTypeId: roomType.id,
        stayDate: { gte: firstDate, lt: new Date('2027-01-04T00:00:00.000Z') },
      },
      data: { nightlyPriceToman: 4_500_000n },
    });
    expect(result.nights).toHaveLength(2);
  });

  it('does not update rates when the projection would violate held/booked capacity', async () => {
    capacity.persistProjection.mockRejectedValueOnce(new ConflictException());
    const dto: UpdateStaffInventoryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
      nightlyPriceToman: '4500000',
    };

    await expect(service.updateRange(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.roomNightInventory.updateMany).not.toHaveBeenCalled();
  });

  it('returns not found for a room type that does not exist', async () => {
    transaction.roomType.findUnique.mockResolvedValueOnce(null);
    const query: StaffInventoryRangeQueryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
    };

    await expect(service.findRange(query)).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.roomNightInventory.findMany).not.toHaveBeenCalled();
  });

  it('marks past dates without a snapshot unavailable instead of using current room counts', async () => {
    transaction.roomNightInventory.findMany.mockResolvedValueOnce([]);
    const query: StaffInventoryRangeQueryDto = {
      roomTypeId: roomType.id,
      startDate: '2020-01-10',
      endDate: '2020-01-11',
    };

    await expect(service.findRange(query)).resolves.toMatchObject({
      nights: [
        {
          stayDate: '2020-01-10',
          capacitySource: 'UNAVAILABLE',
          totalRooms: null,
          heldRooms: null,
          bookedRooms: null,
          blockedRooms: null,
          availableRooms: null,
          nightlyPriceToman: null,
        },
      ],
    });
    expect(capacity.projectDateRange).not.toHaveBeenCalled();
  });

  it('rejects historical rate writes without creating or reprojecting rows', async () => {
    const dto: UpdateStaffInventoryDto = {
      roomTypeId: roomType.id,
      startDate: '2020-01-10',
      endDate: '2020-01-11',
      nightlyPriceToman: '4500000',
    };

    await expect(service.updateRange(dto)).rejects.toMatchObject({
      response: { code: 'HISTORICAL_INVENTORY_READ_ONLY' },
    });
    expect(transaction.roomNightInventory.createMany).not.toHaveBeenCalled();
    expect(capacity.lockAndProjectInventory).not.toHaveBeenCalled();
  });
});
