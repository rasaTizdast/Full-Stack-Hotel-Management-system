'use client';

import Link from 'next/link';
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

type AvailabilitySearchProps = {
  roomTypes: PublicRoomType[];
  initialStay: Pick<AvailabilitySearchInput, 'checkIn' | 'checkOut'>;
};

type SearchState = 'idle' | 'loading' | 'results' | 'unavailable' | 'server-error';

function SearchFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="search-field__error" role="alert">
      {message}
    </span>
  );
}

function AvailabilityRoomCard({
  room,
  details,
  numberOfNights,
}: {
  room: AvailabilityResult['roomTypes'][number];
  details?: PublicRoomType;
  numberOfNights: number;
}) {
  return (
    <article
      className={`availability-card${room.isAvailable ? '' : ' availability-card--unavailable'}`}
    >
      <div className="availability-card__motif" aria-hidden="true">
        <span />
      </div>
      <div className="availability-card__body">
        <div className="availability-card__heading">
          <div>
            <p className="availability-card__eyebrow">
              {room.isAvailable ? 'آمادهٔ پذیرش' : 'ظرفیت تکمیل است'}
            </p>
            <h3>{room.name}</h3>
          </div>
          <span className="availability-card__capacity">
            حداکثر {formatPersianInteger(room.maxGuestsPerRoom)} نفر
          </span>
        </div>
        {details?.description ? (
          <p className="availability-card__description">{details.description}</p>
        ) : null}
        {details && details.amenities.length > 0 ? (
          <ul className="amenity-list" aria-label={`امکانات ${room.name}`}>
            {details.amenities.map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        ) : null}
        {room.isAvailable && room.totalPriceToman !== null ? (
          <div className="availability-card__price">
            <span>قیمت کل برای {formatPersianInteger(numberOfNights)} شب</span>
            <strong>
              <bdi>{formatTomanTotal(room.totalPriceToman)}</bdi>
              <span>تومان</span>
            </strong>
            <span className="availability-card__stock">
              {formatPersianInteger(room.availableRooms)} اتاق در دسترس
            </span>
          </div>
        ) : (
          <p className="availability-card__unavailable-copy">
            برای تاریخ‌های انتخاب‌شده موجود نیست.
          </p>
        )}
        <Link className="availability-card__link" href={`/rooms/${encodeURIComponent(room.slug)}`}>
          جزئیات اتاق <span aria-hidden="true">←</span>
        </Link>
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
    <section className="availability-search" id="stay-search" aria-labelledby="stay-search-title">
      <div className="availability-search__intro">
        <p className="eyebrow">رزرو با خیال آسوده</p>
        <h2 id="stay-search-title">قرارِ اقامتتان را پیدا کنید</h2>
        <p>تاریخ و تعداد مهمان‌ها را انتخاب کنید تا ظرفیت و مبلغ نهایی اتاق‌ها را ببینید.</p>
      </div>

      <form className="search-form" onSubmit={handleSubmit} noValidate aria-label="جستجوی اقامت">
        <div className="search-field">
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
            aria-describedby={
              fieldErrors.checkIn ? 'search-check-in-error' : 'search-check-in-help'
            }
          />
          <span id="search-check-in-help" className="search-field__hint">
            سال / ماه / روز شمسی
          </span>
          <SearchFieldError id="search-check-in-error" message={fieldErrors.checkIn} />
        </div>
        <div className="search-field">
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
            aria-describedby={
              fieldErrors.checkOut ? 'search-check-out-error' : 'search-check-out-help'
            }
          />
          <span id="search-check-out-help" className="search-field__hint">
            روز خروج، شب اقامت محسوب نمی‌شود
          </span>
          <SearchFieldError id="search-check-out-error" message={fieldErrors.checkOut} />
        </div>
        <div className="search-field search-field--guests">
          <label htmlFor="search-guests">تعداد مهمان</label>
          <select
            id="search-guests"
            name="guests"
            value={input.guests}
            disabled={state === 'loading'}
            onChange={(event) => updateInput('guests', event.target.value)}
            aria-invalid={Boolean(fieldErrors.guests)}
            aria-describedby={fieldErrors.guests ? 'search-guests-error' : undefined}
          >
            {Array.from({ length: 20 }, (_, index) => index + 1).map((guests) => (
              <option value={String(guests)} key={guests}>
                {formatPersianInteger(guests)} مهمان
              </option>
            ))}
          </select>
          <SearchFieldError id="search-guests-error" message={fieldErrors.guests} />
        </div>
        <button
          className="button button--jade search-form__submit"
          type="submit"
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'در حال بررسی…' : 'بررسی اتاق‌های موجود'}
          <span aria-hidden="true">←</span>
        </button>
      </form>

      <div
        className="availability-search__results"
        aria-live="polite"
        aria-busy={state === 'loading'}
      >
        {state === 'idle' ? (
          <p className="search-message search-message--quiet" role="status">
            بازهٔ اقامت خود را بررسی کنید؛ قیمت‌ها برای همهٔ شب‌های انتخاب‌شده از سامانه دریافت
            می‌شوند.
          </p>
        ) : null}
        {state === 'loading' ? (
          <p className="search-message search-message--loading" role="status">
            <span className="loading-state__ornament" aria-hidden="true" />
            در حال بررسی اتاق‌های قابل رزرو
          </p>
        ) : null}
        {state === 'unavailable' ? (
          <p className="search-message search-message--unavailable" role="status">
            تاریخ‌های انتخاب‌شده دیگر قابل بررسی نیستند. بازهٔ اقامت را دوباره انتخاب کنید.
          </p>
        ) : null}
        {state === 'server-error' ? (
          <p className="search-message search-message--error" role="alert">
            سرویس بررسی اتاق‌ها موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.
          </p>
        ) : null}
        {resultState === 'empty' ? (
          <p className="search-message" role="status">
            هنوز اتاقی برای نمایش آماده نیست.
          </p>
        ) : null}
        {resultState === 'unavailable' ? (
          <p className="search-message search-message--unavailable" role="status">
            برای این بازهٔ اقامت اتاق آزادی پیدا نشد.
          </p>
        ) : null}
        {resultState === 'available' && result ? (
          <div className="availability-search__cards">
            <div className="availability-search__result-heading">
              <div>
                <p className="eyebrow">گزینه‌های اقامت</p>
                <h2>اتاق‌های مناسب شما</h2>
              </div>
              <p>قیمت هر اتاق برای {formatPersianInteger(result.numberOfNights)} شب اقامت است.</p>
            </div>
            <div className="availability-card-grid">
              {result.roomTypes.map((room) => (
                <AvailabilityRoomCard
                  key={room.slug}
                  room={room}
                  details={roomDetails.get(room.slug)}
                  numberOfNights={result.numberOfNights}
                />
              ))}
            </div>
          </div>
        ) : null}
        {resultState === 'unavailable' && result ? (
          <div className="availability-card-grid availability-card-grid--unavailable">
            {result.roomTypes.map((room) => (
              <AvailabilityRoomCard
                key={room.slug}
                room={room}
                details={roomDetails.get(room.slug)}
                numberOfNights={result.numberOfNights}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
