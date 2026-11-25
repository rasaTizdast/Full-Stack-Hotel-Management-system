import Image from 'next/image';
import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { RoomCard } from '@/components/public/room-card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const [hotel, roomTypes] = await Promise.all([requirePublicHotel(), getPublicRoomTypes()]);

  return (
    <PublicSiteFrame hotel={hotel}>
      <section
        className={'mx-auto w-[min(100%-2rem,84rem)] py-10 pb-20 sm:py-16'}
        aria-labelledby="rooms-page-heading"
      >
        <div
          className={
            'mb-14 grid grid-cols-1 items-center gap-8 md:mb-24 md:grid-cols-[minmax(0,.88fr)_minmax(20rem,1.12fr)] md:gap-10'
          }
        >
          <ScrollReveal
            className={
              'max-w-2xl [&_h1]:mb-4 [&_h1]:max-w-[12ch] [&_h1]:text-5xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-primary-strong sm:[&_h1]:text-6xl [&_p]:mb-5 [&_p]:max-w-prose [&_p]:leading-8 [&_p]:text-muted-foreground'
            }
          >
            <h1 id="rooms-page-heading">اتاق‌ها و سوئیت‌ها</h1>
            <p>
              توضیحات و امکانات هر اتاق را ببینید؛ سپس برای تاریخ و تعداد مهمان‌ها، ظرفیت را بررسی
              کنید.
            </p>
            <Link
              className={
                'inline-flex min-h-12 items-center font-bold text-primary-strong no-underline'
              }
              href="/#stay-search"
            >
              بررسی ظرفیت اقامت
            </Link>
          </ScrollReveal>
          <ScrollReveal
            className={
              'relative min-h-[min(82vw,30rem)] overflow-hidden rounded-t-[48%] rounded-b-3xl bg-surface-soft md:min-h-[clamp(21rem,40vw,34rem)]'
            }
            delay={110}
          >
            <Image
              src="/images/hotel/courtyard-detail.webp"
              alt="تصویرسازی مفهومی از حیاط اقامتگاه در شیراز"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 42vw"
              className={'object-cover'}
            />
          </ScrollReveal>
        </div>

        <ScrollReveal
          className={
            'mb-6 flex flex-col items-start justify-between gap-2 sm:mb-8 sm:flex-row sm:items-baseline [&_p]:text-xl [&_p]:font-bold [&_p]:text-primary-strong [&_span]:text-sm [&_span]:text-muted-foreground'
          }
        >
          <p>فهرست اتاق‌ها</p>
          <span>{roomTypes.length.toLocaleString('fa-IR')} نوع اتاق</span>
        </ScrollReveal>

        {roomTypes.length > 0 ? (
          <div className={'grid gap-5 sm:gap-8'}>
            {roomTypes.map((room, index) => (
              <ScrollReveal key={room.slug} delay={index * 80}>
                <RoomCard room={room} />
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div
            className={
              'rounded-3xl border border-border bg-surface p-8 sm:p-12 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-primary-strong [&_p]:text-muted-foreground'
            }
          >
            <h2>اتاقی برای نمایش آماده نیست</h2>
            <p>لطفاً کمی بعد دوباره سر بزنید.</p>
            <Link
              href="/"
              className={
                'inline-flex min-h-12 items-center font-bold text-primary-strong no-underline'
              }
            >
              بازگشت به صفحهٔ اصلی
            </Link>
          </div>
        )}
      </section>
    </PublicSiteFrame>
  );
}
