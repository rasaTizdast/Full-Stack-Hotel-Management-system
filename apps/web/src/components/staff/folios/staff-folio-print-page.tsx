'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import {
  getStaffFolioPrint,
  type StaffFolioPrint,
  type StaffFolioEntry,
} from '@/lib/staff-folios-api';
import { StaffApiError } from '@/lib/staff-api';
import { useStaffSession } from '../staff-session-provider';
import styles from './folio-print.module.css';

function amountText(value: string): string {
  try {
    return `${new Intl.NumberFormat('en-US').format(BigInt(value))} تومان`;
  } catch {
    return `${value} تومان`;
  }
}

function jalaliDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function localTimestamp(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
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

function entryKindLabel(kind: StaffFolioEntry['kind']): string {
  switch (kind) {
    case 'ACCOMMODATION':
      return 'اقامت';
    case 'SERVICE':
      return 'خدمت';
    case 'FEE':
      return 'هزینه';
    case 'TAX':
      return 'مالیات';
    case 'DISCOUNT':
      return 'تخفیف';
    case 'ADJUSTMENT':
      return 'اصلاح';
    case 'PAYMENT':
      return 'پرداخت';
    case 'REFUND':
      return 'بازپرداخت';
  }
}

function messageFor(error: unknown): string {
  if (error instanceof StaffApiError && error.status === 403) {
    return 'نمایش صورتحساب برای نقش شما فعال نیست.';
  }
  return error instanceof Error ? error.message : 'دریافت صورتحساب چاپی انجام نشد.';
}

export function StaffFolioPrintPage({ bookingId }: { bookingId: string }) {
  const { status, staff } = useStaffSession();
  const canView =
    status === 'authenticated' &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'CASHIER'].includes(staff?.role ?? '');
  const [statement, setStatement] = useState<StaffFolioPrint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    void getStaffFolioPrint(bookingId)
      .then((result) => {
        if (!active) return;
        setStatement(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFor(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookingId, canView]);

  if (status === 'loading' || (canView && loading)) {
    return (
      <p className={styles.status} role="status">
        در حال دریافت نسخه چاپی صورتحساب…
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
  if (!statement) {
    return (
      <main className={styles.page}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Link
          className={styles.screenButton}
          href={`/staff/folios/${encodeURIComponent(bookingId)}`}
        >
          بازگشت به صورتحساب
        </Link>
      </main>
    );
  }

  const { folio } = statement;
  const debits = folio.entries
    .filter((entry) => entry.direction === 'DEBIT')
    .reduce((total, entry) => total + BigInt(entry.amountToman), BigInt(0))
    .toString();
  const credits = folio.entries
    .filter((entry) => entry.direction === 'CREDIT')
    .reduce((total, entry) => total + BigInt(entry.amountToman), BigInt(0))
    .toString();

  return (
    <main className={styles.page}>
      <nav className={styles.toolbar} aria-label="اقدام‌های چاپ">
        <Link
          className={styles.screenButton}
          href={`/staff/folios/${encodeURIComponent(bookingId)}`}
        >
          بازگشت به صورتحساب
        </Link>
        <button className={styles.printButton} type="button" onClick={() => window.print()}>
          چاپ
        </button>
      </nav>

      <article className={styles.paper} aria-labelledby="folio-print-title">
        <header className={styles.documentHeader}>
          <div>
            <p className={styles.eyebrow}>صورتحساب اقامت · سند عملیاتی</p>
            <h1 id="folio-print-title">
              {statement.label === 'Final folio' ? 'صورتحساب نهایی' : 'صورتحساب موقت'}
            </h1>
            <p className={styles.taxNote}>صورتحساب عملیاتی؛ فاکتور مالیاتی نیست.</p>
          </div>
          <div className={styles.printTime}>
            <span>زمان تهیه</span>
            <bdi dir="auto">{localTimestamp(statement.printedAt, statement.hotelTimezone)}</bdi>
          </div>
        </header>

        <section className={styles.staySummary} aria-label="مشخصات اقامت">
          <div>
            <span className={styles.fieldLabel}>نام مهمان</span>
            <strong className={styles.guestName}>{folio.booking.guestName}</strong>
          </div>
          <div>
            <span className={styles.fieldLabel}>شناسه رزرو</span>
            <bdi dir="ltr">{folio.booking.reference}</bdi>
          </div>
          <div>
            <span className={styles.fieldLabel}>ورود</span>
            <span>{jalaliDate(folio.booking.checkIn)}</span>
          </div>
          <div>
            <span className={styles.fieldLabel}>خروج</span>
            <span>{jalaliDate(folio.booking.actualDepartureDate ?? folio.booking.checkOut)}</span>
          </div>
          <div>
            <span className={styles.fieldLabel}>اتاق‌ها</span>
            <span>
              {folio.booking.assignments.length
                ? folio.booking.assignments
                    .map((assignment) => assignment.roomNumber ?? 'تخصیص‌یافته')
                    .join('، ')
                : 'بدون تخصیص اتاق'}
            </span>
          </div>
        </section>

        <div className={styles.ledgerWrap}>
          <table className={styles.ledger}>
            <caption>ردیف‌های صورتحساب عملیاتی اقامت</caption>
            <colgroup>
              <col className={styles.dateColumn} />
              <col className={styles.descriptionColumn} />
              <col className={styles.roomColumn} />
              <col className={styles.methodColumn} />
              <col className={styles.amountColumn} />
              <col className={styles.amountColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">تاریخ</th>
                <th scope="col">شرح</th>
                <th scope="col">اتاق</th>
                <th scope="col">روش</th>
                <th scope="col">بدهکار</th>
                <th scope="col">بستانکار</th>
              </tr>
            </thead>
            <tbody>
              {folio.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{jalaliDate(entry.serviceDate)}</td>
                  <td className={styles.description}>
                    <strong>{entry.description}</strong>
                    {entry.quantity !== null && entry.unitAmountToman !== null && (
                      <small>
                        {entry.quantity} × {amountText(entry.unitAmountToman)}
                      </small>
                    )}
                    {entry.paymentReference && (
                      <small>
                        شناسه رسید: <bdi dir="ltr">{entry.paymentReference}</bdi>
                      </small>
                    )}
                    {entry.correctionReason && <small>دلیل: {entry.correctionReason}</small>}
                  </td>
                  <td>{entry.roomNumber ? `اتاق ${entry.roomNumber}` : '—'}</td>
                  <td>{paymentMethodLabel(entry.paymentMethod) || entryKindLabel(entry.kind)}</td>
                  <td dir="ltr">
                    {entry.direction === 'DEBIT' ? amountText(entry.amountToman) : '—'}
                  </td>
                  <td dir="ltr">
                    {entry.direction === 'CREDIT' ? amountText(entry.amountToman) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className={styles.totals} aria-label="جمع صورتحساب">
          <div>
            <span>جمع بدهکار</span>
            <strong dir="ltr">{amountText(debits)}</strong>
          </div>
          <div>
            <span>جمع بستانکار</span>
            <strong dir="ltr">{amountText(credits)}</strong>
          </div>
          <div className={styles.balanceTotal}>
            <span>مانده صورتحساب</span>
            <strong dir="ltr">{amountText(folio.balanceToman)}</strong>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>مبالغ با تومان ثبت شده‌اند.</span>
          <span>این نسخه برای استفاده عملیاتی هتل تهیه شده است.</span>
        </footer>
      </article>
    </main>
  );
}
