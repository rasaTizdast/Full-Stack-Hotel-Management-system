'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createBookingFormSchema,
  type BookingFormInput,
  type BookingFormValues,
} from '@/lib/booking-form-schema';
import {
  BookingApiError,
  submitBookingRequest,
  type BookingCreatePayload,
  type PublicBookingResponse,
} from '@/lib/booking-client';
import { formatTomanTotal } from '@/lib/availability';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';
import type { AvailabilityRoomType } from '@/lib/availability';
import type { PublicRoomType } from '@/lib/public-api';
import { getRoomImage } from '@/components/public/room-imagery';

export type BookingFlowProps = {
  room: PublicRoomType;
  context: { checkIn: string; checkOut: string; guestCount: number };
  roomAvailability: AvailabilityRoomType;
  hotelContactPhone: string | null;
};

type Attempt = { key: string; fingerprint: string };

function RoomImage({ slug }: { slug: string }) {
  if (slug !== 'garden-double' && slug !== 'family-suite') return null;
  const image = getRoomImage({ slug });

  return (
    <div className={'relative aspect-[1.75] overflow-hidden rounded-xl bg-surface-soft'}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        loading="eager"
        sizes="(max-width: 760px) 100vw, 38vw"
      />
      <span
        className={
          'absolute bottom-3 start-3 rounded-full bg-primary-strong/85 px-3 py-1 text-sm text-primary-foreground'
        }
      >
        خانه‌باغ نارنج، شیراز
      </span>
    </div>
  );
}

function makeIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Secure randomness is unavailable.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); // taste-skill-ignore: preserves byte width in a cryptographic key
}

function getPropertyPhoneHref(phone: string | null): string | null {
  if (!phone) return null;

  const asciiDigits = phone
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const compact = asciiDigits.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) return null;

  return `tel:${compact}`;
}

function StaySummary({
  roomName,
  checkIn,
  checkOut,
  guestCount,
  roomQuantity,
  total,
}: {
  roomName?: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  total: string;
}) {
  return (
    <dl className="my-0 grid gap-y-1 [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-3 [&>div]:py-2 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:text-end [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:text-foreground">
      {roomName ? (
        <div>
          <dt>اتاق</dt>
          <dd>{roomName}</dd>
        </div>
      ) : null}
      <div>
        <dt>ورود</dt>
        <dd>
          <bdi>{formatGregorianAsJalali(checkIn) ?? checkIn}</bdi>
        </dd>
      </div>
      <div>
        <dt>خروج</dt>
        <dd>
          <bdi>{formatGregorianAsJalali(checkOut) ?? checkOut}</bdi>
        </dd>
      </div>
      <div>
        <dt>مهمان</dt>
        <dd>{formatPersianInteger(guestCount)} نفر</dd>
      </div>
      <div>
        <dt>تعداد اتاق</dt>
        <dd>{formatPersianInteger(roomQuantity)} اتاق</dd>
      </div>
      <div className="!my-2 !grid !gap-1 border-t border-border pt-3 [&_dt]:font-bold [&_dt]:text-primary [&_dd]:text-xl [&_dd]:font-bold [&_dd]:text-primary-strong">
        <dt>برآورد مبلغ کل</dt>
        <dd>
          <bdi>{formatTomanTotal(total)}</bdi>
          <span> تومان</span>
        </dd>
      </div>
    </dl>
  );
}

function Confirmation({
  booking,
  submittedPhone,
  hotelContactPhone,
}: {
  booking: PublicBookingResponse;
  submittedPhone: string;
  hotelContactPhone: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const propertyPhoneHref = getPropertyPhoneHref(hotelContactPhone);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className={
        'mx-auto my-10 w-[min(calc(100%-2rem),70rem)] max-w-4xl rounded-3xl bg-surface p-5 sm:my-16 sm:p-10'
      }
      aria-labelledby="booking-confirmation-title"
    >
      <span
        className={
          'mb-4 grid size-12 place-items-center rounded-full bg-success text-primary-foreground'
        }
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="none">
          <path d="m4.5 10.5 3.6 3.6 7.4-8.1" />
        </svg>
      </span>
      <RoomImage slug={booking.roomType.slug} />
      <p
        className={
          'mb-2 inline-flex rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success'
        }
      >
        درخواست شما دریافت شد
      </p>
      <h1
        ref={headingRef}
        id="booking-confirmation-title"
        tabIndex={-1}
        className="text-3xl font-bold leading-tight text-primary-strong sm:text-4xl"
      >
        درخواست اقامت شما ثبت شد
      </h1>
      <p className={'mb-5 mt-3 max-w-prose text-base leading-8 text-muted-foreground'}>
        پذیرش ظرفیت و مبلغ را بررسی می‌کند و نتیجهٔ درخواست را به شما اطلاع می‌دهد.
      </p>
      <div
        className={
          'my-5 flex flex-col gap-1 rounded-xl border border-border bg-surface-soft px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between'
        }
      >
        <span>کد پیگیری</span>
        <strong>
          <bdi>{booking.reference}</bdi>
        </strong>
      </div>
      <StaySummary
        roomName={booking.roomType.name}
        checkIn={booking.checkIn}
        checkOut={booking.checkOut}
        guestCount={booking.guestCount}
        roomQuantity={booking.roomQuantity}
        total={booking.priceSummary.totalPriceToman}
      />
      <p
        className={
          'my-4 flex flex-wrap gap-1 rounded-xl bg-warning-soft px-4 py-3 text-sm text-muted-foreground'
        }
      >
        وضعیت درخواست: <strong>در انتظار تأیید پذیرش</strong>
      </p>
      <div
        className={
          'my-4 grid justify-items-start gap-2 rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm leading-7'
        }
      >
        <p>پذیرش برای پیگیری درخواست با این شماره تماس می‌گیرد:</p>
        <bdi className={'font-bold text-primary-strong'} dir="ltr">
          {submittedPhone}
        </bdi>
        {propertyPhoneHref ? (
          <a
            className={
              'inline-flex min-h-11 items-center font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-ring'
            }
            href={propertyPhoneHref}
            dir="rtl"
          >
            تماس با اقامتگاه: <bdi dir="ltr">{hotelContactPhone}</bdi>
          </a>
        ) : null}
      </div>
      <ButtonLink className="mt-3" href="/" size="default">
        بازگشت به اقامتگاه
      </ButtonLink>
    </section>
  );
}

export function BookingFlow({
  room,
  context,
  roomAvailability,
  hotelContactPhone,
}: BookingFlowProps) {
  const minimumRooms = Math.ceil(context.guestCount / room.maxGuestsPerRoom);
  const maxRooms = Math.min(roomAvailability.availableRooms, 20);
  const schema = createBookingFormSchema({
    guestCount: context.guestCount,
    maxGuestsPerRoom: room.maxGuestsPerRoom,
    availableRooms: roomAvailability.availableRooms,
  });
  const form = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      roomQuantity: String(minimumRooms),
      guestName: '',
      guestPhone: '',
      guestEmail: '',
    },
    mode: 'onSubmit',
  });
  const [failure, setFailure] = useState<'server-error' | 'availability-changed' | null>(null);
  const [booking, setBooking] = useState<{
    response: PublicBookingResponse;
    submittedPhone: string;
  } | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);
  const quantity =
    Number(useWatch({ control: form.control, name: 'roomQuantity' })) || minimumRooms;
  const estimated = (BigInt(roomAvailability.totalPriceToman ?? '0') * BigInt(quantity)).toString();
  const roomQuantityOptions = Array.from(
    { length: Math.max(0, maxRooms - minimumRooms + 1) },
    (_, index) => minimumRooms + index,
  ).map((count) => ({
    value: String(count),
    label: `${formatPersianInteger(count)} اتاق`,
  }));

  async function submit(values: BookingFormValues) {
    setFailure(null);
    const payload: BookingCreatePayload = {
      roomTypeSlug: room.slug,
      checkIn: context.checkIn,
      checkOut: context.checkOut,
      guestCount: context.guestCount,
      roomQuantity: values.roomQuantity,
      guestName: values.guestName,
      guestPhone: values.guestPhone,
      ...(values.guestEmail ? { guestEmail: values.guestEmail } : {}),
    };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) {
      try {
        attempt.current = { key: makeIdempotencyKey(), fingerprint };
      } catch {
        setFailure('server-error');
        return;
      }
    }

    try {
      const response = await submitBookingRequest(payload, attempt.current.key);
      setBooking({ response, submittedPhone: values.guestPhone });
    } catch (error) {
      const kind = error instanceof BookingApiError ? error.kind : 'server-error';
      setFailure(kind);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const runSubmit = form.handleSubmit(submit, (invalid) => {
      const first = Object.keys(invalid)[0] as keyof BookingFormInput | undefined;
      if (!first) return;

      const fieldIds: Record<keyof BookingFormInput, string> = {
        roomQuantity: 'booking-quantity',
        guestName: 'booking-name',
        guestPhone: 'booking-phone',
        guestEmail: 'booking-email',
      };
      form.setFocus(first);
      window.setTimeout(() => {
        document.getElementById(fieldIds[first])?.scrollIntoView({
          block: 'center',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
      }, 0);
    });
    void runSubmit(event)
      .catch(() => setFailure('server-error'))
      .finally(() => {
        submitting.current = false;
      });
  }

  if (booking) {
    return (
      <Confirmation
        booking={booking.response}
        submittedPhone={booking.submittedPhone}
        hotelContactPhone={hotelContactPhone}
      />
    );
  }

  const errors = form.formState.errors;
  const fieldMessage = (field: keyof BookingFormInput) =>
    errors[field]?.message as string | undefined;

  return (
    <section
      className={'mx-auto my-10 w-[min(calc(100%-2rem),70rem)] sm:my-16'}
      aria-labelledby="booking-title"
    >
      <div className={'mb-6 max-w-3xl sm:mb-8'}>
        <h1
          id="booking-title"
          className="text-3xl font-bold leading-tight text-primary-strong sm:text-4xl"
        >
          درخواست اقامت
        </h1>
        <p className="mt-2 text-base leading-8 text-muted-foreground">
          اطلاعات تماس را برای پیگیری درخواست وارد کنید.
        </p>
      </div>
      <div className={'grid items-start gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(17rem,.85fr)]'}>
        <form
          className={'rounded-3xl bg-surface p-5 sm:p-8'}
          noValidate
          onSubmit={handleFormSubmit}
          aria-label="فرم درخواست اقامت"
        >
          <FieldSet
            disabled={form.formState.isSubmitting}
            className={'grid min-w-0 gap-0 border-0 p-0'}
          >
            <FieldLegend className={'mb-4 text-xl font-bold text-primary-strong'}>
              مشخصات درخواست
            </FieldLegend>
            <FieldGroup className={'grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2'}>
              <Controller
                control={form.control}
                name="roomQuantity"
                render={({ field }) => (
                  <Field
                    className={`${'min-w-0 gap-2'} ${'sm:col-span-1'}`}
                    data-invalid={Boolean(fieldMessage('roomQuantity'))}
                  >
                    <FieldLabel htmlFor="booking-quantity">تعداد اتاق</FieldLabel>
                    <Select
                      items={roomQuantityOptions}
                      name={field.name}
                      value={field.value}
                      onValueChange={(value) => field.onChange(String(value ?? ''))}
                      disabled={form.formState.isSubmitting}
                    >
                      <SelectTrigger
                        id="booking-quantity"
                        ref={field.ref}
                        onBlur={field.onBlur}
                        aria-invalid={Boolean(fieldMessage('roomQuantity'))}
                        aria-describedby={
                          fieldMessage('roomQuantity')
                            ? 'booking-quantity-error'
                            : 'booking-quantity-help'
                        }
                      >
                        <SelectValue placeholder="تعداد اتاق را انتخاب کنید" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomQuantityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription
                      id="booking-quantity-help"
                      className={'text-sm leading-relaxed text-muted-foreground'}
                    >
                      ظرفیت هر اتاق حداکثر {formatPersianInteger(room.maxGuestsPerRoom)} نفر است؛
                      برای {formatPersianInteger(context.guestCount)} مهمان، حداقل{' '}
                      {formatPersianInteger(minimumRooms)} اتاق لازم است.
                    </FieldDescription>
                    <FieldError
                      id="booking-quantity-error"
                      className={'text-sm font-semibold text-destructive'}
                    >
                      {fieldMessage('roomQuantity')}
                    </FieldError>
                  </Field>
                )}
              />
              <Field
                className={`${'min-w-0 gap-2'} ${'sm:col-span-1'}`}
                data-invalid={Boolean(fieldMessage('guestName'))}
              >
                <FieldLabel htmlFor="booking-name">نام و نام خانوادگی</FieldLabel>
                <Input
                  className={'w-full min-w-0'}
                  id="booking-name"
                  autoComplete="name"
                  maxLength={160}
                  placeholder="نام خود را وارد کنید"
                  {...form.register('guestName')}
                  aria-invalid={Boolean(fieldMessage('guestName'))}
                  aria-describedby={fieldMessage('guestName') ? 'booking-name-error' : undefined}
                />
                <FieldError
                  id="booking-name-error"
                  className={'text-sm font-semibold text-destructive'}
                >
                  {fieldMessage('guestName')}
                </FieldError>
              </Field>
              <Field className={'min-w-0 gap-2'} data-invalid={Boolean(fieldMessage('guestPhone'))}>
                <FieldLabel htmlFor="booking-phone">شماره موبایل</FieldLabel>
                <Input
                  className={'w-full min-w-0'}
                  id="booking-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={32}
                  placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹"
                  dir="ltr"
                  {...form.register('guestPhone')}
                  aria-invalid={Boolean(fieldMessage('guestPhone'))}
                  aria-describedby={
                    fieldMessage('guestPhone') ? 'booking-phone-error' : 'booking-phone-help'
                  }
                />
                <FieldDescription
                  id="booking-phone-help"
                  className={'text-sm leading-relaxed text-muted-foreground'}
                >
                  شمارهٔ همراه ایران را با هر شکل نوشتاری وارد کنید.
                </FieldDescription>
                <FieldError
                  id="booking-phone-error"
                  className={'text-sm font-semibold text-destructive'}
                >
                  {fieldMessage('guestPhone')}
                </FieldError>
              </Field>
              <Field className={'min-w-0 gap-2'} data-invalid={Boolean(fieldMessage('guestEmail'))}>
                <FieldLabel htmlFor="booking-email">
                  ایمیل{' '}
                  <span className={'text-sm font-normal text-muted-foreground'}>(اختیاری)</span>
                </FieldLabel>
                <Input
                  className={'w-full min-w-0'}
                  id="booking-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="name@example.com"
                  dir="ltr"
                  {...form.register('guestEmail')}
                  aria-invalid={Boolean(fieldMessage('guestEmail'))}
                  aria-describedby={fieldMessage('guestEmail') ? 'booking-email-error' : undefined}
                />
                <FieldError
                  id="booking-email-error"
                  className={'text-sm font-semibold text-destructive'}
                >
                  {fieldMessage('guestEmail')}
                </FieldError>
              </Field>
            </FieldGroup>
          </FieldSet>
          <Alert
            role="note"
            variant="warning"
            className="mt-6 grid-cols-[auto_1fr] items-start gap-3 border-warning/20 bg-warning-soft text-warning"
          >
            <AlertTriangle aria-hidden="true" className="mt-1 size-5" />
            <p className="m-0 text-sm leading-7 text-foreground">
              درخواست پس از ثبت، <strong>منتظر تأیید پذیرش</strong> می‌ماند. ثبت این فرم به معنی
              تأیید نهایی نیست.
            </p>
          </Alert>
          {failure === 'availability-changed' ? (
            <p
              className={
                'mt-4 rounded-xl border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm font-semibold leading-7 text-destructive'
              }
              role="alert"
            >
              این اتاق دیگر برای تمام شب‌های انتخاب‌شده در دسترس نیست.{' '}
              <Link href="/#stay-search">جستجوی دوباره</Link> و انتخاب ظرفیت تازه.
            </p>
          ) : null}
          {failure === 'server-error' ? (
            <p
              className={
                'mt-4 rounded-xl border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm font-semibold leading-7 text-destructive'
              }
              role="alert"
            >
              خطا در ثبت درخواست. اطلاعات حفظ شده است؛ دوباره تلاش کنید.
            </p>
          ) : null}
          {failure !== 'availability-changed' ? (
            <Button
              className={'mt-5 min-h-12 w-full sm:w-auto'}
              size="lg"
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? 'در حال ثبت درخواست…'
                : failure === 'server-error'
                  ? 'دوباره تلاش کنید'
                  : 'ثبت درخواست اقامت'}
            </Button>
          ) : null}
        </form>
        <aside className="row-start-1 md:sticky md:top-4 md:row-auto" aria-label="خلاصهٔ اقامت">
          <Card className="overflow-hidden rounded-3xl border-border p-4 sm:p-6">
            <div className={'mb-4'}>
              <h2>{room.name}</h2>
            </div>
            <RoomImage slug={room.slug} />
            <StaySummary
              checkIn={context.checkIn}
              checkOut={context.checkOut}
              guestCount={context.guestCount}
              roomQuantity={quantity}
              total={estimated}
            />
            <p className={'mt-3 text-sm leading-7 text-muted-foreground'}>
              این مبلغ، برآورد بر اساس نرخ فعلی است. مبلغ قطعی را سامانه هنگام ثبت درخواست محاسبه
              می‌کند.
            </p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
