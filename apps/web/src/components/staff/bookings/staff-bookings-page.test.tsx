import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffSessionProvider } from '@/components/staff/staff-session-provider';
import type {
  StaffBookingDetail,
  StaffBookingListItem,
  StaffBookingPage,
} from '@/lib/staff-bookings-api';
import { StaffBookingsPage } from './staff-bookings-page';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/staff/bookings',
}));

const booking: StaffBookingListItem = {
  reference: 'HB-26-AB',
  status: 'PENDING_CONFIRMATION',
  checkIn: '2026-12-01',
  checkOut: '2026-12-03',
  guestCount: 2,
  roomQuantity: 1,
  guestName: 'مریم رضایی',
  guestPhone: '+989123456789',
  roomType: { slug: 'garden-double', name: 'اتاق دوتخته باغ' },
  createdAt: '2026-11-14T10:00:00.000Z',
  expiresAt: '2026-11-15T10:00:00.000Z',
};

const bookingDetail: StaffBookingDetail = {
  ...booking,
  guestEmail: 'maryam@example.test',
  totalPriceToman: '4800000',
  internalNote: null,
  cancellationReason: null,
  statusTimestamps: { confirmedAt: null, rejectedAt: null, cancelledAt: null, expiredAt: null },
  nights: [
    {
      stayDate: '2026-12-01',
      nightlyPriceToman: '2400000',
      roomQuantity: 1,
      amountToman: '2400000',
    },
    {
      stayDate: '2026-12-02',
      nightlyPriceToman: '2400000',
      roomQuantity: 1,
      amountToman: '2400000',
    },
  ],
};

function pageOf(items: StaffBookingListItem[] = [booking]): StaffBookingPage {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
    },
  };
}

type ActionName = 'confirm' | 'reject' | 'cancel';

interface MockApiOptions {
  lists?: StaffBookingPage[];
  listErrors?: Array<{ status: number; body: unknown }>;
  details?: StaffBookingDetail[];
  actions?: Partial<Record<ActionName, { status: number; body: unknown }>>;
}

function setupApi(options: MockApiOptions = {}) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const lists = [...(options.lists ?? [pageOf()])];
  const listErrors = [...(options.listErrors ?? [])];
  const details = [...(options.details ?? [bookingDetail])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });

    if (url.endsWith('/staff/auth/me')) {
      return new Response(
        JSON.stringify({
          staff: { username: 'reception', email: 'reception@example.test', role: 'RECEPTIONIST' },
          csrfToken: 'csrf-memory',
        }),
        { status: 200 },
      );
    }

    if (init?.method === 'POST') {
      const action = url.split('/').at(-1) as ActionName;
      const result = options.actions?.[action] ?? { status: 200, body: bookingDetail };
      return new Response(JSON.stringify(result.body), { status: result.status });
    }

    if (url.includes('/staff/bookings?') || url.endsWith('/staff/bookings')) {
      const error = listErrors.shift();
      if (error) return new Response(JSON.stringify(error.body), { status: error.status });
      return new Response(JSON.stringify(lists.shift() ?? pageOf()), { status: 200 });
    }

    if (url.includes('/staff/bookings/')) {
      const result = details.shift() ?? details.at(-1) ?? bookingDetail;
      return new Response(JSON.stringify(result), { status: 200 });
    }

    throw new Error(`Unexpected staff API request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StaffSessionProvider>
      <StaffBookingsPage />
    </StaffSessionProvider>,
  );
  return { fetchMock, requests };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('StaffBookingsPage', () => {
  beforeEach(() => router.replace.mockReset());

  it('loads booking requests and opens authorized guest details', async () => {
    setupApi();
    const row = await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ });

    expect(within(row).getByText('مریم رضایی')).toBeInTheDocument();
    fireEvent.click(row);

    expect(
      await screen.findByRole('heading', { name: 'جزئیات رزرو HB-26-AB' }),
    ).toBeInTheDocument();
    expect(screen.getByText('maryam@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('اتاق دوتخته باغ')).toHaveLength(2);
    expect(screen.getAllByText('در انتظار تأیید')).toHaveLength(3);
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
  });

  it('converts Jalali arrival filters and searches by reference or phone', async () => {
    const { requests } = setupApi({ lists: [pageOf(), pageOf()] });
    await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ });

    fireEvent.change(screen.getByLabelText('وضعیت درخواست'), {
      target: { value: 'CONFIRMED' },
    });
    fireEvent.change(screen.getByLabelText('ورود از'), { target: { value: '۱۴۰۲/۱۲/۲۹' } });
    fireEvent.change(screen.getByLabelText('ورود تا'), { target: { value: '۱۴۰۳/۰۱/۰۱' } });
    fireEvent.change(screen.getByLabelText('کد رزرو یا موبایل'), {
      target: { value: '  09123456789  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));

    await waitFor(() => {
      const listRequest = requests.find((request) => request.url.includes('status=CONFIRMED'));
      expect(listRequest).toBeDefined();
      const query = new URL(listRequest!.url).searchParams;
      expect(query.get('arrivalFrom')).toBe('2024-03-19');
      expect(query.get('arrivalTo')).toBe('2024-03-20');
      expect(query.get('search')).toBe('09123456789');
    });
  });

  it('does not call the list API when Jalali filters are invalid', async () => {
    const { requests } = setupApi({ lists: [pageOf()] });
    await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ });
    const callsBeforeFilter = requests.filter((request) =>
      request.url.includes('/staff/bookings'),
    ).length;

    fireEvent.change(screen.getByLabelText('ورود از'), { target: { value: '۱۴۰۰/۱۲/۳۰' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));

    expect(await screen.findByText('تاریخ ورود را معتبر وارد کنید.')).toBeInTheDocument();
    expect(requests.filter((request) => request.url.includes('/staff/bookings'))).toHaveLength(
      callsBeforeFilter,
    );
  });

  it('requires a separate confirmation before sending a booking decision', async () => {
    const confirmed = { ...bookingDetail, status: 'CONFIRMED' as const };
    const { requests } = setupApi({ actions: { confirm: { status: 200, body: confirmed } } });
    fireEvent.click(await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید رزرو' }));

    expect(screen.getByRole('heading', { name: 'تأیید نهایی رزرو' })).toBeInTheDocument();
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'بله، رزرو را تأیید می‌کنم' }));

    await waitFor(() => {
      const actionRequest = requests.find((request) => request.url.endsWith('/confirm'));
      expect(actionRequest?.init).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' }),
      });
    });
    expect(await screen.findByText('رزرو تأیید شد.')).toBeInTheDocument();
    expect(screen.getAllByText('تأییدشده').length).toBeGreaterThan(0);
  });

  it('requires a cancellation reason and a final click before canceling', async () => {
    const confirmedBooking = { ...bookingDetail, status: 'CONFIRMED' as const };
    const cancelled = { ...confirmedBooking, status: 'CANCELLED' as const };
    const { requests } = setupApi({
      details: [confirmedBooking],
      actions: { cancel: { status: 200, body: cancelled } },
    });
    fireEvent.click(await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'لغو رزرو' }));

    const confirm = screen.getByRole('button', { name: 'بله، رزرو را لغو می‌کنم' });
    fireEvent.click(confirm);
    expect(screen.getByLabelText('دلیل لغو')).toBeInvalid();
    expect(requests.some((request) => request.url.endsWith('/cancel'))).toBe(false);

    fireEvent.change(screen.getByLabelText('دلیل لغو'), { target: { value: 'درخواست مهمان' } });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(requests.some((request) => request.url.endsWith('/cancel'))).toBe(true),
    );
    const cancelRequest = requests.find((request) => request.url.endsWith('/cancel'));
    expect(cancelRequest?.init?.body).toBe(JSON.stringify({ reason: 'درخواست مهمان' }));
    expect(await screen.findByText('رزرو لغو شد.')).toBeInTheDocument();
  });

  it('does not offer cancellation after the check-in date has started', async () => {
    const checkedInBooking = {
      ...bookingDetail,
      status: 'CONFIRMED' as const,
      checkIn: '2024-03-20',
    };
    setupApi({ details: [checkedInBooking] });
    fireEvent.click(await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ }));

    expect(
      await screen.findByRole('heading', { name: 'جزئیات رزرو HB-26-AB' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'لغو رزرو' })).not.toBeInTheDocument();
  });

  it('refreshes detail from the API after a stale transition conflict', async () => {
    const current = { ...bookingDetail, status: 'REJECTED' as const };
    setupApi({
      details: [bookingDetail, current],
      actions: {
        confirm: {
          status: 409,
          body: {
            statusCode: 409,
            code: 'BOOKING_STATE_CONFLICT',
            message: 'This booking is no longer pending.',
          },
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید رزرو' }));
    fireEvent.click(await screen.findByRole('button', { name: 'بله، رزرو را تأیید می‌کنم' }));

    expect(
      await screen.findByText('این درخواست تغییر کرده است؛ آخرین وضعیت از سامانه دریافت شد.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('ردشده').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'تأیید نهایی رزرو' })).not.toBeInTheDocument();
  });

  it('distinguishes a server error from a genuinely empty filtered result', async () => {
    setupApi({ lists: [pageOf([])] });
    expect(await screen.findByText('رزروی پیدا نشد.')).toBeInTheDocument();
  });

  it('explains list failures and lets staff retry', async () => {
    setupApi({
      listErrors: [{ status: 500, body: { message: 'سرویس موقتاً در دسترس نیست.' } }],
      lists: [pageOf()],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('سرویس موقتاً در دسترس نیست.');

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(
      await screen.findByRole('button', { name: /نمایش جزئیات رزرو HB-26-AB/ }),
    ).toBeInTheDocument();
  });
});
