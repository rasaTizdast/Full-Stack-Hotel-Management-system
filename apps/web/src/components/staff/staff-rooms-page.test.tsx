import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffApiError } from '@/lib/staff-api';
import { StaffRoomsPage } from './staff-rooms-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'admin',
      email: 'admin@example.test',
      role: 'ADMIN' as 'ADMIN' | 'RECEPTIONIST',
    },
    csrfToken: 'csrf-admin',
    error: null,
    logoutError: null,
    isLoggingOut: false,
    logout: vi.fn(),
  },
}));

const roomsApi = vi.hoisted(() => ({
  getStaffRooms: vi.fn(),
  getStaffInventoryRoomTypes: vi.fn(),
  createStaffRoom: vi.fn(),
  updateStaffRoom: vi.fn(),
  deactivateStaffRoom: vi.fn(),
  reactivateStaffRoom: vi.fn(),
}));

vi.mock('./staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, ...roomsApi };
});

const roomType = {
  id: 'b2fc7c3d-a41f-4621-a774-a2d8c2af4472',
  name: 'اتاق باغ',
  slug: 'garden-room',
};
const generatedRoom = {
  id: '188f912a-1b47-4639-8940-8e9f72a05199',
  roomNumber: 'اتاق باغ ۱',
  floor: '۲',
  features: ['بالکن'],
  housekeepingStatus: 'CLEAN' as const,
  isActive: true,
  isGenerated: true,
  roomType,
};
const inactiveRoom = {
  ...generatedRoom,
  id: 'ec6d235d-bde0-43f2-b139-2be7599c5510',
  roomNumber: '۲۰۲',
  isActive: false,
  isGenerated: false,
};
const roomTypes = [{ ...roomType, isActive: true }];

describe('StaffRoomsPage', () => {
  beforeEach(() => {
    session.current = {
      status: 'authenticated',
      staff: { username: 'admin', email: 'admin@example.test', role: 'ADMIN' },
      csrfToken: 'csrf-admin',
      error: null,
      logoutError: null,
      isLoggingOut: false,
      logout: vi.fn(),
    };
    roomsApi.getStaffRooms.mockReset().mockResolvedValue({ items: [generatedRoom, inactiveRoom] });
    roomsApi.getStaffInventoryRoomTypes.mockReset().mockResolvedValue(roomTypes);
    roomsApi.createStaffRoom.mockReset();
    roomsApi.updateStaffRoom.mockReset();
    roomsApi.deactivateStaffRoom.mockReset();
    roomsApi.reactivateStaffRoom.mockReset();
  });

  it('denies receptionist access without loading room data', () => {
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'RECEPTIONIST' },
    };

    render(<StaffRoomsPage />);

    expect(screen.getByRole('heading', { name: 'دسترسی به مدیریت اتاق‌ها' })).toBeInTheDocument();
    expect(roomsApi.getStaffRooms).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'افزودن اتاق' })).not.toBeInTheDocument();
  });

  it('announces loading and recovers from a list error with a retry action', async () => {
    let resolveRooms!: (value: { items: typeof generatedRoom[] }) => void;
    roomsApi.getStaffRooms.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRooms = resolve;
      }),
    );
    render(<StaffRoomsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت اتاق‌ها');
    resolveRooms({ items: [generatedRoom] });
    expect(await screen.findByText('اتاق باغ ۱')).toBeInTheDocument();

    roomsApi.getStaffRooms.mockRejectedValueOnce(new Error('فهرست در دسترس نیست.'));
    await waitFor(() => expect(roomsApi.getStaffRooms).toHaveBeenCalledTimes(1));
    // Trigger a filter request after the initial load so the error is recoverable in place.
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلترها' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('فهرست در دسترس نیست.');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByText('اتاق باغ ۱')).toBeInTheDocument();
  });

  it('shows room type, floor, active state, and generated-label status to admins', async () => {
    render(<StaffRoomsPage />);

    expect(await screen.findByText('اتاق باغ ۱')).toBeInTheDocument();
    expect(screen.getByText('شمارهٔ پیشنهادی')).toBeInTheDocument();
    const inactiveCard = screen.getByRole('article', { name: '۲۰۲' });
    expect(within(inactiveCard).getByText('غیرفعال')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فعال‌کردن اتاق ۲۰۲' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش اتاق اتاق باغ ۱' })).toBeInTheDocument();
  });

  it('filters by room type, floor, active status, and search text', async () => {
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');

    const filterForm = screen.getByRole('form', { name: 'فیلتر اتاق‌ها' });
    fireEvent.change(within(filterForm).getByLabelText('نوع اتاق'), { target: { value: roomType.id } });
    fireEvent.change(within(filterForm).getByLabelText('طبقه'), { target: { value: '۲' } });
    fireEvent.change(within(filterForm).getByLabelText('وضعیت اتاق'), { target: { value: 'true' } });
    fireEvent.change(within(filterForm).getByLabelText('جست‌وجوی شماره اتاق'), { target: { value: '۲۰۱' } });
    fireEvent.click(within(filterForm).getByRole('button', { name: 'اعمال فیلترها' }));

    await waitFor(() => {
      expect(roomsApi.getStaffRooms).toHaveBeenLastCalledWith({
        roomTypeId: roomType.id,
        floor: '۲',
        isActive: true,
        search: '۲۰۱',
      });
    });
  });

  it('creates a physical room with only the supported room fields', async () => {
    const createdRoom = { ...generatedRoom, id: 'e1fa0dbb-0d31-4d0f-b82d-997476f4db0f', roomNumber: '۲۰۳', isGenerated: false };
    roomsApi.createStaffRoom.mockResolvedValue(createdRoom);
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');

    const form = screen.getByRole('form', { name: 'افزودن اتاق' });
    fireEvent.change(within(form).getByLabelText('نوع اتاق'), { target: { value: roomType.id } });
    fireEvent.change(within(form).getByLabelText('شماره اتاق'), { target: { value: '۲۰۳' } });
    fireEvent.change(within(form).getByLabelText('طبقه'), { target: { value: '۳' } });
    fireEvent.change(within(form).getByLabelText('امکانات'), { target: { value: 'تراس، رو به باغ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'افزودن اتاق' }));

    await waitFor(() => {
      expect(roomsApi.createStaffRoom).toHaveBeenCalledWith(
        { roomTypeId: roomType.id, roomNumber: '۲۰۳', floor: '۳', features: ['تراس', 'رو به باغ'] },
        'csrf-admin',
      );
    });
    expect(await screen.findByText('اتاق ۲۰۳ اضافه شد.')).toBeInTheDocument();
  });

  it('saves generated room labels as real numbers and refreshes the room marker', async () => {
    const updatedRoom = { ...generatedRoom, roomNumber: '۲۰۱', isGenerated: false };
    roomsApi.updateStaffRoom.mockResolvedValue(updatedRoom);
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش اتاق اتاق باغ ۱' }));
    const form = screen.getByRole('form', { name: 'ویرایش اتاق' });
    fireEvent.change(within(form).getByLabelText('شماره اتاق'), { target: { value: '۲۰۱' } });
    fireEvent.click(within(form).getByRole('button', { name: 'ذخیره تغییرات اتاق' }));

    await waitFor(() => {
      expect(roomsApi.updateStaffRoom).toHaveBeenCalledWith(
        generatedRoom.id,
        { roomNumber: '۲۰۱', floor: '۲', features: ['بالکن'] },
        'csrf-admin',
      );
    });
    expect(await screen.findByText('اطلاعات اتاق ۲۰۱ ذخیره شد.')).toBeInTheDocument();
    expect(screen.queryByText('شمارهٔ پیشنهادی')).not.toBeInTheDocument();
  });

  it('keeps a generated marker when only descriptive fields change', async () => {
    const updatedRoom = { ...generatedRoom, floor: '۳' };
    roomsApi.updateStaffRoom.mockResolvedValue(updatedRoom);
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش اتاق اتاق باغ ۱' }));
    const form = screen.getByRole('form', { name: 'ویرایش اتاق' });
    fireEvent.change(within(form).getByLabelText('طبقه'), { target: { value: '۳' } });
    fireEvent.click(within(form).getByRole('button', { name: 'ذخیره تغییرات اتاق' }));

    await waitFor(() => {
      expect(roomsApi.updateStaffRoom).toHaveBeenCalledWith(
        generatedRoom.id,
        { floor: '۳', features: ['بالکن'] },
        'csrf-admin',
      );
    });
    expect(screen.getByText('شمارهٔ پیشنهادی')).toBeInTheDocument();
  });

  it('lets admins replace generated numbers and marks duplicate numbers on the field', async () => {
    roomsApi.updateStaffRoom.mockRejectedValue(
      new StaffApiError('Room number already exists.', 409, 'ROOM_NUMBER_TAKEN'),
    );
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش اتاق اتاق باغ ۱' }));
    const form = screen.getByRole('form', { name: 'ویرایش اتاق' });
    const roomNumber = within(form).getByLabelText('شماره اتاق');
    expect(screen.getByText('شماره‌های نمونه باید پیش از بهره‌برداری با شماره واقعی جایگزین شوند.')).toBeInTheDocument();
    fireEvent.change(roomNumber, { target: { value: '۲۰۲' } });
    fireEvent.click(within(form).getByRole('button', { name: 'ذخیره تغییرات اتاق' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('این شماره قبلاً برای اتاق دیگری ثبت شده است.');
    expect(roomNumber).toHaveAttribute('aria-invalid', 'true');
  });

  it('requires confirmation before deactivation and gives assignment conflicts an action', async () => {
    roomsApi.deactivateStaffRoom.mockRejectedValue(
      new StaffApiError('Room has future assignments.', 409, 'ROOM_HAS_ACTIVE_ASSIGNMENTS'),
    );
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال‌کردن اتاق اتاق باغ ۱' }));
    const dialog = screen.getByRole('alertdialog', { name: 'غیرفعال‌کردن اتاق' });
    const cancel = within(dialog).getByRole('button', { name: 'بازگشت' });
    const confirm = within(dialog).getByRole('button', { name: 'تأیید غیرفعال‌سازی' });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    expect(roomsApi.deactivateStaffRoom).not.toHaveBeenCalled();
    fireEvent.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'برای غیرفعال‌کردن اتاق، ابتدا پذیرش باید انتساب‌های جاری یا آینده را جابه‌جا کند.',
    );
    expect(roomsApi.deactivateStaffRoom).toHaveBeenCalledWith(generatedRoom.id, 'csrf-admin');
  });

  it('closes the confirmation with Escape and returns keyboard focus', async () => {
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    const trigger = screen.getByRole('button', { name: 'غیرفعال‌کردن اتاق اتاق باغ ۱' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('alertdialog', { name: 'غیرفعال‌کردن اتاق' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(roomsApi.deactivateStaffRoom).not.toHaveBeenCalled();
  });

  it('updates the room status after a confirmed deactivation succeeds', async () => {
    roomsApi.deactivateStaffRoom.mockResolvedValue({ ...generatedRoom, isActive: false });
    render(<StaffRoomsPage />);
    await screen.findByText('اتاق باغ ۱');
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال‌کردن اتاق اتاق باغ ۱' }));
    const dialog = screen.getByRole('alertdialog', { name: 'غیرفعال‌کردن اتاق' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید غیرفعال‌سازی' }));

    expect(await screen.findByText('اتاق اتاق باغ ۱ غیرفعال شد.')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'اتاق باغ ۱' })).getByText('غیرفعال')).toBeInTheDocument();
  });

  it('reactivates inactive rooms and explains capacity projection conflicts', async () => {
    roomsApi.reactivateStaffRoom.mockRejectedValue(
      new StaffApiError('Reactivation conflicts with reservations.', 409, 'CAPACITY_BELOW_RESERVED'),
    );
    render(<StaffRoomsPage />);
    await screen.findByText('۲۰۲');
    fireEvent.click(screen.getByRole('button', { name: 'فعال‌کردن اتاق ۲۰۲' }));
    const dialog = screen.getByRole('alertdialog', { name: 'فعال‌کردن دوباره اتاق' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید فعال‌سازی' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ظرفیت قابل عرضه با اتاق‌های رزروشده هم‌خوان نیست؛ موجودی این نوع اتاق را بررسی کنید.',
    );
    expect(roomsApi.reactivateStaffRoom).toHaveBeenCalledWith(inactiveRoom.id, 'csrf-admin');
  });
});
