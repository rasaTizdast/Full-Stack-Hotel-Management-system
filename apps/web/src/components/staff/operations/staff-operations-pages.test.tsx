import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffNightClosePage, StaffOperationsReportPage } from './staff-operations-pages';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'shift-lead',
      email: 'shift-lead@example.test',
      role: 'MANAGER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-operations',
  },
}));

const api = vi.hoisted(() => ({
  getStaffNightClosePreview: vi.fn(),
  getStaffOperationsReport: vi.fn(),
  runStaffNightClose: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-operations-api', () => api);

const preview = {
  hotelName: 'خانه‌باغ نارنج',
  timezone: 'Asia/Tehran',
  businessDate: '2026-11-23',
  nextBusinessDate: '2026-11-24',
  blockers: [],
  warnings: [{ code: 'DIRTY_ROOM', count: 1, references: ['101'] }],
  warningCount: 1,
  accommodation: { roomNightCount: 2, amountToman: '1500000' },
  canClose: true,
};

const report = {
  date: '2026-11-23',
  businessDate: '2026-11-23',
  arrivals: [{
    reference: 'HBE-TEST-001', guestName: 'مهمان آزمایشی', checkIn: '2026-11-23',
    checkOut: '2026-11-25', roomTypeName: 'اتاق باغ', roomQuantity: 1, rooms: ['101'],
  }],
  departures: [],
  inHouse: [],
  rooms: {
    total: 4, occupied: 1, available: 3, occupancyPercent: 25,
    readiness: { inspected: 1, clean: 2, dirty: 1 },
  },
  blocks: { outOfOrder: 1, capacityClosed: 0, total: 1 },
  pendingRequests: { reservations: 2, maintenance: 1 },
  openBalances: {
    count: 1, balanceToman: '250000',
    items: [{ reference: 'HBE-TEST-002', guestName: 'مهمان دوم', balanceToman: '250000' }],
  },
  dailyTotals: { debitsToman: '1500000', creditsToman: '500000' },
};

function setRole(role: typeof session.current.staff.role) {
  session.current = { ...session.current, staff: { ...session.current.staff, role } };
}

describe('staff operations pages', () => {
  beforeEach(() => {
    setRole('MANAGER');
    api.getStaffNightClosePreview.mockReset().mockResolvedValue(preview);
    api.getStaffOperationsReport.mockReset().mockResolvedValue(report);
    api.runStaffNightClose.mockReset().mockResolvedValue({
      businessDate: preview.businessDate,
      nextBusinessDate: preview.nextBusinessDate,
      status: 'COMPLETED',
      roomNightCount: 2,
      accommodationAmountToman: '1500000',
      warningCount: 1,
      completedAt: '2026-11-23T18:00:00.000Z',
      replayed: false,
    });
  });

  it('shows blockers and requires a named confirmation before running night close', async () => {
    api.getStaffNightClosePreview.mockResolvedValueOnce({
      ...preview,
      canClose: false,
      blockers: [{ code: 'UNHANDLED_DUE_OUT', count: 1, references: ['HBE-TEST-003'] }],
    });
    render(<StaffNightClosePage />);
    expect(await screen.findByText('خروج امروز هنوز ثبت نشده است')).toBeVisible();
    expect(screen.getByRole('button', { name: 'تأیید و بستن روز' })).toBeDisabled();
    expect(api.runStaffNightClose).not.toHaveBeenCalled();
  });

  it('names charges, date advance and warnings, then displays the completed result', async () => {
    render(<StaffNightClosePage />);
    await screen.findByRole('heading', { name: 'بستن روز کاری' });
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و بستن روز' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('۱٬۵۰۰٬۰۰۰ تومان');
    expect(dialog).toHaveTextContent('۱ هشدار باقی می‌ماند');
    fireEvent.click(screen.getByRole('button', { name: 'تأیید بستن روز' }));

    await waitFor(() => expect(api.runStaffNightClose).toHaveBeenCalledWith(preview, 'csrf-operations'));
    expect(await screen.findByText('روز کاری با موفقیت بسته شد.')).toBeVisible();
    expect(screen.getByText(/به ۱۴۰۵\/۰۹\/۰۳ منتقل شد/)).toBeVisible();
    expect(api.getStaffNightClosePreview).toHaveBeenCalledTimes(2);
  });

  it('filters the report by selected business date and presents operational totals', async () => {
    render(<StaffOperationsReportPage />);
    expect(await screen.findByText('مهمان آزمایشی')).toBeVisible();
    expect(screen.getByText('۲۵٪')).toBeVisible();
    expect(screen.getByText(/موجودی فعال اتاق‌ها/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('تاریخ کاری'), { target: { value: '۱۴۰۵/۰۹/۰۱' } });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش گزارش' }));
    await waitFor(() => expect(api.getStaffOperationsReport).toHaveBeenLastCalledWith('2026-11-22'));

    fireEvent.change(screen.getByLabelText('تاریخ کاری'), { target: { value: '۱۴۰۵/۱۳/۰۱' } });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش گزارش' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تاریخ کاری را به شکل شمسی معتبر وارد کنید.');
    expect(api.getStaffOperationsReport).toHaveBeenCalledTimes(2);
  });

  it('does not show close or report data for a receptionist', () => {
    setRole('RECEPTIONIST');
    const { rerender } = render(<StaffNightClosePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مدیر اقامتگاه و مدیر شیفت');
    expect(api.getStaffNightClosePreview).not.toHaveBeenCalled();

    rerender(<StaffOperationsReportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مدیر اقامتگاه و مدیر شیفت');
    expect(api.getStaffOperationsReport).not.toHaveBeenCalled();
  });
});
