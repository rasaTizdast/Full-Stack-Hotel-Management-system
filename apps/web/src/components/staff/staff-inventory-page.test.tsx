import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const roomTypeOption = { ...roomType, isActive: true };
const inactiveRoomTypeOption = {
  id: 'c98b4e61-1221-4d27-a1a2-c42bcfb84057',
  name: 'اتاق در حال تعمیر',
  slug: 'maintenance-room',
  isActive: false,
};

const response = {
  roomType,
  startDate: '2027-01-02',
  endDate: '2027-01-04',
  nights: [
    {
      stayDate: '2027-01-02',
      capacitySource: 'PROJECTED' as const,
      totalRooms: 3,
      blockedRooms: 1,
      heldRooms: 1,
      bookedRooms: 0,
      availableRooms: 2,
      nightlyPriceToman: '3500000',
    },
    {
      stayDate: '2027-01-03',
      capacitySource: 'PROJECTED' as const,
      totalRooms: 4,
      blockedRooms: 0,
      heldRooms: 0,
      bookedRooms: 1,
      availableRooms: 3,
      nightlyPriceToman: null,
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
    inventoryApi.getStaffInventoryRoomTypes.mockResolvedValue([roomTypeOption]);
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
    inventoryApi.getStaffInventoryRoomTypes.mockResolvedValue([
      roomTypeOption,
      inactiveRoomTypeOption,
    ]);
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);

    expect(
      await screen.findByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'اتاق باغ' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'اتاق در حال تعمیر (غیرفعال)' })).toBeInTheDocument();
    expect(screen.getByText('ظرفیت از اتاق‌های فعال و مسدودی‌های هر شب به‌صورت خودکار محاسبه می‌شود.')).toBeInTheDocument();
    expect(screen.getByText('قیمت ثبت‌شده برای رزروهای موجود تغییر نمی‌کند.')).toBeInTheDocument();
    expect(screen.getAllByText('ظرفیت محاسبه‌شده')).toHaveLength(4);
    expect(screen.getAllByText('۴')).toHaveLength(4);
    expect(screen.getAllByText('نرخ ثبت نشده')).toHaveLength(2);
    const inventoryTable = screen.getByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    expect(within(inventoryTable).getByRole('columnheader', { name: 'مسدود' })).toBeInTheDocument();
    expect(within(inventoryTable).getByRole('columnheader', { name: 'در انتظار' })).toBeInTheDocument();
    expect(within(inventoryTable).getByRole('columnheader', { name: 'رزرو قطعی' })).toBeInTheDocument();
    expect(inventoryApi.getStaffInventoryRange).toHaveBeenCalledWith(
      expect.objectContaining({ roomTypeId: roomType.id }),
    );

    fireEvent.change(screen.getByLabelText('نوع اتاق'), {
      target: { value: inactiveRoomTypeOption.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش بازه' }));
    await waitFor(() => {
      expect(inventoryApi.getStaffInventoryRange).toHaveBeenLastCalledWith(
        expect.objectContaining({ roomTypeId: inactiveRoomTypeOption.id }),
      );
    });
  });

  it('marks missing historical capacity as unavailable instead of displaying zero', async () => {
    inventoryApi.getStaffInventoryRange.mockResolvedValue({
      ...response,
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      nights: [
        {
          stayDate: '2026-10-01',
          capacitySource: 'UNAVAILABLE',
          totalRooms: null,
          blockedRooms: null,
          heldRooms: null,
          bookedRooms: null,
          availableRooms: null,
          nightlyPriceToman: null,
        },
      ],
    });
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);

    expect(await screen.findAllByText('تاریخچه ظرفیت در دسترس نیست')).not.toHaveLength(0);
    expect(screen.getAllByText('نامشخص')).toHaveLength(12);
    expect(screen.queryByText('نرخ ثبت نشده')).not.toBeInTheDocument();
    expect(screen.queryByText('۰')).not.toBeInTheDocument();
  });

  it('locks historical rate ranges and explains how to recover', async () => {
    inventoryApi.getStaffInventoryRange.mockResolvedValue({
      ...response,
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      nights: [
        {
          ...response.nights[0],
          stayDate: '2026-10-01',
          capacitySource: 'HISTORICAL',
          nightlyPriceToman: null,
        },
      ],
    });
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);

    expect(await screen.findByRole('button', { name: 'ذخیره برای همه شب‌ها' })).toBeDisabled();
    expect(screen.getAllByText('ظرفیت ثبت‌شده')).toHaveLength(2);
    expect(screen.getAllByText('نرخ ثبت نشده')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(
      'نرخ شب‌های گذشته قابل ویرایش نیست. بازه‌ای از امروز یا بعد از آن انتخاب کنید.',
    );
  });

  it('ignores a range response after the selected room changes', async () => {
    const secondRoomType = {
      id: '72be28d2-d4ef-49b0-8c6b-688124a1521f',
      name: 'سوئیت باغ',
      slug: 'garden-suite',
      isActive: true,
    };
    let resolveRange!: (value: typeof response) => void;
    inventoryApi.getStaffInventoryRoomTypes.mockResolvedValue([roomTypeOption, secondRoomType]);
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);
    await screen.findByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' });
    inventoryApi.getStaffInventoryRange.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRange = resolve;
      }),
    );

    fireEvent.change(screen.getByLabelText('نوع اتاق'), { target: { value: secondRoomType.id } });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش بازه' }));
    await waitFor(() => expect(inventoryApi.getStaffInventoryRange).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('نوع اتاق'), { target: { value: roomType.id } });
    await act(async () => {
      resolveRange({
        ...response,
        roomType: secondRoomType,
        nights: response.nights.map((night) => ({
          ...night,
          totalRooms: 9,
          nightlyPriceToman: '5000000',
        })),
      });
    });

    expect(screen.queryByRole('table', { name: 'وضعیت ظرفیت و نرخ هر شب' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ظرفیت مشتق‌شده')).not.toBeInTheDocument();
  });

  it('updates a rate without sending or editing derived room capacity', async () => {
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

    const rate = await screen.findByLabelText('نرخ یک شب (تومان)');
    fireEvent.change(rate, { target: { value: '۴۰۰۰۰۰۰' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ظرفیت فیزیکی با اتاق‌های رزروشده هم‌خوان نیست؛ تغییر ظرفیت فقط از مدیریت اتاق‌های فیزیکی انجام می‌شود.',
    );
    expect(screen.queryByLabelText('ظرفیت کل اتاق‌ها')).not.toBeInTheDocument();
    expect(inventoryApi.updateStaffInventoryRange).toHaveBeenCalledWith(
      expect.objectContaining({ roomTypeId: roomType.id, nightlyPriceToman: '4000000' }),
      'csrf-token',
    );
    expect(inventoryApi.updateStaffInventoryRange.mock.calls[0]?.[0]).not.toHaveProperty('totalRooms');
  });

  it('maps the historical inventory conflict to Persian recovery guidance', async () => {
    inventoryApi.updateStaffInventoryRange.mockRejectedValue(
      new StaffApiError(
        'Historical capacity can only be changed by an authorized correction workflow.',
        409,
        'HISTORICAL_INVENTORY_READ_ONLY',
      ),
    );
    session.current = {
      ...session.current,
      staff: { ...session.current.staff, role: 'ADMIN' },
    };

    render(<StaffInventoryPage />);
    fireEvent.change(await screen.findByLabelText('نرخ یک شب (تومان)'), {
      target: { value: '۴۰۰۰۰۰۰' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره برای همه شب‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'نرخ شب‌های گذشته قابل ویرایش نیست. بازه‌ای از امروز یا بعد از آن انتخاب کنید.',
    );
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
