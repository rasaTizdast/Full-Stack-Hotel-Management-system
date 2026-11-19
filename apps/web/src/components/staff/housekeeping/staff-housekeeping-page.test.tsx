import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffApiError } from '@/lib/staff-api';
import type { HousekeepingDiscrepancy } from '@/lib/staff-housekeeping-api';
import { StaffHousekeepingPage } from './staff-housekeeping-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'attendant-1',
      email: 'attendant@example.test',
      role: 'HOUSEKEEPER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-housekeeping',
  },
}));

const housekeepingApi = vi.hoisted(() => ({
  getStaffHousekeepingTasks: vi.fn(),
  createStaffHousekeepingTask: vi.fn(),
  assignStaffHousekeepingTask: vi.fn(),
  startStaffHousekeepingTask: vi.fn(),
  completeStaffHousekeepingTask: vi.fn(),
  cancelStaffHousekeepingTask: vi.fn(),
  getStaffHousekeepingDiscrepancies: vi.fn(),
  reportStaffRoomDiscrepancy: vi.fn(),
  resolveStaffHousekeepingDiscrepancy: vi.fn(),
  dismissStaffHousekeepingDiscrepancy: vi.fn(),
  getStaffHousekeepingRooms: vi.fn(),
  getStaffHousekeepingAssignees: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-housekeeping-api', () => housekeepingApi);

const taskFixture = {
  id: 'task-1',
  room: {
    id: 'room-101',
    roomNumber: '۱۰۱',
    floor: '۲',
    housekeepingStatus: 'DIRTY',
    occupancy: 'VACANT',
  },
  arrivalDue: true,
  departureDue: false,
  isOverdue: false,
  dueDate: '2026-11-17',
  taskType: 'INSPECTION',
  status: 'IN_PROGRESS',
  priority: 'URGENT',
  completionOutcome: null,
  completionReason: null,
  note: null,
  assignee: { id: 'staff-1', username: 'attendant-1' },
  allowedActions: { canAssign: false, canStart: false, canComplete: true, canCancel: false },
  guestName: 'PRIVATE GUEST NAME',
  guestPhone: '09120000000',
  folioBalanceToman: '5000000',
};

const taskPage = (items = [taskFixture]) => ({
  businessDate: '2026-11-17',
  items: structuredClone(items),
  pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
});

const discrepancyFixture: HousekeepingDiscrepancy = {
  id: 'discrepancy-1',
  roomId: 'room-101',
  roomNumber: '۱۰۱',
  floor: '۲',
  businessDate: '2026-11-17',
  kind: 'SLEEP',
  expectedOccupied: false,
  observedOccupied: true,
  status: 'OPEN',
  note: 'صدای حضور داخل اتاق شنیده شد',
  reportedBy: { id: 'staff-1', username: 'attendant-1' },
  reportedAt: '2026-11-17T08:00:00.000Z',
  resolvedBy: null,
  resolvedAt: null,
  resolutionReason: null,
};

const discrepancyPage = (items = [discrepancyFixture]) => ({
  businessDate: '2026-11-17',
  items: structuredClone(items),
  pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
});

const roomOptions = [
  { id: 'room-101', roomNumber: '۱۰۱', floor: '۲', housekeepingStatus: 'DIRTY', occupancy: 'VACANT', dueArrival: true, dueDeparture: false },
  { id: 'room-102', roomNumber: '۱۰۲', floor: '۳', housekeepingStatus: 'CLEAN', occupancy: 'OCCUPIED', dueArrival: false, dueDeparture: true },
];
const roomPage = {
  businessDate: '2026-11-17',
  items: structuredClone(roomOptions),
  pagination: { page: 1, pageSize: 20, totalItems: roomOptions.length, totalPages: 1 },
};

function setRole(role: typeof session.current.staff.role) {
  session.current = {
    status: 'authenticated',
    staff: { username: 'attendant-1', email: 'attendant@example.test', role, mustChangePassword: false },
    csrfToken: 'csrf-housekeeping',
  };
}

describe('StaffHousekeepingPage', () => {
  beforeEach(() => {
    setRole('HOUSEKEEPER');
    housekeepingApi.getStaffHousekeepingTasks.mockReset().mockResolvedValue(taskPage());
    housekeepingApi.getStaffHousekeepingDiscrepancies.mockReset().mockResolvedValue(discrepancyPage());
    housekeepingApi.getStaffHousekeepingRooms.mockReset().mockResolvedValue(roomPage);
    housekeepingApi.getStaffHousekeepingAssignees.mockReset().mockResolvedValue({ items: [
      { id: 'staff-1', username: 'attendant-1' },
      { id: 'staff-2', username: 'attendant-2' },
    ] });
    housekeepingApi.createStaffHousekeepingTask.mockReset().mockResolvedValue(taskFixture);
    housekeepingApi.assignStaffHousekeepingTask.mockReset().mockResolvedValue(taskFixture);
    housekeepingApi.startStaffHousekeepingTask.mockReset().mockResolvedValue({ ...taskFixture, status: 'IN_PROGRESS' });
    housekeepingApi.completeStaffHousekeepingTask.mockReset().mockResolvedValue({ ...taskFixture, status: 'COMPLETED', completionOutcome: 'DONE' });
    housekeepingApi.cancelStaffHousekeepingTask.mockReset().mockResolvedValue({ ...taskFixture, status: 'CANCELLED' });
    housekeepingApi.reportStaffRoomDiscrepancy.mockReset().mockResolvedValue(discrepancyFixture);
    housekeepingApi.resolveStaffHousekeepingDiscrepancy.mockReset().mockResolvedValue({ ...discrepancyFixture, status: 'RESOLVED' });
    housekeepingApi.dismissStaffHousekeepingDiscrepancy.mockReset().mockResolvedValue({ ...discrepancyFixture, status: 'DISMISSED' });
  });

  it('shows separate room occupancy, condition, task priority, and due context without guest or folio data', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);

    expect(await screen.findByRole('heading', { name: 'خانه‌داری' })).toBeVisible();
    const card = await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });
    expect(within(card).getByText('خالی')).toBeVisible();
    expect(within(card).getByText('نیازمند نظافت')).toBeVisible();
    expect(within(card).getByText('در حال انجام')).toBeVisible();
    expect(within(card).getByText('فوری')).toBeVisible();
    expect(within(card).getByText(/ورود امروز/)).toBeVisible();
    expect(within(card).queryByText('PRIVATE GUEST NAME')).not.toBeInTheDocument();
    expect(within(card).queryByText('09120000000')).not.toBeInTheDocument();
    expect(within(card).queryByText('۵٬۰۰۰٬۰۰۰')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'آمادگی اتاق‌ها' })).toBeVisible();
    const roomCard = screen.getByRole('article', { name: 'وضعیت اتاق ۱۰۱' });
    expect(within(roomCard).getByText('حضور:')).toBeVisible();
    expect(within(roomCard).getByText('خالی')).toBeVisible();
    expect(within(roomCard).getByText('وضعیت نظافت:')).toBeVisible();
    expect(within(roomCard).getByText('نیازمند نظافت')).toBeVisible();
    expect(screen.getByRole('region', { name: 'مغایرت‌های حضور' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('فیلتر حضور اتاق‌ها'), { target: { value: 'OCCUPIED' } });
    expect(screen.getByRole('article', { name: 'وضعیت اتاق ۱۰۲' })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'وضعیت اتاق ۱۰۱' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ })).toBeVisible();
  });

  it('shows paged physical-room readiness with occupancy and housekeeping filters separate from task filters', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);

    expect(await screen.findByRole('heading', { name: 'آمادگی اتاق‌ها' })).toBeVisible();
    const room101 = await screen.findByRole('article', { name: 'وضعیت اتاق ۱۰۱' });
    expect(within(room101).getByText('حضور:')).toBeVisible();
    expect(within(room101).getByText('خالی')).toBeVisible();
    expect(within(room101).getByText('وضعیت نظافت:')).toBeVisible();
    expect(within(room101).getByText('نیازمند نظافت')).toBeVisible();

    fireEvent.change(screen.getByLabelText('فیلتر حضور اتاق‌ها'), { target: { value: 'OCCUPIED' } });
    expect(screen.getByRole('article', { name: 'وضعیت اتاق ۱۰۲' })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'وضعیت اتاق ۱۰۱' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ })).toBeVisible();
  });

  it('loads every paginated room page for readiness and room selection', async () => {
    setRole('RECEPTIONIST');
    const thirdRoom = {
      id: 'room-103',
      roomNumber: '۱۰۳',
      floor: '۴',
      housekeepingStatus: 'INSPECTED',
      occupancy: 'VACANT',
      dueArrival: false,
      dueDeparture: false,
    };
    housekeepingApi.getStaffHousekeepingRooms
      .mockReset()
      .mockResolvedValueOnce({ ...roomPage, pagination: { page: 1, pageSize: 100, totalItems: 3, totalPages: 2 } })
      .mockResolvedValueOnce({ ...roomPage, items: [thirdRoom], pagination: { page: 2, pageSize: 100, totalItems: 3, totalPages: 2 } });
    render(<StaffHousekeepingPage />);

    expect(await screen.findByRole('article', { name: 'وضعیت اتاق ۱۰۳' })).toBeVisible();
    expect(housekeepingApi.getStaffHousekeepingRooms).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(housekeepingApi.getStaffHousekeepingRooms).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
  });

  it('filters discrepancy history independently from task filters', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });

    fireEvent.change(screen.getByLabelText('وضعیت گزارش‌ها'), { target: { value: 'DISMISSED' } });

    await waitFor(() => expect(housekeepingApi.getStaffHousekeepingDiscrepancies).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'DISMISSED' }),
    ));
    expect(housekeepingApi.getStaffHousekeepingDiscrepancies).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' }));
    expect(housekeepingApi.getStaffHousekeepingTasks.mock.lastCall?.[0]).not.toHaveProperty('status', 'DISMISSED');
  });

  it('shows reporter and resolution history when the closed report filter is selected', async () => {
    setRole('RECEPTIONIST');
    const dismissed: HousekeepingDiscrepancy = {
      ...discrepancyFixture,
      status: 'DISMISSED',
      resolvedBy: { id: 'staff-2', username: 'shift-manager' },
      resolvedAt: '2026-11-17T09:20:00.000Z',
      resolutionReason: 'پس از بررسی، حضور مهمان تأیید نشد',
    };
    housekeepingApi.getStaffHousekeepingDiscrepancies
      .mockResolvedValueOnce(discrepancyPage([]))
      .mockResolvedValue(discrepancyPage([dismissed]));
    render(<StaffHousekeepingPage />);
    await screen.findByRole('heading', { name: 'مغایرت‌های حضور' });

    fireEvent.change(screen.getByLabelText('وضعیت گزارش‌ها'), { target: { value: 'DISMISSED' } });

    const card = await screen.findByRole('article', { name: /اتاق خالی ثبت شده/ });
    expect(within(card).getByText(/گزارش attendant-1/)).toBeVisible();
    expect(within(card).getByText(/بررسی shift-manager/)).toBeVisible();
    expect(within(card).getByText('توضیح: پس از بررسی، حضور مهمان تأیید نشد')).toBeVisible();
    expect(within(card).getByLabelText('زمان بررسی مغایرت')).toHaveAttribute('datetime', '2026-11-17T09:20:00.000Z');
  });

  it('requires an inspection reason for rework, submits completion, and announces the result', async () => {
    render(<StaffHousekeepingPage />);
    const card = await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });
    fireEvent.click(within(card).getByRole('button', { name: 'تکمیل بازرسی' }));

    const dialog = await screen.findByRole('dialog', { name: 'ثبت نتیجهٔ بازرسی اتاق ۱۰۱' });
    const rework = within(dialog).getByRole('radio', { name: 'نیازمند نظافت دوباره' });
    fireEvent.click(rework);
    expect(within(dialog).getByRole('button', { name: 'ثبت نتیجهٔ بازرسی' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('دلیل نیاز به نظافت دوباره'), { target: { value: 'رسوب در حمام' } });

    const submit = within(dialog).getByRole('button', { name: 'ثبت نتیجهٔ بازرسی' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(housekeepingApi.completeStaffHousekeepingTask).toHaveBeenCalledWith(
      'task-1',
      { outcome: 'NEEDS_REWORK', reason: 'رسوب در حمام' },
      'csrf-housekeeping',
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('نظافت دوباره برای اتاق ۱۰۱ ثبت شد');
  });

  it('refreshes the readiness card after a manager completes room work', async () => {
    setRole('MANAGER');
    const inspectedPage = {
      ...roomPage,
      items: roomOptions.map((room) => room.id === 'room-101' ? { ...room, housekeepingStatus: 'INSPECTED' } : room),
    };
    housekeepingApi.getStaffHousekeepingRooms
      .mockReset()
      .mockResolvedValueOnce(roomPage)
      .mockResolvedValue(inspectedPage);
    render(<StaffHousekeepingPage />);
    const taskCard = await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });
    fireEvent.click(within(taskCard).getByRole('button', { name: 'تکمیل بازرسی' }));
    const dialog = await screen.findByRole('dialog', { name: 'ثبت نتیجهٔ بازرسی اتاق ۱۰۱' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت نتیجهٔ بازرسی' }));

    const roomCard = await screen.findByRole('article', { name: 'وضعیت اتاق ۱۰۱' });
    expect(within(roomCard).getByText('بازرسی‌شده')).toBeVisible();
    expect(housekeepingApi.getStaffHousekeepingRooms).toHaveBeenCalledTimes(2);
  });

  it('lets a housekeeper report an observed occupancy mismatch without changing room occupancy', async () => {
    render(<StaffHousekeepingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'گزارش مغایرت حضور' }));
    const dialog = await screen.findByRole('dialog', { name: 'گزارش مغایرت حضور' });
    fireEvent.change(within(dialog).getByLabelText('اتاق'), { target: { value: 'room-101' } });
    fireEvent.change(within(dialog).getByLabelText('حضور مشاهده‌شده'), { target: { value: 'true' } });
    fireEvent.change(within(dialog).getByLabelText('یادداشت عملیاتی'), { target: { value: 'صدای حضور داخل اتاق شنیده شد' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت مغایرت' }));

    await waitFor(() => expect(housekeepingApi.reportStaffRoomDiscrepancy).toHaveBeenCalledWith(
      'room-101',
      { businessDate: '2026-11-17', observedOccupied: true, note: 'صدای حضور داخل اتاق شنیده شد' },
      'csrf-housekeeping',
    ));
    expect(await screen.findByText(/اتاق خالی ثبت شده/)).toBeVisible();
    expect(housekeepingApi.resolveStaffHousekeepingDiscrepancy).not.toHaveBeenCalled();
  });

  it('allows reception to resolve a reported discrepancy after checking the server result', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    const card = await screen.findByRole('article', { name: /اتاق خالی ثبت شده/ });
    expect(within(card).getByText(/حضور ثبت‌شده: خالی/)).toBeVisible();
    expect(within(card).getByText(/مشاهدهٔ کارکنان: اشغال/)).toBeVisible();
    fireEvent.click(within(card).getByRole('button', { name: 'تأیید اصلاح مغایرت' }));

    await waitFor(() => expect(housekeepingApi.resolveStaffHousekeepingDiscrepancy).toHaveBeenCalledWith(
      'discrepancy-1',
      'csrf-housekeeping',
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('مغایرت اتاق ۱۰۱ اصلاح شد');
    expect(screen.queryByRole('button', { name: /گزارش مغایرت/ })).not.toBeInTheDocument();
  });

  it('shows one combined warning when task and discrepancy refreshes fail', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    expect(await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ })).toBeVisible();
    expect(await screen.findByRole('article', { name: /اتاق خالی ثبت شده/ })).toBeVisible();
    housekeepingApi.getStaffHousekeepingTasks.mockRejectedValueOnce(new StaffApiError('Offline', 0));
    housekeepingApi.getStaffHousekeepingDiscrepancies.mockRejectedValueOnce(new StaffApiError('Offline', 0));
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی فهرست' }));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(screen.getByRole('alert')).toHaveTextContent(/کارها و مغایرت‌ها/);
    expect(screen.getByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('filters task due dates without changing the server business-date reference', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });
    fireEvent.change(screen.getByLabelText('موعد انجام کار'), { target: { value: '۱۴۰۵/۰۸/۲۷' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));

    await waitFor(() => expect(housekeepingApi.getStaffHousekeepingTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ dueDate: '2026-11-18' }),
    ));
    expect(housekeepingApi.getStaffHousekeepingTasks.mock.lastCall?.[0]).not.toHaveProperty('businessDate');
  });

  it('keeps visible Jalali date-format guidance and associates invalid-date feedback with its field', async () => {
    render(<StaffHousekeepingPage />);
    const dueDate = screen.getByLabelText('موعد انجام کار');

    expect(screen.getByText('قالب تاریخ شمسی: سال/ماه/روز، مانند ۱۴۰۵/۰۸/۲۷')).toBeVisible();
    fireEvent.change(dueDate, { target: { value: '۱۴۰۵/۱۳/۰۱' } });

    expect(dueDate).toHaveAttribute('aria-invalid', 'true');
    const describedBy = dueDate.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain('housekeeping-due-date-help');
    expect(describedBy).toContain('housekeeping-due-date-error');
    expect(document.getElementById('housekeeping-due-date-error')).toHaveTextContent('تاریخ کاری را به‌شکل سال/ماه/روز شمسی معتبر وارد کنید.');

    fireEvent.change(dueDate, { target: { value: '۱۴۰۵/۰۸/۲۷' } });
    expect(dueDate).not.toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('housekeeping-due-date-error')).not.toBeInTheDocument();
  });

  it('lets managers filter by active housekeeper and preserves that filter through pagination and clearing', async () => {
    setRole('MANAGER');
    housekeepingApi.getStaffHousekeepingTasks.mockImplementation((query: { page?: number; pageSize?: number }) => Promise.resolve({
      ...taskPage(),
      pagination: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, totalItems: 21, totalPages: 2 },
    }));
    render(<StaffHousekeepingPage />);
    const assigneeFilter = await screen.findByLabelText('مسئول کار');
    expect(housekeepingApi.getStaffHousekeepingAssignees).toHaveBeenCalledOnce();
    expect(await within(assigneeFilter).findByRole('option', { name: 'attendant-2' })).toBeInTheDocument();

    fireEvent.change(assigneeFilter, { target: { value: 'staff-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));
    await waitFor(() => expect(housekeepingApi.getStaffHousekeepingTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeStaffUserId: 'staff-2', page: 1 }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعد' }));
    await waitFor(() => expect(housekeepingApi.getStaffHousekeepingTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeStaffUserId: 'staff-2', page: 2 }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'پاک‌کردن فیلترها' }));
    await waitFor(() => expect(housekeepingApi.getStaffHousekeepingTasks).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ assigneeStaffUserId: expect.anything() }),
    ));
    expect(screen.getByLabelText('مسئول کار')).toHaveValue('');
  });

  it('does not expose the assignee filter to reception staff', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    await screen.findByRole('heading', { name: 'خانه‌داری' });

    expect(screen.queryByLabelText('مسئول کار')).not.toBeInTheDocument();
    expect(housekeepingApi.getStaffHousekeepingAssignees).not.toHaveBeenCalled();
  });

  it('keeps the assignee retry action outside its label and links the error to the select', async () => {
    setRole('MANAGER');
    housekeepingApi.getStaffHousekeepingAssignees.mockRejectedValueOnce(new StaffApiError('Offline', 0));
    render(<StaffHousekeepingPage />);
    await screen.findByText('فهرست مسئول‌ها دریافت نشد.');
    const select = await screen.findByLabelText('مسئول کار');
    const label = select.closest('label');

    expect(label?.querySelector('button')).toBeNull();
    expect(select).toHaveAttribute('aria-describedby', 'housekeeping-assignee-filter-error');
    expect(screen.getByText('فهرست مسئول‌ها دریافت نشد.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(await within(select).findByRole('option', { name: 'attendant-2' })).toBeInTheDocument();
  });

  it('creates a task using the server business date', async () => {
    setRole('MANAGER');
    render(<StaffHousekeepingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'ایجاد کار' }));
    const dialog = await screen.findByRole('dialog', { name: 'ایجاد کار خانه‌داری' });
    fireEvent.change(within(dialog).getByLabelText('اتاق'), { target: { value: 'room-101' } });
    fireEvent.change(within(dialog).getByLabelText('نوع کار'), { target: { value: 'INSPECTION' } });
    fireEvent.change(within(dialog).getByLabelText('اولویت'), { target: { value: 'HIGH' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ایجاد کار' }));

    await waitFor(() => expect(housekeepingApi.createStaffHousekeepingTask).toHaveBeenCalledWith(
      { roomId: 'room-101', taskType: 'INSPECTION', businessDate: '2026-11-17', priority: 'HIGH' },
      'csrf-housekeeping',
    ));
    expect(await screen.findByRole('status')).toHaveTextContent(/کار خانه‌داری ثبت شد/);
  });

  it('loads active housekeepers and submits manager assignment by staff id', async () => {
    setRole('MANAGER');
    housekeepingApi.getStaffHousekeepingTasks.mockResolvedValue(taskPage([{ ...taskFixture, allowedActions: { ...taskFixture.allowedActions, canAssign: true } }]));
    render(<StaffHousekeepingPage />);
    const card = await screen.findByRole('article', { name: /کار خانه‌داری اتاق ۱۰۱/ });
    fireEvent.click(within(card).getByRole('button', { name: 'تغییر مسئول' }));

    const dialog = await screen.findByRole('dialog', { name: 'تخصیص کار اتاق ۱۰۱' });
    expect(housekeepingApi.getStaffHousekeepingAssignees).toHaveBeenCalledTimes(2);
    fireEvent.change(within(dialog).getByLabelText('خانه‌دار مسئول'), { target: { value: 'staff-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ثبت تخصیص' }));

    await waitFor(() => expect(housekeepingApi.assignStaffHousekeepingTask).toHaveBeenCalledWith(
      'task-1',
      { assigneeStaffUserId: 'staff-2' },
      'csrf-housekeeping',
    ));
  });

  it('denies cashier access before requesting any housekeeping data', () => {
    setRole('CASHIER');
    render(<StaffHousekeepingPage />);

    expect(screen.getByRole('heading', { name: 'دسترسی به خانه‌داری' })).toBeVisible();
    expect(housekeepingApi.getStaffHousekeepingTasks).not.toHaveBeenCalled();
    expect(housekeepingApi.getStaffHousekeepingDiscrepancies).not.toHaveBeenCalled();
    expect(housekeepingApi.getStaffHousekeepingRooms).not.toHaveBeenCalled();
  });

  it('shows readiness and task creation to reception staff', async () => {
    setRole('RECEPTIONIST');
    render(<StaffHousekeepingPage />);
    expect(await screen.findByRole('heading', { name: 'آمادگی اتاق‌ها' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'ایجاد کار' })).toBeVisible();
  });
});
