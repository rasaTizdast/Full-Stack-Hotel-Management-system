import Image from 'next/image';
import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';

type HotelHeroProps = {
  hotel: PublicHotel;
};

export function HotelHero({ hotel }: HotelHeroProps) {
  return (
    <section
      className={
        'mx-auto grid min-h-0 w-[min(100%-2rem,84rem)] grid-cols-1 items-center gap-8 py-12 sm:py-16 md:min-h-[min(48rem,calc(100svh-7rem))] md:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)] md:gap-10 md:py-20'
      }
      aria-labelledby="hero-title"
    >
      <div className={'relative z-10 max-w-2xl md:ps-6'}>
        <h1
          id="hero-title"
          className="mb-5 max-w-[14ch] text-5xl font-bold leading-tight tracking-tight text-primary-strong sm:text-6xl lg:text-7xl"
        >
          <span className={'block overflow-hidden pb-[.14em] mb-[-.14em]'}>
            <span className={'block'}>{hotel.name}</span>
          </span>
        </h1>
        <p
          className={'mb-6 max-w-[42ch] text-lg leading-9 text-muted-foreground sm:mb-8 sm:text-xl'}
        >
          {hotel.description}
        </p>
        <div className={'flex flex-wrap items-center gap-4 sm:gap-8'}>
          <Link
            className={
              'inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground no-underline transition-transform hover:-translate-y-0.5 hover:bg-primary-strong focus-visible:outline-3 focus-visible:outline-ring'
            }
            href="/#stay-search"
          >
            بررسی ظرفیت اقامت
          </Link>
          <Link
            className={
              'font-bold text-foreground decoration-highlight decoration-2 underline-offset-8 transition-colors hover:text-accent-brand'
            }
            href="/rooms"
          >
            دیدن اتاق‌ها
          </Link>
        </div>
        <div className={'mt-8 grid gap-1 border-s-1 border-highlight ps-4 md:mt-16'}>
          <span className={'text-xs text-muted-foreground'}>نشانی اقامتگاه</span>
          <address>{hotel.address}</address>
        </div>
      </div>

      <div className={'relative p-2 pb-4 ps-4'}>
        <div
          className={
            'relative isolate min-h-[min(112vw,36rem)] overflow-hidden rounded-t-[48%] rounded-b-3xl bg-surface-soft md:min-h-[clamp(28rem,50vw,43rem)] md:rounded-b-[2rem]'
          }
        >
          <Image
            src="/images/hotel/courtyard-hero.webp"
            alt="تصویرسازی مفهومی از اقامتگاهی سنتی با حیاطی سرسبز، حوض و طاق‌های کاشی‌کاری‌شده"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 56vw"
            className={'z-0 object-cover object-center'}
          />
          <p
            className={
              'absolute inset-x-5 bottom-6 z-10 m-0 flex items-end justify-between gap-4 text-sm text-primary-foreground sm:inset-x-8 sm:bottom-8'
            }
          >
            <span>تصویرسازی مفهومی از حیاطی در شیراز</span>
          </p>
        </div>
      </div>
    </section>
  );
}
