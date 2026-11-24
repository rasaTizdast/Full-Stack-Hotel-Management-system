'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  StaffApiError,
  type StaffMember,
} from '@/lib/staff-api';
import {
  getStaffNightClosePreview,
  getStaffOperationsReport,
  runStaffNightClose,
  type StaffNightClosePreview,
  type StaffNightCloseResult,
  type StaffOperationSignal,
  type StaffOperationsReport,
  type StaffReportStay,
} from '@/lib/staff-operations-api';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';
import { useStaffSession } from '../staff-session-provider';
import styles from './staff-operations.module.css';

const canRunOperations = (staff: StaffMember | null) =>
  Boolean(staff && ['ADMIN', 'MANAGER'].includes(staff.role));

const signalLabels: Record<string, string> = {
  PREVIOUS_CLOSE_INCOMPLETE: 'بستن روز قبلی کامل نشده است',
  UNRESOLVED_DUE_IN: 'ورود امروز هنوز تعیین تکلیف نشده است',
  UNHANDLED_DUE_OUT: 'خروج امروز هنوز ثبت نشده است',
  MISSING_CHECKED_IN_ASSIGNMENT: 'اقامت ثبت‌شده اتاق تخصیص‌نیافته دارد',
  FAILED_INVARIANT: 'اطلاعات رزرو یا دفتر مالی با هم سازگار نیست',
  UPCOMING_ARRIVAL: 'ورود آینده',
  ACTIVE_IN_HOUSE: 'اقامت فعال',
  OPEN_RECEIVABLE: 'مانده دریافتنی باز',
  DIRTY_ROOM: 'اتاق نیازمند نظافت',
  MAINTENANCE_BLOCK: 'انسداد تعمیراتی فعال',
};

function dateLabel(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function toman(value: string): string {
  try {
    return `${formatPersianInteger(BigInt(value))} تومان`;
  } catch {
    return 'مبلغ نامعتبر';
  }
}

function RoleNotice() {
  return (
    <section className={styles.denied} aria-labelledby="operations-denied-title">
      <h1 id="operations-denied-title">گزارش‌ها و بستن روز</h1>
      <p role="alert">این بخش برای مدیر اقامتگاه و مدیر شیفت در دسترس است.</p>
    </section>
  );
}

function SignalList({ title, signals }: { title: string; signals: StaffOperationSignal[] }) {
  return (
    <section className={styles.signalPanel} aria-label={title}>
      <h2>{title}</h2>
      {signals.length === 0 ? (
        <p className={styles.quiet}>موردی ثبت نشده است.</p>
      ) : (
        <ul className={styles.signalList}>
          {signals.map((signal) => (
            <li key={signal.code}>
              <div>
                <strong>{signalLabels[signal.code] ?? signal.code}</strong>
                {signal.references.length > 0 && (
                  <span className={styles.references} dir="ltr">
                    {signal.references.join('، ')}
                  </span>
                )}
              </div>
              <span className={styles.count}>{formatPersianInteger(signal.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StaffNightClosePage() {
  const { status, staff, csrfToken } = useStaffSession();
  const [preview, setPreview] = useState<StaffNightClosePreview | null>(null);
  const [result, setResult] = useState<StaffNightCloseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmationRef = useRef<HTMLElement>(null);
  const canManage = canRunOperations(staff);

  useEffect(() => {
    if (!confirming) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setConfirming(false);
      if (event.key !== 'Tab') return;
      const focusable = confirmationRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        confirmationRef.current?.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === confirmationRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [confirming, saving]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getStaffNightClosePreview();
      setPreview(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'پیش‌نمایش بستن روز دریافت نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    let active = true;
    getStaffNightClosePreview()
      .then((next) => {
        if (active) setPreview(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'پیش‌نمایش بستن روز دریافت نشد.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, canManage]);

  if (status !== 'authenticated' || !staff) return null;
  if (!canManage) return <RoleNotice />;

  async function confirmClose() {
    if (!preview || !csrfToken || !preview.canClose) return;
    setSaving(true);
    setError(null);
    try {
      const closeResult = await runStaffNightClose(preview, csrfToken);
      setResult(closeResult);
      setConfirming(false);
      await loadPreview();
    } catch (cause) {
      setError(
        cause instanceof StaffApiError && cause.code === 'NIGHT_CLOSE_CONFIRMATION_STALE'
          ? 'پیش‌نمایش تغییر کرده است. اطلاعات تازه را بررسی کنید و دوباره تأیید کنید.'
          : cause instanceof Error
            ? cause.message
            : 'بستن روز انجام نشد. پس از بررسی وضعیت دوباره تلاش کنید.',
      );
      setConfirming(false);
      await loadPreview();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>عملیات پایان روز · {preview?.hotelName ?? 'مدیریت اقامتگاه'}</p>
          <h1>بستن روز کاری</h1>
          <p className={styles.lead}>
            این کار ثبت هزینه اقامت شب و انتقال تاریخ کاری اقامتگاه را در یک مرحله انجام می‌دهد.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/staff/reports">گزارش روزانه</Link>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {result && (
        <section className={styles.success} role="status" aria-live="polite">
          <div>
            <strong>روز کاری با موفقیت بسته شد.</strong>
            <p>
              تاریخ {dateLabel(result.businessDate)} به {dateLabel(result.nextBusinessDate)} منتقل شد؛{' '}
              {formatPersianInteger(result.roomNightCount)} شب اقامت به مبلغ{' '}
              <bdi>{toman(result.accommodationAmountToman)}</bdi> ثبت شد.
              {result.replayed ? ' نتیجه بسته‌شدن قبلی بازیابی شد.' : ''}
            </p>
          </div>
          <button type="button" className={styles.textButton} onClick={() => setResult(null)}>
            بستن پیام
          </button>
        </section>
      )}

      {loading && <p className={styles.loading} role="status">در حال دریافت وضعیت روز کاری…</p>}
      {!loading && !preview && (
        <section className={styles.empty}>
          <p>وضعیت بستن روز در دسترس نیست.</p>
          <button type="button" className={styles.primaryButton} onClick={() => void loadPreview()}>
            تلاش دوباره
          </button>
        </section>
      )}

      {!loading && preview && (
        <>
          <section className={styles.closeSummary} aria-label="خلاصه بستن روز">
            <div>
              <span>تاریخ کاری فعلی</span>
              <strong>{dateLabel(preview.businessDate)}</strong>
              <small dir="ltr">{preview.businessDate} · {preview.timezone}</small>
            </div>
            <div>
              <span>پس از بستن</span>
              <strong>{dateLabel(preview.nextBusinessDate)}</strong>
              <small dir="ltr">{preview.nextBusinessDate}</small>
            </div>
            <div>
              <span>هزینه اقامت قابل ثبت</span>
              <strong><bdi>{toman(preview.accommodation.amountToman)}</bdi></strong>
              <small>{formatPersianInteger(preview.accommodation.roomNightCount)} شب اتاق</small>
            </div>
            <div>
              <span>هشدارها</span>
              <strong>{formatPersianInteger(preview.warningCount)}</strong>
              <small>موارد نیازمند پیگیری</small>
            </div>
          </section>

          <div className={styles.signalGrid}>
            <SignalList title="مانع‌های بستن روز" signals={preview.blockers} />
            <SignalList title="هشدارها" signals={preview.warnings} />
          </div>

          <section className={styles.actionPanel} aria-labelledby="close-action-title">
            <div>
              <h2 id="close-action-title">آماده‌سازی بستن روز</h2>
              <p>
                {preview.canClose
                  ? 'با تأیید نهایی، هزینه اقامت ثبت و تاریخ کاری یک روز جلو می‌رود.'
                  : 'ابتدا مانع‌ها را در پذیرش، دفتر مالی یا تعمیرات برطرف کنید؛ پس از آن پیش‌نمایش را تازه کنید.'}
              </p>
            </div>
            <div className={styles.actionButtons}>
              <button type="button" className={styles.secondaryButton} onClick={() => void loadPreview()} disabled={loading || saving}>
                تازه‌سازی وضعیت
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setConfirming(true)}
                disabled={!preview.canClose || saving}
              >
                تأیید و بستن روز
              </button>
            </div>
          </section>
        </>
      )}

      {confirming && preview && (
        <div className={styles.dialogBackdrop}>
          <section
            className={styles.confirmDialog}
            ref={confirmationRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="close-confirm-title"
            aria-describedby="close-confirm-description"
          >
            <p className={styles.eyebrow}>تأیید نهایی</p>
            <h2 id="close-confirm-title">بستن روز {dateLabel(preview.businessDate)}؟</h2>
            <p id="close-confirm-description">
              هزینه {formatPersianInteger(preview.accommodation.roomNightCount)} شب اقامت، به مبلغ{' '}
              <bdi>{toman(preview.accommodation.amountToman)}</bdi> ثبت می‌شود. تاریخ کاری از{' '}
              {dateLabel(preview.businessDate)} به {dateLabel(preview.nextBusinessDate)} می‌رود و{' '}
              {formatPersianInteger(preview.warningCount)} هشدار باقی می‌ماند.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setConfirming(false)} disabled={saving}>
                بازگشت و بررسی
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void confirmClose()} disabled={saving}>
                {saving ? 'در حال بستن روز…' : 'تأیید بستن روز'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StayList({ title, stays, emptyText }: { title: string; stays: StaffReportStay[]; emptyText: string }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>{title}</h2>
        <span>{formatPersianInteger(stays.length)} مورد</span>
      </div>
      {stays.length === 0 ? (
        <p className={styles.quiet}>{emptyText}</p>
      ) : (
        <ul className={styles.stayList}>
          {stays.map((stay) => (
            <li key={`${stay.reference}-${stay.checkIn}-${stay.checkOut}`}>
              <div className={styles.stayIdentity}>
                <strong>{stay.guestName}</strong>
                <span dir="ltr">{stay.reference}</span>
              </div>
              <div className={styles.stayDetails}>
                <span>{stay.roomTypeName} · {formatPersianInteger(stay.roomQuantity)} اتاق</span>
                <span>{stay.rooms.length ? `اتاق ${stay.rooms.join('، ')}` : 'بدون تخصیص اتاق'}</span>
                <span>{dateLabel(stay.checkIn)} تا {dateLabel(stay.checkOut)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StaffOperationsReportPage() {
  const { status, staff } = useStaffSession();
  const [report, setReport] = useState<StaffOperationsReport | null>(null);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = canRunOperations(staff);

  const loadReport = useCallback(async (selectedDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getStaffOperationsReport(selectedDate);
      setReport(next);
      setDate(next.date);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'گزارش روز دریافت نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    let active = true;
    getStaffOperationsReport()
      .then((next) => {
        if (!active) return;
        setReport(next);
        setDate(next.date);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'گزارش روز دریافت نشد.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, canManage]);

  if (status !== 'authenticated' || !staff) return null;
  if (!canManage) return <RoleNotice />;

  function submitDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date) void loadReport(date);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>گزارش عملیاتی اقامتگاه</p>
          <h1>گزارش روزانه</h1>
          <p className={styles.lead}>ورود و خروج، وضعیت اتاق‌ها و گردش دفتر مالی در تاریخ انتخابی.</p>
        </div>
        <Link className={styles.secondaryButton} href="/staff/operations/close">بستن روز کاری</Link>
      </header>

      <form className={styles.dateForm} onSubmit={submitDate}>
        <label htmlFor="report-date">تاریخ کاری</label>
        <input
          id="report-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
          aria-describedby="report-date-help"
        />
        <span id="report-date-help">تاریخ فعلی اقامتگاه: {report ? dateLabel(report.businessDate) : '—'}</span>
        <button className={styles.primaryButton} type="submit" disabled={loading || !date}>
          نمایش گزارش
        </button>
      </form>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.loading} role="status">در حال دریافت گزارش…</p>}
      {!loading && !report && (
        <section className={styles.empty}>
          <p>گزارشی بارگذاری نشده است.</p>
          <button type="button" className={styles.primaryButton} onClick={() => void loadReport(date || undefined)}>
            تلاش دوباره
          </button>
        </section>
      )}

      {!loading && report && (
        <>
          <div className={styles.reportDate}>
            <strong>گزارش {dateLabel(report.date)}</strong>
            <span dir="ltr">{report.date}</span>
          </div>
          <section className={styles.metricGrid} aria-label="خلاصه روز">
            <Metric label="ورود امروز" value={report.arrivals.length} />
            <Metric label="خروج ثبت‌شده" value={report.departures.length} />
            <Metric label="اقامت در این تاریخ" value={report.inHouse.length} />
            <Metric label="اشغال اتاق‌ها" value={`${formatPersianInteger(report.rooms.occupancyPercent)}٪`} detail={`${formatPersianInteger(report.rooms.occupied)} از ${formatPersianInteger(report.rooms.total)} اتاق`} />
            <Metric label="اتاق آماده" value={report.rooms.readiness.inspected + report.rooms.readiness.clean} detail={`بازرسی‌شده ${formatPersianInteger(report.rooms.readiness.inspected)} · تمیز ${formatPersianInteger(report.rooms.readiness.clean)}`} />
            <Metric label="انسداد فعال" value={report.blocks.total} detail={`خارج از سرویس ${formatPersianInteger(report.blocks.outOfOrder)} · ظرفیت ${formatPersianInteger(report.blocks.capacityClosed)}`} />
            <Metric label="درخواست‌های رزرو باز" value={report.pendingRequests.reservations} />
            <Metric label="درخواست‌های تعمیر باز" value={report.pendingRequests.maintenance} />
          </section>
          <p className={styles.dataNote}>
            آمادگی، موجودی فعال اتاق‌ها، انسدادها، مانده دفترهای مالی و صف درخواست‌ها از وضعیت فعلی می‌آیند؛ برای این موارد در تاریخ گذشته snapshot جداگانه نداریم.
          </p>

          <section className={styles.financeGrid} aria-label="خلاصه مالی روز">
            <Metric label="بدهکار روز" value={toman(report.dailyTotals.debitsToman)} />
            <Metric label="بستانکار روز" value={toman(report.dailyTotals.creditsToman)} />
            <Metric label="مانده باز" value={toman(report.openBalances.balanceToman)} detail={`${formatPersianInteger(report.openBalances.count)} دفتر مالی`} />
          </section>

          {report.openBalances.items.length > 0 && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <h2>مانده‌های دریافتنی</h2>
                <span>{formatPersianInteger(report.openBalances.count)} دفتر</span>
              </div>
              <ul className={styles.balanceList}>
                {report.openBalances.items.map((item) => (
                  <li key={item.reference}>
                    <div><strong>{item.guestName}</strong><span dir="ltr">{item.reference}</span></div>
                    <bdi>{toman(item.balanceToman)}</bdi>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.stayGrid}>
            <StayList title="ورودها" stays={report.arrivals} emptyText="ورودی برای این تاریخ ثبت نشده است." />
            <StayList title="خروج‌ها" stays={report.departures} emptyText="خروج ثبت‌شده‌ای برای این تاریخ نیست." />
            <StayList title="اقامت‌های جاری در تاریخ" stays={report.inHouse} emptyText="اقامت فعالی در این تاریخ نیست." />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatPersianInteger(value) : value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
