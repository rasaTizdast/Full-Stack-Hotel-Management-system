import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStaffRoom,
  deactivateStaffRoom,
  getStaffRooms,
  reactivateStaffRoom,
  updateStaffRoom,
} from './staff-api';

const roomTypeId = 'b2fc7c3d-a41f-4621-a774-a2d8c2af4472';
const room = {
  id: '188f912a-1b47-4639-8940-8e9f72a05199',
  roomNumber: '۲۰۱',
  floor: '۲',
  features: ['بالکن'],
  housekeepingStatus: 'CLEAN',
  isActive: true,
  isGenerated: false,
  roomType: { id: roomTypeId, name: 'اتاق باغ', slug: 'garden-room' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staff physical rooms API client', () => {
  it('loads rooms using filters and private uncached staff requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [room] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getStaffRooms({ roomTypeId, floor: '۲', isActive: false, search: '۲۰۱' }),
    ).resolves.toEqual({ items: [room] });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000/api/v1/staff/rooms?roomTypeId=${roomTypeId}&floor=%DB%B2&isActive=false&search=%DB%B2%DB%B0%DB%B1`,
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('sends only room fields and CSRF for create and edit', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => new Response(JSON.stringify(room), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const create = { roomTypeId, roomNumber: '۲۰۱', floor: '۲', features: ['بالکن'] };
    const update = { roomNumber: '۲۰۲', floor: '۳', features: ['تراس'] };

    await createStaffRoom(create, 'csrf-admin');
    await updateStaffRoom(room.id, update, 'csrf-admin');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/rooms',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-admin' },
        body: JSON.stringify(create),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:4000/api/v1/staff/rooms/${room.id}`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-admin' },
        body: JSON.stringify(update),
      }),
    );
  });

  it('posts explicit deactivate and reactivate actions with CSRF', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => new Response(JSON.stringify({ ...room, isActive: false }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deactivateStaffRoom(room.id, 'csrf-admin');
    await reactivateStaffRoom(room.id, 'csrf-admin');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:4000/api/v1/staff/rooms/${room.id}/deactivate`,
      expect.objectContaining({ method: 'POST', cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:4000/api/v1/staff/rooms/${room.id}/reactivate`,
      expect.objectContaining({ method: 'POST', cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'X-CSRF-Token': 'csrf-admin' },
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'X-CSRF-Token': 'csrf-admin' },
    });
  });
});
