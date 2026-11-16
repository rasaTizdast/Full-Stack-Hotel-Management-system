import { afterEach, describe, expect, it, vi } from 'vitest';
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
