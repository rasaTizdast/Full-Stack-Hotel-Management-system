import Link from 'next/link';
import { BookingFlow } from '@/components/booking/booking-flow';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import {
  getPublicAvailability,
  getPublicHotel,
  getPublicRoomTypes,
  PublicApiError,
} from '@/lib/public-api';
import type { AvailabilityResult } from '@/lib/availability';
import { formatGregorianAsJalali } from '@/lib/jalali-date';

export const dynamic = 'force-dynamic';

type BookingSearchParams = Record<string, string | string[] | undefined>;

function singleValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function parseBookingQuery(params: BookingSearchParams) {
  const roomType = singleValue(params.roomType);
  const checkIn = singleValue(params.checkIn);
  const checkOut = singleValue(params.checkOut);
  const guestText = singleValue(params.guestCount);
  if (
    !roomType ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(roomType) ||
    !checkIn ||
    !formatGregorianAsJalali(checkIn) ||
    !checkOut ||
    !formatGregorianAsJalali(checkOut) ||
    !guestText ||
    !/^\d{1,2}$/.test(guestText)
  )
    return null;
  const guestCount = Number(guestText);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20 || checkOut <= checkIn) {
    return null;
  }
  return { roomType, checkIn, checkOut, guestCount };
}

function BookingMessage({ kind }: { kind: 'invalid' | 'unavailable' | 'server-error' }) {
  const content = {
    invalid: {
      title: 'اطلاعات اقامت کامل نیست',
      body: 'برای ثبت درخواست، ابتدا تاریخ اقامت و تعداد مهمان‌ها را در جستجوی اتاق مشخص کنید.',
    },
    unavailable: {
      title: 'این انتخاب دیگر در دسترس نیست',
      body: 'ظرفیت یا شرایط این اتاق تغییر کرده است. جستجو را دوباره انجام دهید تا گزینه‌های به‌روز را ببینید.',
    },
    'server-error': {
      title: 'بررسی اتاق فعلاً ممکن نیست',
      body: 'سرویس رزرو موقتاً پاسخ نمی‌دهد. کمی بعد دوباره جستجو کنید.',
    },
  }[kind];

  return (
    <section className="empty-panel" aria-labelledby="booking-message-title" role="status">
      <p className="eyebrow">درخواست اقامت</p>
      <h1 id="booking-message-title">{content.title}</h1>
      <p>{content.body}</p>
      <Link className="text-link" href="/#stay-search">
        جستجوی دوباره <span aria-hidden="true">←</span>
      </Link>
    </section>
  );
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<BookingSearchParams>;
}) {
  const query = parseBookingQuery(await searchParams);
  const [hotel, rooms] = await Promise.all([getPublicHotel(), getPublicRoomTypes()]);

  if (!query) {
    return (
      <PublicSiteFrame hotel={hotel}>
        <BookingMessage kind="invalid" />
      </PublicSiteFrame>
    );
  }

  const room = rooms.find((candidate) => candidate.slug === query.roomType);
  if (!room) {
    return (
      <PublicSiteFrame hotel={hotel}>
        <BookingMessage kind="unavailable" />
      </PublicSiteFrame>
    );
  }

  let availability: AvailabilityResult | null = null;
  let availabilityFailure: 'unavailable' | 'server-error' | null = null;
  try {
    availability = await getPublicAvailability({
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guestCount,
    });
  } catch (error) {
    availabilityFailure =
      error instanceof PublicApiError && error.kind === 'unavailable'
        ? 'server-error'
        : 'unavailable';
  }

  if (availabilityFailure) {
    return (
      <PublicSiteFrame hotel={hotel}>
        <BookingMessage kind={availabilityFailure} />
      </PublicSiteFrame>
    );
  }
  const roomAvailability = availability?.roomTypes.find(
    (candidate) => candidate.slug === room.slug,
  );
  if (
    !roomAvailability?.isAvailable ||
    roomAvailability.availableRooms < 1 ||
    !roomAvailability.totalPriceToman
  ) {
    return (
      <PublicSiteFrame hotel={hotel}>
        <BookingMessage kind="unavailable" />
      </PublicSiteFrame>
    );
  }
  return (
    <PublicSiteFrame hotel={hotel}>
      <BookingFlow room={room} context={query} roomAvailability={roomAvailability} />
    </PublicSiteFrame>
  );
}
