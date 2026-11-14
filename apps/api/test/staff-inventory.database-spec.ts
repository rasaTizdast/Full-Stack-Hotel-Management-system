import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { StaffInventoryService } from '../src/staff-inventory/staff-inventory.service';

describe('PostgreSQL staff inventory updates', () => {
  const suffix = randomUUID();
  let pool: Pool | undefined;
  let prisma: PrismaService | undefined;
  let service: StaffInventoryService | undefined;
  let hotelId: string;
  let roomTypeId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL must point to an isolated PostgreSQL test database.');
    }

    pool = new Pool({ connectionString: databaseUrl });
    const database = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(database.rows[0].database_name).toMatch(/_test$/);

    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
    service = new StaffInventoryService(prisma);
    hotelId = randomUUID();
    const hotel = await prisma.hotel.create({
      data: {
        id: hotelId,
        slug: `inventory-db-${suffix}`,
        name: 'Inventory database fixture',
        address: 'Fictional test address',
        description: 'Fictional database test hotel.',
      },
    });
    const roomType = await prisma.roomType.create({
      data: {
        hotelId: hotel.id,
        slug: `inventory-db-${suffix}`,
        name: 'Inventory database fixture room',
        description: 'Fictional database test room.',
        maxGuestsPerRoom: 4,
      },
    });
    roomTypeId = roomType.id;
  }, 30000);

  afterEach(async () => {
    await prisma?.roomNightInventory.deleteMany({ where: { roomTypeId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.roomNightInventory.deleteMany({ where: { roomTypeId } });
      await prisma.roomType.deleteMany({ where: { id: roomTypeId } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
      await prisma.$disconnect();
    }
    await pool?.end();
  });

  it('rolls back placeholder rows and all updates if any date is below reserved capacity', async () => {
    if (!prisma || !service) {
      throw new Error('Inventory database fixture did not initialize.');
    }
    const reservedDate = new Date('2027-04-11T00:00:00.000Z');
    await prisma.roomNightInventory.create({
      data: {
        roomTypeId,
        stayDate: reservedDate,
        totalRooms: 4,
        heldRooms: 1,
        bookedRooms: 2,
        nightlyPriceToman: 5_000_000n,
      },
    });

    await expect(
      service.updateRange({
        roomTypeId,
        startDate: '2027-04-10',
        endDate: '2027-04-12',
        totalRooms: 2,
        nightlyPriceToman: '6000000',
      }),
    ).rejects.toThrow('Capacity cannot be lower than held plus booked rooms.');

    const persisted = await prisma.roomNightInventory.findMany({
      where: {
        roomTypeId,
        stayDate: {
          gte: new Date('2027-04-10T00:00:00.000Z'),
          lt: new Date('2027-04-12T00:00:00.000Z'),
        },
      },
      orderBy: { stayDate: 'asc' },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ totalRooms: 4, heldRooms: 1, bookedRooms: 2 });
    expect(persisted[0].nightlyPriceToman).toBe(5_000_000n);
  }, 30000);

  it('keeps PostgreSQL inventory constraints as the final invariant guard', async () => {
    if (!pool || !prisma) {
      throw new Error('Inventory database fixture did not initialize.');
    }
    const stayDate = new Date('2027-04-20T00:00:00.000Z');
    await expect(
      pool.query(
        `INSERT INTO room_night_inventory
          (id, room_type_id, stay_date, total_rooms, held_rooms, booked_rooms,
           nightly_price_toman, created_at, updated_at)
         VALUES ($1, $2, $3, 1, 1, 1, 1000000, now(), now())`,
        [randomUUID(), roomTypeId, stayDate],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      pool.query(
        `INSERT INTO room_night_inventory
          (id, room_type_id, stay_date, total_rooms, held_rooms, booked_rooms,
           nightly_price_toman, created_at, updated_at)
         VALUES ($1, $2, $3, 2, 1, 1, -1, now(), now())`,
        [randomUUID(), roomTypeId, new Date('2027-04-21T00:00:00.000Z')],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  }, 30000);
});
