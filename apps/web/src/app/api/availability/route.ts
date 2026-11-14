const AVAILABILITY_PARAMETERS = ['checkIn', 'checkOut', 'guests'] as const;

function getApiBaseUrl(): string {
  return (process.env.HOTEL_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of AVAILABILITY_PARAMETERS) {
    const values = incoming.searchParams.getAll(key);
    if (values.length !== 1 || values[0].length === 0) {
      return json({ code: 'INVALID_AVAILABILITY_QUERY' }, 400);
    }
    query.set(key, values[0]);
  }

  try {
    const upstream = await fetch(`${getApiBaseUrl()}/availability?${query.toString()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    let body: unknown;
    try {
      body = await upstream.json();
    } catch {
      return json({ code: 'SERVICE_UNAVAILABLE' }, 502);
    }
    return json(body, upstream.status);
  } catch {
    return json({ code: 'SERVICE_UNAVAILABLE' }, 502);
  }
}
