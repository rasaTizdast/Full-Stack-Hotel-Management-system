import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { lookupStaffFolio } from '@/lib/staff-folios-api';
import { StaffFolioLookupPage } from './staff-folio-lookup-page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/staff-folios-api', () => ({ lookupStaffFolio: vi.fn() }));

describe('StaffFolioLookupPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches an exact reference and shows a minimal cashier summary', async () => {
    vi.mocked(lookupStaffFolio).mockResolvedValue({
      bookingId: 'fictional-booking-id',
      reference: 'TEST-REF-001',
      guestName: 'مهمان آزمایشی',
      checkIn: '2026-11-24',
      checkOut: '2026-11-26',
      folioStatus: 'OPEN',
      balanceToman: '125000',
    });
    render(<StaffFolioLookupPage />);

    fireEvent.change(screen.getByLabelText('کد رزرو'), { target: { value: 'TEST-REF-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی صورتحساب' }));

    await waitFor(() => expect(lookupStaffFolio).toHaveBeenCalledWith('TEST-REF-001'));
    expect(await screen.findByText('مهمان آزمایشی')).toBeVisible();
    expect(screen.getByText('TEST-REF-001')).toBeVisible();
    expect(screen.getByText('125,000 تومان')).toBeVisible();
    expect(screen.getByRole('link', { name: 'باز کردن صورتحساب' })).toHaveAttribute(
      'href',
      '/staff/folios/fictional-booking-id',
    );
    expect(screen.queryByText(/\+98|@/)).not.toBeInTheDocument();
  });

  it('shows a generic not-found message', async () => {
    vi.mocked(lookupStaffFolio).mockRejectedValue(new Error('booking not found'));
    render(<StaffFolioLookupPage />);

    fireEvent.change(screen.getByLabelText('کد رزرو'), { target: { value: 'UNKNOWN-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'جستجوی صورتحساب' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'صورتحساب فعالی با این کد پیدا نشد.',
    );
  });
});
