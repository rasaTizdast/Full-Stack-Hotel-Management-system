import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';

describe('Public catalog API (e2e)', () => {
  type PublicRoom = {
    slug: string;
    name: string;
    description: string;
    maxGuestsPerRoom: number;
    amenities: string[];
  };
  const hotelSlug = 'shiraz-garden-house';
  const suffix = randomUUID().slice(0, 8);
  const activeRoomSlug = `catalog-active-${suffix}`;
  const inactiveRoomSlug = `catalog-inactive-${suffix}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hotelId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    prisma = app.get(PrismaService);

    const hotel = await prisma.hotel.upsert({
      where: { slug: hotelSlug },
      create: {
        slug: hotelSlug,
        name: 'خانه‌باغ نارنج؛ هتل نمایشی',
        address: 'شیراز، نشانی نمایشی شماره ۱',
        description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
        timezone: 'Asia/Tehran',
        contactEmail: 'hello@example.invalid',
      },
      update: {},
    });
    hotelId = hotel.id;

    await prisma.roomType.createMany({
      data: [
        {
          hotelId,
          slug: activeRoomSlug,
          name: 'اتاق آزمون فعال',
          description: 'اتاق نمایشی فعال برای آزمون رابط عمومی.',
          maxGuestsPerRoom: 2,
          amenities: ['وای‌فای'],
          displayOrder: 98,
          isActive: true,
        },
        {
          hotelId,
          slug: inactiveRoomSlug,
          name: 'اتاق آزمون غیرفعال',
          description: 'این اتاق برای آزمون باید مخفی بماند.',
          maxGuestsPerRoom: 2,
          amenities: ['تهویه مطبوع'],
          displayOrder: 99,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    if (hotelId) {
      await prisma.roomType.deleteMany({
        where: { hotelId, slug: { in: [activeRoomSlug, inactiveRoomSlug] } },
      });
    }
    await app.close();
  });

  it('returns public hotel content without internal database fields', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/hotel').expect(200);

    expect(response.body).toEqual({
      slug: hotelSlug,
      name: 'خانه‌باغ نارنج؛ هتل نمایشی',
      address: 'شیراز، نشانی نمایشی شماره ۱',
      description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
      timezone: 'Asia/Tehran',
      contactPhone: null,
      contactEmail: 'hello@example.invalid',
    });
  });

  it('returns active room types only and serializes no internal, inventory, or guest data', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/room-types').expect(200);
    const rooms = response.body as unknown as PublicRoom[];
    const activeRoom = rooms.find((room) => room.slug === activeRoomSlug);

    expect(activeRoom).toEqual({
      slug: activeRoomSlug,
      name: 'اتاق آزمون فعال',
      description: 'اتاق نمایشی فعال برای آزمون رابط عمومی.',
      maxGuestsPerRoom: 2,
      amenities: ['وای‌فای'],
    });
    expect(rooms.map((room) => room.slug)).not.toContain(inactiveRoomSlug);
    expect(
      rooms.every(
        (room) =>
          Object.keys(room).sort().join(',') === 'amenities,description,maxGuestsPerRoom,name,slug',
      ),
    ).toBe(true);
    expect(response.text).not.toContain('internal');
    expect(response.text).not.toContain('Private guest name');
  });
});
