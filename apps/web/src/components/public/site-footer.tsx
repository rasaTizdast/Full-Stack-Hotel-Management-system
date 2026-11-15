import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';
import { HotelLogo } from '@/components/brand/hotel-logo';
import styles from './site-footer.module.css';

export function SiteFooter({ hotel }: { hotel: PublicHotel }) {
  const contactEmail = hotel.contactEmail?.trim() ?? '';
  const hasContactEmail =
    contactEmail.length > 0 && !contactEmail.toLowerCase().endsWith('.invalid');

  return (
    <footer className={styles.footer}>
      <div className={styles.main}>
        <div className={styles.identity}>
          <div className={styles.identityHeading}>
            <HotelLogo size={48} className={styles.identityMark} />
            <h2>{hotel.name}</h2>
          </div>
          <p>{hotel.address}</p>
        </div>

        <div className={styles.contact}>
          <h3>راه‌های تماس</h3>
          {hotel.contactPhone ? (
            <a href={`tel:${hotel.contactPhone}`} dir="ltr">
              {hotel.contactPhone}
            </a>
          ) : null}
          {hasContactEmail ? (
            <a href={`mailto:${hotel.contactEmail}`}>{contactEmail}</a>
          ) : null}
          {!hotel.contactPhone && !hasContactEmail ? (
            <p>اطلاعات تماس هنوز ثبت نشده است.</p>
          ) : null}
        </div>

        <div className={styles.links}>
          <h3>برای برنامه‌ریزی اقامت</h3>
          <Link href="/rooms">دیدن اتاق‌ها</Link>
          <Link href="/#stay-search">بررسی ظرفیت و قیمت</Link>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>درخواست اقامت پس از بررسی کارکنان قطعی می‌شود.</span>
        <a href="#top">
          بازگشت به بالا
        </a>
      </div>
    </footer>
  );
}
