import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStaffInventoryRange,
  getStaffInventoryRoomTypes,
  StaffApiError,
  updateStaffInventoryRange,
} from './staff-api';

const range = {
  roomTypeId: 'b2fc7c3d-a41f-4621-a774-a2d8c2af4472',
  startDate: '2027-01-02',
  endDate: '2027-01-04',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('staff inventory API client', () => {
  it('loads minimal room type options using the authenticated staff API', async () => {
    const options = [
      { id: range.roomTypeId, name: 'اتاق باغ', slug: 'garden-room', isActive: true },
      {
        id: 'e9136419-2536-4f43-9f2f-2b2b3c4b0e3d',
        name: 'اتاق بسته',
        slug: 'closed-room',
        isActive: false,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(options), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffInventoryRoomTypes()).resolves.toEqual(options);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/inventory/room-types',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('sends Gregorian range queries to the staff inventory endpoint', async () => {
    const result = {
      roomType: { ...{ id: range.roomTypeId, name: 'اتاق باغ', slug: 'garden-room' } },
      ...range,
      nights: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffInventoryRange(range)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000/api/v1/staff/inventory?roomTypeId=${range.roomTypeId}&startDate=2027-01-02&endDate=2027-01-04`,
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('includes the session CSRF token when batch-saving a range', async () => {
    const update = { ...range, totalRooms: 3, nightlyPriceToman: '3500000' };
    const response = {
      roomType: { id: range.roomTypeId, name: 'اتاق باغ', slug: 'garden-room' },
      startDate: range.startDate,
      endDate: range.endDate,
      nights: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateStaffInventoryRange(update, 'admin-csrf')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/inventory',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'admin-csrf' },
        body: JSON.stringify(update),
      }),
    );
  });

  it('preserves safe API error codes and field details for form feedback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          fields: [{ field: 'nightlyPriceToman', messages: ['Invalid value.'] }],
        }),
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateStaffInventoryRange({ ...range, totalRooms: 3, nightlyPriceToman: 'invalid' }, 'csrf'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: [{ field: 'nightlyPriceToman', messages: ['Invalid value.'] }],
    } satisfies Partial<StaffApiError>);
  });
});
