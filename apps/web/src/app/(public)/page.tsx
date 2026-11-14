import Link from 'next/link';
import { HotelHero } from '@/components/public/hotel-hero';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { RoomCard } from '@/components/public/room-card';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [hotel, roomTypes] = await Promise.all([requirePublicHotel(), getPublicRoomTypes()]);

  return (
    <PublicSiteFrame hotel={hotel}>
      <HotelHero hotel={hotel} />

      <section className="room-section" id="rooms" aria-labelledby="rooms-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">اتاق‌های اقامتگاه</p>
            <h2 id="rooms-heading">جایی برای مکث و آسودن</h2>
          </div>
          <Link className="text-link" href="/rooms">
            دیدن همهٔ اتاق‌ها <span aria-hidden="true">←</span>
          </Link>
        </div>
        {roomTypes.length > 0 ? (
          <div className="room-grid">
            {roomTypes.slice(0, 3).map((room) => (
              <RoomCard key={room.slug} room={room} />
            ))}
          </div>
        ) : (
          <p className="empty-state">در حال حاضر اتاقی برای نمایش آماده نیست.</p>
        )}
      </section>

      <section className="location-strip" aria-labelledby="location-heading">
        <div className="location-strip__symbol" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="eyebrow">نشانی اقامتگاه</p>
          <h2 id="location-heading">در دل شیراز</h2>
          <p>{hotel.address}</p>
        </div>
        <Link className="text-link" href="/rooms">
          انتخاب اتاق <span aria-hidden="true">←</span>
        </Link>
      </section>
    </PublicSiteFrame>
  );
}
