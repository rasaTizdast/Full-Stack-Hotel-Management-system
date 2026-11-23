import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHotelTodayIso } from '@/lib/jalali-date';
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
  getStaffFolio: vi.fn(),
  getStaffServiceItems: vi.fn(),
  postStaffServiceCharge: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-folios-api', () => api);

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
          serviceDate: getHotelTodayIso(),
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
    expect(api.getStaffServiceItems).toHaveBeenCalledOnce();
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
});
