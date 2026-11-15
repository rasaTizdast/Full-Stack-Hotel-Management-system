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
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function LocationSection({ hotel }: { hotel: PublicHotel }) {
  return (
    <section className={styles.location} id="location" aria-labelledby="location-heading">
      <div className={styles.locationPhoto}>
        <ScrollReveal className={styles.locationImageReveal}>
          <Image
            src="/images/hotel/courtyard-detail.webp"
            alt="تصویرسازی مفهومی از حیاطی با حوض سنگی، درخت نارنج و طاق کاشی‌کاری‌شده"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            className={styles.locationImage}
          />
        </ScrollReveal>
      </div>
      <ScrollReveal className={styles.locationCopy} delay={100}>
        <h2 id="location-heading">در شیراز، جایی برای مکث</h2>
        <p className={styles.address}>{hotel.address}</p>
        <p className={styles.locationNote}>
          پیش از ثبت درخواست، اتاق‌ها و ظرفیت تاریخ دلخواهتان را بررسی کنید.
        </p>
        <Link className={styles.locationLink} href="/#stay-search">
          <span>رفتن به جستجوی اقامت</span>
          <span aria-hidden="true">←</span>
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

      <section className={styles.roomsSection} id="rooms" aria-labelledby="rooms-heading">
        <div className={styles.sectionHeading}>
          <ScrollReveal>
            <h2 id="rooms-heading">جایی برای مکث و آسودن</h2>
          </ScrollReveal>
          <ScrollReveal delay={90}>
            <Link className={styles.allRoomsLink} href="/rooms">
              <span>دیدن همهٔ اتاق‌ها</span>
              <span aria-hidden="true">←</span>
            </Link>
          </ScrollReveal>
        </div>
        {roomTypes.length > 0 ? (
          <div className={styles.roomList}>
            {roomTypes.slice(0, 3).map((room, index) => (
              <ScrollReveal key={room.slug} delay={index * 90}>
                <RoomCard room={room} headingLevel="h3" />
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>اتاقی برای نمایش آماده نیست</h3>
            <p>لطفاً کمی بعد دوباره سر بزنید.</p>
          </div>
        )}
      </section>

      <LocationSection hotel={hotel} />
    </PublicSiteFrame>
  );
}
