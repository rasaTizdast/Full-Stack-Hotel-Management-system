import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { addDays, getHotelBusinessDate } from '../src/availability/date-range';
import { configureApiApplication } from '../src/common/configure-api-application';
import { PrismaService } from '../src/database/prisma.service';
import { FoliosService } from '../src/folios/folios.service';
import type { StaffRole } from '../src/generated/prisma/enums';

export const boardRoute = '/api/v1/staff/rooms/board';
export const bookingRoute = (reference: string) => '/api/v1/staff/bookings/' + reference;
export const assignmentsRoute = (reference: string) =>
  bookingRoute(reference) + '/room-assignments';
const date = (value: string) => new Date(value + 'T00:00:00.000Z');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class RoomBoardFixture {
  private readonly staffIds: string[] = [];
  private readonly hotelIds: string[] = [];
  readonly today = getHotelBusinessDate();
  readonly checkIn = addDays(this.today, 14);
  readonly next = addDays(this.checkIn, 1);
  readonly checkOut = addDays(this.checkIn, 2);
  readonly reason = 'Front desk allocation';

  private constructor(
    private readonly app: INestApplication<App>,
    readonly prisma: PrismaService,
  ) {}

  static async start() {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = testingModule.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApiApplication(app);
    await app.init();
    return new RoomBoardFixture(app, app.get(PrismaService));
  }

  async staff(role: StaffRole) {
    const id = randomUUID();
    const token = randomUUID();
    const csrf = randomUUID();
    await this.prisma.staffUser.create({
      data: {
        id,
        username: id,
        email: id + '@example.invalid',
        role,
        passwordHash: 'unused-test-login',
        sessions: {
          create: {
            tokenHash: hash(token),
            csrfTokenHash: hash(csrf),
            expiresAt: new Date(Date.now() + 600000),
          },
        },
      },
    });
    this.staffIds.push(id);
    return {
      id,
      headers: {
        Cookie: 'hotel_staff_session=' + token + '; hotel_staff_csrf=' + csrf,
        'X-CSRF-Token': csrf,
      },
    };
  }

  client() {
    return request(this.app.getHttpServer());
  }

  get folios(): FoliosService {
    return this.app.get(FoliosService);
  }

  async assignmentRevision(
    booking: { publicReference: string; roomTypeId: string },
    headers: Record<string, string>,
  ): Promise<string> {
    const result = await this.client()
      .get(boardRoute)
      .set(headers)
      .query({ date: this.checkIn, roomTypeId: booking.roomTypeId })
      .expect(200);
    const data = result.body as {
      assignableBookings: Array<{ reference: string; revision: string }>;
    };
    const revision = data.assignableBookings.find(
      ({ reference }) => reference === booking.publicReference,
    )?.revision;
    if (typeof revision !== 'string') throw new Error('Missing booking assignment revision');
    return revision;
  }

  async createProperty(timezone = 'Asia/Tehran', createdAt?: Date, slug: string = randomUUID()) {
    const hotel = await this.prisma.hotel.create({
      data: {
        slug,
        name: 'Room board test hotel',
        address: 'Test',
        description: 'Test',
        timezone,
        ...(createdAt ? { createdAt } : {}),
      },
    });
    this.hotelIds.push(hotel.id);
    const type = await this.roomType(hotel.id);
    const rooms = await Promise.all(
      ['101', '102', '201'].map((roomNumber) =>
        this.prisma.room.create({
          data: {
            hotelId: hotel.id,
            roomTypeId: type.id,
            roomNumber,
            floor: roomNumber.slice(0, 1),
            housekeepingStatus: roomNumber === '101' ? 'INSPECTED' : 'DIRTY',
          },
        }),
      ),
    );
    return { hotel, type, rooms };
  }

  async housekeepingProperty() {
    const slug = 'hpm005-housekeeping-fixture';
    const existingHotel = await this.prisma.hotel.findUnique({ where: { slug } });
    if (!existingHotel) {
      return this.createProperty('Asia/Tehran', new Date('2000-01-01T00:00:00.000Z'), slug);
    }

    const type = await this.prisma.roomType.findFirst({
      where: { hotelId: existingHotel.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!type) throw new Error('The preserved HPM-005 test hotel has no room type.');
    const rooms = await this.prisma.room.findMany({
      where: { hotelId: existingHotel.id, roomTypeId: type.id },
      orderBy: [{ roomNumber: 'asc' }, { id: 'asc' }],
    });
    if (rooms.length < 3) throw new Error('The preserved HPM-005 test hotel has incomplete rooms.');
    return { hotel: existingHotel, type, rooms };
  }

  roomType(hotelId: string) {
    return this.prisma.roomType.create({
      data: {
        hotelId,
        slug: randomUUID(),
        name: 'Test Double',
        description: 'Test',
        maxGuestsPerRoom: 2,
      },
    });
  }

  booking(roomTypeId: string, roomQuantity = 1, checkIn = this.checkIn) {
    const next = addDays(checkIn, 1);
    const checkOut = addDays(checkIn, 2);
    return this.prisma.booking.create({
      data: {
        publicReference: randomUUID().slice(0, 16),
        roomTypeId,
        roomQuantity,
        status: 'CONFIRMED',
        checkIn: date(checkIn),
        checkOut: date(checkOut),
        guestCount: 1,
        guestName: 'Test Guest',
        guestPhone: '+989121234567',
        guestEmail: 'guest@example.invalid',
        totalPriceToman: 3000n * BigInt(roomQuantity),
        expiresAt: new Date(),
        nights: {
          create: [checkIn, next].map((stayDate) => ({
            stayDate: date(stayDate),
            roomQuantity,
            nightlyPriceToman: 1500n,
            amountToman: 1500n * BigInt(roomQuantity),
          })),
        },
      },
    });
  }

  inventory(roomTypeId: string, bookedRooms = 1) {
    return this.prisma.roomNightInventory.createMany({
      data: [this.checkIn, this.next].map((stayDate) => ({
        roomTypeId,
        stayDate: date(stayDate),
        totalRooms: 3,
        bookedRooms,
        nightlyPriceToman: 1500n,
      })),
    });
  }

  async close(options?: { preserveData?: boolean }) {
    try {
      if (options?.preserveData) {
        await this.prisma.staffSession.deleteMany({
          where: { staffUserId: { in: this.staffIds } },
        });
        await this.prisma.staffUser.updateMany({
          where: { id: { in: this.staffIds } },
          data: { isActive: false },
        });
        return;
      }

      const roomType = { hotelId: { in: this.hotelIds } };
      await this.prisma.roomAssignment.deleteMany({ where: { booking: { roomType } } });
      await this.prisma.roomBlock.deleteMany({ where: { room: { roomType } } });
      await this.prisma.room.deleteMany({ where: { roomType } });
      await this.prisma.roomNightInventory.deleteMany({ where: { roomType } });
      await this.prisma.folio.deleteMany({
        where: { booking: { roomType }, entries: { none: {} } },
      });
      await this.prisma.booking.deleteMany({ where: { roomType } });
      await this.prisma.roomType.deleteMany({ where: roomType });
      await this.prisma.hotel.deleteMany({ where: { id: { in: this.hotelIds } } });
      await this.prisma.staffSession.deleteMany({ where: { staffUserId: { in: this.staffIds } } });
      await this.prisma.staffUser.updateMany({
        where: { id: { in: this.staffIds } },
        data: { isActive: false },
      });
    } finally {
      await this.app.close();
    }
  }
}
