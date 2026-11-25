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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
      <p
        className="m-0 rounded-xl bg-surface-soft px-4 py-3 text-sm leading-7 text-muted-foreground print:hidden"
        role="status"
      >
        در حال دریافت نسخه چاپی صورتحساب…
      </p>
    );
  }
  if (!canView) {
    return (
      <p
        className="m-0 rounded-xl bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive print:hidden"
        role="alert"
      >
        نمایش صورتحساب برای نقش شما فعال نیست.
      </p>
    );
  }
  if (!statement) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-3 text-foreground sm:p-6 print:block print:max-w-none print:p-0">
        {error && (
          <p
            className="m-0 rounded-xl bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive print:hidden"
            role="alert"
          >
            {error}
          </p>
        )}
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-primary-strong no-underline hover:bg-muted print:hidden"
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
    <main className="mx-auto grid w-full max-w-6xl gap-4 p-3 text-foreground sm:p-6 print:block print:max-w-none print:p-0">
      <nav className="flex justify-end gap-3 print:hidden" aria-label="اقدام‌های چاپ">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-primary-strong no-underline hover:bg-muted"
          href={`/staff/folios/${encodeURIComponent(bookingId)}`}
        >
          بازگشت به صورتحساب
        </Link>
        <Button type="button" onClick={() => window.print()}>
          چاپ
        </Button>
      </nav>

      <Card
        className="min-w-0 rounded-2xl border-border bg-surface p-4 shadow-sm sm:p-8 print:rounded-none print:border-0 print:bg-white print:px-[8mm] print:py-0 print:shadow-none max-[680px]:print:px-[2mm]"
        aria-labelledby="folio-print-title"
      >
        <article aria-labelledby="folio-print-title">
          <header className="flex min-w-0 flex-col items-start justify-between gap-5 border-b-2 border-primary-strong pb-4 sm:flex-row">
            <div>
              <p className="mb-1 text-xs font-bold text-muted-foreground">
                صورتحساب اقامت · سند عملیاتی
              </p>
              <h1
                id="folio-print-title"
                className="text-2xl font-bold leading-tight text-primary-strong sm:text-4xl"
              >
                {statement.label === 'Final folio' ? 'صورتحساب نهایی' : 'صورتحساب موقت'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                صورتحساب عملیاتی؛ فاکتور مالیاتی نیست.
              </p>
            </div>
            <div className="grid min-w-40 gap-1 text-end text-sm max-[680px]:text-start">
              <span className="text-xs text-muted-foreground">زمان تهیه</span>
              <bdi dir="auto">{localTimestamp(statement.printedAt, statement.hotelTimezone)}</bdi>
            </div>
          </header>

          <section
            className="grid grid-cols-2 gap-x-5 gap-y-4 py-5 sm:grid-cols-3"
            aria-label="مشخصات اقامت"
          >
            <div>
              <span className="mb-1 block text-xs font-bold text-muted-foreground">نام مهمان</span>
              <strong className="block break-words text-lg leading-relaxed">
                {folio.booking.guestName}
              </strong>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold text-muted-foreground">شناسه رزرو</span>
              <bdi dir="ltr">{folio.booking.reference}</bdi>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold text-muted-foreground">ورود</span>
              <span>{jalaliDate(folio.booking.checkIn)}</span>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold text-muted-foreground">خروج</span>
              <span>{jalaliDate(folio.booking.actualDepartureDate ?? folio.booking.checkOut)}</span>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold text-muted-foreground">اتاق‌ها</span>
              <span>
                {folio.booking.assignments.length
                  ? folio.booking.assignments
                      .map((assignment) => assignment.roomNumber ?? 'تخصیص‌یافته')
                      .join('، ')
                  : 'بدون تخصیص اتاق'}
              </span>
            </div>
          </section>

          <div className="max-w-full overflow-x-auto rounded-xl border border-border print:overflow-visible print:border-0">
            <table className="w-full min-w-[42rem] border-collapse text-start text-sm print:min-w-0 print:table-fixed print:text-[9pt] max-[680px]:print:text-[8pt] [&_caption]:p-3 [&_caption]:text-start [&_caption]:text-xs [&_caption]:text-muted-foreground [&_th]:border-t [&_th]:border-border [&_th]:bg-surface-soft [&_th]:p-3 [&_th]:font-extrabold [&_th]:text-primary-strong [&_td]:border-t [&_td]:border-border [&_td]:break-normal [&_td]:p-3 [&_td]:align-top print:[&_thead]:[display:table-header-group] print:[&_tr]:break-inside-avoid print:[&_tr]:[page-break-inside:avoid] print:[&_th]:bg-neutral-200 print:[&_th]:text-neutral-950 print:[&_th]:[print-color-adjust:exact] print:[&_th]:p-1 print:[&_td]:p-1">
              <caption className="print:table-caption">ردیف‌های صورتحساب عملیاتی اقامت</caption>
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[26%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
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
                    <td className="[&_strong]:block [&_small]:mt-1 [&_small]:block [&_small]:leading-relaxed [&_small]:text-muted-foreground">
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

          <section
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 [&>div]:grid [&>div]:gap-1 [&>div]:rounded-xl [&>div]:border [&>div]:border-border [&>div]:p-3 [&_span]:text-xs [&_span]:text-muted-foreground [&_strong]:text-sm [&_strong]:font-bold [&_strong]:text-primary-strong [&_strong]:tabular-nums print:[&>div]:break-inside-avoid print:[&>div]:[page-break-inside:avoid]"
            aria-label="جمع صورتحساب"
          >
            <div>
              <span>جمع بدهکار</span>
              <strong dir="ltr">{amountText(debits)}</strong>
            </div>
            <div>
              <span>جمع بستانکار</span>
              <strong dir="ltr">{amountText(credits)}</strong>
            </div>
            <div className="grid gap-1 rounded-xl border border-highlight bg-surface-soft p-3">
              <span>مانده صورتحساب</span>
              <strong dir="ltr">{amountText(folio.balanceToman)}</strong>
            </div>
          </section>

          <footer className="mt-4 flex flex-col justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row">
            <span>مبالغ با تومان ثبت شده‌اند.</span>
            <span>این نسخه برای استفاده عملیاتی هتل تهیه شده است.</span>
          </footer>
        </article>
      </Card>
    </main>
  );
}
