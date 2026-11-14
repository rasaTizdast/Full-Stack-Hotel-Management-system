import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';

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

  return (
    <PublicSiteFrame hotel={hotel}>
      <article className="room-detail" aria-labelledby="room-detail-heading">
        <Link className="back-link" href="/rooms">
          <span aria-hidden="true">→</span> بازگشت به اتاق‌ها
        </Link>
        <div className="room-detail__art" aria-hidden="true">
          <span className="room-detail__sun" />
          <span className="room-detail__arch" />
          <span className="room-detail__tile" />
        </div>
        <div className="room-detail__copy">
          <p className="eyebrow">جزئیات اتاق</p>
          <h1 id="room-detail-heading">{room.name}</h1>
          <p className="room-detail__description">{room.description}</p>
          <p className="room-detail__capacity">
            ظرفیت هر اتاق: حداکثر {persianNumber.format(room.maxGuestsPerRoom)} نفر
          </p>
          {room.amenities.length > 0 ? (
            <section className="room-detail__amenities" aria-labelledby="amenities-heading">
              <h2 id="amenities-heading">امکانات اتاق</h2>
              <ul className="amenity-list">
                {room.amenities.map((amenity) => (
                  <li key={amenity}>{amenity}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <Link className="button button--jade" href="/rooms">
            بازگشت به فهرست اتاق‌ها <span aria-hidden="true">←</span>
          </Link>
        </div>
      </article>
    </PublicSiteFrame>
  );
}
