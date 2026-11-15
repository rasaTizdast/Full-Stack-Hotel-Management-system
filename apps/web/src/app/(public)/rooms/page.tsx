import Image from 'next/image';
import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { RoomCard } from '@/components/public/room-card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';
import styles from './rooms-page.module.css';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const [hotel, roomTypes] = await Promise.all([requirePublicHotel(), getPublicRoomTypes()]);

  return (
    <PublicSiteFrame hotel={hotel}>
      <section className={styles.page} aria-labelledby="rooms-page-heading">
        <div className={styles.intro}>
          <ScrollReveal className={styles.introCopy}>
            <h1 id="rooms-page-heading">اتاق‌ها و سوئیت‌ها</h1>
            <p>
              توضیحات و امکانات هر اتاق را ببینید؛ سپس برای تاریخ و تعداد مهمان‌ها، ظرفیت را بررسی
              کنید.
            </p>
            <Link className={styles.searchLink} href="/#stay-search">
              بررسی ظرفیت اقامت
            </Link>
          </ScrollReveal>
          <ScrollReveal className={styles.introImage} delay={110}>
            <Image
              src="/images/hotel/courtyard-detail.webp"
              alt="تصویرسازی مفهومی از حیاط اقامتگاه در شیراز"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 42vw"
              className={styles.image}
            />
          </ScrollReveal>
        </div>

        <ScrollReveal className={styles.listHeading}>
          <p>فهرست اتاق‌ها</p>
          <span>{roomTypes.length.toLocaleString('fa-IR')} نوع اتاق</span>
        </ScrollReveal>

        {roomTypes.length > 0 ? (
          <div className={styles.roomList}>
            {roomTypes.map((room, index) => (
              <ScrollReveal key={room.slug} delay={index * 80}>
                <RoomCard room={room} />
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className={styles.emptyPanel}>
            <h2>اتاقی برای نمایش آماده نیست</h2>
            <p>لطفاً کمی بعد دوباره سر بزنید.</p>
            <Link href="/" className={styles.backLink}>
              بازگشت به صفحهٔ اصلی
            </Link>
          </div>
        )}
      </section>
    </PublicSiteFrame>
  );
}
