import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoomCard } from './room-card';

describe('RoomCard', () => {
  it('shows public room details and links to that room without internal identifiers', () => {
    render(
      <RoomCard
        room={{
          slug: 'garden-double',
          name: 'اتاق دوتخته باغ',
          description: 'اتاقی برای دو نفر.',
          maxGuestsPerRoom: 2,
          amenities: ['وای‌فای', 'صبحانه'],
        }}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'اتاق دوتخته باغ' })).toBeVisible();
    expect(screen.getByText('حداکثر ۲ نفر')).toBeVisible();
    expect(screen.getByText('وای‌فای')).toBeVisible();
    expect(screen.getByRole('link', { name: 'جزئیات اتاق دوتخته باغ' })).toHaveAttribute(
      'href',
      '/rooms/garden-double',
    );
    expect(screen.queryByText(/internal|guest|inventory/i)).not.toBeInTheDocument();
  });
});
