import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvailabilitySearch } from './availability-search';
import type { AvailabilityResult } from '@/lib/availability';
import type { PublicRoomType } from '@/lib/public-api';
import { getDefaultStayInput, toGregorianIso } from '@/lib/jalali-date';

const roomTypes: PublicRoomType[] = [
  {
    slug: 'garden-double',
    name: 'اتاق دوتخته باغ',
    description: 'اتاق رو به باغ.',
    maxGuestsPerRoom: 2,
    amenities: ['وای‌فای', 'صبحانه'],
  },
];
const initialStay = getDefaultStayInput();

function result(overrides: Partial<AvailabilityResult> = {}): AvailabilityResult {
  return {
    checkIn: '2026-11-15',
    checkOut: '2026-11-17',
    guests: 2,
    numberOfNights: 2,
    roomTypes: [
      {
        slug: 'garden-double',
        name: 'اتاق دوتخته باغ',
        maxGuestsPerRoom: 2,
        isAvailable: true,
        availableRooms: 4,
        totalPriceToman: '4800000',
        nightlyBreakdown: [],
      },
    ],
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('AvailabilitySearch', () => {
  it('shows field validation and does not call the API for invalid input', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />);

    fireEvent.change(screen.getByLabelText('تاریخ ورود'), { target: { value: '1403/13/01' } });
    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));

    expect(
      await screen.findByText('تاریخ ورود را به شکل سال/ماه/روز معتبر وارد کنید.'),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows loading, sends converted dates, and renders the server total and room capacity', async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />);
    const checkIn = screen.getByLabelText('تاریخ ورود') as HTMLInputElement;
    const checkOut = screen.getByLabelText('تاریخ خروج') as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));
    expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی اتاق‌های قابل رزرو');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toContain(`checkIn=${toGregorianIso(checkIn.value)}`);
    expect(fetchMock.mock.calls[0][0]).toContain(`checkOut=${toGregorianIso(checkOut.value)}`);
    expect(fetchMock.mock.calls[0][0]).toContain('guests=2');

    resolveRequest(Response.json(result()));
    expect(await screen.findByRole('heading', { name: 'اتاق‌های مناسب شما' })).toBeVisible();
    expect(screen.getByText('۴٬۸۰۰٬۰۰۰')).toBeVisible();
    expect(screen.getByText('تومان')).toBeVisible();
    expect(screen.getByText('حداکثر ۲ نفر')).toBeVisible();
    expect(screen.getByText('۴ اتاق در دسترس')).toBeVisible();
    expect(screen.getByText('وای‌فای')).toBeVisible();

    fireEvent.change(checkIn, { target: { value: '۱۴۰۵/۰۸/۲۵' } });
    expect(screen.queryByRole('heading', { name: 'اتاق‌های مناسب شما' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('بازهٔ اقامت خود را بررسی کنید');
  });

  it('passes only the selected room and stay details to the booking form', async () => {
    const bookingDates = {
      checkIn: toGregorianIso(initialStay.checkIn)!,
      checkOut: toGregorianIso(initialStay.checkOut)!,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result(bookingDates))));
    render(<AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />);

    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));
    const bookingLink = await screen.findByRole('link', { name: 'درخواست اقامت' });
    const query = new URL(bookingLink.getAttribute('href')!, 'http://localhost').searchParams;

    expect(query.get('roomType')).toBe('garden-double');
    expect(query.get('checkIn')).toBe(bookingDates.checkIn);
    expect(query.get('checkOut')).toBe(bookingDates.checkOut);
    expect(query.get('guestCount')).toBe('2');
    expect(query.has('totalPriceToman')).toBe(false);
  });

  it('distinguishes no room types, unavailable dates, and server errors', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(
      <AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />,
    );

    fetchMock.mockResolvedValueOnce(Response.json(result({ roomTypes: [] })));
    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));
    expect(await screen.findByText('هنوز اتاقی برای نمایش آماده نیست.')).toBeVisible();

    rerender(<AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />);
    fetchMock.mockResolvedValueOnce(
      Response.json(
        result({
          roomTypes: [
            {
              ...result().roomTypes[0],
              isAvailable: false,
              availableRooms: 0,
              totalPriceToman: null,
            },
          ],
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));
    expect(await screen.findByText('برای این بازهٔ اقامت اتاق آزادی پیدا نشد.')).toBeVisible();

    rerender(<AvailabilitySearch roomTypes={roomTypes} initialStay={initialStay} />);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: 'بررسی اتاق‌های موجود' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'سرویس بررسی اتاق‌ها موقتاً در دسترس نیست.',
    );
  });
});
