import Link from 'next/link';
import type { PublicRoomType } from '@/lib/public-api';

type RoomCardProps = {
  room: PublicRoomType;
};

const persianNumber = new Intl.NumberFormat('fa-IR');

export function RoomCard({ room }: RoomCardProps) {
  return (
    <article className="room-card" aria-labelledby={`room-${room.slug}`}>
      <div className="room-card__mark" aria-hidden="true">
        <span className="room-card__mark-ring" />
        <span className="room-card__mark-core" />
      </div>
      <div className="room-card__body">
        <div className="room-card__heading">
          <h2 id={`room-${room.slug}`}>{room.name}</h2>
          <span className="room-card__capacity">
            <span aria-hidden="true">♧</span>
            حداکثر {persianNumber.format(room.maxGuestsPerRoom)} نفر
          </span>
        </div>
        <p>{room.description}</p>
        <ul className="amenity-list" aria-label={`امکانات ${room.name}`}>
          {room.amenities.map((amenity) => (
            <li key={amenity}>{amenity}</li>
          ))}
        </ul>
        <Link className="room-card__link" href={`/rooms/${encodeURIComponent(room.slug)}`}>
          <span>جزئیات {room.name}</span>
          <span aria-hidden="true">←</span>
        </Link>
      </div>
    </article>
  );
}
