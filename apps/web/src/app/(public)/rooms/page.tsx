import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { RoomCard } from '@/components/public/room-card';
import { getPublicRoomTypes } from '@/lib/public-api';
import { requirePublicHotel } from '@/lib/public-page-data';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const [hotel, roomTypes] = await Promise.all([requirePublicHotel(), getPublicRoomTypes()]);

  return (
    <PublicSiteFrame hotel={hotel}>
      <section className="rooms-page" aria-labelledby="rooms-page-heading">
        <div className="rooms-page__intro">
          <p className="eyebrow">خانهٔ شما در شیراز</p>
          <h1 id="rooms-page-heading">اتاق‌ها و سوئیت‌ها</h1>
          <p>هر اتاق با حال‌وهوای خودش؛ جزئیات را ببینید و برای انتخاب آگاهانه‌تر آماده شوید.</p>
        </div>
        {roomTypes.length > 0 ? (
          <div className="room-grid room-grid--all">
            {roomTypes.map((room) => (
              <RoomCard key={room.slug} room={room} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>اتاقی برای نمایش آماده نیست</h2>
            <p>لطفاً کمی بعد دوباره سر بزنید.</p>
            <Link className="text-link" href="/">
              بازگشت به صفحهٔ اصلی <span aria-hidden="true">←</span>
            </Link>
          </div>
        )}
      </section>
    </PublicSiteFrame>
  );
}
