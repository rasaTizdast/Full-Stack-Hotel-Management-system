import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffInventoryPage } from './staff-inventory-page';
import { StaffApiError } from '@/lib/staff-api';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'reception',
      email: 'reception@example.test',
      role: 'RECEPTIONIST' as 'RECEPTIONIST' | 'ADMIN',
    },
    csrfToken: 'csrf-token',
    error: null,
    logoutError: null,
    isLoggingOut: false,
    logout: vi.fn(),
  },
}));

const inventoryApi = vi.hoisted(() => ({
  getStaffInventoryRoomTypes: vi.fn(),
  getStaffInventoryRange: vi.fn(),
  updateStaffInventoryRange: vi.fn(),
}));

vi.mock('./staff-session-provider', () => ({
  useStaffSession: () => session.current,
}));

vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, ...inventoryApi };
});

const roomType = {
  id: 'b2fc7c3d-a41f-4621-a774-a2d8c2af4472',
  name: 'اتاق باغ',
  slug: 'garden-room',
};

const response = {
  roomType,
  startDate: '2027-01-02',
  endDate: '2027-01-04',
  nights: [
    {
      stayDate: '2027-01-02',
      totalRooms: 3,
      heldRooms: 1,
      bookedRooms: 0,
      availableRooms: 2,
      nightlyPriceToman: '3500000',
    },
    {
      stayDate: '2027-01-03',
      totalRooms: 3,
      heldRooms: 0,
      bookedRooms: 0,
      availableRooms: 3,
      nightlyPriceToman: '3500000',
    },
  ],
};

describe('StaffInventoryPage', () => {
  beforeEach(() => {
    session.current = {
      status: 'authenticated',
      staff: { username: 'reception', email: 'reception@example.test', role: 'RECEPTIONIST' },
      csrfToken: 'csrf-token',
      error: null,
      logoutError: null,
      isLoggingOut: false,
      logout: vi.fn(),
    };
    inventoryApi.getStaffInventoryRoomTypes.mockReset();
    inventoryApi.getStaffInventoryRange.mockReset();
    inventoryApi.updateStaffInventoryRange.mockReset();
    inventoryApi.getStaffInventoryRoomTypes.mockResolvedValue([roomType]);
    inventoryApi.getStaffInventoryRange.mockResolvedValue(response);
    inventoryApi.updateStaffInventoryRange.mockResolvedValue(response);
  });

  it('denies receptionist access without loading or showing inventory controls', () => {
    render(<StaffInventoryPage />);

    expect(screen.getByRole('heading', { name: 'دسترسی به مدیریت موجودی' })).toBeInTheDocument();
    expect(screen.queryByLabelText('نوع اتاق')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ذخیره برای همه شب‌ها' })).not.toBeInTheDocument();
    expect(inventoryApi.getStaffInventoryRoomTypes).not.toHaveBeenCalled();
  });

  it('loads range rows and shows the existing-booking price snapshot notice to admins', async () => {
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);

    expect(
      await screen.findByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'اتاق باغ' })).toBeInTheDocument();
    expect(screen.getByText('رزروهای ثبت‌شده با قیمت فعلی خود باقی می‌مانند.')).toBeInTheDocument();
    expect(screen.getAllByText('۳٬۵۰۰٬۰۰۰')).toHaveLength(2);
    expect(inventoryApi.getStaffInventoryRange).toHaveBeenCalledWith(
      expect.objectContaining({ roomTypeId: roomType.id }),
    );
  });

  it('shows capacity conflicts on the capacity field', async () => {
    inventoryApi.updateStaffInventoryRange.mockRejectedValue(
      new StaffApiError(
        'Capacity cannot be lower than held plus booked rooms.',
        409,
        'CAPACITY_BELOW_RESERVED',
      ),
    );
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);

    const capacity = await screen.findByLabelText('ظرفیت کل اتاق‌ها');
    fireEvent.change(capacity, { target: { value: '۰' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ظرفیت نمی‌تواند از مجموع اتاق‌های در انتظار تأیید و رزروشده کمتر باشد.',
    );
    expect(capacity).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects invalid Jalali ranges before requesting inventory', async () => {
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);
    await screen.findByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    const requestsBeforeInvalidRange = inventoryApi.getStaffInventoryRange.mock.calls.length;

    fireEvent.change(screen.getByLabelText('شروع بازه'), { target: { value: '۱۴۰۳/۰۱/۰۵' } });
    fireEvent.change(screen.getByLabelText('پایان بازه'), { target: { value: '۱۴۰۳/۰۱/۰۱' } });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش بازه' }));

    expect(await screen.findByText('تاریخ پایان باید پس از تاریخ شروع باشد.')).toBeInTheDocument();
    expect(inventoryApi.getStaffInventoryRange).toHaveBeenCalledTimes(requestsBeforeInvalidRange);
  });
});
