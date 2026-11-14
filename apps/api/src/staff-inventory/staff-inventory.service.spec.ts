import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { StaffInventoryService } from './staff-inventory.service';

type InventoryRecord = {
  stayDate: Date;
  totalRooms: number;
  heldRooms: number;
  bookedRooms: number;
  nightlyPriceToman: bigint;
};

describe('StaffInventoryService', () => {
  let service: StaffInventoryService;
  let moduleFixture: TestingModule;
  let prisma: {
    roomType: { findUnique: jest.Mock };
    roomNightInventory: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let transaction: {
    roomType: { findUnique: jest.Mock };
    roomNightInventory: { createMany: jest.Mock; updateMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  const roomType = { id: '30cd1675-e815-42b2-91ed-037bd00553f5', name: 'Deluxe', slug: 'deluxe' };

  beforeEach(async () => {
    transaction = {
      roomType: { findUnique: jest.fn().mockResolvedValue({ id: roomType.id }) },
      roomNightInventory: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { heldRooms: 0, bookedRooms: 0 },
        { heldRooms: 1, bookedRooms: 0 },
      ]),
    };
    prisma = {
      roomType: { findUnique: jest.fn().mockResolvedValue(roomType) },
      roomNightInventory: {
        findMany: jest.fn().mockResolvedValue([
          {
            stayDate: new Date('2027-01-02T00:00:00.000Z'),
            totalRooms: 3,
            heldRooms: 1,
            bookedRooms: 0,
            nightlyPriceToman: 3_500_000n,
          },
        ] satisfies InventoryRecord[]),
        createMany: transaction.roomNightInventory.createMany,
        updateMany: transaction.roomNightInventory.updateMany,
      },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    transaction.roomNightInventory.createMany = jest.fn().mockResolvedValue({ count: 2 });
    transaction.roomNightInventory.updateMany = jest.fn().mockResolvedValue({ count: 2 });

    moduleFixture = await Test.createTestingModule({
      providers: [StaffInventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleFixture.get(StaffInventoryService);
  });

  afterEach(async () => {
    await moduleFixture.close();
  });

  it('returns a per-night range and represents missing inventory explicitly', async () => {
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
        totalRooms: 3,
        heldRooms: 1,
        bookedRooms: 0,
        availableRooms: 2,
        nightlyPriceToman: '3500000',
      },
      {
        stayDate: '2027-01-03',
        totalRooms: null,
        heldRooms: null,
        bookedRooms: null,
        availableRooms: null,
        nightlyPriceToman: null,
      },
    ]);
    expect(prisma.roomNightInventory.findMany).toHaveBeenCalledTimes(1);
  });

  it('updates the full range in one transaction after locking and validating every night', async () => {
    const dto: UpdateStaffInventoryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
      totalRooms: 3,
      nightlyPriceToman: '4500000',
    };

    const result = await service.updateRange(dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.roomNightInventory.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.roomNightInventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { totalRooms: 3, nightlyPriceToman: 4_500_000n },
      }),
    );
    expect(result.nights).toHaveLength(2);
  });

  it('does not issue any updates if a locked night is below reserved capacity', async () => {
    transaction.$queryRaw.mockResolvedValueOnce([
      { heldRooms: 0, bookedRooms: 0 },
      { heldRooms: 1, bookedRooms: 2 },
    ]);
    const dto: UpdateStaffInventoryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
      totalRooms: 2,
      nightlyPriceToman: '4500000',
    };

    await expect(service.updateRange(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.roomNightInventory.updateMany).not.toHaveBeenCalled();
  });

  it('returns not found for a room type that does not exist', async () => {
    prisma.roomType.findUnique.mockResolvedValueOnce(null);
    const query: StaffInventoryRangeQueryDto = {
      roomTypeId: roomType.id,
      startDate: '2027-01-02',
      endDate: '2027-01-04',
    };

    await expect(service.findRange(query)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.roomNightInventory.findMany).not.toHaveBeenCalled();
  });
});
