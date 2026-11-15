import type { PublicRoomType } from '@/lib/public-api';

export type RoomImage = {
  src: string;
  alt: string;
};

export function getRoomImage(room: Pick<PublicRoomType, 'slug'>): RoomImage {
  if (room.slug.includes('family') || room.slug.includes('suite')) {
    return {
      src: '/images/hotel/family-suite.webp',
      alt: 'تصویرسازی مفهومی از فضای نشیمن سوئیتی با پنجره‌های رو به باغ و اتاق خواب',
    };
  }

  if (room.slug.includes('double') || room.slug.includes('garden')) {
    return {
      src: '/images/hotel/garden-double.webp',
      alt: 'تصویرسازی مفهومی از اتاقی دو تخته با پنجره‌های چوبی رو به باغ',
    };
  }

  return {
    src: '/images/hotel/courtyard-detail.webp',
    alt: 'تصویرسازی مفهومی از حیاطی با حوض سنگی، درخت نارنج و طاق کاشی‌کاری‌شده',
  };
}
