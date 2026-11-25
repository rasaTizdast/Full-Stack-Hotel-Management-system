import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';
import { HotelLogo } from '@/components/brand/hotel-logo';
import { ButtonLink } from '@/components/ui/button-link';

export function SiteHeader({ hotel }: { hotel: PublicHotel }) {
  return (
    <header className={'relative z-10 px-4 pt-4 sm:px-6 lg:px-10'} id="top">
      <div
        className={
          'mx-auto grid min-h-20 w-full max-w-[84rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl bg-surface px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] md:gap-6 md:rounded-full md:px-6'
        }
      >
        <Link
          className={
            'inline-flex min-w-0 items-center gap-3 justify-self-start text-primary-strong no-underline'
          }
          href="/"
          aria-label={`صفحهٔ اصلی ${hotel.name}`}
        >
          <HotelLogo size={48} className={'size-11 shrink-0 object-contain'} />
          <span className={'grid min-w-0 leading-snug'}>
            <span className={'max-w-[22ch] truncate text-base font-bold'}>{hotel.name}</span>
            <span className={'text-xs text-muted-foreground'}>اقامت در شیراز</span>
          </span>
        </Link>

        <nav
          className={
            'col-span-2 row-start-2 flex min-w-0 items-center justify-start gap-5 overflow-x-auto py-1 md:col-span-1 md:col-start-2 md:row-start-1 md:justify-center md:gap-8 [&_a]:shrink-0 [&_a]:text-sm [&_a]:font-semibold [&_a]:text-muted-foreground [&_a]:no-underline [&_a]:transition-colors [&_a:hover]:text-primary-strong [&_a:hover]:underline [&_a:hover]:decoration-highlight [&_a:hover]:underline-offset-4'
          }
          aria-label="ناوبری اصلی"
        >
          <Link href="/">اقامتگاه</Link>
          <Link href="/rooms">اتاق‌ها</Link>
          <Link href="/#location">نشانی و تماس</Link>
        </nav>

        <ButtonLink
          className="col-start-2 row-start-1 justify-self-end px-4 md:col-start-3"
          href="/#stay-search"
          size="default"
          variant="secondary"
        >
          جستجوی اقامت
        </ButtonLink>
      </div>
    </header>
  );
}
