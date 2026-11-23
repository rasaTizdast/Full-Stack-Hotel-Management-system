'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { StaffApiError } from '@/lib/staff-api';
import { formatGregorianAsJalali, getHotelTodayIso, toGregorianIso } from '@/lib/jalali-date';
import {
  adjustStaffFolio,
  checkoutStaffFolio,
  getStaffFolio,
  getStaffServiceItems,
  postStaffServiceCharge,
  recordStaffFolioPayment,
  refundStaffFolioPayment,
  type StaffFolio,
  type StaffFolioEntry,
  type StaffFolioPaymentInput,
  type StaffServiceItem,
} from '@/lib/staff-folios-api';
import { extendStaffStay } from '@/lib/staff-front-desk-api';
import { useStaffSession } from '../staff-session-provider';
import styles from './folios.module.css';

function messageFor(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.code === 'FOLIO_PAYMENT_EXCEEDS_BALANCE') {
      return 'مبلغ پرداخت نمی‌تواند از مانده صورتحساب بیشتر باشد.';
    }
    if (error.code === 'FOLIO_BALANCE_NOT_SETTLED') {
      return 'برای خروج، مانده صورتحساب باید تسویه شود.';
    }
    if (error.code === 'STAY_EXTENSION_REQUIRED') {
      return 'تاریخ خروج رزرو گذشته است؛ پیش از ثبت خروج، تمدید اقامت را ثبت کنید.';
    }
    if (error.code === 'STAY_EXTENSION_NOT_LATER') {
      return 'تاریخ خروج جدید باید بعد از تاریخ خروج فعلی باشد.';
    }
    if (error.code === 'STAY_EXTENSION_WINDOW_CLOSED') {
      return 'تاریخ خروج جدید باید دست‌کم تا امروز کاری هتل ادامه داشته باشد.';
    }
    if (error.code === 'STAY_EXTENSION_INVENTORY_MISSING') {
      return 'موجودی شب‌های تمدید کامل نیست؛ پیش از ادامه با پذیرش هماهنگ کنید.';
    }
    if (error.code === 'ON_ACCOUNT_REASON_REQUIRED') {
      return 'برای ثبت مانده قابل دریافت، دلیل لازم است.';
    }
    if (error.code === 'REFUND_EXCEEDS_SOURCE_PAYMENT') {
      return 'مبلغ استرداد از مبلغ پرداخت‌نشده بیشتر است.';
    }
  }
  if (error instanceof StaffApiError && error.status === 403) {
    return 'این اقدام برای نقش شما مجاز نیست.';
  }
  if (error instanceof StaffApiError && error.status === 409) {
    return 'وضعیت اقامت یا صورتحساب تغییر کرده است؛ اطلاعات را تازه کنید و دوباره بررسی کنید.';
  }
  return error instanceof Error ? error.message : 'درخواست انجام نشد. دوباره تلاش کنید.';
}

function formatToman(value: string): string {
  try {
    const amount = BigInt(value);
    const sign = amount < BigInt(0) ? '−' : '';
    const absolute = amount < BigInt(0) ? -amount : amount;
    return `${sign}${new Intl.NumberFormat('en-US').format(absolute)}`;
  } catch {
    return value;
  }
}

function jalaliDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function localTimestamp(value: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
}

function amountText(value: string): string {
  return `${formatToman(value)} تومان`;
}

function makeIdempotencyKey(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function canAdjustEntry(entry: StaffFolioEntry): boolean {
  return !entry.correctsEntryId && entry.kind !== 'PAYMENT' && entry.kind !== 'REFUND';
}

function paymentMethodLabel(method: StaffFolioEntry['paymentMethod']): string {
  switch (method) {
    case 'CASH':
      return 'نقدی';
    case 'BANK_TERMINAL':
      return 'کارت‌خوان';
    case 'BANK_TRANSFER':
      return 'حواله بانکی';
    case 'OTHER':
      return 'سایر';
    default:
      return '';
  }
}

function refundableAmount(payment: StaffFolioEntry, entries: StaffFolioEntry[]): bigint {
  const refunded = entries
    .filter((entry) => entry.kind === 'REFUND' && entry.correctsEntryId === payment.id)
    .reduce((total, entry) => total + BigInt(entry.amountToman), BigInt(0));
  return BigInt(payment.amountToman) - refunded;
}

function serviceDateInput(isoDate: string, value: string, onChange: (value: string) => void) {
  return (
    <label className={styles.field}>
      <span>تاریخ خدمت · شمسی</span>
      <input
        inputMode="numeric"
        placeholder="۱۴۰۵/۰۹/۰۲"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="folio-service-date-help"
      />
      <small id="folio-service-date-help">
        تاریخ امروز: {jalaliDate(isoDate)} · قالب سال/ماه/روز
      </small>
    </label>
  );
}

function stayExtensionDateInput(value: string, onChange: (value: string) => void) {
  return (
    <label className={styles.field}>
      <span>تاریخ خروج جدید · شمسی</span>
      <input
        inputMode="numeric"
        placeholder="۱۴۰۵/۰۹/۰۲"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="تاریخ خروج جدید · شمسی"
      />
      <small>تاریخ خروج باید پس از تاریخ برنامه‌ریزی‌شده و دست‌کم برابر امروز باشد.</small>
    </label>
  );
}

export function StaffFolioPage({ bookingId }: { bookingId: string }) {
  const { status, staff, csrfToken } = useStaffSession();
  const role = staff?.role;
  const canView =
    status === 'authenticated' &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'CASHIER'].includes(role ?? '');
  const canPost =
    status === 'authenticated' && ['ADMIN', 'MANAGER', 'CASHIER'].includes(role ?? '');
  const canAdjust = status === 'authenticated' && ['ADMIN', 'MANAGER'].includes(role ?? '');
  const canCheckout =
    status === 'authenticated' &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'CASHIER'].includes(role ?? '');
  const [folio, setFolio] = useState<StaffFolio | null>(null);
  const [serviceItems, setServiceItems] = useState<StaffServiceItem[]>([]);
  const [serviceItemId, setServiceItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serviceDate, setServiceDate] = useState(
    () => formatGregorianAsJalali(getHotelTodayIso()) ?? '',
  );
  const [roomAssignmentId, setRoomAssignmentId] = useState('');
  const [adjustment, setAdjustment] = useState<{
    entry: StaffFolioEntry;
    amountToman: string;
    reason: string;
  } | null>(null);
  const [refund, setRefund] = useState<{
    entry: StaffFolioEntry;
    amountToman: string;
    reason: string;
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<StaffFolioPaymentInput['method']>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [onAccountReason, setOnAccountReason] = useState('');
  const [extensionDate, setExtensionDate] = useState(
    () => formatGregorianAsJalali(getHotelTodayIso()) ?? '',
  );
  const [extensionReason, setExtensionReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [folioResult, services] = await Promise.all([
        getStaffFolio(bookingId),
        canPost ? getStaffServiceItems() : Promise.resolve({ items: [] }),
      ]);
      setError(null);
      setFolio(folioResult);
      setServiceItems(services.items);
      setServiceItemId(
        (selected) => selected || services.items.find((item) => item.isActive)?.id || '',
      );
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsLoading(false);
    }
  }, [bookingId, canPost]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const serviceDateIso = toGregorianIso(serviceDate);
  const applicableAssignments = useMemo(
    () =>
      folio?.booking.assignments.filter(
        (assignment) =>
          serviceDateIso &&
          assignment.startDate <= serviceDateIso &&
          serviceDateIso < assignment.endDate,
      ) ?? [],
    [folio?.booking.assignments, serviceDateIso],
  );

  async function postService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !csrfToken) return;
    const normalizedDate = toGregorianIso(serviceDate);
    const normalizedQuantity = Number(quantity);
    if (
      !serviceItemId ||
      !normalizedDate ||
      !Number.isInteger(normalizedQuantity) ||
      normalizedQuantity < 1 ||
      normalizedQuantity > 100
    ) {
      setError('خدمت، تاریخ شمسی معتبر و تعداد بین ۱ تا ۱۰۰ را وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await postStaffServiceCharge(
        folio.booking.id,
        {
          serviceItemId,
          quantity: normalizedQuantity,
          serviceDate: normalizedDate,
          ...(roomAssignmentId ? { roomAssignmentId } : {}),
        },
        makeIdempotencyKey('service'),
        csrfToken,
      );
      setFolio(updated);
      setQuantity('1');
      setSuccess('خدمت به صورتحساب اضافه شد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !adjustment || !csrfToken) return;
    if (!/^[1-9]\d*$/.test(adjustment.amountToman) || adjustment.reason.trim().length < 3) {
      setError('مبلغ مثبت و دلیل حداقل سه‌حرفی لازم است.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await adjustStaffFolio(
        folio.booking.id,
        {
          correctsEntryId: adjustment.entry.id,
          amountToman: adjustment.amountToman,
          reason: adjustment.reason.trim(),
        },
        makeIdempotencyKey('adjust'),
        csrfToken,
      );
      setFolio(updated);
      setAdjustment(null);
      setSuccess('اصلاح به‌صورت ردیف جبرانی ثبت شد؛ ردیف اصلی تغییر نکرد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !csrfToken) return;
    if (!/^[1-9]\d*$/.test(paymentAmount)) {
      setError('مبلغ پرداخت باید عدد صحیح و مثبت به تومان باشد.');
      return;
    }
    const amount = BigInt(paymentAmount);
    const balance = BigInt(folio.balanceToman);
    if (balance <= BigInt(0) || amount > balance) {
      setError('مبلغ پرداخت از مانده مثبت صورتحساب بیشتر است.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await recordStaffFolioPayment(
        folio.booking.id,
        {
          amountToman: paymentAmount,
          method: paymentMethod,
          ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
        },
        makeIdempotencyKey('payment'),
        csrfToken,
      );
      setFolio(updated);
      setPaymentAmount('');
      setPaymentReference('');
      setSuccess('پرداخت آفلاین در صورتحساب ثبت شد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !refund || !csrfToken) return;
    const remaining = refundableAmount(refund.entry, folio.entries);
    if (
      !/^[1-9]\d*$/.test(refund.amountToman) ||
      BigInt(refund.amountToman) > remaining ||
      refund.reason.trim().length < 3
    ) {
      setError('مبلغ استرداد باید مثبت و از مانده قابل استرداد بیشتر نباشد؛ دلیل را هم وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await refundStaffFolioPayment(
        folio.booking.id,
        {
          paymentEntryId: refund.entry.id,
          amountToman: refund.amountToman,
          reason: refund.reason.trim(),
        },
        makeIdempotencyKey('refund'),
        csrfToken,
      );
      setFolio(updated);
      setRefund(null);
      setSuccess('استرداد به‌صورت ردیف جبرانی ثبت شد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !csrfToken) return;
    const balance = BigInt(folio.balanceToman);
    if (balance < BigInt(0)) {
      setError('ابتدا اعتبار مهمان را با استرداد مجاز تسویه کنید.');
      return;
    }
    if (balance > BigInt(0) && (!canAdjust || onAccountReason.trim().length < 3)) {
      setError(
        canAdjust
          ? 'برای ثبت خروج با مانده قابل دریافت، دلیل حداقل سه‌حرفی لازم است.'
          : 'برای خروج، ابتدا مانده صورتحساب را تسویه کنید.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await checkoutStaffFolio(
        folio.booking.id,
        balance > BigInt(0) ? { onAccountReason: onAccountReason.trim() } : {},
        makeIdempotencyKey('checkout'),
        csrfToken,
      );
      setFolio(updated);
      setSuccess('خروج نهایی ثبت شد و اتاق برای نظافت علامت‌گذاری شد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitStayExtension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio || !csrfToken) return;
    const checkOut = toGregorianIso(extensionDate);
    if (
      !checkOut ||
      checkOut <= folio.booking.checkOut ||
      checkOut < getHotelTodayIso() ||
      extensionReason.trim().length < 3
    ) {
      setError('تاریخ خروج جدید و دلیل حداقل سه‌حرفی تمدید را وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await extendStaffStay(folio.booking.reference, csrfToken, {
        checkOut,
        reason: extensionReason.trim(),
      });
      setFolio(await getStaffFolio(folio.booking.id));
      setExtensionReason('');
      setSuccess('تمدید اقامت و شب‌های افزوده‌شده ثبت شد.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <p className={styles.status} role="status">
        در حال دریافت صورتحساب اقامت…
      </p>
    );
  }
  if (!canView) {
    return (
      <p className={styles.error} role="alert">
        نمایش صورتحساب برای نقش شما فعال نیست.
      </p>
    );
  }
  if (!folio) {
    return (
      <main className={styles.page}>
        <h1>صورتحساب اقامت</h1>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            setIsLoading(true);
            void load();
          }}
        >
          تلاش دوباره
        </button>
      </main>
    );
  }

  const balance = BigInt(folio.balanceToman);
  const balanceLabel =
    balance === BigInt(0) ? 'تسویه' : balance > BigInt(0) ? 'مانده بدهی' : 'اعتبار مهمان';
  const canPostForStay =
    canPost && folio.booking.status === 'CHECKED_IN' && folio.status === 'OPEN';
  const canRecordPayment =
    canPost &&
    balance > BigInt(0) &&
    ((folio.status === 'OPEN' && folio.booking.status === 'CHECKED_IN') ||
      (folio.status === 'CLOSED_DUE' && folio.booking.status === 'CHECKED_OUT'));
  const canSubmitCheckout =
    balance === BigInt(0) ||
    (balance > BigInt(0) && canAdjust && onAccountReason.trim().length >= 3);
  const isCheckedIn = folio.booking.status === 'CHECKED_IN' && folio.status === 'OPEN';
  const canExtendStay = canAdjust && isCheckedIn;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {folio.booking.status === 'CHECKED_OUT'
              ? 'صورتحساب عملیاتی · نهایی'
              : 'صورتحساب عملیاتی · موقت'}
          </p>
          <h1>صورتحساب اقامت</h1>
          <p className={styles.lead}>
            مبالغ با تومان ثبت شده‌اند. این سند، صورتحساب عملیاتی است و فاکتور مالیاتی محسوب
            نمی‌شود.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link
            className={styles.secondaryButton}
            href={`/staff/folios/${encodeURIComponent(folio.booking.id)}/print`}
          >
            چاپ صورتحساب
          </Link>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => {
              setIsLoading(true);
              void load();
            }}
          >
            دریافت دوباره
          </button>
        </div>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          {success}
        </p>
      )}

      <section className={styles.summary} aria-label="خلاصه اقامت و مانده صورتحساب">
        <div className={styles.guestBlock}>
          <p className={styles.eyebrow}>مهمان</p>
          <h2>{folio.booking.guestName}</h2>
          <p>
            شناسه رزرو <bdi dir="ltr">{folio.booking.reference}</bdi>
          </p>
          <p>
            {jalaliDate(folio.booking.checkIn)} تا{' '}
            {jalaliDate(folio.booking.actualDepartureDate ?? folio.booking.checkOut)}
          </p>
        </div>
        <div className={styles.balanceCard}>
          <span>{balanceLabel}</span>
          <strong dir="ltr">{amountText(folio.balanceToman)}</strong>
          <small>
            {folio.status === 'OPEN'
              ? 'صورتحساب باز'
              : folio.status === 'CLOSED_DUE'
                ? 'بسته با مانده'
                : 'بسته‌شده'}
          </small>
        </div>
      </section>

      {canExtendStay && (
        <section className={styles.panel} aria-labelledby="folio-extension-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>تغییر برنامه اقامت</p>
              <h2 id="folio-extension-heading">تمدید اقامت جاری</h2>
            </div>
            <span className={styles.roleHint}>
              تمدید با ظرفیت اتاق و نرخ هر شب بررسی و ثبت می‌شود.
            </span>
          </div>
          <form className={styles.formGrid} onSubmit={(event) => void submitStayExtension(event)}>
            {stayExtensionDateInput(extensionDate, setExtensionDate)}
            <label className={styles.field}>
              <span>دلیل تمدید</span>
              <input
                value={extensionReason}
                maxLength={500}
                onChange={(event) => setExtensionReason(event.target.value)}
                required
              />
            </label>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit" disabled={busy || !csrfToken}>
                {busy ? 'در حال ثبت…' : 'ثبت تمدید اقامت'}
              </button>
            </div>
          </form>
        </section>
      )}

      {canCheckout && isCheckedIn && (
        <section className={styles.panel} aria-labelledby="folio-checkout-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>پایان اقامت</p>
              <h2 id="folio-checkout-heading">تسویه نهایی و خروج</h2>
            </div>
            <span className={styles.roleHint}>
              خروج، هزینه شب‌های اقامت و وضعیت اتاق را یک‌جا ثبت می‌کند.
            </span>
          </div>
          {balance > BigInt(0) && canAdjust && (
            <label className={styles.field}>
              <span>دلیل تسویه با مانده</span>
              <input
                value={onAccountReason}
                maxLength={500}
                onChange={(event) => setOnAccountReason(event.target.value)}
                aria-describedby="folio-on-account-help"
                aria-label="دلیل تسویه با مانده"
              />
              <small id="folio-on-account-help">
                فقط مدیر یا مدیر سامانه می‌تواند خروج با مانده قابل دریافت را تأیید کند.
              </small>
            </label>
          )}
          {balance > BigInt(0) && !canAdjust && (
            <p className={styles.status}>
              برای خروج عادی، مانده {amountText(folio.balanceToman)} را ثبت و تسویه کنید.
            </p>
          )}
          {balance < BigInt(0) && (
            <p className={styles.status}>
              اعتبار مهمان باید پیش از خروج نهایی با استرداد مجاز تسویه شود.
            </p>
          )}
          <form className={styles.formActions} onSubmit={(event) => void submitCheckout(event)}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={busy || !csrfToken || !canSubmitCheckout || balance < BigInt(0)}
            >
              {busy ? 'در حال ثبت خروج…' : 'ثبت خروج'}
            </button>
          </form>
        </section>
      )}

      {canRecordPayment && (
        <section className={styles.panel} aria-labelledby="folio-payment-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>دریافت آفلاین</p>
              <h2 id="folio-payment-heading">ثبت پرداخت</h2>
            </div>
            <span className={styles.roleHint}>مبلغ باید مثبت و حداکثر برابر با مانده باشد.</span>
          </div>
          <form className={styles.formGrid} onSubmit={(event) => void submitPayment(event)}>
            <label className={styles.field}>
              <span>مبلغ پرداخت · تومان</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span>روش پرداخت</span>
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as StaffFolioPaymentInput['method'])
                }
              >
                <option value="CASH">نقدی</option>
                <option value="BANK_TERMINAL">کارت‌خوان</option>
                <option value="BANK_TRANSFER">حواله بانکی</option>
                <option value="OTHER">سایر روش‌های آفلاین</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>شماره رسید بانکی · اختیاری</span>
              <input
                dir="ltr"
                maxLength={120}
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit" disabled={busy || !csrfToken}>
                {busy ? 'در حال ثبت…' : 'ثبت پرداخت'}
              </button>
            </div>
          </form>
          <p className={styles.panelHint}>
            شماره کارت، رمز، CVV و اطلاعات احراز پرداخت را وارد نکنید.
          </p>
        </section>
      )}

      {canPostForStay && (
        <section className={styles.panel} aria-labelledby="folio-service-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>افزودن هزینه</p>
              <h2 id="folio-service-heading">ثبت خدمت</h2>
            </div>
            <span className={styles.roleHint}>قیمت از فهرست فعال خدمات برداشته می‌شود.</span>
          </div>
          {serviceItems.length === 0 ? (
            <p className={styles.emptyState}>
              خدمت فعالی در فهرست نیست؛ مدیر می‌تواند از بخش فهرست خدمات موردی اضافه کند.
            </p>
          ) : (
            <form className={styles.formGrid} onSubmit={(event) => void postService(event)}>
              <label className={styles.field}>
                <span>خدمت</span>
                <select
                  value={serviceItemId}
                  onChange={(event) => setServiceItemId(event.target.value)}
                  required
                >
                  <option value="">انتخاب خدمت</option>
                  {serviceItems
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} · {amountText(item.currentPriceToman)}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>تعداد</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>
              {serviceDateInput(getHotelTodayIso(), serviceDate, setServiceDate)}
              <label className={styles.field}>
                <span>اتاق مرتبط · اختیاری</span>
                <select
                  value={roomAssignmentId}
                  onChange={(event) => setRoomAssignmentId(event.target.value)}
                >
                  <option value="">بدون انتساب به اتاق</option>
                  {applicableAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.roomNumber ? `اتاق ${assignment.roomNumber}` : 'اتاق تخصیص‌یافته'}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.formActions}>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={busy || !csrfToken}
                >
                  {busy ? 'در حال ثبت…' : 'ثبت در صورتحساب'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {folio.booking.status !== 'CHECKED_IN' && canPost && (
        <p className={styles.status}>ثبت هزینه جدید فقط هنگام اقامت جاری ممکن است.</p>
      )}

      <section className={styles.panel} aria-labelledby="folio-ledger-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>تراکنش‌های ثبت‌شده</p>
            <h2 id="folio-ledger-heading">گردش صورتحساب</h2>
          </div>
          <span className={styles.roleHint}>
            {folio.entries.length} ردیف · مانده از سمت سرور محاسبه شده
          </span>
        </div>
        {folio.entries.length === 0 ? (
          <p className={styles.emptyState}>هنوز هزینه یا پرداختی در این صورتحساب ثبت نشده است.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.ledger}>
              <caption className={styles.srOnly}>ردیف‌های صورتحساب با مانده پس از هر ثبت</caption>
              <thead>
                <tr>
                  <th scope="col">تاریخ</th>
                  <th scope="col">شرح</th>
                  <th scope="col">اتاق</th>
                  <th scope="col">نوع</th>
                  <th scope="col">بدهکار</th>
                  <th scope="col">بستانکار</th>
                  <th scope="col">مانده</th>
                  <th scope="col">ثبت‌کننده</th>
                  {canAdjust && <th scope="col">اقدام</th>}
                </tr>
              </thead>
              <tbody>
                {folio.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {jalaliDate(entry.serviceDate)}
                      <small>{localTimestamp(entry.createdAt)}</small>
                    </td>
                    <td>
                      <strong>{entry.description}</strong>
                      {entry.quantity !== null && (
                        <small>
                          {entry.quantity} × {amountText(entry.unitAmountToman ?? '0')}
                        </small>
                      )}
                      {entry.correctionReason && (
                        <small>دلیل اصلاح: {entry.correctionReason}</small>
                      )}
                      {entry.paymentMethod && (
                        <small>روش پرداخت: {paymentMethodLabel(entry.paymentMethod)}</small>
                      )}
                      {entry.paymentReference && (
                        <small>
                          شناسه رسید: <bdi dir="ltr">{entry.paymentReference}</bdi>
                        </small>
                      )}
                    </td>
                    <td>{entry.roomNumber ? `اتاق ${entry.roomNumber}` : '—'}</td>
                    <td>
                      <span
                        className={
                          entry.direction === 'DEBIT' ? styles.debitBadge : styles.creditBadge
                        }
                      >
                        {entry.direction === 'DEBIT' ? 'بدهکار' : 'بستانکار'}
                      </span>
                    </td>
                    <td dir="ltr">
                      {entry.direction === 'DEBIT' ? amountText(entry.amountToman) : '—'}
                    </td>
                    <td dir="ltr">
                      {entry.direction === 'CREDIT' ? amountText(entry.amountToman) : '—'}
                    </td>
                    <td dir="ltr" className={styles.runningBalance}>
                      {amountText(entry.balanceAfterToman)}
                    </td>
                    <td>{entry.actorUsername ?? 'سامانه'}</td>
                    {canAdjust && (
                      <td>
                        {canAdjustEntry(entry) && (
                          <button
                            className={styles.textButton}
                            type="button"
                            onClick={() =>
                              setAdjustment({ entry, amountToman: entry.amountToman, reason: '' })
                            }
                          >
                            اصلاح
                          </button>
                        )}
                        {canAdjust &&
                          entry.kind === 'PAYMENT' &&
                          refundableAmount(entry, folio.entries) > BigInt(0) && (
                            <button
                              className={styles.textButton}
                              type="button"
                              onClick={() =>
                                setRefund({
                                  entry,
                                  amountToman: refundableAmount(entry, folio.entries).toString(),
                                  reason: '',
                                })
                              }
                            >
                              ثبت استرداد
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adjustment && (
        <section className={styles.panel} aria-labelledby="folio-adjust-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>ردیف اصلی باقی می‌ماند</p>
              <h2 id="folio-adjust-heading">ثبت اصلاح جبرانی</h2>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setAdjustment(null)}
            >
              بستن
            </button>
          </div>
          <p className={styles.panelHint}>
            ردیف: {adjustment.entry.description} · حداکثر {amountText(adjustment.entry.amountToman)}
          </p>
          <form className={styles.formGrid} onSubmit={(event) => void submitAdjustment(event)}>
            <label className={styles.field}>
              <span>مبلغ اصلاح · تومان</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={adjustment.amountToman}
                onChange={(event) =>
                  setAdjustment((current) =>
                    current ? { ...current, amountToman: event.target.value } : null,
                  )
                }
                required
              />
            </label>
            <label className={styles.field}>
              <span>دلیل اصلاح</span>
              <input
                value={adjustment.reason}
                maxLength={500}
                onChange={(event) =>
                  setAdjustment((current) =>
                    current ? { ...current, reason: event.target.value } : null,
                  )
                }
                required
              />
            </label>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit" disabled={busy || !csrfToken}>
                {busy ? 'در حال ثبت…' : 'ثبت اصلاح'}
              </button>
            </div>
          </form>
        </section>
      )}

      {refund && (
        <section className={styles.panel} aria-labelledby="folio-refund-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>ردیف پرداخت اصلی باقی می‌ماند</p>
              <h2 id="folio-refund-heading">ثبت استرداد پرداخت</h2>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setRefund(null)}
            >
              بستن
            </button>
          </div>
          <p className={styles.panelHint}>
            حداکثر مبلغ قابل استرداد:{' '}
            {amountText(refundableAmount(refund.entry, folio.entries).toString())}
          </p>
          <form className={styles.formGrid} onSubmit={(event) => void submitRefund(event)}>
            <label className={styles.field}>
              <span>مبلغ استرداد · تومان</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={refund.amountToman}
                onChange={(event) =>
                  setRefund((current) =>
                    current ? { ...current, amountToman: event.target.value } : null,
                  )
                }
                required
              />
            </label>
            <label className={styles.field}>
              <span>دلیل استرداد</span>
              <input
                value={refund.reason}
                maxLength={500}
                onChange={(event) =>
                  setRefund((current) =>
                    current ? { ...current, reason: event.target.value } : null,
                  )
                }
                required
              />
            </label>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit" disabled={busy || !csrfToken}>
                {busy ? 'در حال ثبت…' : 'تأیید استرداد'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
