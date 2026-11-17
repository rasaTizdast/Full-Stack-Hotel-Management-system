import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
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

  it('upgrades populated legacy inventory without marking generated rooms ready', async () => {
    const client = await pool.connect();
    const schemaName = `legacy_upgrade_${randomUUID().replaceAll('-', '')}`;
    let schemaCreated = false;
    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      schemaCreated = true;
      await client.query(`SET search_path TO "${schemaName}"`);

      const migrationsDirectory = resolve(apiDirectory, 'prisma', 'migrations');
      const legacyMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.localeCompare('20261115100000_physical_rooms_foundation') < 0,
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      expect(legacyMigrations.length).toBeGreaterThan(0);

      for (const migration of legacyMigrations) {
        const sql = readFileSync(
          resolve(migrationsDirectory, migration.name, 'migration.sql'),
          'utf8',
        );
        await client.query(sql);
      }

      await client.query(`
        INSERT INTO hotels (id, slug, name, address, description, timezone, created_at, updated_at)
        VALUES ('10000000-0000-4000-8000-000000000001', 'legacy-upgrade', 'Legacy fixture', 'Test', 'Test', 'Asia/Tehran', now(), now());
        INSERT INTO room_types (id, hotel_id, name, slug, description, max_guests_per_room, created_at, updated_at)
        VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Legacy type', 'legacy', 'Test', 2, now(), now());
        INSERT INTO room_night_inventory (id, room_type_id, stay_date, total_rooms, held_rooms, booked_rooms, nightly_price_toman, created_at, updated_at) VALUES
          ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2099-05-17', 3, 1, 1, 5000, now(), now()),
          ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '2099-05-18', 1, 0, 1, 6000, now(), now());
        INSERT INTO bookings (id, public_reference, status, check_in, check_out, guest_count, room_type_id, room_quantity, guest_name, guest_phone, total_price_toman, expires_at) VALUES
          ('30000000-0000-4000-8000-000000000001', 'UP-PENDING-0001', 'PENDING_CONFIRMATION', '2099-05-17', '2099-05-19', 2, '20000000-0000-4000-8000-000000000001', 1, 'Fixture pending', '+989121234567', 5000, now() + interval '1 day'),
          ('30000000-0000-4000-8000-000000000002', 'UP-CONFIRMED-01', 'CONFIRMED', '2099-05-17', '2099-05-19', 2, '20000000-0000-4000-8000-000000000001', 1, 'Fixture confirmed', '+989121234567', 5100, now() + interval '1 day'),
          ('30000000-0000-4000-8000-000000000003', 'UP-CANCELLED-01', 'CANCELLED', '2099-05-17', '2099-05-19', 2, '20000000-0000-4000-8000-000000000001', 1, 'Fixture cancelled', '+989121234567', 5200, now() + interval '1 day'),
          ('30000000-0000-4000-8000-000000000004', 'UP-EXPIRED-001', 'EXPIRED', '2099-05-17', '2099-05-19', 2, '20000000-0000-4000-8000-000000000001', 1, 'Fixture expired', '+989121234567', 5300, now() + interval '1 day');
        INSERT INTO booking_nights (id, booking_id, stay_date, nightly_price_toman, room_quantity, amount_toman, created_at) VALUES
          ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2099-05-17', 5000, 1, 5000, now()),
          ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '2099-05-17', 5100, 1, 5100, now()),
          ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '2099-05-17', 5200, 1, 5200, now()),
          ('50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '2099-05-17', 5300, 1, 5300, now());
      `);

      const physicalMigration = readFileSync(
        resolve(migrationsDirectory, '20261115100000_physical_rooms_foundation', 'migration.sql'),
        'utf8',
      );
      await client.query(physicalMigration);

      const historicalSnapshotsMigration = readFileSync(
        resolve(
          migrationsDirectory,
          '20261116100000_historical_inventory_snapshots',
          'migration.sql',
        ),
        'utf8',
      );
      await client.query(historicalSnapshotsMigration);

      const upgraded = await client.query<{
        room_count: string;
        generated_count: string;
        generated_dirty_count: string;
        reduced_night_blocks: string;
        inventory_snapshot: string;
        booking_count: string;
        booking_night_count: string;
        booking_snapshot_prices: string;
      }>(`
        SELECT
          (SELECT count(*) FROM rooms WHERE room_type_id = '20000000-0000-4000-8000-000000000001') AS room_count,
          (SELECT count(*) FROM rooms WHERE room_type_id = '20000000-0000-4000-8000-000000000001' AND is_generated) AS generated_count,
          (SELECT count(*) FROM rooms WHERE room_type_id = '20000000-0000-4000-8000-000000000001' AND is_generated AND housekeeping_status = 'DIRTY') AS generated_dirty_count,
          (SELECT count(*) FROM room_blocks WHERE start_date = DATE '2099-05-18') AS reduced_night_blocks,
          (SELECT string_agg(total_rooms || ':' || blocked_rooms || ':' || held_rooms || ':' || booked_rooms || ':' || nightly_price_toman, ',' ORDER BY stay_date) FROM room_night_inventory WHERE room_type_id = '20000000-0000-4000-8000-000000000001') AS inventory_snapshot,
          (SELECT count(*) FROM bookings) AS booking_count,
          (SELECT count(*) FROM booking_nights) AS booking_night_count,
          (SELECT string_agg(nightly_price_toman::text, ',' ORDER BY nightly_price_toman) FROM booking_nights) AS booking_snapshot_prices
      `);
      expect(upgraded.rows[0]).toEqual({
        room_count: '3',
        generated_count: '3',
        generated_dirty_count: '3',
        reduced_night_blocks: '2',
        inventory_snapshot: '3:0:1:1:5000,1:2:0:1:6000',
        booking_count: '4',
        booking_night_count: '4',
        booking_snapshot_prices: '5000,5100,5200,5300',
      });
    } finally {
      if (schemaCreated) {
        try {
          await client.query('SET search_path TO public');
          await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        } finally {
          client.release();
        }
      } else {
        client.release();
      }
    }
  }, 30000);

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
      demo_room_count: string;
      demo_explicit_inspected_room_count: string;
      demo_generated_room_count: string;
      demo_generated_dirty_room_count: string;
      inventory_count: string;
      future_inventory_count: string;
      admin_count: string;
      password_hash: string | null;
      booking_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM hotels WHERE slug = 'shiraz-garden-house') AS hotel_count,
         (SELECT count(*) FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house') AS room_type_count,
         (SELECT count(*) FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.slug = 'shiraz-garden-house') AS demo_room_count,
         (SELECT count(*) FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.slug = 'shiraz-garden-house' AND r.is_generated = false AND r.housekeeping_status = 'INSPECTED') AS demo_explicit_inspected_room_count,
         (SELECT count(*) FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.slug = 'shiraz-garden-house' AND r.is_generated = true) AS demo_generated_room_count,
         (SELECT count(*) FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.slug = 'shiraz-garden-house' AND r.is_generated = true AND r.housekeeping_status = 'DIRTY') AS demo_generated_dirty_room_count,
         (SELECT count(*) FROM room_night_inventory i JOIN room_types rt ON rt.id = i.room_type_id JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house') AS inventory_count,
         (SELECT count(*) FROM room_night_inventory i JOIN room_types rt ON rt.id = i.room_type_id JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = 'shiraz-garden-house' AND i.stay_date > CURRENT_DATE) AS future_inventory_count,
         (SELECT count(*) FROM staff_users WHERE email = $1) AS admin_count,
         (SELECT password_hash FROM staff_users WHERE email = $1) AS password_hash,
         (SELECT count(*) FROM bookings) AS booking_count`,
      [email],
    );
    expect(Number(first.rows[0].hotel_count)).toBe(1);
    expect(Number(first.rows[0].room_type_count)).toBeGreaterThanOrEqual(2);
    expect(Number(first.rows[0].demo_explicit_inspected_room_count)).toBe(11);
    expect(Number(first.rows[0].demo_generated_dirty_room_count)).toBe(
      Number(first.rows[0].demo_generated_room_count),
    );
    expect(Number(first.rows[0].demo_room_count)).toBeGreaterThanOrEqual(
      Number(first.rows[0].demo_explicit_inspected_room_count),
    );
    expect(Number(first.rows[0].future_inventory_count)).toBeGreaterThan(0);
    expect(Number(first.rows[0].admin_count)).toBe(1);
    expect(first.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(first.rows[0].password_hash).not.toBe(password);
    expect(await argon2.verify(first.rows[0].password_hash!, password!)).toBe(true);
    expect(first.rows[0].booking_count).toBe(bookingsBeforeSeed.rows[0].booking_count);

    const demoRoom = await pool.query<{ id: string; room_type_id: string }>(
      `SELECT r.id, r.room_type_id
       FROM rooms r
       JOIN hotels h ON h.id = r.hotel_id
       WHERE h.slug = 'shiraz-garden-house' AND r.is_active = true
       ORDER BY r.room_number
       LIMIT 1`,
    );
    expect(demoRoom.rows).toHaveLength(1);
    const stayDate = new Date();
    stayDate.setUTCHours(0, 0, 0, 0);
    stayDate.setUTCDate(stayDate.getUTCDate() + 10);
    const originalInventory = await pool.query<{
      id: string;
      total_rooms: number;
      blocked_rooms: number;
      held_rooms: number;
      booked_rooms: number;
      nightly_price_toman: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, total_rooms, blocked_rooms, held_rooms, booked_rooms,
              nightly_price_toman::text, created_at, updated_at
       FROM room_night_inventory
       WHERE room_type_id = $1 AND stay_date = $2::date`,
      [demoRoom.rows[0].room_type_id, stayDate],
    );
    expect(originalInventory.rows).toHaveLength(1);
    const blockId = randomUUID();
    await pool.query(
      'DELETE FROM room_night_inventory WHERE room_type_id = $1 AND stay_date = $2::date',
      [demoRoom.rows[0].room_type_id, stayDate],
    );
    await pool.query(
      `INSERT INTO room_blocks
         (id, room_id, start_date, end_date, kind, reason, is_active, created_at, updated_at)
       VALUES ($1, $2, $3::date, $3::date + 1, 'CAPACITY_CLOSED', 'Fictional seed snapshot test', true, now(), now())`,
      [blockId, demoRoom.rows[0].id, stayDate],
    );

    try {
      runSeed();
      const seededSnapshot = await pool.query<{
        total_rooms: number;
        blocked_rooms: number;
        active_rooms: string;
      }>(
        `SELECT
           inventory.total_rooms,
           inventory.blocked_rooms,
           (SELECT count(*)::text FROM rooms WHERE room_type_id = inventory.room_type_id AND is_active = true) AS active_rooms
         FROM room_night_inventory inventory
         WHERE inventory.room_type_id = $1 AND inventory.stay_date = $2::date`,
        [demoRoom.rows[0].room_type_id, stayDate],
      );
      expect(seededSnapshot.rows).toHaveLength(1);
      expect(seededSnapshot.rows[0].blocked_rooms).toBe(1);
      expect(seededSnapshot.rows[0].total_rooms + seededSnapshot.rows[0].blocked_rooms).toBe(
        Number(seededSnapshot.rows[0].active_rooms),
      );

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
        inventory_count: first.rows[0].inventory_count,
        admin_count: first.rows[0].admin_count,
        booking_count: bookingsBeforeSeed.rows[0].booking_count,
      });
    } finally {
      await pool.query('DELETE FROM room_blocks WHERE id = $1', [blockId]);
      await pool.query(
        'DELETE FROM room_night_inventory WHERE room_type_id = $1 AND stay_date = $2::date',
        [demoRoom.rows[0].room_type_id, stayDate],
      );
      const original = originalInventory.rows[0];
      await pool.query(
        `INSERT INTO room_night_inventory
           (id, room_type_id, stay_date, total_rooms, blocked_rooms, held_rooms,
            booked_rooms, nightly_price_toman, created_at, updated_at)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8::bigint, $9, $10)`,
        [
          original.id,
          demoRoom.rows[0].room_type_id,
          stayDate,
          original.total_rooms,
          original.blocked_rooms,
          original.held_rooms,
          original.booked_rooms,
          original.nightly_price_toman,
          original.created_at,
          original.updated_at,
        ],
      );
    }
  });
});
