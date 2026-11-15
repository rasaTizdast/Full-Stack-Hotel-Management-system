import Image from 'next/image';
import Link from 'next/link';
import type { PublicRoomType } from '@/lib/public-api';
import { getRoomImage } from './room-imagery';
import styles from './room-card.module.css';

type RoomCardProps = {
  room: PublicRoomType;
  headingLevel?: 'h2' | 'h3';
};

const persianNumber = new Intl.NumberFormat('fa-IR');

export function RoomCard({ room, headingLevel = 'h2' }: RoomCardProps) {
  const Heading = headingLevel;
  const image = getRoomImage(room);

  return (
    <article className={styles.card} aria-labelledby={`room-${room.slug}`}>
      <Link
        className={styles.imageLink}
        href={`/rooms/${encodeURIComponent(room.slug)}`}
        aria-label={`مشاهدهٔ جزئیات ${room.name}`}
      >
        <div className={styles.imageFrame}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 760px) 100vw, (max-width: 1100px) 48vw, 40vw"
            className={styles.image}
          />
        </div>
      </Link>

      <div className={styles.body}>
        <div className={styles.headingRow}>
          <div>
            <Heading id={`room-${room.slug}`} className={styles.title}>
              {room.name}
            </Heading>
          </div>
          <span className={styles.capacity}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" />
            </svg>
            <span>حداکثر {persianNumber.format(room.maxGuestsPerRoom)} نفر</span>
          </span>
        </div>

        <p className={styles.description}>{room.description}</p>

        {room.amenities.length > 0 ? (
          <ul className={styles.amenities} aria-label={`امکانات ${room.name}`}>
            {room.amenities.slice(0, 4).map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        ) : null}

        <Link className={styles.link} href={`/rooms/${encodeURIComponent(room.slug)}`}>
          <span>جزئیات {room.name}</span>
          <span className={styles.linkIcon} aria-hidden="true">
            ←
          </span>
        </Link>
      </div>
    </article>
  );
}
