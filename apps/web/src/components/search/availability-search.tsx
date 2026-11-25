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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type AvailabilitySearchProps = {
  roomTypes: PublicRoomType[];
  initialStay: Pick<AvailabilitySearchInput, 'checkIn' | 'checkOut'>;
};

type SearchState = 'idle' | 'loading' | 'results' | 'unavailable' | 'server-error';

function SearchFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <FieldError id={id} className="text-sm font-semibold text-destructive">
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
    <Card
      className={cn(
        'grid min-w-0 grid-rows-[auto_1fr] overflow-hidden rounded-2xl border-border p-0 transition-colors duration-200 hover:border-primary/35',
        !room.isAvailable && 'bg-surface-soft/70',
      )}
    >
      <div className={'relative isolate min-h-52 overflow-hidden bg-surface-soft'}>
        {image.src ? (
          <Image src={image.src} alt={image.alt} fill sizes="(max-width: 760px) 100vw, 50vw" />
        ) : (
          <span
            className={
              'grid min-h-52 place-items-center bg-primary-strong font-display text-xl text-primary-foreground'
            }
            aria-hidden="true"
          >
            اقامتگاه نارنج
          </span>
        )}
        <span className="absolute start-3 top-3 z-10">
          <Badge variant={room.isAvailable ? 'success' : 'destructive'}>
            {room.isAvailable ? 'آمادهٔ پذیرش' : 'ظرفیت تکمیل است'}
          </Badge>
        </span>
      </div>
      <div className={'flex min-w-0 flex-col items-stretch p-4 sm:p-5'}>
        <div className={'flex items-start justify-between gap-3'}>
          <div>
            <h3 className={'text-xl font-bold leading-snug text-primary-strong'}>{room.name}</h3>
          </div>
          <span
            className={'shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground'}
          >
            حداکثر {formatPersianInteger(room.maxGuestsPerRoom)} نفر
          </span>
        </div>
        {details?.description ? (
          <p className={'mt-2 text-sm leading-7 text-muted-foreground'}>{details.description}</p>
        ) : null}
        {details && details.amenities.length > 0 ? (
          <ul className={'mt-3 flex flex-wrap gap-2'} aria-label={`امکانات ${room.name}`}>
            {details.amenities.map((amenity) => (
              <li
                key={amenity}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
              >
                {amenity}
              </li>
            ))}
          </ul>
        ) : null}
        {room.isAvailable && room.totalPriceToman !== null ? (
          <div className="mt-4 grid gap-1 border-t border-border pt-3 text-sm text-muted-foreground">
            <span>قیمت کل برای {formatPersianInteger(numberOfNights)} شب</span>
            <strong
              className={
                'flex flex-wrap items-baseline gap-1 text-xl leading-relaxed text-primary-strong tabular-nums'
              }
            >
              <bdi>{formatTomanTotal(room.totalPriceToman)}</bdi>
              <span>تومان</span>
            </strong>
            <span className={'text-xs font-semibold text-success'}>
              {formatPersianInteger(room.availableRooms)} اتاق در دسترس
            </span>
          </div>
        ) : (
          <p className={'mt-auto border-t border-border pt-3 text-sm text-destructive'}>
            برای تاریخ‌های انتخاب‌شده موجود نیست.
          </p>
        )}
        <div className={'mt-auto flex flex-wrap items-center gap-2 pt-4'}>
          <Link
            className={
              'inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-3 focus-visible:outline-ring'
            }
            href={`/rooms/${encodeURIComponent(room.slug)}`}
          >
            جزئیات اتاق
          </Link>
          {room.isAvailable && room.totalPriceToman !== null ? (
            <Link
              className={
                'ms-auto inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-strong focus-visible:outline-3 focus-visible:outline-ring'
              }
              href={`/booking?${bookingQuery.toString()}`}
            >
              درخواست اقامت
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
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
    <section
      className={
        'mx-auto my-16 w-[min(calc(100%-2rem),84rem)] scroll-mt-8 rounded-3xl bg-surface p-5 sm:p-8 lg:p-12'
      }
      id="stay-search"
      aria-labelledby="stay-search-title"
    >
      <div className={'mb-6 max-w-3xl sm:mb-8'}>
        <h2
          id="stay-search-title"
          className="text-3xl font-bold leading-tight text-primary-strong sm:text-4xl"
        >
          قرارِ اقامتتان را پیدا کنید
        </h2>
        <p className="mt-3 max-w-prose text-base leading-8 text-muted-foreground">
          تاریخ و تعداد مهمان‌ها را انتخاب کنید تا ظرفیت و مبلغ نهایی اتاق‌ها را ببینید.
        </p>
      </div>

      <form
        className={
          'grid grid-cols-1 items-end gap-4 rounded-2xl border border-border bg-surface-soft p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(10rem,.8fr)_auto]'
        }
        onSubmit={handleSubmit}
        noValidate
        aria-label="جستجوی اقامت"
      >
        <Field className={'min-w-0 gap-2'} data-invalid={Boolean(fieldErrors.checkIn)}>
          <FieldLabel htmlFor="search-check-in">تاریخ ورود</FieldLabel>
          <Input
            className={'w-full min-w-0'}
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
          <FieldDescription id="search-check-in-help" className={'min-h-5 text-xs leading-relaxed'}>
            سال، ماه و روز شمسی؛ وارد کردن / اختیاری است
          </FieldDescription>
          <SearchFieldError id="search-check-in-error" message={fieldErrors.checkIn} />
        </Field>
        <Field className={'min-w-0 gap-2'} data-invalid={Boolean(fieldErrors.checkOut)}>
          <FieldLabel htmlFor="search-check-out">تاریخ خروج</FieldLabel>
          <Input
            className={'w-full min-w-0'}
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
          <FieldDescription
            id="search-check-out-help"
            className={'min-h-5 text-xs leading-relaxed'}
          >
            روز خروج، شب اقامت محسوب نمی‌شود
          </FieldDescription>
          <SearchFieldError id="search-check-out-error" message={fieldErrors.checkOut} />
        </Field>
        <Field className={'min-w-0 gap-2'} data-invalid={Boolean(fieldErrors.guests)}>
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
        <Button
          className={'min-h-12 w-full whitespace-normal xl:w-auto'}
          size="lg"
          type="submit"
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'در حال بررسی…' : 'بررسی اتاق‌های موجود'}
        </Button>
      </form>

      <div className={'mt-5 min-h-14'} aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'idle' ? (
          <p
            className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm leading-7 text-muted-foreground"
            role="status"
          >
            بازهٔ اقامت خود را بررسی کنید؛ قیمت‌ها برای همهٔ شب‌های انتخاب‌شده از سامانه دریافت
            می‌شوند.
          </p>
        ) : null}
        {state === 'loading' ? (
          <p
            className="flex min-h-12 items-center gap-3 rounded-xl border border-primary/30 bg-surface-soft px-4 py-3 text-sm leading-7 text-primary-strong"
            role="status"
          >
            <span
              className={
                'size-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary'
              }
              aria-hidden="true"
            />
            در حال بارگذاری و بررسی ظرفیت اتاق‌ها…
          </p>
        ) : null}
        {state === 'unavailable' ? (
          <p
            className="flex min-h-12 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive"
            role="status"
          >
            تاریخ‌های انتخاب‌شده دیگر قابل بررسی نیستند. بازهٔ اقامت را دوباره انتخاب کنید.
          </p>
        ) : null}
        {state === 'server-error' ? (
          <p
            className="flex min-h-12 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive"
            role="alert"
          >
            خطا در بررسی اتاق‌ها: سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.
          </p>
        ) : null}
        {resultState === 'empty' ? (
          <p
            className={
              'flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm leading-7'
            }
            role="status"
          >
            هنوز اتاقی برای نمایش آماده نیست.
          </p>
        ) : null}
        {resultState === 'unavailable' ? (
          <p
            className="flex min-h-12 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive"
            role="status"
          >
            برای این بازهٔ اقامت اتاق آزادی پیدا نشد.
          </p>
        ) : null}
        {resultState === 'available' && result ? (
          <div className={'grid gap-5'}>
            <div
              className={'flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end'}
            >
              <div>
                <h2 className="text-2xl font-bold text-primary-strong">اتاق‌های مناسب شما</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                قیمت هر اتاق برای {formatPersianInteger(result.numberOfNights)} شب اقامت است.
              </p>
            </div>
            <div className={'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
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
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
