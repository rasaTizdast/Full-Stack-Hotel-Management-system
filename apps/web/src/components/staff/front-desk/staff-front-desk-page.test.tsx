import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffApiError } from '@/lib/staff-api';
import type { StaffStayWorklist } from '@/lib/staff-front-desk-api';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { StaffFrontDeskPage } from './staff-front-desk-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'reception',
      email: 'reception@example.test',
      role: 'RECEPTIONIST' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER',
    },
    csrfToken: 'csrf-reception',
  },
}));

const frontDeskApi = vi.hoisted(() => ({
  getStaffStayWorklist: vi.fn(),
  createStaffWalkIn: vi.fn(),
  checkInStaffStay: vi.fn(),
  markStaffStayNoShow: vi.fn(),
  amendStaffStay: vi.fn(),
  moveStaffStayRoom: vi.fn(),
}));

const bookingApi = vi.hoisted(() => ({ getStaffBooking: vi.fn() }));
const roomApi = vi.hoisted(() => ({ getStaffRoomBoard: vi.fn() }));
const publicApi = vi.hoisted(() => ({ getPublicRoomTypes: vi.fn() }));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-front-desk-api', () => frontDeskApi);
vi.mock('@/lib/staff-bookings-api', () => bookingApi);
vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, ...roomApi };
});
vi.mock('@/lib/public-api', () => publicApi);
vi.mock('@/lib/jalali-date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jalali-date')>();
  return { ...actual, getHotelTodayIso: () => '2026-11-18' };
});

const todayStay: StaffStayWorklist['items'][number] = {
  reference: 'ABC123456789',
  status: 'CONFIRMED',
  guestName: 'مریم رضایی',
  checkIn: '2026-11-18',
  checkOut: '2026-11-20',
  roomQuantity: 2,
  roomType: { id: 'type-double', name: 'اتاق دوتخته' },
  confirmedAt: '2026-11-16T10:30:00.000Z',
  checkedInAt: null,
  assignedRooms: [
    { assignmentId: 'assign-1', roomNumber: '۱۰۱', housekeepingStatus: 'INSPECTED', startDate: '2026-11-18', endDate: '2026-11-20' },
  ],
};

const roomTypeOptions = [
  { slug: 'garden-double', name: 'اتاق دوتخته', description: '', maxGuestsPerRoom: 2, amenities: [] },
];

function renderPage(queue: 'arrivals' | 'in-house' | 'departures') {
  return render(<StaffFrontDeskPage queue={queue} roomTypes={roomTypeOptions} />);
}

function worklist(items: StaffStayWorklist['items']): StaffStayWorklist {
  return {
    date: '2026-11-18',
    businessDate: '2026-11-18',
    items,
    pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
  };
}

function copyStay(stay: StaffStayWorklist['items'][number] = todayStay) {
  return structuredClone(stay);
}

describe('StaffFrontDeskPage', () => {
  beforeEach(() => {
    session.current = {
      status: 'authenticated',
      staff: { username: 'reception', email: 'reception@example.test', role: 'RECEPTIONIST' },
      csrfToken: 'csrf-reception',
    };
    frontDeskApi.getStaffStayWorklist.mockReset().mockResolvedValue(worklist([copyStay()]));
    frontDeskApi.createStaffWalkIn.mockReset().mockResolvedValue({ reference: 'WALKIN123456', status: 'CONFIRMED' });
    frontDeskApi.checkInStaffStay.mockReset().mockResolvedValue({ reference: todayStay.reference, status: 'CHECKED_IN' });
    frontDeskApi.markStaffStayNoShow.mockReset().mockResolvedValue({ reference: todayStay.reference, status: 'NO_SHOW' });
    frontDeskApi.amendStaffStay.mockReset().mockResolvedValue({ reference: todayStay.reference, status: 'CONFIRMED' });
    frontDeskApi.moveStaffStayRoom.mockReset().mockResolvedValue({ reference: todayStay.reference, status: 'CHECKED_IN' });
    bookingApi.getStaffBooking.mockReset().mockResolvedValue({
      ...todayStay,
      guestPhone: '09120000000',
      guestEmail: null,
      guestCount: 2,
      totalPriceToman: '2500000',
      statusTimestamps: { confirmedAt: todayStay.confirmedAt, checkedInAt: null, noShowAt: null },
    });
    roomApi.getStaffRoomBoard.mockReset().mockResolvedValue({
      date: '2026-11-18', businessDate: '2026-11-18', updatedAt: '2026-11-18T08:00:00Z',
      items: [{ id: 'target-room', roomNumber: '۱۰۲', floor: null, features: [], housekeepingStatus: 'INSPECTED', isActive: true, isGenerated: false, roomType: { id: 'type-double', name: 'اتاق دوتخته', slug: 'garden-double' }, occupancy: 'VACANT', reservationContexts: [], blocks: [] }],
      assignableBookings: [],
    });
    publicApi.getPublicRoomTypes.mockReset().mockResolvedValue([
      { slug: 'garden-double', name: 'اتاق دوتخته', description: '', maxGuestsPerRoom: 2, amenities: [] },
    ]);
  });

  it('denies housekeeping without requesting a private worklist', () => {
    session.current.staff.role = 'HOUSEKEEPER';

    renderPage('arrivals');

    expect(screen.getByRole('heading', { name: 'دسترسی به میز پذیرش ندارید' })).toBeVisible();
    expect(frontDeskApi.getStaffStayWorklist).not.toHaveBeenCalled();
  });

  it('separates due-today and overdue arrivals and links incomplete assignments to rooms', async () => {
    const overdue = copyStay();
    overdue.reference = 'OLD123456789';
    overdue.guestName = 'علی مرادی';
    overdue.checkIn = '2026-11-17';
    const incomplete = copyStay();
    incomplete.roomQuantity = 2;
    incomplete.reference = 'MISSING123456';
    incomplete.guestName = 'نازنین محمدی';

    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([copyStay(), overdue, incomplete]));
    renderPage('arrivals');

    expect(await screen.findByRole('heading', { name: 'ورودهای امروز' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'ورودهای معوق' })).toBeVisible();
    expect(screen.getAllByText('مریم رضایی')).toHaveLength(1);
    expect(screen.getByText('علی مرادی')).toBeVisible();
    expect(screen.getAllByText('۱ از ۲ اتاق تخصیص یافته')).toHaveLength(3);
    const incompleteCard = screen.getByRole('article', { name: /MISSING123456/ });
    expect(within(incompleteCard).getByRole('link', { name: /^تکمیل تخصیص اتاق‌ها/ })).toHaveAttribute('href', '/staff/rooms');
    expect(screen.queryByText('09120000000')).not.toBeInTheDocument();
    expect(screen.queryByText(/تومان/)).not.toBeInTheDocument();
  });

  it('counts only assignments active on the hotel business date', async () => {
    const futureAssignment = copyStay();
    futureAssignment.roomQuantity = 2;
    futureAssignment.assignedRooms = [
      { assignmentId: 'assign-tomorrow', roomNumber: '۱۰۱', housekeepingStatus: 'INSPECTED', startDate: '2026-11-19', endDate: '2026-11-20' },
    ];
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([futureAssignment]));
    renderPage('arrivals');

    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    expect(within(card).getByText('۰ از ۲ اتاق تخصیص یافته')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'تکمیل تخصیص اتاق‌ها (۲ اتاق)' })).toHaveAttribute('href', '/staff/rooms');
    expect(within(card).getByText('اتاق ۱۰۱')).toBeVisible();
    expect(within(card).getByText(/آمادگی کل بازه و محدودیت‌ها را سامانه/)).toBeVisible();
  });

  it('keeps loading, retry, and empty results distinct', async () => {
    let resolveList!: (value: StaffStayWorklist) => void;
    frontDeskApi.getStaffStayWorklist.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const view = renderPage('arrivals');
    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت فهرست ورودها');
    resolveList(worklist([]));
    expect(await screen.findByText('برای این تاریخ ورودی ثبت نشده است.')).toBeVisible();

    frontDeskApi.getStaffStayWorklist.mockRejectedValueOnce(new StaffApiError('offline', 0));
    fireEvent.click(screen.getByRole('button', { name: 'دریافت دوباره' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ارتباط با سامانه برقرار نشد');
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([]));
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByText('برای این تاریخ ورودی ثبت نشده است.')).toBeVisible();
    view.unmount();
  });

  it('disables arrival actions and walk-ins when the selected date is not the business date', async () => {
    const futureArrival = copyStay();
    futureArrival.checkIn = '2026-11-20';
    futureArrival.checkOut = '2026-11-22';
    frontDeskApi.getStaffStayWorklist
      .mockResolvedValueOnce(worklist([copyStay()]))
      .mockResolvedValueOnce({ ...worklist([futureArrival]), date: '2026-11-20' });
    renderPage('arrivals');

    await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.change(screen.getByLabelText('تاریخ کاری'), {
      target: { value: formatGregorianAsJalali('2026-11-20') },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));
    const card = await screen.findByRole('article', { name: /ABC123456789/ });

    expect(screen.getByRole('heading', { name: 'ورودهای تاریخ انتخاب‌شده' })).toBeVisible();
    expect(within(card).getByText('ورود در تاریخ انتخاب‌شده')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'ثبت ورود' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'ثبت عدم مراجعه' })).toBeDisabled();
    expect(within(card).getByRole('status')).toHaveTextContent('خارج از بازه فعال تاریخ کاری جاری');
    expect(screen.getByRole('button', { name: 'ثبت ورود بدون رزرو قبلی' })).toBeDisabled();
    expect(screen.getByText('ثبت ورود حضوری فقط برای تاریخ کاری جاری در دسترس است.')).toBeVisible();
  });

  it('does not offer room moves for an in-house item outside the business-date stay window', async () => {
    const futureStay = copyStay();
    futureStay.status = 'CHECKED_IN';
    futureStay.checkIn = '2026-11-20';
    futureStay.checkOut = '2026-11-22';
    futureStay.checkedInAt = '2026-11-20T09:00:00.000Z';
    futureStay.assignedRooms = [
      { assignmentId: 'assign-future', roomNumber: '۱۰۱', housekeepingStatus: 'INSPECTED', startDate: '2026-11-20', endDate: '2026-11-22' },
    ];
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([futureStay]));
    renderPage('in-house');

    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    expect(within(card).getByRole('button', { name: 'انتقال اتاق' })).toBeDisabled();
    expect(within(card).getByRole('status')).toHaveTextContent('برای اقامت واردشده در بازه فعال تاریخ کاری جاری');
  });

  it('confirms a check-in, shows authoritative readiness errors, and refreshes the selected queue', async () => {
    frontDeskApi.checkInStaffStay.mockRejectedValueOnce(
      new StaffApiError('Room inspection is incomplete.', 409, 'ROOM_NOT_INSPECTED'),
    );
    render(<StaffFrontDeskPage queue="arrivals" />);

    const stayCard = await screen.findByRole('article', { name: /ABC123456789/ });
    const trigger = within(stayCard).getByRole('button', { name: 'ثبت ورود' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'تأیید ورود مهمان' })).toBeVisible();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'تأیید ورود مهمان' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت ورود' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('ورود ثبت نشد؛ وضعیت بازرسی اتاق‌ها باید از سوی سامانه تأیید شود.');
    expect(within(error).getByRole('link', { name: 'بررسی وضعیت اتاق‌ها' })).toHaveAttribute('href', '/staff/rooms');
    expect(frontDeskApi.getStaffStayWorklist).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('links a blocked-room check-in error to room recovery', async () => {
    frontDeskApi.checkInStaffStay.mockRejectedValueOnce(
      new StaffApiError('Room is blocked.', 409, 'ROOM_BLOCKED'),
    );
    renderPage('arrivals');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'ثبت ورود' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و ثبت ورود' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('یکی از اتاق‌ها با یک رزرو یا محدودیت هم‌پوشانی دارد');
    expect(within(error).getByRole('link', { name: 'بررسی وضعیت اتاق‌ها' })).toHaveAttribute('href', '/staff/rooms');
  });

  it('keeps non-blocker check-in errors without a room-recovery link', async () => {
    frontDeskApi.checkInStaffStay.mockRejectedValueOnce(
      new StaffApiError('The stay was already updated.', 409, 'INVALID_STAY_STATE'),
    );
    renderPage('arrivals');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'ثبت ورود' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و ثبت ورود' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('The stay was already updated.');
    expect(within(error).queryByRole('link', { name: 'بررسی وضعیت اتاق‌ها' })).not.toBeInTheDocument();
  });

  it('announces a successful check-in and preserves search while refreshing server data', async () => {
    renderPage('arrivals');
    const search = await screen.findByLabelText('جست‌وجو در نام، کد یا اتاق');
    fireEvent.change(search, { target: { value: 'ABC123456789' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));
    await waitFor(() => expect(frontDeskApi.getStaffStayWorklist).toHaveBeenLastCalledWith(
      'arrivals', expect.objectContaining({ search: 'ABC123456789' }),
    ));
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'ثبت ورود' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و ثبت ورود' }));
    expect(await screen.findByRole('status')).toHaveTextContent('ورود مهمان مریم رضایی ثبت شد.');
    await waitFor(() => expect(frontDeskApi.getStaffStayWorklist).toHaveBeenLastCalledWith(
      'arrivals', expect.objectContaining({ search: 'ABC123456789' }),
    ));
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('allows a manager-only early-check-in reason and blocks a receptionist from sending one', async () => {
    session.current.staff.role = 'MANAGER';
    const manager = renderPage('arrivals');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'ثبت ورود' }));
    expect(screen.getByLabelText('دلیل ورود زودهنگام')).toBeVisible();
    manager.unmount();

    session.current.staff.role = 'RECEPTIONIST';
    renderPage('arrivals');
    const receptionistCard = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(receptionistCard).getByRole('button', { name: 'ثبت ورود' }));
    expect(screen.queryByLabelText('دلیل ورود زودهنگام')).not.toBeInTheDocument();
  });

  it('requires a no-show reason before submitting the explicit confirmation', async () => {
    renderPage('arrivals');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'ثبت عدم مراجعه' }));
    const dialog = await screen.findByRole('dialog', { name: 'ثبت عدم مراجعه مهمان' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت عدم مراجعه' }));
    expect(within(dialog).getByText('ثبت دلیل برای عدم مراجعه الزامی است.')).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText('دلیل عدم مراجعه'), { target: { value: 'تماس بی‌پاسخ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت عدم مراجعه' }));
    await waitFor(() => expect(frontDeskApi.markStaffStayNoShow).toHaveBeenCalledWith(
      todayStay.reference,
      'csrf-reception',
      { reason: 'تماس بی‌پاسخ' },
    ));
  });

  it('shows walk-in success and reuses the same idempotency key for a retry', async () => {
    frontDeskApi.createStaffWalkIn
      .mockRejectedValueOnce(new StaffApiError('Temporary network failure.', 0))
      .mockRejectedValueOnce(new StaffApiError('Temporary network failure.', 0))
      .mockResolvedValueOnce({ reference: 'WALKIN123456', status: 'CONFIRMED' });
    renderPage('arrivals');
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت ورود بدون رزرو قبلی' }));
    const dialog = await screen.findByRole('dialog', { name: 'ثبت ورود بدون رزرو قبلی' });
    fireEvent.change(within(dialog).getByLabelText('نام مهمان'), { target: { value: 'مهمان حضوری' } });
    fireEvent.change(within(dialog).getByLabelText('شماره تماس'), { target: { value: '09120000000' } });
    fireEvent.change(within(dialog).getByLabelText('تعداد مهمانان'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('تعداد اتاق'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت ورود قطعی' }));
    expect(await within(dialog).findByText(/ارتباط با سامانه برقرار نشد/)).toBeVisible();
    expect(within(dialog).getByText(/ممکن است اقامت تکراری ثبت شود/)).toBeVisible();

    expect(within(dialog).getByLabelText('نام مهمان')).toBeDisabled();
    expect(within(dialog).getByLabelText('شماره تماس')).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'بازگشت' }));
    expect(screen.queryByRole('dialog', { name: 'ثبت ورود بدون رزرو قبلی' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت ورود بدون رزرو قبلی' }));
    const reopenedDialog = await screen.findByRole('dialog', { name: 'ثبت ورود بدون رزرو قبلی' });
    expect(within(reopenedDialog).getByLabelText('نام مهمان')).toBeDisabled();
    expect(within(reopenedDialog).getByRole('button', { name: 'تلاش دوباره با همان درخواست' })).toBeVisible();

    fireEvent.change(within(reopenedDialog).getByLabelText('نام مهمان'), { target: { value: 'مهمان متفاوت' } });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'تلاش دوباره با همان درخواست' }));
    await waitFor(() => expect(frontDeskApi.createStaffWalkIn).toHaveBeenCalledTimes(2));
    expect(frontDeskApi.createStaffWalkIn.mock.calls[1]).toEqual(frontDeskApi.createStaffWalkIn.mock.calls[0]);
    expect(await within(reopenedDialog).findByText(/ارتباط با سامانه برقرار نشد/)).toBeVisible();

    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'لغو تلاش و شروع درخواست جدید' }));
    expect(within(reopenedDialog).getByLabelText('نام مهمان')).toBeEnabled();
    fireEvent.change(within(reopenedDialog).getByLabelText('نام مهمان'), { target: { value: 'مهمان جدید' } });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'ثبت ورود قطعی' }));
    await waitFor(() => expect(frontDeskApi.createStaffWalkIn).toHaveBeenCalledTimes(3));
    expect(frontDeskApi.createStaffWalkIn.mock.calls[2][0].guestName).toBe('مهمان جدید');
    expect(frontDeskApi.createStaffWalkIn.mock.calls[2][2]).not.toBe(frontDeskApi.createStaffWalkIn.mock.calls[0][2]);
    expect(await screen.findByText(/WALKIN123456/)).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'ثبت ورود بدون رزرو قبلی' })).not.toBeInTheDocument();
  });

  it('shows in-house due-outs without offering a move on the exclusive checkout date', async () => {
    const checkedIn = copyStay();
    checkedIn.status = 'CHECKED_IN';
    checkedIn.checkOut = '2026-11-18';
    checkedIn.checkedInAt = '2026-11-18T09:00:00.000Z';
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([checkedIn]));
    renderPage('in-house');

    expect(await screen.findByText('موعد خروج امروز')).toBeVisible();
    const card = screen.getByRole('article', { name: /ABC123456789/ });
    expect(within(card).getByRole('button', { name: 'انتقال اتاق' })).toBeDisabled();
  });

  it('uses only the room assignment covering the hotel business date for a move', async () => {
    const checkedIn = copyStay();
    checkedIn.status = 'CHECKED_IN';
    checkedIn.checkOut = '2026-11-20';
    checkedIn.checkedInAt = '2026-11-18T09:00:00.000Z';
    checkedIn.assignedRooms = [
      { assignmentId: 'assign-ended-today', roomNumber: '۱۰۱', housekeepingStatus: 'INSPECTED', startDate: '2026-11-17', endDate: '2026-11-18' },
      { assignmentId: 'assign-current', roomNumber: '۱۰۳', housekeepingStatus: 'INSPECTED', startDate: '2026-11-18', endDate: '2026-11-20' },
    ];
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([checkedIn]));
    renderPage('in-house');

    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'انتقال اتاق' }));
    const dialog = await screen.findByRole('dialog', { name: 'انتقال مهمان به اتاق دیگر' });
    const source = within(dialog).getByLabelText('اتاق فعلی') as HTMLSelectElement;

    expect(source.value).toBe('assign-current');
    expect(within(source).getByRole('option', { name: 'اتاق ۱۰۳' })).toBeInTheDocument();
    expect(within(source).queryByRole('option', { name: 'اتاق ۱۰۱' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('اتاق مقصد'), { target: { value: 'target-room' } });
    fireEvent.change(within(dialog).getByLabelText('دلیل انتقال'), { target: { value: 'درخواست مهمان' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت انتقال' }));

    await waitFor(() => expect(frontDeskApi.moveStaffStayRoom).toHaveBeenCalledWith(
      checkedIn.reference,
      'csrf-reception',
      { sourceAssignmentId: 'assign-current', targetRoomId: 'target-room', reason: 'درخواست مهمان' },
    ));
  });

  it('explains and blocks a move when no assignment covers the business date', async () => {
    const checkedIn = copyStay();
    checkedIn.status = 'CHECKED_IN';
    checkedIn.checkOut = '2026-11-20';
    checkedIn.checkedInAt = '2026-11-18T09:00:00.000Z';
    checkedIn.assignedRooms = [
      { assignmentId: 'assign-future', roomNumber: '۱۰۱', housekeepingStatus: 'INSPECTED', startDate: '2026-11-19', endDate: '2026-11-20' },
    ];
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([checkedIn]));
    renderPage('in-house');

    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'انتقال اتاق' }));
    const dialog = await screen.findByRole('dialog', { name: 'انتقال مهمان به اتاق دیگر' });

    expect(within(dialog).getByRole('status')).toHaveTextContent('برای تاریخ کاری جاری تخصیص اتاقی فعال نیست');
    expect(within(dialog).getByRole('button', { name: 'ثبت انتقال' })).toBeDisabled();
  });

  it('previews only future amendment fields without a price quote or room-type control', async () => {
    renderPage('arrivals');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    fireEvent.click(within(card).getByRole('button', { name: 'نمایش جزئیات' }));
    const detail = await screen.findByRole('region', { name: /جزئیات اقامت/ });
    expect(bookingApi.getStaffBooking).toHaveBeenCalledWith(todayStay.reference);
    fireEvent.click(within(detail).getByRole('button', { name: 'ویرایش جزئیات اقامت' }));
    fireEvent.change(within(detail).getByLabelText('تعداد مهمانان'), { target: { value: '3' } });
    expect(within(detail).getByRole('region', { name: 'پیش‌نمایش تغییرات' })).toHaveTextContent('تعداد مهمانان: ۲ ← ۳');
    expect(within(detail).queryByText(/تومان|قیمت|مبلغ/)).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText('نوع اتاق')).not.toBeInTheDocument();
  });

  it('keeps departures read-only and handles API permission denial', async () => {
    const departed = copyStay();
    departed.status = 'CHECKED_IN';
    departed.checkedInAt = '2026-11-16T08:00:00Z';
    departed.checkOut = '2026-11-17';
    frontDeskApi.getStaffStayWorklist.mockResolvedValueOnce(worklist([departed]));
    const view = renderPage('departures');
    const card = await screen.findByRole('article', { name: /ABC123456789/ });
    expect(within(card).getByText('فهرست اطلاع‌رسانی؛ ثبت خروج در این بخش انجام نمی‌شود.')).toBeVisible();
    expect(within(card).queryByRole('button', { name: /ثبت خروج|تسویه/ })).not.toBeInTheDocument();
    view.unmount();

    frontDeskApi.getStaffStayWorklist.mockRejectedValueOnce(new StaffApiError('Forbidden', 403));
    renderPage('departures');
    expect(await screen.findByRole('alert')).toHaveTextContent('دسترسی شما برای مشاهده این فهرست تأیید نشد');
  });
});
