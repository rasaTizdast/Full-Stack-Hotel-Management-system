import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AvailabilityApiError,
  classifyAvailabilityResults,
  fetchAvailability,
  formatTomanTotal,
  type AvailabilityResult,
} from './availability';

const response: AvailabilityResult = {
  checkIn: '2024-03-19',
  checkOut: '2024-03-20',
  guests: 2,
  numberOfNights: 1,
  roomTypes: [
    {
      slug: 'garden-double',
      name: 'اتاق دوتخته باغ',
      maxGuestsPerRoom: 2,
      isAvailable: true,
      availableRooms: 4,
      totalPriceToman: '2400000',
      nightlyBreakdown: [
        {
          stayDate: '2024-03-19',
          isAvailable: true,
          availableRooms: 4,
          nightlyPriceToman: '2400000',
        },
      ],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('availability API client', () => {
  it('sends only Gregorian ISO dates and guest count to the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchAvailability({ checkIn: '2024-03-19', checkOut: '2024-03-20', guests: 2 }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/availability?checkIn=2024-03-19&checkOut=2024-03-20&guests=2',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('classifies empty, unavailable, and available result sets separately', () => {
    expect(classifyAvailabilityResults([])).toBe('empty');
    expect(classifyAvailabilityResults([{ ...response.roomTypes[0], isAvailable: false }])).toBe(
      'unavailable',
    );
    expect(classifyAvailabilityResults(response.roomTypes)).toBe('available');
  });

  it('preserves the server total as an integer Toman amount', () => {
    expect(formatTomanTotal('240000000000000000000')).toBe('۲۴۰٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰');
    expect(() => formatTomanTotal('2400000.5')).toThrow();
  });

  it('distinguishes an unavailable date range from a server failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchAvailability({ checkIn: '2024-03-19', checkOut: '2024-03-20', guests: 2 }),
    ).rejects.toMatchObject<Partial<AvailabilityApiError>>({ kind: 'unavailable' });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(
      fetchAvailability({ checkIn: '2024-03-19', checkOut: '2024-03-20', guests: 2 }),
    ).rejects.toMatchObject<Partial<AvailabilityApiError>>({ kind: 'server-error' });
  });
});
