import Image from 'next/image';
import Link from 'next/link';
import type { PublicRoomType } from '@/lib/public-api';
import { getRoomImage } from './room-imagery';

type RoomCardProps = {
  room: PublicRoomType;
  headingLevel?: 'h2' | 'h3';
};

const persianNumber = new Intl.NumberFormat('fa-IR');

export function RoomCard({ room, headingLevel = 'h2' }: RoomCardProps) {
  const Heading = headingLevel;
  const image = getRoomImage(room);

  return (
    <article
      className={
        'grid min-w-0 grid-cols-1 gap-0 overflow-hidden rounded-3xl border border-border bg-surface p-2 transition-colors duration-200 hover:border-primary/30 md:grid-cols-[minmax(0,1.08fr)_minmax(17rem,.92fr)] md:gap-8'
      }
      aria-labelledby={`room-${room.slug}`}
    >
      <Link
        className={'block min-w-0 text-inherit no-underline'}
        href={`/rooms/${encodeURIComponent(room.slug)}`}
        aria-label={`مشاهدهٔ جزئیات ${room.name}`}
      >
        <div
          className={
            'relative aspect-[1.35] min-h-52 overflow-hidden rounded-2xl bg-surface-soft md:aspect-auto md:min-h-80'
          }
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 760px) 100vw, (max-width: 1100px) 48vw, 40vw"
            className={'object-cover'}
          />
        </div>
      </Link>

      <div className={'flex min-w-0 flex-col items-start justify-center p-4 sm:p-6 md:p-8'}>
        <div className={'flex w-full items-start justify-between gap-4 max-[420px]:flex-col'}>
          <div>
            <Heading
              id={`room-${room.slug}`}
              className={'text-2xl font-bold leading-snug text-primary-strong sm:text-3xl'}
            >
              {room.name}
            </Heading>
          </div>
          <span
            className={
              'inline-flex shrink-0 items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-bold text-primary-strong [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-1'
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" />
            </svg>
            <span>حداکثر {persianNumber.format(room.maxGuestsPerRoom)} نفر</span>
          </span>
        </div>

        <p
          className={
            'my-4 max-w-[52ch] text-sm leading-8 text-muted-foreground sm:my-5 sm:text-base'
          }
        >
          {room.description}
        </p>

        {room.amenities.length > 0 ? (
          <ul
            className={
              'mb-5 flex flex-wrap gap-2 [&_li]:rounded-full [&_li]:border [&_li]:border-border [&_li]:px-3 [&_li]:py-1 [&_li]:text-xs [&_li]:leading-6 [&_li]:text-foreground'
            }
            aria-label={`امکانات ${room.name}`}
          >
            {room.amenities.slice(0, 4).map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        ) : null}

        <Link
          className={
            'mt-auto inline-flex min-h-11 items-center font-bold text-primary-strong no-underline underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-ring'
          }
          href={`/rooms/${encodeURIComponent(room.slug)}`}
        >
          جزئیات {room.name}
        </Link>
      </div>
    </article>
  );
}
