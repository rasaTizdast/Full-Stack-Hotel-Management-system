'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import styles from './booking-flow.module.css';

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
    <div className={styles.roomImage}>
      <Image src={image.src} alt={image.alt} fill sizes="(max-width: 760px) 100vw, 38vw" />
      <span className={styles.imageCaption}>خانه‌باغ نارنج، شیراز</span>
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span className={styles.fieldError} id={id} role="alert">
      {message}
    </span>
  );
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
    <dl className={styles.summary}>
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
      <div className={styles.summaryTotal}>
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
      className={styles.confirmation}
      aria-labelledby="booking-confirmation-title"
    >
      <span className={styles.confirmationMark} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="m4.5 10.5 3.6 3.6 7.4-8.1" />
        </svg>
      </span>
      <RoomImage slug={booking.roomType.slug} />
      <p className={styles.confirmationStatus}>درخواست شما دریافت شد</p>
      <h1 ref={headingRef} id="booking-confirmation-title" tabIndex={-1}>
        درخواست اقامت شما ثبت شد
      </h1>
      <p className={styles.confirmationLead}>
        پذیرش ظرفیت و مبلغ را بررسی می‌کند و نتیجهٔ درخواست را به شما اطلاع می‌دهد.
      </p>
      <div className={styles.reference}>
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
      <p className={styles.pendingNote}>
        وضعیت درخواست: <strong>در انتظار تأیید پذیرش</strong>
      </p>
      <div className={styles.followUp}>
        <p>پذیرش برای پیگیری درخواست با این شماره تماس می‌گیرد:</p>
        <bdi className={styles.followUpPhone} dir="ltr">
          {submittedPhone}
        </bdi>
        {propertyPhoneHref ? (
          <a className={styles.contactLink} href={propertyPhoneHref} dir="rtl">
            تماس با اقامتگاه: <bdi dir="ltr">{hotelContactPhone}</bdi>
          </a>
        ) : null}
      </div>
      <Link href="/" className={styles.backLink}>
        بازگشت به اقامتگاه
      </Link>
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
      setFailure(error instanceof BookingApiError ? error.kind : 'server-error');
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const runSubmit = form.handleSubmit(submit, (invalid) => {
      const first = Object.keys(invalid)[0] as keyof BookingFormInput | undefined;
      if (first) form.setFocus(first);
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
    <section className={styles.booking} aria-labelledby="booking-title">
      <div className={styles.intro}>
        <h1 id="booking-title">درخواست اقامت</h1>
        <p>اطلاعات تماس را برای پیگیری درخواست وارد کنید.</p>
      </div>
      <div className={styles.layout}>
        <form
          className={styles.form}
          noValidate
          onSubmit={handleFormSubmit}
          aria-label="فرم درخواست اقامت"
        >
          <fieldset disabled={form.formState.isSubmitting} className={styles.fields}>
            <legend>مشخصات درخواست</legend>
            <div className={styles.field}>
              <label htmlFor="booking-quantity">تعداد اتاق</label>
              <select
                id="booking-quantity"
                {...form.register('roomQuantity')}
                aria-invalid={Boolean(fieldMessage('roomQuantity'))}
                aria-describedby={
                  fieldMessage('roomQuantity') ? 'booking-quantity-error' : undefined
                }
              >
                {Array.from(
                  { length: Math.max(0, maxRooms - minimumRooms + 1) },
                  (_, index) => minimumRooms + index,
                ).map((count) => (
                  <option value={String(count)} key={count}>
                    {formatPersianInteger(count)} اتاق
                  </option>
                ))}
              </select>
              <span className={styles.hint}>
                ظرفیت هر اتاق حداکثر {formatPersianInteger(room.maxGuestsPerRoom)} نفر است؛ برای{' '}
                {formatPersianInteger(context.guestCount)} مهمان، حداقل{' '}
                {formatPersianInteger(minimumRooms)} اتاق لازم است.
              </span>
              <FieldError id="booking-quantity-error" message={fieldMessage('roomQuantity')} />
            </div>
            <div className={styles.field}>
              <label htmlFor="booking-name">نام و نام خانوادگی</label>
              <input
                id="booking-name"
                autoComplete="name"
                maxLength={160}
                {...form.register('guestName')}
                aria-invalid={Boolean(fieldMessage('guestName'))}
                aria-describedby={fieldMessage('guestName') ? 'booking-name-error' : undefined}
              />
              <FieldError id="booking-name-error" message={fieldMessage('guestName')} />
            </div>
            <div className={styles.field}>
              <label htmlFor="booking-phone">شماره موبایل</label>
              <input
                id="booking-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={32}
                dir="ltr"
                {...form.register('guestPhone')}
                aria-invalid={Boolean(fieldMessage('guestPhone'))}
                aria-describedby={
                  fieldMessage('guestPhone') ? 'booking-phone-error' : 'booking-phone-help'
                }
              />
              <span className={styles.hint} id="booking-phone-help">
                شمارهٔ همراه ایران را با هر شکل نوشتاری وارد کنید.
              </span>
              <FieldError id="booking-phone-error" message={fieldMessage('guestPhone')} />
            </div>
            <div className={styles.field}>
              <label htmlFor="booking-email">
                ایمیل <span>(اختیاری)</span>
              </label>
              <input
                id="booking-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                dir="ltr"
                {...form.register('guestEmail')}
                aria-invalid={Boolean(fieldMessage('guestEmail'))}
                aria-describedby={fieldMessage('guestEmail') ? 'booking-email-error' : undefined}
              />
              <FieldError id="booking-email-error" message={fieldMessage('guestEmail')} />
            </div>
          </fieldset>
          <div className={styles.notice}>
            <span aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M10 2.75 18 17H2l8-14.25Z" />
                <path d="M10 7v4.5M10 14.25v.1" />
              </svg>
            </span>
            <p>
              درخواست پس از ثبت، <strong>منتظر تأیید پذیرش</strong> می‌ماند. ثبت این فرم به معنی
              تأیید نهایی نیست.
            </p>
          </div>
          {failure === 'availability-changed' ? (
            <p className={styles.error} role="alert">
              این اتاق دیگر برای تمام شب‌های انتخاب‌شده در دسترس نیست.{' '}
              <Link href="/#stay-search">جستجوی دوباره</Link> و انتخاب ظرفیت تازه.
            </p>
          ) : null}
          {failure === 'server-error' ? (
            <p className={styles.error} role="alert">
              خطا در ثبت درخواست. اطلاعات حفظ شده است؛ دوباره تلاش کنید.
            </p>
          ) : null}
          {failure !== 'availability-changed' ? (
            <button className={styles.submit} type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? 'در حال ثبت درخواست…'
                : failure === 'server-error'
                  ? 'دوباره تلاش کنید'
                  : 'ثبت درخواست اقامت'}
            </button>
          ) : null}
        </form>
        <aside className={styles.aside} aria-label="خلاصهٔ اقامت">
          <RoomImage slug={room.slug} />
          <h2>{room.name}</h2>
          <StaySummary
            checkIn={context.checkIn}
            checkOut={context.checkOut}
            guestCount={context.guestCount}
            roomQuantity={quantity}
            total={estimated}
          />
          <p className={styles.estimateNote}>
            این مبلغ، برآورد بر اساس نرخ فعلی است. مبلغ قطعی را سامانه هنگام ثبت درخواست محاسبه
            می‌کند.
          </p>
        </aside>
      </div>
    </section>
  );
}
