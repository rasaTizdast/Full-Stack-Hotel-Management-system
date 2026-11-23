import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffFolioPrintPage } from './staff-folio-print-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'cashier-test',
      email: 'cashier@example.test',
      role: 'CASHIER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-print',
  },
}));

const api = vi.hoisted(() => ({ getStaffFolioPrint: vi.fn() }));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-folios-api', () => api);

const printStatement = {
  label: 'Final folio' as const,
  printedAt: '2026-11-24T08:30:00.000Z',
  hotelTimezone: 'Asia/Tehran',
  folio: {
    id: 'folio-print-1',
    booking: {
      id: 'booking-print-1',
      reference: 'BKGPRINT001',
      guestName: 'مهمان آزمایشی بلند نام',
      status: 'CHECKED_OUT',
      checkIn: '2026-11-23',
      checkOut: '2026-11-24',
      actualDepartureDate: '2026-11-24',
      assignments: [
        {
          id: 'assignment-print-1',
          roomNumber: '101',
          startDate: '2026-11-23',
          endDate: '2026-11-24',
        },
      ],
    },
    status: 'CLOSED' as const,
    balanceToman: '0',
    entries: [
      {
        id: 'entry-print-1',
        direction: 'DEBIT' as const,
        kind: 'ACCOMMODATION' as const,
        amountToman: '1500000',
        serviceDate: '2026-11-23',
        description: 'هزینه اقامت - اتاق 101',
        roomNumber: '101',
        quantity: 1,
        unitAmountToman: '1500000',
        correctsEntryId: null,
        correctionReason: null,
        paymentMethod: null,
        paymentReference: null,
        actorUsername: 'cashier-test',
        balanceAfterToman: '1500000',
        createdAt: '2026-11-24T08:00:00.000Z',
      },
    ],
  },
};

describe('StaffFolioPrintPage', () => {
  beforeEach(() => {
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'CASHIER' },
    };
    api.getStaffFolioPrint.mockReset().mockResolvedValue(printStatement);
  });

  it('renders a final operational folio with room, totals, local timestamp and print action', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<StaffFolioPrintPage bookingId="booking-print-1" />);

    expect(await screen.findByText('صورتحساب نهایی')).toBeVisible();
    expect(screen.getByText('مهمان آزمایشی بلند نام')).toBeVisible();
    expect(screen.getAllByText('اتاق 101').length).toBeGreaterThan(0);
    expect(screen.getByText('صورتحساب عملیاتی؛ فاکتور مالیاتی نیست.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'چاپ' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('does not render private folio data for a signed-out or unauthorized role', async () => {
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'HOUSEKEEPER' },
    };
    render(<StaffFolioPrintPage bookingId="booking-print-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'نمایش صورتحساب برای نقش شما فعال نیست.',
    );
    expect(api.getStaffFolioPrint).not.toHaveBeenCalled();
  });
});
