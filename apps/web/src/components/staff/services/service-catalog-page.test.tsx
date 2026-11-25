import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceCatalogPage } from './service-catalog-page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'shift-lead',
      email: 'shift-lead@example.test',
      role: 'MANAGER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-services',
  },
}));

const api = vi.hoisted(() => ({
  createStaffServiceItem: vi.fn(),
  getStaffServiceItems: vi.fn(),
  updateStaffServiceItem: vi.fn(),
}));

vi.mock('../staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-folios-api', () => api);

const item = {
  id: 'service-1',
  name: 'صبحانه ایرانی',
  category: 'پذیرایی',
  currentPriceToman: '125000',
  isActive: true,
  createdAt: '2026-11-20T09:00:00.000Z',
  updatedAt: '2026-11-20T09:00:00.000Z',
};

function setRole(role: typeof session.current.staff.role) {
  session.current = { ...session.current, staff: { ...session.current.staff, role } };
}

describe('ServiceCatalogPage', () => {
  beforeEach(() => {
    setRole('MANAGER');
    api.getStaffServiceItems.mockReset().mockResolvedValue({ items: [item] });
    api.createStaffServiceItem.mockReset().mockResolvedValue({ ...item, id: 'service-2' });
    api.updateStaffServiceItem
      .mockReset()
      .mockResolvedValue({ ...item, currentPriceToman: '150000' });
  });

  it('creates a service with integer Toman price and refreshes the manager catalog', async () => {
    render(<ServiceCatalogPage />);
    expect(await screen.findByRole('heading', { name: 'فهرست خدمات' })).toBeVisible();
    fireEvent.change(screen.getAllByLabelText('نام خدمت')[0]!, {
      target: { value: 'ترانسفر فرودگاه' },
    });
    fireEvent.change(screen.getAllByLabelText('دسته‌بندی')[0]!, { target: { value: 'حمل‌ونقل' } });
    fireEvent.change(screen.getAllByLabelText('قیمت فعلی · تومان')[0]!, {
      target: { value: '450000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن خدمت' }));

    await waitFor(() =>
      expect(api.createStaffServiceItem).toHaveBeenCalledWith(
        { name: 'ترانسفر فرودگاه', category: 'حمل‌ونقل', currentPriceToman: '450000' },
        'csrf-services',
      ),
    );
    expect(api.getStaffServiceItems).toHaveBeenCalledTimes(2);
  });

  it('reports invalid local prices and keeps editing/deactivation on the same service', async () => {
    render(<ServiceCatalogPage />);
    await screen.findByRole('heading', { name: 'فهرست خدمات' });
    const priceFields = screen.getAllByLabelText('قیمت فعلی · تومان');
    fireEvent.change(priceFields[1]!, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'قیمت باید یک عدد صحیح مثبت به تومان باشد.',
    );
    expect(api.updateStaffServiceItem).not.toHaveBeenCalled();

    fireEvent.change(priceFields[1]!, { target: { value: '150000' } });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'برای ثبت‌های جدید فعال باشد · صبحانه ایرانی' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    await waitFor(() =>
      expect(api.updateStaffServiceItem).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ currentPriceToman: '150000', isActive: false }),
        'csrf-services',
      ),
    );
  });

  it('keeps catalog editing away from reception and cashier roles', async () => {
    setRole('CASHIER');
    render(<ServiceCatalogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'مدیریت خدمات برای نقش شما فعال نیست.',
    );
    expect(screen.queryByRole('button', { name: 'افزودن خدمت' })).not.toBeInTheDocument();
    expect(api.createStaffServiceItem).not.toHaveBeenCalled();
  });
});
