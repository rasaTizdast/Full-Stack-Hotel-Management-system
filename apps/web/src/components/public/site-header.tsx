import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';
import { HotelLogo } from '@/components/brand/hotel-logo';
import styles from './site-header.module.css';

export function SiteHeader({ hotel }: { hotel: PublicHotel }) {
  return (
    <header className={styles.header} id="top">
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label={`صفحهٔ اصلی ${hotel.name}`}>
          <HotelLogo size={48} className={styles.brandMark} />
          <span className={styles.brandText}>
            <span className={styles.brandName}>{hotel.name}</span>
            <span className={styles.brandSubline}>اقامت در شیراز</span>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="ناوبری اصلی">
          <Link href="/">اقامتگاه</Link>
          <Link href="/rooms">اتاق‌ها</Link>
          <Link href="/#location">نشانی و تماس</Link>
        </nav>

        <Link className={styles.cta} href="/#stay-search">
          <span>جستجوی اقامت</span>
          <span aria-hidden="true">←</span>
        </Link>
      </div>
    </header>
  );
}
