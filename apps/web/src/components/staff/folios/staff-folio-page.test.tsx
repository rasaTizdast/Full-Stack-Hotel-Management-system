import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { StaffFolioPage } from './staff-folio-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'shift-lead',
      email: 'shift-lead@example.test',
      role: 'MANAGER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-folio',
  },
}));

const api = vi.hoisted(() => ({
  adjustStaffFolio: vi.fn(),
  checkoutStaffFolio: vi.fn(),
  extendStaffStay: vi.fn(),
  getStaffFolio: vi.fn(),
  getStaffServiceItems: vi.fn(),
  postStaffServiceCharge: vi.fn(),
  recordStaffFolioPayment: vi.fn(),
  refundStaffFolioPayment: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-folios-api', () => api);
vi.mock('@/lib/staff-front-desk-api', () => ({ extendStaffStay: api.extendStaffStay }));

const service = {
  id: 'service-1',
  name: 'صبحانه ایرانی',
  category: 'پذیرایی',
  currentPriceToman: '125000',
  isActive: true,
  createdAt: '2026-11-20T09:00:00.000Z',
  updatedAt: '2026-11-20T09:00:00.000Z',
};
const entry = {
  id: 'entry-1',
  direction: 'DEBIT' as const,
  kind: 'SERVICE' as const,
  amountToman: '250000',
  serviceDate: '2026-11-23',
  description: 'صبحانه ایرانی',
  roomNumber: null,
  quantity: 2,
  unitAmountToman: '125000',
  correctsEntryId: null,
  correctionReason: null,
  paymentMethod: null,
  paymentReference: null,
  actorUsername: 'shift-lead',
  balanceAfterToman: '250000',
  createdAt: '2026-11-23T08:00:00.000Z',
};
const folio = {
  id: 'folio-1',
  booking: {
    id: 'booking-1',
    reference: 'BKGHTL8Q27KS',
    guestName: 'مهمان آزمایشی',
    status: 'CHECKED_IN',
    checkIn: '2026-11-23',
    checkOut: '2026-11-25',
    actualDepartureDate: null,
    assignments: [
      { id: 'assignment-1', roomNumber: null, startDate: '2026-11-23', endDate: '2026-11-25' },
    ],
  },
  status: 'OPEN' as const,
  balanceToman: '250000',
  entries: [entry],
};

function setRole(role: typeof session.current.staff.role) {
  session.current = {
    ...session.current,
    staff: { ...session.current.staff, role },
  };
}

describe('StaffFolioPage', () => {
  beforeEach(() => {
    setRole('MANAGER');
    api.getStaffFolio.mockReset().mockResolvedValue(folio);
    api.getStaffServiceItems.mockReset().mockResolvedValue({ items: [service] });
    api.postStaffServiceCharge.mockReset().mockResolvedValue(folio);
    api.adjustStaffFolio.mockReset().mockResolvedValue(folio);
    api.recordStaffFolioPayment.mockReset().mockResolvedValue(folio);
    api.refundStaffFolioPayment.mockReset().mockResolvedValue(folio);
    api.checkoutStaffFolio.mockReset().mockResolvedValue(folio);
    api.extendStaffStay.mockReset().mockResolvedValue({
      reference: folio.booking.reference,
      status: 'CHECKED_IN',
      checkOut: '2026-11-26',
    });
  });

  it('shows a dated running ledger and lets a manager post a room-attributed service', async () => {
    render(<StaffFolioPage bookingId="booking-1" />);

    expect(await screen.findByRole('heading', { name: 'صورتحساب اقامت' })).toBeVisible();
    expect(screen.getByText('صورتحساب عملیاتی · موقت')).toBeVisible();
    expect(screen.getByText('مهمان آزمایشی')).toBeVisible();
    expect(
      screen.getByRole('table', { name: 'ردیف‌های صورتحساب با مانده پس از هر ثبت' }),
    ).toBeVisible();
    expect(screen.getByLabelText('خلاصه اقامت و مانده صورتحساب')).toHaveTextContent(
      '250,000 تومان',
    );

    fireEvent.change(screen.getByLabelText('تعداد'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('تاریخ خدمت · شمسی'), {
      target: { value: formatGregorianAsJalali('2026-11-24') ?? '' },
    });
    fireEvent.change(screen.getByLabelText('اتاق مرتبط · اختیاری'), {
      target: { value: 'assignment-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت در صورتحساب' }));

    await waitFor(() =>
      expect(api.postStaffServiceCharge).toHaveBeenCalledWith(
        'booking-1',
        expect.objectContaining({
          serviceItemId: service.id,
          quantity: 3,
          serviceDate: '2026-11-24',
          roomAssignmentId: 'assignment-1',
        }),
        expect.stringMatching(/^service-/),
        'csrf-folio',
      ),
    );
  });

  it('lets managers append a reasoned compensating correction', async () => {
    render(<StaffFolioPage bookingId="booking-1" />);
    const ledger = await screen.findByRole('table', {
      name: 'ردیف‌های صورتحساب با مانده پس از هر ثبت',
    });
    const row = within(ledger).getByRole('row', { name: /صبحانه ایرانی/ });
    fireEvent.click(within(row).getByRole('button', { name: 'اصلاح' }));
    fireEvent.change(screen.getByLabelText('دلیل اصلاح'), {
      target: { value: 'تعداد اشتباه ثبت شد' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت اصلاح' }));

    await waitFor(() =>
      expect(api.adjustStaffFolio).toHaveBeenCalledWith(
        'booking-1',
        {
          correctsEntryId: entry.id,
          amountToman: entry.amountToman,
          reason: 'تعداد اشتباه ثبت شد',
        },
        expect.stringMatching(/^adjust-/),
        'csrf-folio',
      ),
    );
  });

  it('lets cashier post a service but does not expose manager-only adjustments', async () => {
    setRole('CASHIER');
    render(<StaffFolioPage bookingId="booking-1" />);
    await screen.findByRole('heading', { name: 'صورتحساب اقامت' });
    expect(screen.getByRole('button', { name: 'ثبت در صورتحساب' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'اصلاح' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ثبت تمدید اقامت' })).not.toBeInTheDocument();
    expect(api.getStaffServiceItems).toHaveBeenCalledOnce();
  });

  it('lets managers extend an in-house stay with a reason and refreshes the folio', async () => {
    const extendedFolio = {
      ...folio,
      booking: { ...folio.booking, checkOut: '2026-11-26' },
    };
    api.getStaffFolio.mockReset().mockResolvedValueOnce(folio).mockResolvedValueOnce(extendedFolio);
    render(<StaffFolioPage bookingId="booking-1" />);
    await screen.findByRole('heading', { name: 'تمدید اقامت جاری' });

    fireEvent.change(screen.getByLabelText('تاریخ خروج جدید · شمسی'), {
      target: { value: formatGregorianAsJalali('2026-11-26') },
    });
    fireEvent.change(screen.getByLabelText('دلیل تمدید'), {
      target: { value: 'درخواست مهمان آزمایشی' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تمدید اقامت' }));

    await waitFor(() =>
      expect(api.extendStaffStay).toHaveBeenCalledWith(folio.booking.reference, 'csrf-folio', {
        checkOut: '2026-11-26',
        reason: 'درخواست مهمان آزمایشی',
      }),
    );
    await waitFor(() => expect(api.getStaffFolio).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('تمدید اقامت و شب‌های افزوده‌شده ثبت شد.')).toBeVisible();
  });

  it('lets reception view the folio without service posting controls', async () => {
    setRole('RECEPTIONIST');
    render(<StaffFolioPage bookingId="booking-1" />);
    await screen.findByRole('heading', { name: 'صورتحساب اقامت' });
    expect(
      screen.getByRole('table', { name: 'ردیف‌های صورتحساب با مانده پس از هر ثبت' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'ثبت در صورتحساب' })).not.toBeInTheDocument();
    expect(api.getStaffServiceItems).not.toHaveBeenCalled();
  });

  it('records an offline payment, supports manager on-account checkout, and links the private print view', async () => {
    render(<StaffFolioPage bookingId="booking-1" />);
    await screen.findByRole('heading', { name: 'صورتحساب اقامت' });

    fireEvent.change(screen.getByLabelText('مبلغ پرداخت · تومان'), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByLabelText('روش پرداخت'), {
      target: { value: 'BANK_TRANSFER' },
    });
    fireEvent.change(screen.getByLabelText('شماره رسید بانکی · اختیاری'), {
      target: { value: 'TRANSFER-TEST-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت پرداخت' }));

    await waitFor(() =>
      expect(api.recordStaffFolioPayment).toHaveBeenCalledWith(
        'booking-1',
        { amountToman: '50000', method: 'BANK_TRANSFER', reference: 'TRANSFER-TEST-01' },
        expect.stringMatching(/^payment-/),
        'csrf-folio',
      ),
    );

    fireEvent.change(screen.getByLabelText('دلیل تسویه با مانده'), {
      target: { value: 'توافق مهمان آزمایشی' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت خروج' }));
    await waitFor(() =>
      expect(api.checkoutStaffFolio).toHaveBeenCalledWith(
        'booking-1',
        { onAccountReason: 'توافق مهمان آزمایشی' },
        expect.stringMatching(/^checkout-/),
        'csrf-folio',
      ),
    );
    expect(screen.getByRole('link', { name: 'چاپ صورتحساب' })).toHaveAttribute(
      'href',
      '/staff/folios/booking-1/print',
    );
  });

  it('allows only managers to issue a reasoned partial refund against a payment entry', async () => {
    const paymentEntry = {
      ...entry,
      id: 'payment-entry-1',
      direction: 'CREDIT' as const,
      kind: 'PAYMENT' as const,
      amountToman: '50000',
      description: 'دریافت نقدی',
      quantity: null,
      unitAmountToman: null,
      paymentMethod: 'CASH',
      paymentReference: 'RCPT-TEST-01',
      balanceAfterToman: '200000',
    };
    api.getStaffFolio.mockResolvedValue({ ...folio, entries: [entry, paymentEntry] });
    render(<StaffFolioPage bookingId="booking-1" />);
    const ledger = await screen.findByRole('table', {
      name: 'ردیف‌های صورتحساب با مانده پس از هر ثبت',
    });
    const row = within(ledger).getByRole('row', { name: /دریافت نقدی/ });
    fireEvent.click(within(row).getByRole('button', { name: 'ثبت استرداد' }));
    fireEvent.change(screen.getByLabelText('مبلغ استرداد · تومان'), {
      target: { value: '10000' },
    });
    fireEvent.change(screen.getByLabelText('دلیل استرداد'), {
      target: { value: 'استرداد آزمایشی' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تأیید استرداد' }));

    await waitFor(() =>
      expect(api.refundStaffFolioPayment).toHaveBeenCalledWith(
        'booking-1',
        { paymentEntryId: paymentEntry.id, amountToman: '10000', reason: 'استرداد آزمایشی' },
        expect.stringMatching(/^refund-/),
        'csrf-folio',
      ),
    );
  });
});
