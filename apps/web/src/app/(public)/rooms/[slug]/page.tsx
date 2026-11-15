import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { getRoomImage } from '@/components/public/room-imagery';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const persianNumber = new Intl.NumberFormat('fa-IR');

export default async function RoomDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, hotel, roomTypes] = await Promise.all([
    params,
    requirePublicHotel(),
    getPublicRoomTypes(),
  ]);
  const room = roomTypes.find((candidate) => candidate.slug === slug);

  if (!room) {
    notFound();
  }

  const image = getRoomImage(room);

  return (
    <PublicSiteFrame hotel={hotel}>
      <article className={styles.page} aria-labelledby="room-detail-heading">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href="/">اقامتگاه</Link>
          <span aria-hidden="true">/</span>
          <Link href="/rooms">اتاق‌ها</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{room.name}</span>
        </nav>

        <div className={styles.layout}>
          <ScrollReveal className={styles.visual}>
            <div className={styles.imageFrame}>
              <Image
                src={image.src}
                alt={image.alt}
                fill
                priority
                sizes="(max-width: 760px) 100vw, 58vw"
                className={styles.image}
              />
            </div>
          </ScrollReveal>

          <ScrollReveal className={styles.copy} delay={100}>
            <h1 id="room-detail-heading">{room.name}</h1>
            <p className={styles.description}>{room.description}</p>

            <div className={styles.capacity}>
              <span className={styles.capacityMark} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" />
                </svg>
              </span>
              <span>
                ظرفیت هر اتاق{' '}
                <strong>حداکثر {persianNumber.format(room.maxGuestsPerRoom)} نفر</strong>
              </span>
            </div>

            {room.amenities.length > 0 ? (
              <section className={styles.amenitiesSection} aria-labelledby="amenities-heading">
                <h2 id="amenities-heading">امکانات این اتاق</h2>
                <ul className={styles.amenities}>
                  {room.amenities.map((amenity) => (
                    <li key={amenity}>
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M8 1.75 9.8 6.2 14.25 8 9.8 9.8 8 14.25 6.2 9.8 1.75 8 6.2 6.2 8 1.75Z" />
                      </svg>
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/#stay-search">
                <span>بررسی تاریخ و ظرفیت</span>
                <span aria-hidden="true">←</span>
              </Link>
              <p>تأیید نهایی درخواست پس از بررسی کارکنان انجام می‌شود.</p>
            </div>
          </ScrollReveal>
        </div>

        <div className={styles.bottomLink}>
          <span>گزینه‌های دیگر را هم ببینید</span>
          <Link href="/rooms">
            بازگشت به همهٔ اتاق‌ها <span aria-hidden="true">←</span>
          </Link>
        </div>
      </article>
    </PublicSiteFrame>
  );
}
