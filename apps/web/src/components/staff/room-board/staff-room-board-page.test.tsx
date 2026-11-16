import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffApiError, type StaffRoomBoardResponse } from '@/lib/staff-api';
import { StaffRoomBoardPage } from './staff-room-board-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'reception',
      email: 'reception@example.test',
      role: 'RECEPTIONIST' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'CASHIER',
    },
    csrfToken: 'csrf-reception',
  },
}));

const boardApi = vi.hoisted(() => ({
  getStaffRoomBoard: vi.fn(),
  replaceStaffBookingRoomAssignments: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, ...boardApi };
});

const roomType = {
  id: 'dcb44b37-514f-4f96-b55f-d9d9a76f3f44',
  name: 'اتاق دوتخته باغ',
  slug: 'garden-double',
};

const boardFixture: StaffRoomBoardResponse = {
  date: '2026-11-18',
  businessDate: '2026-11-18',
  updatedAt: '2026-11-18T08:30:00.000Z',
  items: [
    {
      id: 'room-101',
      roomNumber: '۱۰۱',
      floor: '۲',
      features: [],
      housekeepingStatus: 'INSPECTED',
      isActive: true,
      isGenerated: false,
      roomType,
      occupancy: 'UNKNOWN',
      reservationContexts: [
        {
          assignmentId: 'assignment-101',
          reference: 'ABC123456789',
          guestName: 'مریم رضایی',
          startDate: '2026-11-17',
          endDate: '2026-11-20',
          stayContext: 'RESERVED',
        },
      ],
      blocks: [],
    },
    {
      id: 'room-102',
      roomNumber: '۱۰۲',
      floor: '۳',
      features: [],
      housekeepingStatus: 'DIRTY',
      isActive: true,
      isGenerated: false,
      roomType,
      occupancy: 'VACANT',
      reservationContexts: [],
      blocks: [],
    },
    {
      id: 'room-103',
      roomNumber: '۱۰۳',
      floor: '۲',
      features: [],
      housekeepingStatus: 'INSPECTED',
      isActive: true,
      isGenerated: false,
      roomType,
      occupancy: 'VACANT',
      reservationContexts: [],
      blocks: [],
    },
  ],
  assignableBookings: [
    {
      reference: 'ABC123456789',
      guestName: 'مریم رضایی',
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      checkIn: '2026-11-17',
      checkOut: '2026-11-20',
      roomQuantity: 3,
      revision: 'a'.repeat(64),
      unassignedRoomQuantity: 2,
      assignments: [
        {
          id: 'assignment-101',
          roomId: 'room-101',
          roomNumber: '۱۰۱',
          startDate: '2026-11-17',
          endDate: '2026-11-20',
        },
        {
          id: 'assignment-102',
          roomId: 'room-102',
          roomNumber: '۱۰۲',
          startDate: '2026-11-19',
          endDate: '2026-11-20',
        },
      ],
    },
  ],
};

function copyBoard(board: StaffRoomBoardResponse = boardFixture): StaffRoomBoardResponse {
  return structuredClone(board);
}

describe('StaffRoomBoardPage', () => {
  beforeEach(() => {
    session.current = {
      status: 'authenticated',
      staff: {
        username: 'reception',
        email: 'reception@example.test',
        role: 'RECEPTIONIST',
      },
      csrfToken: 'csrf-reception',
    };
    boardApi.getStaffRoomBoard.mockReset().mockResolvedValue(copyBoard());
    boardApi.replaceStaffBookingRoomAssignments.mockReset().mockResolvedValue({
      revision: 'b'.repeat(64),
      assignments: [],
    });
  });

  it('loads the business-date board and separates reservation context from physical occupancy', async () => {
    render(<StaffRoomBoardPage />);

    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت وضعیت اتاق‌ها');
    expect(await screen.findByRole('heading', { name: 'وضعیت اتاق‌ها' })).toBeVisible();
    expect(
      await screen.findByRole('region', { name: 'خلاصهٔ وضعیت اتاق‌های نمایش‌داده‌شده' }),
    ).toBeVisible();
    expect(boardApi.getStaffRoomBoard).toHaveBeenCalledWith({});

    const reservedRoom = screen.getByRole('article', { name: /اتاق ۱۰۱/ });
    expect(within(reservedRoom).getByText('رزرو در جریان')).toBeVisible();
    expect(within(reservedRoom).queryByText('اشغال')).not.toBeInTheDocument();
    expect(within(reservedRoom).getByText('بازرسی‌شده')).toBeVisible();
    expect(screen.getAllByText('مریم رضایی')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'اتاق‌های ۱۴۰۵/۰۸/۲۷' })).toBeVisible();
  });

  it('filters visible rooms locally while retaining complete out-of-date booking intervals for editing', async () => {
    render(<StaffRoomBoardPage />);
    await screen.findByRole('article', { name: /اتاق ۱۰۱/ });

    fireEvent.change(screen.getByLabelText('طبقه'), { target: { value: '۲' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));
    expect(screen.queryByRole('article', { name: /اتاق ۱۰۲/ })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /اتاق ۱۰۱/ })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'ویرایش تخصیص اتاق ABC123456789' }));
    expect(screen.getByRole('group', { name: /تخصیص اتاق ۱۰۲/ })).toBeVisible();
    expect(screen.getByText(/این بازه شامل تاریخ تابلو نیست/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'افزودن اتاق به تخصیص' }));
    fireEvent.change(screen.getByLabelText('دلیل تغییر تخصیص'), {
      target: { value: 'تخصیص پیش از ورود' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تخصیص‌ها' }));

    await waitFor(() => expect(boardApi.replaceStaffBookingRoomAssignments).toHaveBeenCalledOnce());
    expect(boardApi.replaceStaffBookingRoomAssignments).toHaveBeenCalledWith(
      'ABC123456789',
      {
        assignments: [
          { roomId: 'room-101', startDate: '2026-11-17', endDate: '2026-11-20' },
          { roomId: 'room-102', startDate: '2026-11-19', endDate: '2026-11-20' },
          { roomId: 'room-103', startDate: '2026-11-18', endDate: '2026-11-20' },
        ],
        expectedRevision: 'a'.repeat(64),
        reason: 'تخصیص پیش از ورود',
      },
      'csrf-reception',
    );
  });

  it('keeps a draft separate on a stale assignment and requires an explicit latest-revision choice', async () => {
    const latest = copyBoard();
    latest.assignableBookings[0] = {
      ...latest.assignableBookings[0],
      revision: 'b'.repeat(64),
      assignments: [
        ...latest.assignableBookings[0].assignments,
        {
          id: 'assignment-103',
          roomId: 'room-103',
          roomNumber: '۱۰۳',
          startDate: '2026-11-19',
          endDate: '2026-11-20',
        },
      ],
    };
    boardApi.getStaffRoomBoard
      .mockResolvedValueOnce(copyBoard())
      .mockResolvedValueOnce(latest)
      .mockResolvedValue(copyBoard(latest));
    boardApi.replaceStaffBookingRoomAssignments
      .mockRejectedValueOnce(
        new StaffApiError('Assignments changed elsewhere.', 409, 'ROOM_ASSIGNMENT_STALE'),
      )
      .mockResolvedValue({ revision: 'c'.repeat(64), assignments: [] });
    render(<StaffRoomBoardPage />);
    await screen.findByRole('article', { name: /اتاق ۱۰۱/ });
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش تخصیص اتاق ABC123456789' }));
    fireEvent.click(screen.getByRole('button', { name: 'حذف اتاق ۱۰۲ از تخصیص' }));
    fireEvent.change(screen.getByLabelText('دلیل تغییر تخصیص'), {
      target: { value: 'تغییر برنامه اقامت' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تخصیص‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تخصیص اتاق هم‌زمان تغییر کرده است');
    expect(screen.queryByRole('group', { name: /تخصیص اتاق ۱۰۲/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'آخرین تخصیص‌های ثبت‌شده' })).toHaveTextContent('۱۰۳');
    expect(screen.getByRole('button', { name: 'اعمال پیش‌نویس من با نسخهٔ جدید' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'اعمال پیش‌نویس من با نسخهٔ جدید' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تخصیص‌ها' }));

    await waitFor(() => expect(boardApi.replaceStaffBookingRoomAssignments).toHaveBeenCalledTimes(2));
    expect(boardApi.replaceStaffBookingRoomAssignments).toHaveBeenLastCalledWith(
      'ABC123456789',
      {
        assignments: [{ roomId: 'room-101', startDate: '2026-11-17', endDate: '2026-11-20' }],
        expectedRevision: 'b'.repeat(64),
        reason: 'تغییر برنامه اقامت',
      },
      'csrf-reception',
    );
  });

  it('retains the last successful board and marks it stale when a refresh fails', async () => {
    boardApi.getStaffRoomBoard
      .mockResolvedValueOnce(copyBoard())
      .mockRejectedValueOnce(new Error('اتصال قطع شد.'));
    render(<StaffRoomBoardPage />);
    await screen.findByRole('article', { name: /اتاق ۱۰۱/ });

    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی وضعیت اتاق‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('اتصال قطع شد.');
    expect(screen.getByRole('article', { name: /اتاق ۱۰۱/ })).toBeVisible();
    expect(screen.getByText('نمایش داده‌ها ممکن است قدیمی باشد.')).toBeVisible();
  });

  it('does not request the board for a role without room-board access', () => {
    session.current.staff.role = 'CASHIER';
    render(<StaffRoomBoardPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('این بخش برای پذیرش و مدیران در دسترس است.');
    expect(boardApi.getStaffRoomBoard).not.toHaveBeenCalled();
  });
});
