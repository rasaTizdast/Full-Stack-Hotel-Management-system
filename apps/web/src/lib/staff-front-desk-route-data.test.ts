import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFrontDeskRoomTypes } from './staff-front-desk-route-data';

const publicApi = vi.hoisted(() => ({ getPublicRoomTypes: vi.fn() }));

vi.mock('./public-api', () => publicApi);

describe('getFrontDeskRoomTypes', () => {
  beforeEach(() => publicApi.getPublicRoomTypes.mockReset());

  it('preserves a valid empty catalog as a successful result', async () => {
    publicApi.getPublicRoomTypes.mockResolvedValueOnce([]);

    await expect(getFrontDeskRoomTypes()).resolves.toEqual({ status: 'ready', roomTypes: [] });
  });

  it('preserves catalog failure as a retryable error result', async () => {
    publicApi.getPublicRoomTypes.mockRejectedValueOnce(new Error('catalog unavailable'));

    await expect(getFrontDeskRoomTypes()).resolves.toEqual({ status: 'error', roomTypes: [] });
  });
});
