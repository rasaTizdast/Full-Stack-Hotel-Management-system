import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adjustStaffFolio,
  createStaffServiceItem,
  getStaffFolio,
  getStaffServiceItems,
  postStaffServiceCharge,
  updateStaffServiceItem,
} from './staff-folios-api';

afterEach(() => vi.unstubAllGlobals());

describe('staff folio API client', () => {
  it('sends catalog and folio reads with private no-store fetch settings', async () => {
    const response = { items: [] };
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(response))));
    vi.stubGlobal('fetch', fetchMock);

    await getStaffServiceItems();
    await getStaffFolio('booking/123');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/services',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4000/api/v1/staff/folios/booking%2F123',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('sends CSRF and idempotency headers for writes and keeps private fetch settings', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const csrf = 'fictional-csrf-token';

    await createStaffServiceItem(
      { name: 'صبحانه', category: 'پذیرایی', currentPriceToman: '120000' },
      csrf,
    );
    await updateStaffServiceItem('service/1', { currentPriceToman: '125000' }, csrf);
    await postStaffServiceCharge(
      'booking/1',
      { serviceItemId: 'service-1', quantity: 2, serviceDate: '2026-11-23' },
      'service-retry-01',
      csrf,
    );
    await adjustStaffFolio(
      'booking/1',
      { correctsEntryId: 'entry-1', amountToman: '10000', reason: 'مبلغ اشتباه' },
      'adjust-retry-01',
      csrf,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/staff/services',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({ 'X-CSRF-Token': csrf }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4000/api/v1/staff/services/service%2F1',
      expect.objectContaining({ method: 'PATCH', cache: 'no-store' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:4000/api/v1/staff/folios/booking%2F1/services',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          'X-CSRF-Token': csrf,
          'Idempotency-Key': 'service-retry-01',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:4000/api/v1/staff/folios/booking%2F1/adjustments',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          'X-CSRF-Token': csrf,
          'Idempotency-Key': 'adjust-retry-01',
        }),
      }),
    );
  });
});
