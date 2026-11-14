import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { RoomTypesService } from './room-types.service';

describe('RoomTypesService', () => {
  const prisma = {
    roomType: { findMany: jest.fn() },
  };
  let service: RoomTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomTypesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(RoomTypesService);
    jest.clearAllMocks();
  });

  it('returns safe public fields and excludes persistence and inventory data', async () => {
    prisma.roomType.findMany.mockResolvedValue([
      {
        id: 'internal-room-type-id',
        hotelId: 'internal-hotel-id',
        slug: 'garden-double',
        name: 'اتاق دوتخته باغ',
        description: 'اتاقی نمایشی با چشم‌انداز باغ و امکانات پایه برای اقامت دو نفر.',
        maxGuestsPerRoom: 2,
        amenities: ['وای‌فای', 'تهویه مطبوع', 'صبحانه'],
        displayOrder: 1,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        inventory: [{ totalRooms: 99, nightlyPriceToman: 1n }],
        bookings: [{ guestName: 'Private guest name' }],
      },
    ]);

    await expect(service.getActivePublicRoomTypes()).resolves.toEqual([
      {
        slug: 'garden-double',
        name: 'اتاق دوتخته باغ',
        description: 'اتاقی نمایشی با چشم‌انداز باغ و امکانات پایه برای اقامت دو نفر.',
        maxGuestsPerRoom: 2,
        amenities: ['وای‌فای', 'تهویه مطبوع', 'صبحانه'],
      },
    ]);
  });

  it('requests only active room types and returns them in the configured display order', async () => {
    prisma.roomType.findMany.mockResolvedValue([]);

    await service.getActivePublicRoomTypes();

    expect(prisma.roomType.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        description: true,
        maxGuestsPerRoom: true,
        amenities: true,
      },
    });
  });
});
