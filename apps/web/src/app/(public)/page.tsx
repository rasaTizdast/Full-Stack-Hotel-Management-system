import Image from 'next/image';
import Link from 'next/link';
import { AvailabilitySearch } from '@/components/search/availability-search';
import { HotelHero } from '@/components/public/hotel-hero';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { RoomCard } from '@/components/public/room-card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { getPublicRoomTypes, type PublicHotel } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';
import { getDefaultStayInput } from '@/lib/jalali-date';

export const dynamic = 'force-dynamic';

function LocationSection({ hotel }: { hotel: PublicHotel }) {
  return (
    <section
      className={
        'mx-auto mb-16 grid min-h-96 w-[min(100%-2rem,84rem)] grid-cols-1 overflow-hidden rounded-3xl bg-surface-soft lg:mb-24 lg:grid-cols-2'
      }
      id="location"
      aria-labelledby="location-heading"
    >
      <div className={'relative isolate min-h-72 bg-primary-strong sm:min-h-96'}>
        <ScrollReveal className={'absolute inset-0'}>
          <Image
            src="/images/hotel/courtyard-detail.webp"
            alt="تصویرسازی مفهومی از حیاطی با حوض سنگی، درخت نارنج و طاق کاشی‌کاری‌شده"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            className={'z-0 object-cover'}
          />
        </ScrollReveal>
      </div>
      <ScrollReveal
        className={'flex flex-col items-start justify-center p-7 sm:p-10 lg:p-14'}
        delay={100}
      >
        <h2 id="location-heading">در شیراز، جایی برای مکث</h2>
        <p className={'mb-2 font-semibold text-foreground'}>{hotel.address}</p>
        <p className={'mb-5 max-w-[36ch] leading-8 text-muted-foreground'}>
          پیش از ثبت درخواست، اتاق‌ها و ظرفیت تاریخ دلخواهتان را بررسی کنید.
        </p>
        <Link
          className={
            'mt-1 inline-flex min-h-12 items-center font-bold text-primary-strong no-underline underline-offset-4 hover:underline'
          }
          href="/#stay-search"
        >
          رفتن به جستجوی اقامت
        </Link>
      </ScrollReveal>
    </section>
  );
}

export default async function HomePage() {
  const [hotel, roomTypes] = await Promise.all([requirePublicHotel(), getPublicRoomTypes()]);

  return (
    <PublicSiteFrame hotel={hotel}>
      <HotelHero hotel={hotel} />

      <AvailabilitySearch roomTypes={roomTypes} initialStay={getDefaultStayInput()} />

      <section
        className={'mx-auto w-[min(100%-2rem,84rem)] py-16 sm:py-20 lg:py-24'}
        id="rooms"
        aria-labelledby="rooms-heading"
      >
        <div
          className={
            'mb-8 flex flex-col items-start justify-between gap-4 sm:mb-12 sm:flex-row sm:items-end sm:gap-8'
          }
        >
          <ScrollReveal>
            <h2 id="rooms-heading">اتاق‌های اقامتگاه</h2>
          </ScrollReveal>
          <ScrollReveal delay={90}>
            <Link
              className={
                'inline-flex min-h-12 shrink-0 items-center font-bold text-primary-strong no-underline'
              }
              href="/rooms"
            >
              دیدن همهٔ اتاق‌ها
            </Link>
          </ScrollReveal>
        </div>
        {roomTypes.length > 0 ? (
          <div className={'grid gap-5 sm:gap-8'}>
            {roomTypes.slice(0, 3).map((room, index) => (
              <ScrollReveal key={room.slug} delay={index * 90}>
                <RoomCard room={room} headingLevel="h3" />
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className={'rounded-3xl border border-border bg-surface p-8 sm:p-12'}>
            <h3>اتاقی برای نمایش آماده نیست</h3>
            <p>لطفاً کمی بعد دوباره سر بزنید.</p>
          </div>
        )}
      </section>

      <LocationSection hotel={hotel} />
    </PublicSiteFrame>
  );
}
