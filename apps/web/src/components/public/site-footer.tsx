import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';
import { HotelLogo } from '@/components/brand/hotel-logo';

export function SiteFooter({ hotel }: { hotel: PublicHotel }) {
  const contactEmail = hotel.contactEmail?.trim() ?? '';
  const hasContactEmail =
    contactEmail.length > 0 && !contactEmail.toLowerCase().endsWith('.invalid');

  return (
    <footer
      className={'bg-primary-strong px-4 py-12 text-primary-foreground sm:px-6 lg:px-10 lg:py-16'}
    >
      <div
        className={
          'mx-auto grid w-full max-w-[84rem] grid-cols-1 gap-x-8 gap-y-8 border-b border-primary-foreground/15 pb-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(12rem,.7fr)_minmax(13rem,.75fr)] lg:gap-12 lg:pb-16'
        }
      >
        <div className={'max-w-xl sm:col-span-2 lg:col-span-1'}>
          <div
            className={
              'mb-3 flex items-center gap-3 [&_h2]:min-w-0 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight sm:[&_h2]:text-3xl'
            }
          >
            <HotelLogo size={48} className={'size-11 shrink-0'} />
            <h2>{hotel.name}</h2>
          </div>
          <p>{hotel.address}</p>
        </div>

        <div
          className={
            'flex flex-col items-start gap-2 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-bold [&_a]:max-w-full [&_a]:break-words [&_a]:text-sm [&_a]:text-primary-foreground/80 [&_a]:underline-offset-4 [&_a:hover]:text-highlight [&_p]:text-sm [&_p]:text-primary-foreground/80'
          }
        >
          <h3>راه‌های تماس</h3>
          {hotel.contactPhone ? (
            <a href={`tel:${hotel.contactPhone}`} dir="ltr">
              {hotel.contactPhone}
            </a>
          ) : null}
          {hasContactEmail ? <a href={`mailto:${hotel.contactEmail}`}>{contactEmail}</a> : null}
          {!hotel.contactPhone && !hasContactEmail ? <p>اطلاعات تماس هنوز ثبت نشده است.</p> : null}
        </div>

        <div
          className={
            'flex flex-col items-start gap-2 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-bold [&_a]:text-sm [&_a]:text-primary-foreground/80 [&_a]:underline-offset-4 [&_a:hover]:text-highlight'
          }
        >
          <h3>برای برنامه‌ریزی اقامت</h3>
          <Link href="/rooms">دیدن اتاق‌ها</Link>
          <Link href="/#stay-search">بررسی ظرفیت و قیمت</Link>
        </div>
      </div>

      <div
        className={
          'mx-auto flex w-full max-w-[84rem] flex-col items-start justify-between gap-3 pt-5 text-xs text-primary-foreground/75 sm:flex-row sm:items-center'
        }
      >
        <span>درخواست اقامت پس از بررسی کارکنان قطعی می‌شود.</span>
        <a href="#top">بازگشت به بالا</a>
      </div>
    </footer>
  );
}
