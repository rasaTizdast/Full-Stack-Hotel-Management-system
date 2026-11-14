import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/availability', () => {
  it('forwards an allowlisted query to the configured API without caching', async () => {
    vi.stubEnv('HOTEL_API_BASE_URL', 'http://api.example.test/api/v1/');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ roomTypes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request(
        'http://localhost/api/availability?checkIn=2024-03-19&checkOut=2024-03-20&guests=2&extra=ignored',
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.test/api/v1/availability?checkIn=2024-03-19&checkOut=2024-03-20&guests=2',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ roomTypes: [] });
  });

  it('returns a safe service error when the upstream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection details stay private')));
    const response = await GET(
      new Request(
        'http://localhost/api/availability?checkIn=2024-03-19&checkOut=2024-03-20&guests=2',
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ code: 'SERVICE_UNAVAILABLE' });
  });
});
