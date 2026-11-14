import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { AvailabilityService } from './availability.service';
import { parseAvailabilityCriteria } from './date-range';

describe('AvailabilityService', () => {
  const prisma = { roomType: { findMany: jest.fn() } };
  let service: AvailabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AvailabilityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AvailabilityService);
    jest.clearAllMocks();
  });

  it('returns a server-calculated integer Toman total across every exclusive stay night', async () => {
    prisma.roomType.findMany.mockResolvedValue([
      {
        slug: 'garden-double',
        name: 'Garden double',
        maxGuestsPerRoom: 2,
        inventory: [
          {
            stayDate: new Date('2026-03-10T00:00:00.000Z'),
            totalRooms: 4,
            heldRooms: 1,
            bookedRooms: 1,
            nightlyPriceToman: 2_400_000n,
          },
          {
            stayDate: new Date('2026-03-11T00:00:00.000Z'),
            totalRooms: 4,
            heldRooms: 0,
            bookedRooms: 2,
            nightlyPriceToman: 3_100_000n,
          },
          {
            stayDate: new Date('2026-03-12T00:00:00.000Z'),
            totalRooms: 0,
            heldRooms: 0,
            bookedRooms: 0,
            nightlyPriceToman: 99_000_000n,
          },
        ],
      },
    ]);
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-03-12', guests: 2 },
      '2026-03-09',
    );

    await expect(service.search(criteria)).resolves.toMatchObject({
      checkIn: '2026-03-10',
      checkOut: '2026-03-12',
      guests: 2,
      numberOfNights: 2,
      roomTypes: [
        {
          slug: 'garden-double',
          isAvailable: true,
          availableRooms: 2,
          totalPriceToman: '5500000',
          nightlyBreakdown: [
            {
              stayDate: '2026-03-10',
              isAvailable: true,
              availableRooms: 2,
              nightlyPriceToman: '2400000',
            },
            {
              stayDate: '2026-03-11',
              isAvailable: true,
              availableRooms: 2,
              nightlyPriceToman: '3100000',
            },
          ],
        },
      ],
    });
  });

  it('marks a room unavailable when a requested night is missing', async () => {
    prisma.roomType.findMany.mockResolvedValue([
      {
        slug: 'missing-night',
        name: 'Missing night',
        maxGuestsPerRoom: 2,
        inventory: [
          {
            stayDate: new Date('2026-03-10T00:00:00.000Z'),
            totalRooms: 2,
            heldRooms: 0,
            bookedRooms: 0,
            nightlyPriceToman: 2_000_000n,
          },
        ],
      },
    ]);
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-03-12', guests: 2 },
      '2026-03-09',
    );

    const result = await service.search(criteria);

    expect(result.roomTypes[0]).toMatchObject({
      isAvailable: false,
      availableRooms: 0,
      totalPriceToman: null,
      nightlyBreakdown: [
        { isAvailable: true, nightlyPriceToman: '2000000' },
        { isAvailable: false, availableRooms: 0, nightlyPriceToman: null },
      ],
    });
  });

  it('marks a room unavailable when any requested night is sold out or guest capacity is too small', async () => {
    prisma.roomType.findMany.mockResolvedValue([
      {
        slug: 'sold-out',
        name: 'Sold out',
        maxGuestsPerRoom: 2,
        inventory: [
          {
            stayDate: new Date('2026-03-10T00:00:00.000Z'),
            totalRooms: 2,
            heldRooms: 0,
            bookedRooms: 0,
            nightlyPriceToman: 2_000_000n,
          },
          {
            stayDate: new Date('2026-03-11T00:00:00.000Z'),
            totalRooms: 1,
            heldRooms: 1,
            bookedRooms: 0,
            nightlyPriceToman: 2_000_000n,
          },
        ],
      },
      {
        slug: 'too-small',
        name: 'Too small',
        maxGuestsPerRoom: 1,
        inventory: [
          {
            stayDate: new Date('2026-03-10T00:00:00.000Z'),
            totalRooms: 2,
            heldRooms: 0,
            bookedRooms: 0,
            nightlyPriceToman: 2_000_000n,
          },
          {
            stayDate: new Date('2026-03-11T00:00:00.000Z'),
            totalRooms: 2,
            heldRooms: 0,
            bookedRooms: 0,
            nightlyPriceToman: 2_000_000n,
          },
        ],
      },
    ]);
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-03-12', guests: 2 },
      '2026-03-09',
    );

    const result = await service.search(criteria);

    expect(
      result.roomTypes.map((room) => [room.slug, room.isAvailable, room.totalPriceToman]),
    ).toEqual([
      ['sold-out', false, null],
      ['too-small', false, null],
    ]);
  });

  it('queries all active room types and every exclusive requested night in a single relation query', async () => {
    prisma.roomType.findMany.mockResolvedValue([]);
    const criteria = parseAvailabilityCriteria(
      { checkIn: '2026-03-10', checkOut: '2026-03-12', guests: 2 },
      '2026-03-09',
    );

    await service.search(criteria);

    expect(prisma.roomType.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        maxGuestsPerRoom: true,
        inventory: {
          where: {
            stayDate: {
              gte: new Date('2026-03-10T00:00:00.000Z'),
              lt: new Date('2026-03-12T00:00:00.000Z'),
            },
          },
          orderBy: { stayDate: 'asc' },
          select: {
            stayDate: true,
            totalRooms: true,
            heldRooms: true,
            bookedRooms: true,
            nightlyPriceToman: true,
          },
        },
      },
    });
  });
});
