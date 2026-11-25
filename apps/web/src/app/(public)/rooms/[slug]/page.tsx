import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/public-site-frame';
import { getRoomImage } from '@/components/public/room-imagery';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
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

  const image = getRoomImage(room);

  return (
    <PublicSiteFrame hotel={hotel}>
      <article
        className={'mx-auto w-[min(100%-2rem,84rem)] py-7 pb-20 sm:py-10'}
        aria-labelledby="room-detail-heading"
      >
        <nav
          className={
            'mb-8 flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground [&_a]:shrink-0 [&_a]:no-underline [&_a:hover]:text-primary-strong [&_span:last-child]:truncate [&_span:last-child]:text-foreground'
          }
          aria-label="مسیر صفحه"
        >
          <Link href="/">اقامتگاه</Link>
          <span aria-hidden="true">/</span>
          <Link href="/rooms">اتاق‌ها</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{room.name}</span>
        </nav>

        <div
          className={
            'grid items-center gap-6 md:grid-cols-[minmax(0,1.08fr)_minmax(20rem,.92fr)] md:gap-10'
          }
        >
          <ScrollReveal className={'min-w-0'}>
            <div
              className={
                'relative min-h-[min(105vw,35rem)] overflow-hidden rounded-t-[44%] rounded-b-3xl border-[.55rem] border-surface bg-surface-soft md:min-h-[clamp(27rem,51vw,43rem)]'
              }
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                priority
                sizes="(max-width: 760px) 100vw, 58vw"
                className={'object-cover'}
              />
            </div>
          </ScrollReveal>

          <ScrollReveal
            className={
              'py-2 sm:py-6 [&_h1]:mb-4 [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-primary-strong sm:[&_h1]:text-6xl'
            }
            delay={100}
          >
            <h1
              id="room-detail-heading"
              className="text-4xl font-bold leading-tight text-primary-strong sm:text-6xl"
            >
              {room.name}
            </h1>
            <p className={'mb-6 text-base leading-8 text-muted-foreground'}>{room.description}</p>

            <div
              className={
                'flex items-center gap-4 rounded-2xl bg-surface p-4 text-sm text-muted-foreground sm:text-base [&_strong]:mt-1 [&_strong]:block [&_strong]:text-foreground'
              }
            >
              <span
                className={
                  'grid size-11 shrink-0 place-items-center rounded-full bg-surface-soft text-primary [&_svg]:size-6 [&_svg]:stroke-current [&_svg]:stroke-1'
                }
                aria-hidden="true"
              >
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
              <section
                className={
                  'mt-6 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-primary-strong'
                }
                aria-labelledby="amenities-heading"
              >
                <h2 id="amenities-heading">امکانات این اتاق</h2>
                <ul
                  className={
                    'grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:grid-cols-3 [&_li]:flex [&_li]:min-h-11 [&_li]:items-center [&_li]:gap-2 [&_li]:rounded-xl [&_li]:bg-surface [&_li]:px-3 [&_li]:py-2 [&_li]:text-sm [&_li_svg]:size-4 [&_li_svg]:shrink-0 [&_li_svg]:text-accent-brand'
                  }
                >
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

            <div className={'mt-7 [&_p]:mt-3 [&_p]:text-xs [&_p]:text-muted-foreground'}>
              <Link
                className={
                  'inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-5 font-bold text-primary-foreground no-underline transition-colors hover:bg-primary-strong focus-visible:outline-3 focus-visible:outline-ring'
                }
                href="/#stay-search"
              >
                بررسی تاریخ و ظرفیت
              </Link>
              <p>تأیید نهایی درخواست پس از بررسی کارکنان انجام می‌شود.</p>
            </div>

            <div
              className={
                'mt-4 flex items-center text-sm [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-bold [&_a]:text-primary-strong [&_a]:no-underline'
              }
            >
              <Link href="/rooms">دیدن همهٔ اتاق‌ها</Link>
            </div>
          </ScrollReveal>
        </div>
      </article>
    </PublicSiteFrame>
  );
}
