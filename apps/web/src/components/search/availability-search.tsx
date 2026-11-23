'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <FieldError id={id} className={styles.fieldError}>
      {message}
    </FieldError>
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
      const fieldIds: Record<keyof AvailabilitySearchInput, string> = {
        checkIn: 'search-check-in',
        checkOut: 'search-check-out',
        guests: 'search-guests',
      };
      const firstInvalid = Object.keys(validation.errors)[0] as
        keyof AvailabilitySearchInput | undefined;
      if (firstInvalid) {
        window.setTimeout(() => {
          const control = document.getElementById(fieldIds[firstInvalid]);
          control?.focus();
          control?.scrollIntoView({
            block: 'center',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          });
        }, 0);
      }
      return;
    }

    setState('loading');
    try {
      const response = await fetchAvailability(validation.query);
      setResult(response);
      setState('results');
    } catch (error) {
      if (error instanceof AvailabilityApiError && error.kind === 'unavailable') {
        setState('unavailable');
      } else {
        setState('server-error');
      }
    }
  }

  const resultState = result ? classifyAvailabilityResults(result.roomTypes) : null;
  const roomDetails = new Map(roomTypes.map((room) => [room.slug, room]));
  const guestOptions = Array.from({ length: 20 }, (_, index) => index + 1).map((guests) => ({
    value: String(guests),
    label: `${formatPersianInteger(guests)} مهمان`,
  }));

  return (
    <section className={styles.search} id="stay-search" aria-labelledby="stay-search-title">
      <div className={styles.intro}>
        <h2 id="stay-search-title">قرارِ اقامتتان را پیدا کنید</h2>
        <p>تاریخ و تعداد مهمان‌ها را انتخاب کنید تا ظرفیت و مبلغ نهایی اتاق‌ها را ببینید.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="جستجوی اقامت">
        <Field className={styles.field} data-invalid={Boolean(fieldErrors.checkIn)}>
          <FieldLabel htmlFor="search-check-in">تاریخ ورود</FieldLabel>
          <Input
            className={styles.control}
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
          <FieldDescription id="search-check-in-help" className={styles.hint}>
            سال، ماه و روز شمسی؛ وارد کردن / اختیاری است
          </FieldDescription>
          <SearchFieldError id="search-check-in-error" message={fieldErrors.checkIn} />
        </Field>
        <Field className={styles.field} data-invalid={Boolean(fieldErrors.checkOut)}>
          <FieldLabel htmlFor="search-check-out">تاریخ خروج</FieldLabel>
          <Input
            className={styles.control}
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
          <FieldDescription id="search-check-out-help" className={styles.hint}>
            روز خروج، شب اقامت محسوب نمی‌شود
          </FieldDescription>
          <SearchFieldError id="search-check-out-error" message={fieldErrors.checkOut} />
        </Field>
        <Field className={styles.field} data-invalid={Boolean(fieldErrors.guests)}>
          <FieldLabel htmlFor="search-guests">تعداد مهمان</FieldLabel>
          <Select
            items={guestOptions}
            name="guests"
            value={input.guests}
            disabled={state === 'loading'}
            onValueChange={(value) => updateInput('guests', String(value ?? ''))}
          >
            <SelectTrigger
              id="search-guests"
              aria-invalid={Boolean(fieldErrors.guests)}
              aria-describedby={fieldErrors.guests ? 'search-guests-error' : undefined}
              aria-errormessage={fieldErrors.guests ? 'search-guests-error' : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {guestOptions.map((option) => (
                <SelectItem value={option.value} key={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SearchFieldError id="search-guests-error" message={fieldErrors.guests} />
        </Field>
        <Button className={styles.submit} size="lg" type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'در حال بررسی…' : 'بررسی اتاق‌های موجود'}
        </Button>
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
