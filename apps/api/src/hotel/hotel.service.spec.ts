import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HotelService } from './hotel.service';

describe('HotelService', () => {
  const prisma = {
    hotel: { findUnique: jest.fn() },
  };
  let service: HotelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HotelService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(HotelService);
    jest.clearAllMocks();
  });

  it('returns only the public hotel fields when persistence metadata is present', async () => {
    prisma.hotel.findUnique.mockResolvedValue({
      id: 'internal-hotel-id',
      slug: 'shiraz-garden-house',
      name: 'خانه‌باغ نارنج؛ هتل نمایشی',
      address: 'شیراز، نشانی نمایشی شماره ۱',
      description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
      timezone: 'Asia/Tehran',
      contactPhone: null,
      contactEmail: 'hello@example.invalid',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      roomTypes: [{ id: 'private-room-type-id' }],
    });

    await expect(service.getPublicHotel()).resolves.toEqual({
      slug: 'shiraz-garden-house',
      name: 'خانه‌باغ نارنج؛ هتل نمایشی',
      address: 'شیراز، نشانی نمایشی شماره ۱',
      description: 'اقامتگاهی کاملاً خیالی برای نمایش و آزمون سامانه رزرو.',
      timezone: 'Asia/Tehran',
      contactPhone: null,
      contactEmail: 'hello@example.invalid',
    });
  });

  it('returns a not-found error when public hotel content is not configured', async () => {
    prisma.hotel.findUnique.mockResolvedValue(null);

    await expect(service.getPublicHotel()).rejects.toBeInstanceOf(NotFoundException);
  });
});
