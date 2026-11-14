import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { Pool, type QueryResult } from 'pg';

describe('PostgreSQL schema and fictional seed', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const apiDirectory = resolve(__dirname, '..');
  const fixtureHotelIds: string[] = [];

  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    expect(result.rows[0].database_name).toMatch(/_test$/);
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    if (fixtureHotelIds.length === 0) {
      return;
    }

    await pool.query(
      `DELETE FROM booking_nights
       WHERE booking_id IN (
         SELECT b.id FROM bookings b
         JOIN room_types rt ON rt.id = b.room_type_id
         WHERE rt.hotel_id = ANY($1::uuid[])
       )`,
      [fixtureHotelIds],
    );
    await pool.query(
      `DELETE FROM bookings
       WHERE room_type_id IN (SELECT id FROM room_types WHERE hotel_id = ANY($1::uuid[]))`,
      [fixtureHotelIds],
    );
    await pool.query(
      `DELETE FROM room_night_inventory
       WHERE room_type_id IN (SELECT id FROM room_types WHERE hotel_id = ANY($1::uuid[]))`,
      [fixtureHotelIds],
    );
    await pool.query('DELETE FROM room_types WHERE hotel_id = ANY($1::uuid[])', [fixtureHotelIds]);
    await pool.query('DELETE FROM hotels WHERE id = ANY($1::uuid[])', [fixtureHotelIds]);
    fixtureHotelIds.length = 0;
  });

  function runSeed(): void {
    const result = spawnSync('pnpm', ['exec', 'prisma', 'db', 'seed'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Prisma seed command failed: ${result.stderr}`);
    }
  }

  async function createInventoryFixture(): Promise<{ roomTypeId: string; stayDate: string }> {
    const suffix = randomUUID();
    const hotelId = randomUUID();
    const roomTypeId = randomUUID();
    const stayDate = '2099-05-17';
    fixtureHotelIds.push(hotelId);

    await pool.query(
      `INSERT INTO hotels (id, slug, name, address, description, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        hotelId,
        `constraint-test-${suffix}`,
        'Fictional test hotel',
        'Fictional address',
        'Test fixture',
        'Asia/Tehran',
      ],
    );
    await pool.query(
      `INSERT INTO room_types
         (id, hotel_id, name, slug, description, max_guests_per_room, amenities, is_active, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 2, ARRAY['wifi']::text[], true, 0, now(), now())`,
      [roomTypeId, hotelId, 'Test room', `constraint-test-${suffix}`, 'Fictional test room'],
    );

    return { roomTypeId, stayDate };
  }

  async function insertInventory(
    roomTypeId: string,
    stayDate: string,
    values: {
      totalRooms?: number;
      heldRooms?: number;
      bookedRooms?: number;
      nightlyPriceToman?: number;
    } = {},
  ): Promise<QueryResult> {
    const id = randomUUID();
    return pool.query(
      `INSERT INTO room_night_inventory
         (id, room_type_id, stay_date, total_rooms, held_rooms, booked_rooms, nightly_price_toman, created_at, updated_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, now(), now())`,
      [
        id,
        roomTypeId,
        stayDate,
        values.totalRooms ?? 3,
        values.heldRooms ?? 0,
        values.bookedRooms ?? 0,
        values.nightlyPriceToman ?? 2_000_000,
      ],
    );
  }

  async function createExistingBooking(roomTypeId: string): Promise<void> {
    await pool.query(
      `INSERT INTO bookings
         (id, public_reference, status, check_in, check_out, guest_count, room_type_id,
          room_quantity, guest_name, guest_phone, total_price_toman, expires_at)
       VALUES ($1, $2, 'PENDING_CONFIRMATION', '2099-05-17', '2099-05-18', 1, $3, 1,
               'Fictional existing guest', '+989121234567', 1000, now() + interval '1 day')`,
      [randomUUID(), randomUUID().replaceAll('-', '').slice(0, 16), roomTypeId],
    );
  }

  it('keeps one inventory row per room type and Gregorian stay date', async () => {
    const { roomTypeId, stayDate } = await createInventoryFixture();
    await insertInventory(roomTypeId, stayDate);

    await expect(insertInventory(roomTypeId, stayDate)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it.each([
    ['negative total rooms', { totalRooms: -1 }],
    ['negative held rooms', { heldRooms: -1 }],
    ['negative booked rooms', { bookedRooms: -1 }],
    ['held and booked rooms above total', { totalRooms: 2, heldRooms: 2, bookedRooms: 1 }],
    ['negative Toman price', { nightlyPriceToman: -1 }],
  ])('rejects %s at the database boundary', async (_caseName, values) => {
    const { roomTypeId, stayDate } = await createInventoryFixture();

    await expect(insertInventory(roomTypeId, stayDate, values)).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('seeds repeatably without changing existing bookings', async () => {
    const fixture = await createInventoryFixture();
    await createExistingBooking(fixture.roomTypeId);
    const email = process.env.DEMO_ADMIN_EMAIL;
    const password = process.env.DEMO_ADMIN_PASSWORD;
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();

    const bookingsBeforeSeed = await pool.query<{ booking_count: string }>(
      'SELECT count(*) AS booking_count FROM bookings',
    );
    runSeed();
    const first = await pool.query<{
      hotel_count: string;
      room_type_count: string;
      future_inventory_count: string;
      admin_count: string;
      password_hash: string | null;
      booking_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM hotels WHERE slug = 'shiraz-garden-house') AS hotel_count,
         (SELECT count(*) FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house') AS room_type_count,
         (SELECT count(*) FROM room_night_inventory i JOIN room_types rt ON rt.id = i.room_type_id JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house' AND i.stay_date > CURRENT_DATE) AS future_inventory_count,
         (SELECT count(*) FROM staff_users WHERE email = $1) AS admin_count,
         (SELECT password_hash FROM staff_users WHERE email = $1) AS password_hash,
         (SELECT count(*) FROM bookings) AS booking_count`,
      [email],
    );
    expect(Number(first.rows[0].hotel_count)).toBe(1);
    expect(Number(first.rows[0].room_type_count)).toBeGreaterThanOrEqual(2);
    expect(Number(first.rows[0].future_inventory_count)).toBeGreaterThan(0);
    expect(Number(first.rows[0].admin_count)).toBe(1);
    expect(first.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(first.rows[0].password_hash).not.toBe(password);
    expect(await argon2.verify(first.rows[0].password_hash!, password!)).toBe(true);
    expect(first.rows[0].booking_count).toBe(bookingsBeforeSeed.rows[0].booking_count);

    runSeed();
    const second = await pool.query(
      `SELECT
         (SELECT count(*) FROM hotels WHERE slug = 'shiraz-garden-house') AS hotel_count,
         (SELECT count(*) FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house') AS room_type_count,
         (SELECT count(*) FROM room_night_inventory i JOIN room_types rt ON rt.id = i.room_type_id JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house') AS inventory_count,
         (SELECT count(*) FROM staff_users WHERE email = $1) AS admin_count,
         (SELECT count(*) FROM bookings) AS booking_count`,
      [email],
    );
    expect(second.rows[0]).toEqual({
      hotel_count: first.rows[0].hotel_count,
      room_type_count: first.rows[0].room_type_count,
      inventory_count: first.rows[0].future_inventory_count,
      admin_count: first.rows[0].admin_count,
      booking_count: bookingsBeforeSeed.rows[0].booking_count,
    });
  });
});
