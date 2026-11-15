import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';

const HOTEL_SLUG = 'shiraz-garden-house';

const roomTypeDefinitions = [
  {
    slug: 'garden-double',
    name: 'اتاق دوتخته باغ',
    description: 'اتاقی نمایشی با چشم‌انداز باغ و امکانات پایه برای اقامت دو نفر.',
    maxGuestsPerRoom: 2,
    amenities: ['وای‌فای', 'تهویه مطبوع', 'صبحانه'],
    displayOrder: 1,
    totalRooms: 8,
    roomNumberPrefix: '1',
    nightlyPriceToman: 2_400_000n,
  },
  {
    slug: 'family-suite',
    name: 'سوئیت خانوادگی',
    description: 'سوئیتی نمایشی با فضای بیشتر برای اقامت خانوادگی.',
    maxGuestsPerRoom: 4,
    amenities: ['وای‌فای', 'تهویه مطبوع', 'صبحانه', 'نشیمن'],
    displayOrder: 2,
    totalRooms: 3,
    roomNumberPrefix: '2',
    nightlyPriceToman: 4_800_000n,
  },
];

export interface DemoAdminCredentials {
  email: string;
  password: string;
}

function normalizeCredentials(credentials: DemoAdminCredentials): DemoAdminCredentials {
  const email = credentials.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('DEMO_ADMIN_EMAIL must be a valid email address.');
  }
  if (credentials.password.length < 12) {
    throw new Error('DEMO_ADMIN_PASSWORD must contain at least 12 characters.');
  }

  return { email, password: credentials.password };
}

export async function seedDemoData(
  prisma: PrismaClient,
  credentials: DemoAdminCredentials,
): Promise<void> {
  const admin = normalizeCredentials(credentials);
  const passwordHash = await argon2.hash(admin.password, { type: argon2.argon2id });

  await prisma.$transaction(async (transaction) => {
    const hotel = await transaction.hotel.upsert({
      where: { slug: HOTEL_SLUG },
      create: {
        slug: HOTEL_SLUG,
        name: 'خانه‌باغ نارنج؛ هتل نمایشی',
        address: 'شیراز، نشانی نمایشی شماره ۱',
        description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
        timezone: 'Asia/Tehran',
        contactEmail: 'hello@example.invalid',
      },
      update: {
        name: 'خانه‌باغ نارنج؛ هتل نمایشی',
        address: 'شیراز، نشانی نمایشی شماره ۱',
        description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
        timezone: 'Asia/Tehran',
        contactEmail: 'hello@example.invalid',
      },
    });

    const storedRoomTypes: Array<{
      id: string;
      hotelId: string;
      totalRooms: number;
      roomNumberPrefix: string;
      nightlyPriceToman: bigint;
    }> = [];
    for (const definition of roomTypeDefinitions) {
      const { totalRooms, roomNumberPrefix, nightlyPriceToman, ...roomTypeData } = definition;
      const roomType = await transaction.roomType.upsert({
        where: { hotelId_slug: { hotelId: hotel.id, slug: definition.slug } },
        create: { ...roomTypeData, hotelId: hotel.id },
        update: roomTypeData,
      });
      storedRoomTypes.push({
        id: roomType.id,
        hotelId: hotel.id,
        totalRooms,
        roomNumberPrefix,
        nightlyPriceToman,
      });
    }

    for (const roomType of storedRoomTypes) {
      const generatedRooms = await transaction.room.findMany({
        where: { roomTypeId: roomType.id, isGenerated: true },
        orderBy: { roomNumber: 'asc' },
        select: { id: true },
      });
      let generatedIndex = 0;

      for (let roomIndex = 1; roomIndex <= roomType.totalRooms; roomIndex += 1) {
        const roomNumber = `${roomType.roomNumberPrefix}${String(roomIndex).padStart(2, '0')}`;
        const existing = await transaction.room.findUnique({
          where: { hotelId_roomNumber: { hotelId: roomType.hotelId, roomNumber } },
          select: { id: true },
        });
        if (existing) continue;

        const generatedRoom = generatedRooms[generatedIndex];
        if (generatedRoom) {
          generatedIndex += 1;
          await transaction.room.update({
            where: { id: generatedRoom.id },
            data: {
              roomNumber,
              isGenerated: false,
              isActive: true,
              housekeepingStatus: 'INSPECTED',
            },
          });
          continue;
        }

        await transaction.room.create({
          data: {
            hotelId: roomType.hotelId,
            roomTypeId: roomType.id,
            roomNumber,
            floor: roomType.roomNumberPrefix,
            housekeepingStatus: 'INSPECTED',
          },
        });
      }
    }

    const firstNight = new Date();
    firstNight.setUTCHours(0, 0, 0, 0);
    const lastNightExclusive = new Date(firstNight);
    lastNightExclusive.setUTCDate(lastNightExclusive.getUTCDate() + 91);
    const activeRoomCounts = new Map(
      await Promise.all(
        storedRoomTypes.map(
          async (roomType) =>
            [
              roomType.id,
              await transaction.room.count({ where: { roomTypeId: roomType.id, isActive: true } }),
            ] as const,
        ),
      ),
    );
    const blocks = await transaction.roomBlock.findMany({
      where: {
        isActive: true,
        startDate: { lt: lastNightExclusive },
        endDate: { gt: firstNight },
        room: { hotelId: hotel.id, isActive: true },
      },
      select: {
        roomId: true,
        startDate: true,
        endDate: true,
        room: { select: { roomTypeId: true } },
      },
    });
    const inventory = storedRoomTypes.flatMap((roomType) =>
      Array.from({ length: 90 }, (_, index) => {
        const stayDate = new Date(firstNight);
        stayDate.setUTCDate(stayDate.getUTCDate() + index + 1);
        const blockedRoomIds = new Set(
          blocks
            .filter(
              (block) =>
                block.room.roomTypeId === roomType.id &&
                block.startDate <= stayDate &&
                block.endDate > stayDate,
            )
            .map((block) => block.roomId),
        );
        return {
          roomTypeId: roomType.id,
          stayDate,
          totalRooms: Math.max(0, (activeRoomCounts.get(roomType.id) ?? 0) - blockedRoomIds.size),
          blockedRooms: blockedRoomIds.size,
          heldRooms: 0,
          bookedRooms: 0,
          nightlyPriceToman: roomType.nightlyPriceToman,
        };
      }),
    );

    await transaction.roomNightInventory.createMany({ data: inventory, skipDuplicates: true });
    await transaction.staffUser.upsert({
      where: { email: admin.email },
      create: {
        username: admin.email,
        email: admin.email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      update: {},
    });
  });
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(process.cwd(), '../../.env') });

  const connectionString = process.env.DATABASE_URL;
  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!connectionString || !email || !password) {
    throw new Error('DATABASE_URL, DEMO_ADMIN_EMAIL, and DEMO_ADMIN_PASSWORD must be configured.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedDemoData(prisma, { email, password });
    process.stdout.write('Fictional hotel demo data is ready.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`Database seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
