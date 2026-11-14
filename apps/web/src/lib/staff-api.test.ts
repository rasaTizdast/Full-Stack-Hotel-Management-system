import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentStaff } from './staff-api';

afterEach(() => vi.unstubAllGlobals());

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
