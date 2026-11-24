import { afterEach, describe, expect, it, vi } from 'vitest';
import * as staffApi from './staff-api';
import { changeStaffPassword, getCurrentStaff, loginStaff } from './staff-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getCurrentStaff', () => {
  it('shares an in-flight session refresh so CSRF rotation runs once', async () => {
    let resolveResponse!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    vi.stubGlobal('fetch', fetchMock);

    const first = getCurrentStaff();
    const second = getCurrentStaff();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveResponse(
      new Response(
        JSON.stringify({
          staff: { username: 'reception', email: 'reception@example.test', role: 'RECEPTIONIST' },
          csrfToken: 'memory-only-csrf',
        }),
        { status: 200 },
      ),
    );
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });
});

describe('changeStaffPassword', () => {
  it('posts only the current and new password with CSRF and private-fetch settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      changeStaffPassword('initial-password', 'new-password', 'csrf-token'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify({ currentPassword: 'initial-password', newPassword: 'new-password' }),
      }),
    );
  });
});

describe('room board API', () => {
  it('loads a filtered board through the private no-store staff client', async () => {
    const getBoard = Reflect.get(staffApi, 'getStaffRoomBoard');
    expect(getBoard).toBeTypeOf('function');
    if (typeof getBoard !== 'function') return;

    const board = {
      date: '2026-11-17',
      businessDate: '2026-11-17',
      updatedAt: '2026-11-17T08:30:00.000Z',
      items: [],
      assignableBookings: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(board), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getBoard({
        date: '2026-11-17',
        roomTypeId: 'dcb44b37-514f-4f96-b55f-d9d9a76f3f44',
        floor: '۲',
        occupancy: 'UNKNOWN',
        housekeepingStatus: 'DIRTY',
        stayContext: 'ARRIVING',
        blockKind: 'OUT_OF_ORDER',
      }),
    ).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/rooms/board?date=2026-11-17&roomTypeId=dcb44b37-514f-4f96-b55f-d9d9a76f3f44&floor=%DB%B2&occupancy=UNKNOWN&housekeepingStatus=DIRTY&stayContext=ARRIVING&blockKind=OUT_OF_ORDER',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('accepts and serializes the in-house stay-context filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          date: '2026-11-17',
          businessDate: '2026-11-17',
          updatedAt: '',
          items: [],
          assignableBookings: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await staffApi.getStaffRoomBoard({ date: '2026-11-17', stayContext: 'IN_HOUSE' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/rooms/board?date=2026-11-17&stayContext=IN_HOUSE',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('saves the complete revisioned assignment set and preserves the stale conflict code', async () => {
    const replaceAssignments = Reflect.get(staffApi, 'replaceStaffBookingRoomAssignments');
    expect(replaceAssignments).toBeTypeOf('function');
    if (typeof replaceAssignments !== 'function') return;

    const input = {
      assignments: [
        {
          roomId: 'b0b97da9-811e-4d70-b0c1-ae0a0f58042a',
          startDate: '2026-11-20',
          endDate: '2026-11-23',
        },
      ],
      expectedRevision: 'a'.repeat(64),
      reason: 'تخصیص پیش از ورود',
    };
    const response = { revision: 'b'.repeat(64), assignments: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Assignment changed elsewhere.',
            code: 'ROOM_ASSIGNMENT_STALE',
          }),
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(replaceAssignments('ABC123456789', input, 'csrf-token')).resolves.toEqual(
      response,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/bookings/ABC123456789/room-assignments',
      expect.objectContaining({
        method: 'PUT',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify(input),
      }),
    );
    await expect(replaceAssignments('ABC123456789', input, 'csrf-token')).rejects.toMatchObject({
      status: 409,
      code: 'ROOM_ASSIGNMENT_STALE',
    });
  });
});

describe('loginStaff API configuration', () => {
  it('does not send staff credentials to localhost when production API configuration is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_HOTEL_API_BASE_URL', '');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          staff: { username: 'staff', email: 'staff@example.test', role: 'ADMIN' },
          csrfToken: 'csrf-token',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loginStaff('staff@example.test', 'secret')).rejects.toMatchObject({ status: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send staff credentials to an insecure API URL in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_HOTEL_API_BASE_URL', 'http://api.example.test/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          staff: { username: 'staff', email: 'staff@example.test', role: 'ADMIN' },
          csrfToken: 'csrf-token',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loginStaff('staff@example.test', 'secret')).rejects.toMatchObject({ status: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
