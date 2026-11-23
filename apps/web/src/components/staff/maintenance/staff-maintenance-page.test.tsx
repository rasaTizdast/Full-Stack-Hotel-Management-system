import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { StaffMaintenancePage } from './staff-maintenance-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'shift-lead',
      email: 'shift-lead@example.test',
      role: 'MANAGER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-maintenance',
  },
}));

const api = vi.hoisted(() => ({
  getStaffMaintenanceRequests: vi.fn(),
  createStaffMaintenanceRequest: vi.fn(),
  assignStaffMaintenanceRequest: vi.fn(),
  resolveStaffMaintenanceRequest: vi.fn(),
  getStaffRoomBlocks: vi.fn(),
  createStaffRoomBlock: vi.fn(),
  restoreStaffRoomBlock: vi.fn(),
  getStaffMaintenanceAssignees: vi.fn(),
  getStaffMaintenanceRooms: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-maintenance-api', () => api);

const room = { id: 'room-1', roomNumber: '۱۰۱', floor: '۲', roomTypeName: 'دبل' };
const request = {
  id: 'request-1',
  room,
  category: 'PLUMBING' as const,
  description: 'نشتی شیر روشویی',
  priority: 'HIGH' as const,
  status: 'OPEN' as const,
  expectedDate: '2026-12-15',
  openedAt: '2026-11-23T08:00:00.000Z',
  assignedAt: null,
  assignee: null,
  createdBy: { id: 'staff-1', username: 'shift-lead' },
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
};
const block = {
  id: 'block-1',
  room,
  startDate: '2026-12-15',
  expectedReturnDate: '2026-12-18',
  kind: 'OUT_OF_ORDER' as const,
  reason: 'تعویض لوله آب',
  status: 'ACTIVE' as const,
  createdBy: { id: 'staff-1', username: 'shift-lead' },
  createdAt: '2026-11-23T08:00:00.000Z',
};
const list = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, pageSize: 50, totalItems: items.length, totalPages: 1 },
});

function setRole(role: typeof session.current.staff.role) {
  session.current = {
    ...session.current,
    staff: { ...session.current.staff, role },
  };
}

describe('StaffMaintenancePage', () => {
  beforeEach(() => {
    setRole('MANAGER');
    api.getStaffMaintenanceRequests.mockReset().mockResolvedValue(list([request]));
    api.getStaffRoomBlocks.mockReset().mockResolvedValue(list([block]));
    api.getStaffMaintenanceRooms.mockReset().mockResolvedValue({ items: [room] });
    api.getStaffMaintenanceAssignees.mockReset().mockResolvedValue({
      items: [{ id: 'staff-2', username: 'maintenance-tech' }],
    });
    api.createStaffMaintenanceRequest.mockReset().mockResolvedValue(request);
    api.assignStaffMaintenanceRequest.mockReset().mockResolvedValue(request);
    api.resolveStaffMaintenanceRequest
      .mockReset()
      .mockResolvedValue({ ...request, status: 'RESOLVED' });
    api.createStaffRoomBlock.mockReset().mockResolvedValue(block);
    api.restoreStaffRoomBlock.mockReset().mockResolvedValue({ ...block, status: 'RESTORED' });
  });

  it('shows separate repair requests and dated room blocks to managers', async () => {
    render(<StaffMaintenancePage />);

    expect(await screen.findByRole('heading', { name: 'تعمیرات و انسداد اتاق' })).toBeVisible();
    const requestCard = await screen.findByRole('article', { name: /درخواست تعمیر اتاق ۱۰۱/ });
    expect(within(requestCard).getByText('نشتی شیر روشویی')).toBeVisible();
    expect(within(requestCard).getByText('در انتظار رسیدگی')).toBeVisible();
    const blockCard = screen.getByRole('article', { name: /انسداد اتاق ۱۰۱/ });
    expect(within(blockCard).getByText('تعویض لوله آب')).toBeVisible();
    expect(blockCard).toHaveTextContent('خروج از سرویس');
    expect(
      within(blockCard).getByRole('button', { name: 'بازگرداندن اتاق به ظرفیت فروش' }),
    ).toBeVisible();
    expect(api.getStaffMaintenanceAssignees).toHaveBeenCalledOnce();
    expect(api.getStaffMaintenanceRooms).toHaveBeenCalledOnce();
  });

  it('lets reception create a repair request but does not show manager block controls', async () => {
    setRole('RECEPTIONIST');
    render(<StaffMaintenancePage />);
    await screen.findByRole('heading', { name: 'تعمیرات و انسداد اتاق' });

    fireEvent.change(screen.getByLabelText('اتاق برای درخواست تعمیر'), {
      target: { value: room.id },
    });
    fireEvent.change(screen.getByLabelText('نوع تعمیر'), { target: { value: 'PLUMBING' } });
    fireEvent.change(screen.getByLabelText('شرح مشکل'), {
      target: { value: 'آب از زیر شیر می‌چکد' },
    });
    fireEvent.change(screen.getByLabelText('موعد تقریبی رسیدگی'), {
      target: { value: formatGregorianAsJalali('2026-12-15') },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست تعمیر' }));

    await waitFor(() =>
      expect(api.createStaffMaintenanceRequest).toHaveBeenCalledWith(
        {
          roomId: room.id,
          category: 'PLUMBING',
          description: 'آب از زیر شیر می‌چکد',
          priority: 'NORMAL',
          expectedDate: '2026-12-15',
        },
        'csrf-maintenance',
      ),
    );
    expect(screen.queryByRole('button', { name: /ایجاد بازه انسداد/ })).not.toBeInTheDocument();
    expect(api.getStaffMaintenanceAssignees).not.toHaveBeenCalled();
  });

  it('lets housekeepers file a request without exposing the maintenance queue', async () => {
    setRole('HOUSEKEEPER');
    render(<StaffMaintenancePage />);

    expect(await screen.findByRole('heading', { name: 'ثبت درخواست تعمیر' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'درخواست‌های تعمیر' })).not.toBeInTheDocument();
    expect(api.getStaffMaintenanceRooms).toHaveBeenCalledOnce();
    expect(api.getStaffMaintenanceRequests).not.toHaveBeenCalled();
    expect(api.getStaffRoomBlocks).not.toHaveBeenCalled();
  });

  it('denies cashier access in the page even if the route is opened directly', () => {
    setRole('CASHIER');
    render(<StaffMaintenancePage />);
    expect(screen.getByRole('heading', { name: 'دسترسی به این بخش مجاز نیست' })).toBeVisible();
    expect(api.getStaffMaintenanceRequests).not.toHaveBeenCalled();
    expect(api.getStaffMaintenanceRooms).not.toHaveBeenCalled();
  });
});
