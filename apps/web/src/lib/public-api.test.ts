import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicHotel, getPublicRoomTypes, PublicApiError } from './public-api';

const hotel = {
  slug: 'shiraz-garden-house',
  name: 'خانه‌باغ نارنج؛ هتل نمایشی',
  address: 'شیراز، نشانی نمایشی شماره ۱',
  description: 'اقامتگاهی خیالی برای آزمون سامانه رزرو.',
  timezone: 'Asia/Tehran',
  contactPhone: null,
  contactEmail: 'hello@example.invalid',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('public API client', () => {
  it('loads hotel content from the configured API without caching', async () => {
    vi.stubEnv('HOTEL_API_BASE_URL', 'https://hotel.example.test/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(Response.json(hotel));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPublicHotel()).resolves.toEqual(hotel);
    expect(fetchMock).toHaveBeenCalledWith('https://hotel.example.test/api/v1/hotel', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  });

  it('surfaces a not-found error for a missing public hotel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getPublicHotel()).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('rejects malformed API data instead of rendering untrusted shapes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...hotel, slug: 12 })));

    await expect(getPublicHotel()).rejects.toBeInstanceOf(PublicApiError);
  });

  it('loads the active room list from the public endpoint', async () => {
    const rooms = [
      {
        slug: 'garden-double',
        name: 'اتاق دوتخته باغ',
        description: 'اتاقی برای دو نفر.',
        maxGuestsPerRoom: 2,
        amenities: ['وای‌فای', 'صبحانه'],
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(Response.json(rooms));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPublicRoomTypes()).resolves.toEqual(rooms);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/room-types', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  });
});
