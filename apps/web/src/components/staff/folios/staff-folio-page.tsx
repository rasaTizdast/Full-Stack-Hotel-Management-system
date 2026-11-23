'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { StaffApiError } from '@/lib/staff-api';
import { formatGregorianAsJalali, getHotelTodayIso, toGregorianIso } from '@/lib/jalali-date';
import {
  adjustStaffFolio,
  getStaffFolio,
  getStaffServiceItems,
  postStaffServiceCharge,
  type StaffFolio,
  type StaffFolioEntry,
  type StaffServiceItem,
} from '@/lib/staff-folios-api';
import { useStaffSession } from '../staff-session-provider';
import styles from './folios.module.css';

function messageFor(error: unknown): string {
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

export function StaffFolioPage({ bookingId }: { bookingId: string }) {
  const { status, staff, csrfToken } = useStaffSession();
  const role = staff?.role;
  const canView =
    status === 'authenticated' &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'CASHIER'].includes(role ?? '');
  const canPost =
    status === 'authenticated' && ['ADMIN', 'MANAGER', 'CASHIER'].includes(role ?? '');
  const canAdjust = status === 'authenticated' && ['ADMIN', 'MANAGER'].includes(role ?? '');
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>صورتحساب عملیاتی · موقت</p>
          <h1>صورتحساب اقامت</h1>
          <p className={styles.lead}>
            مبالغ با تومان ثبت شده‌اند. این سند، صورتحساب عملیاتی است و فاکتور مالیاتی محسوب
            نمی‌شود.
          </p>
        </div>
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
            {jalaliDate(folio.booking.checkIn)} تا {jalaliDate(folio.booking.checkOut)}
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
    </main>
  );
}
