import Image from 'next/image';
import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';
import styles from './hotel-hero.module.css';

type HotelHeroProps = {
  hotel: PublicHotel;
};

export function HotelHero({ hotel }: HotelHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title">
          <span className={styles.titleMask}>
            <span className={styles.titleText}>{hotel.name}</span>
          </span>
        </h1>
        <p className={styles.description}>{hotel.description}</p>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/#stay-search">
            بررسی ظرفیت اقامت
          </Link>
          <Link className={styles.secondaryAction} href="/rooms">
            دیدن اتاق‌ها
          </Link>
        </div>
        <div className={styles.address}>
          <span className={styles.addressLabel}>نشانی اقامتگاه</span>
          <address>{hotel.address}</address>
        </div>
      </div>

      <div className={styles.visual}>
        <div className={styles.imageFrame}>
          <Image
            src="/images/hotel/courtyard-hero.webp"
            alt="تصویرسازی مفهومی از اقامتگاهی سنتی با حیاطی سرسبز، حوض و طاق‌های کاشی‌کاری‌شده"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 56vw"
            className={styles.image}
          />
          <p className={styles.imageCaption}>
            <span>تصویرسازی مفهومی از حیاطی در شیراز</span>
          </p>
        </div>
      </div>
    </section>
  );
}
