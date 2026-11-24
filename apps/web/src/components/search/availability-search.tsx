'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import {
  AvailabilityApiError,
  classifyAvailabilityResults,
  fetchAvailability,
  formatTomanTotal,
  type AvailabilityResult,
} from '@/lib/availability';
import {
  formatPersianInteger,
  type AvailabilitySearchErrors,
  type AvailabilitySearchInput,
  validateAvailabilitySearch,
} from '@/lib/jalali-date';
import type { PublicRoomType } from '@/lib/public-api';
import { getRoomImage } from '@/components/public/room-imagery';
import styles from './availability-search.module.css';

type AvailabilitySearchProps = {
  roomTypes: PublicRoomType[];
  initialStay: Pick<AvailabilitySearchInput, 'checkIn' | 'checkOut'>;
};

type SearchState = 'idle' | 'loading' | 'results' | 'unavailable' | 'server-error';

function SearchFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className={styles.fieldError} role="alert">
      {message}
    </span>
  );
}

function AvailabilityRoomCard({
  room,
  details,
  numberOfNights,
  stay,
}: {
  room: AvailabilityResult['roomTypes'][number];
  details?: PublicRoomType;
  numberOfNights: number;
  stay: Pick<AvailabilityResult, 'checkIn' | 'checkOut' | 'guests'>;
}) {
  const image = getRoomImage(room);
  const bookingQuery = new URLSearchParams({
    roomType: room.slug,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    guestCount: String(stay.guests),
  });
  return (
    <article
      className={`${styles.roomCard}${room.isAvailable ? '' : ` ${styles.roomCardUnavailable}`}`}
    >
      <div className={styles.roomImage}>
        {image.src ? (
          <Image src={image.src} alt={image.alt} fill sizes="(max-width: 760px) 100vw, 50vw" />
        ) : (
          <span className={styles.roomImageFallback} aria-hidden="true">
            اقامتگاه نارنج
          </span>
        )}
        <span
          className={`${styles.availabilityBadge}${room.isAvailable ? '' : ` ${styles.unavailableBadge}`}`}
        >
          {room.isAvailable ? 'آمادهٔ پذیرش' : 'ظرفیت تکمیل است'}
        </span>
      </div>
      <div className={styles.roomBody}>
        <div className={styles.roomHeading}>
          <div>
            <h3 className={styles.roomTitle}>{room.name}</h3>
          </div>
          <span className={styles.capacity}>
            حداکثر {formatPersianInteger(room.maxGuestsPerRoom)} نفر
          </span>
        </div>
        {details?.description ? (
          <p className={styles.roomDescription}>{details.description}</p>
        ) : null}
        {details && details.amenities.length > 0 ? (
          <ul className={styles.amenities} aria-label={`امکانات ${room.name}`}>
            {details.amenities.map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        ) : null}
        {room.isAvailable && room.totalPriceToman !== null ? (
          <div className={styles.priceBlock}>
            <span>قیمت کل برای {formatPersianInteger(numberOfNights)} شب</span>
            <strong className={styles.price}>
              <bdi>{formatTomanTotal(room.totalPriceToman)}</bdi>
              <span>تومان</span>
            </strong>
            <span className={styles.stock}>
              {formatPersianInteger(room.availableRooms)} اتاق در دسترس
            </span>
          </div>
        ) : (
          <p className={styles.unavailableCopy}>برای تاریخ‌های انتخاب‌شده موجود نیست.</p>
        )}
        <div className={styles.roomActions}>
          <Link className={styles.detailsLink} href={`/rooms/${encodeURIComponent(room.slug)}`}>
            جزئیات اتاق
          </Link>
          {room.isAvailable && room.totalPriceToman !== null ? (
            <Link className={styles.bookingLink} href={`/booking?${bookingQuery.toString()}`}>
              درخواست اقامت
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AvailabilitySearch({ roomTypes, initialStay }: AvailabilitySearchProps) {
  const [input, setInput] = useState<AvailabilitySearchInput>({ ...initialStay, guests: '2' });
  const [fieldErrors, setFieldErrors] = useState<AvailabilitySearchErrors>({});
  const [state, setState] = useState<SearchState>('idle');
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  function updateInput(name: keyof AvailabilitySearchInput, value: string) {
    setInput((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setResult(null);
    setState('idle');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const validation = validateAvailabilitySearch(input);
    setFieldErrors(validation.errors);
    if (!validation.query) {
      setState('idle');
      return;
    }

    setState('loading');
    try {
      const response = await fetchAvailability(validation.query);
      setResult(response);
      setState('results');
    } catch (error) {
      setState(
        error instanceof AvailabilityApiError && error.kind === 'unavailable'
          ? 'unavailable'
          : 'server-error',
      );
    }
  }

  const resultState = result ? classifyAvailabilityResults(result.roomTypes) : null;
  const roomDetails = new Map(roomTypes.map((room) => [room.slug, room]));

  return (
    <section className={styles.search} id="stay-search" aria-labelledby="stay-search-title">
      <div className={styles.intro}>
        <h2 id="stay-search-title">قرارِ اقامتتان را پیدا کنید</h2>
        <p>تاریخ و تعداد مهمان‌ها را انتخاب کنید تا ظرفیت و مبلغ نهایی اتاق‌ها را ببینید.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="جستجوی اقامت">
        <div className={styles.field}>
          <label htmlFor="search-check-in">تاریخ ورود</label>
          <input
            id="search-check-in"
            name="checkIn"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="۱۴۰۵/۰۸/۲۴"
            value={input.checkIn}
            disabled={state === 'loading'}
            onChange={(event) => updateInput('checkIn', event.target.value)}
            aria-invalid={Boolean(fieldErrors.checkIn)}
            aria-describedby={`search-check-in-help${fieldErrors.checkIn ? ' search-check-in-error' : ''}`}
            aria-errormessage={fieldErrors.checkIn ? 'search-check-in-error' : undefined}
          />
          <span id="search-check-in-help" className={styles.hint}>
            سال / ماه / روز شمسی
          </span>
          <SearchFieldError id="search-check-in-error" message={fieldErrors.checkIn} />
        </div>
        <div className={styles.field}>
          <label htmlFor="search-check-out">تاریخ خروج</label>
          <input
            id="search-check-out"
            name="checkOut"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="۱۴۰۵/۰۸/۲۶"
            value={input.checkOut}
            disabled={state === 'loading'}
            onChange={(event) => updateInput('checkOut', event.target.value)}
            aria-invalid={Boolean(fieldErrors.checkOut)}
            aria-describedby={`search-check-out-help${fieldErrors.checkOut ? ' search-check-out-error' : ''}`}
            aria-errormessage={fieldErrors.checkOut ? 'search-check-out-error' : undefined}
          />
          <span id="search-check-out-help" className={styles.hint}>
            روز خروج، شب اقامت محسوب نمی‌شود
          </span>
          <SearchFieldError id="search-check-out-error" message={fieldErrors.checkOut} />
        </div>
        <div className={styles.field}>
          <label htmlFor="search-guests">تعداد مهمان</label>
          <select
            id="search-guests"
            name="guests"
            value={input.guests}
            disabled={state === 'loading'}
            onChange={(event) => updateInput('guests', event.target.value)}
            aria-invalid={Boolean(fieldErrors.guests)}
            aria-describedby={fieldErrors.guests ? 'search-guests-error' : undefined}
            aria-errormessage={fieldErrors.guests ? 'search-guests-error' : undefined}
          >
            {Array.from({ length: 20 }, (_, index) => index + 1).map((guests) => (
              <option value={String(guests)} key={guests}>
                {formatPersianInteger(guests)} مهمان
              </option>
            ))}
          </select>
          <SearchFieldError id="search-guests-error" message={fieldErrors.guests} />
        </div>
        <button className={styles.submit} type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'در حال بررسی…' : 'بررسی اتاق‌های موجود'}
        </button>
      </form>

      <div className={styles.results} aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'idle' ? (
          <p className={`${styles.message} ${styles.messageQuiet}`} role="status">
            بازهٔ اقامت خود را بررسی کنید؛ قیمت‌ها برای همهٔ شب‌های انتخاب‌شده از سامانه دریافت
            می‌شوند.
          </p>
        ) : null}
        {state === 'loading' ? (
          <p className={`${styles.message} ${styles.messageLoading}`} role="status">
            <span className={styles.loadingMark} aria-hidden="true" />
            در حال بارگذاری و بررسی ظرفیت اتاق‌ها…
          </p>
        ) : null}
        {state === 'unavailable' ? (
          <p className={`${styles.message} ${styles.messageUnavailable}`} role="status">
            تاریخ‌های انتخاب‌شده دیگر قابل بررسی نیستند. بازهٔ اقامت را دوباره انتخاب کنید.
          </p>
        ) : null}
        {state === 'server-error' ? (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            خطا در بررسی اتاق‌ها: سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.
          </p>
        ) : null}
        {resultState === 'empty' ? (
          <p className={styles.message} role="status">
            هنوز اتاقی برای نمایش آماده نیست.
          </p>
        ) : null}
        {resultState === 'unavailable' ? (
          <p className={`${styles.message} ${styles.messageUnavailable}`} role="status">
            برای این بازهٔ اقامت اتاق آزادی پیدا نشد.
          </p>
        ) : null}
        {resultState === 'available' && result ? (
          <div className={styles.cards}>
            <div className={styles.resultHeading}>
              <div>
                <h2>اتاق‌های مناسب شما</h2>
              </div>
              <p>قیمت هر اتاق برای {formatPersianInteger(result.numberOfNights)} شب اقامت است.</p>
            </div>
            <div className={styles.cardGrid}>
              {result.roomTypes.map((room) => (
                <AvailabilityRoomCard
                  key={room.slug}
                  room={room}
                  details={roomDetails.get(room.slug)}
                  numberOfNights={result.numberOfNights}
                  stay={result}
                />
              ))}
            </div>
          </div>
        ) : null}
        {resultState === 'unavailable' && result ? (
          <div className={`${styles.cardGrid} ${styles.unavailableGrid}`}>
            {result.roomTypes.map((room) => (
              <AvailabilityRoomCard
                key={room.slug}
                room={room}
                details={roomDetails.get(room.slug)}
                numberOfNights={result.numberOfNights}
                stay={result}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
