import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HotelHero } from './hotel-hero';

describe('HotelHero', () => {
  it('uses the API-provided hotel name and description as the page heading', () => {
    render(
      <HotelHero
        hotel={{
          slug: 'shiraz-garden-house',
          name: 'خانه‌باغ نارنج؛ هتل نمایشی',
          address: 'شیراز، نشانی نمایشی شماره ۱',
          description: 'اقامتگاهی خیالی برای آزمون سامانه رزرو.',
          timezone: 'Asia/Tehran',
          contactPhone: null,
          contactEmail: 'hello@example.invalid',
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'خانه‌باغ نارنج؛ هتل نمایشی' }),
    ).toBeVisible();
    expect(screen.getByText('اقامتگاهی خیالی برای آزمون سامانه رزرو.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'دیدن اتاق‌ها' })).toHaveAttribute('href', '/rooms');
  });
});
