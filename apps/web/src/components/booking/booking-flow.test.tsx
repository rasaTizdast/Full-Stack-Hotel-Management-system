import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingFlow } from './booking-flow';
import type { AvailabilityRoomType } from '@/lib/availability';
import type { PublicRoomType } from '@/lib/public-api';

const room: PublicRoomType = {
  slug: 'garden-double',
  name: 'اتاق دوتخته باغ',
  description: 'اتاقی رو به باغ.',
  maxGuestsPerRoom: 2,
  amenities: ['وای‌فای', 'صبحانه'],
};

const context = {
  checkIn: '2026-11-15',
  checkOut: '2026-11-17',
  guestCount: 2,
};

const roomAvailability: AvailabilityRoomType = {
  slug: room.slug,
  name: room.name,
  maxGuestsPerRoom: room.maxGuestsPerRoom,
  isAvailable: true,
  availableRooms: 3,
  totalPriceToman: '4800000',
  nightlyBreakdown: [],
};

const bookingResponse = {
  reference: 'N8rP4vQkL2dX',
  status: 'PENDING_CONFIRMATION',
  checkIn: '2026-11-15',
  checkOut: '2026-11-17',
  guestCount: 2,
  roomQuantity: 1,
  roomType: { slug: room.slug, name: room.name },
  priceSummary: {
    numberOfNights: 2,
    totalPriceToman: '4800000',
    nights: [],
  },
};

afterEach(() => vi.unstubAllGlobals());

function renderBookingFlow(hotelContactPhone: string | null = null) {
  return render(
    <BookingFlow
      room={room}
      context={context}
      roomAvailability={roomAvailability}
      hotelContactPhone={hotelContactPhone}
    />,
  );
}

function fillGuestDetails() {
  fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), {
    target: { value: 'مریم رضایی' },
  });
  fireEvent.change(screen.getByLabelText('شماره موبایل'), {
    target: { value: '۰۹۱۲۳۴۵۶۷۸۹' },
  });
}

describe('BookingFlow', () => {
  it('shows the selected stay, capacity-aware room quantity, and server-based estimate', () => {
    renderBookingFlow();

    expect(screen.getByRole('heading', { name: 'اتاق دوتخته باغ' })).toBeVisible();
    expect(screen.getByLabelText('تعداد اتاق')).toHaveValue('1');
    expect(screen.getByText('۴٬۸۰۰٬۰۰۰')).toBeVisible();
    expect(screen.getByText('تومان')).toBeVisible();
    expect(screen.getByText('منتظر تأیید پذیرش')).toBeVisible();
  });

  it('multiplies the server estimate by the selected room quantity', () => {
    renderBookingFlow();
    fireEvent.change(screen.getByLabelText('تعداد اتاق'), { target: { value: '2' } });

    expect(screen.getByText('۹٬۶۰۰٬۰۰۰')).toBeVisible();
  });

  it('blocks invalid contact details before calling the booking API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderBookingFlow();

    fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: '02188776655' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));

    expect(await screen.findByText('نام را با دست‌کم دو نویسه وارد کنید.')).toBeVisible();
    expect(screen.getByText('شمارهٔ موبایل معتبر ایران را وارد کنید.')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('نام و نام خانوادگی')).toHaveFocus();
  });

  it('prevents duplicate clicks while submitting and confirms only the public response', async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderBookingFlow();
    fillGuestDetails();
    const submit = screen.getByRole('button', { name: 'ثبت درخواست اقامت' });

    fireEvent.click(submit);
    expect(screen.getByRole('button', { name: 'در حال ثبت درخواست…' })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'در حال ثبت درخواست…' }));
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveRequest(Response.json(bookingResponse, { status: 201 }));
    const confirmationHeading = await screen.findByRole('heading', {
      name: 'درخواست اقامت شما ثبت شد',
    });
    expect(confirmationHeading).toBeVisible();
    expect(confirmationHeading).toHaveFocus();
    expect(screen.getByText('N8rP4vQkL2dX')).toBeVisible();
    expect(screen.getByText('۴٬۸۰۰٬۰۰۰')).toBeVisible();
    expect(screen.queryByLabelText('شماره موبایل')).not.toBeInTheDocument();
    expect(screen.queryByText('مریم رضایی')).not.toBeInTheDocument();
  });

  it('exposes the confirmation as a named region instead of a long status live region', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(bookingResponse, { status: 201 })));
    renderBookingFlow();
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));
    await screen.findByRole('heading', { name: 'درخواست اقامت شما ثبت شد' });

    expect(screen.getByRole('region', { name: 'درخواست اقامت شما ثبت شد' })).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a direct call link when the property has a valid configured phone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(bookingResponse, { status: 201 })),
    );
    renderBookingFlow('+98 (71) 3234-5678');
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));

    const contactLink = await screen.findByRole('link', { name: /تماس با اقامتگاه/ });
    expect(contactLink).toHaveAttribute('href', 'tel:+987132345678');
    expect(screen.getByText('در انتظار تأیید پذیرش')).toBeVisible();
  });

  it('does not show an empty or placeholder contact link when the property phone is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(bookingResponse, { status: 201 })),
    );
    const { container } = renderBookingFlow(null);
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));
    await screen.findByRole('heading', { name: 'درخواست اقامت شما ثبت شد' });

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /تماس با اقامتگاه/ })).not.toBeInTheDocument();
    expect(screen.getByText(/پذیرش برای پیگیری درخواست با این شماره تماس می‌گیرد/)).toBeVisible();
    expect(screen.getByText('+989123456789')).toBeVisible();
  });

  it('shows the submitted phone as the number reception will use for follow-up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(bookingResponse, { status: 201 })),
    );
    renderBookingFlow();
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));
    await screen.findByRole('heading', { name: 'درخواست اقامت شما ثبت شد' });

    expect(screen.getByText(/پذیرش برای پیگیری درخواست با این شماره تماس می‌گیرد/)).toBeVisible();
    expect(screen.getByText('+989123456789')).toBeVisible();
    expect(screen.getByText('N8rP4vQkL2dX')).toBeVisible();
    expect(screen.getByText('در انتظار تأیید پذیرش')).toBeVisible();
  });

  it('reuses the same idempotency key when retrying the same form after a server failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 }))
      .mockResolvedValueOnce(Response.json(bookingResponse, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    renderBookingFlow();
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'خطا در ثبت درخواست. اطلاعات حفظ شده است؛ دوباره تلاش کنید.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'دوباره تلاش کنید' }));
    expect(await screen.findByRole('heading', { name: 'درخواست اقامت شما ثبت شد' })).toBeVisible();
    const firstKey = fetchMock.mock.calls[0][1].headers['Idempotency-Key'];
    const retryKey = fetchMock.mock.calls[1][1].headers['Idempotency-Key'];
    expect(retryKey).toBe(firstKey);
  });

  it('offers a fresh search when inventory changed before submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'AVAILABILITY_CHANGED' }, { status: 409 })),
    );
    renderBookingFlow();
    fillGuestDetails();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست اقامت' }));

    const recoveryLink = await screen.findByRole('link', { name: 'جستجوی دوباره' });
    expect(recoveryLink).toHaveAttribute('href', '/#stay-search');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'این اتاق دیگر برای تمام شب‌های انتخاب‌شده در دسترس نیست.',
    );
    expect(screen.queryByRole('button', { name: 'ثبت درخواست اقامت' })).not.toBeInTheDocument();
  });
});
