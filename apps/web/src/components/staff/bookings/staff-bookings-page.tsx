'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffSession } from '@/components/staff/staff-session-provider';
import {
  formatGregorianAsJalali,
  formatPersianInteger,
  getHotelTodayIso,
  toGregorianIso,
} from '@/lib/jalali-date';
import { StaffApiError } from '@/lib/staff-api';
import {
  cancelStaffBooking,
  confirmStaffBooking,
  getStaffBooking,
  listStaffBookings,
  rejectStaffBooking,
  type StaffBookingDetail,
  type StaffBookingFilters,
  type StaffBookingListItem,
  type StaffBookingStatus,
} from '@/lib/staff-bookings-api';
import styles from './staff-bookings.module.css';

type ListState = 'loading' | 'ready' | 'error';
type DetailState = 'idle' | 'loading' | 'ready' | 'error';
type BookingAction = 'confirm' | 'reject' | 'cancel';

interface FilterDraft {
  status: StaffBookingStatus | '';
  arrivalFrom: string;
  arrivalTo: string;
  search: string;
}

const EMPTY_FILTERS: FilterDraft = { status: '', arrivalFrom: '', arrivalTo: '', search: '' };
const PAGE_SIZE = 20;

const STATUS_LABELS: Record<StaffBookingStatus, string> = {
  PENDING_CONFIRMATION: 'در انتظار تأیید',
  CONFIRMED: 'تأییدشده',
  REJECTED: 'ردشده',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی‌شده',
};

const ACTION_LABELS: Record<BookingAction, string> = {
  confirm: 'تأیید نهایی رزرو',
  reject: 'ثبت رد رزرو',
  cancel: 'ثبت لغو رزرو',
};

const SUCCESS_MESSAGES: Record<BookingAction, string> = {
  confirm: 'رزرو تأیید شد.',
  reject: 'درخواست رزرو رد شد.',
  cancel: 'رزرو لغو شد.',
};

function errorMessage(cause: unknown): string {
  if (cause instanceof StaffApiError) {
    if (cause.status === 0)
      return 'ارتباط با سامانه برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.';
    return cause.message;
  }
  return 'درخواست انجام نشد. دوباره تلاش کنید.';
}

function bookingDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function toman(value: string): string {
  if (!/^\d+$/.test(value)) return '—';
  return `${formatPersianInteger(BigInt(value))} تومان`;
}

function isActionable(booking: StaffBookingDetail): boolean {
  return (
    booking.status === 'PENDING_CONFIRMATION' ||
    (booking.status === 'CONFIRMED' && booking.checkIn > getHotelTodayIso())
  );
}

export function StaffBookingsPage() {
  const { csrfToken } = useStaffSession();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<StaffBookingFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [filterErrors, setFilterErrors] = useState<
    Partial<Record<'arrivalFrom' | 'arrivalTo', string>>
  >({});
  const [items, setItems] = useState<StaffBookingListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [listState, setListState] = useState<ListState>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [listRefresh, setListRefresh] = useState(0);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffBookingDetail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>('idle');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState<BookingAction | null>(null);
  const [actionTargetReference, setActionTargetReference] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const actionHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;

    listStaffBookings(filters)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
        setListState('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setListError(errorMessage(cause));
        setListState('error');
      });

    return () => {
      active = false;
    };
  }, [filters, listRefresh]);

  useEffect(() => {
    if (!selectedReference) return;

    let active = true;

    getStaffBooking(selectedReference)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setDetailState('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setDetailError(errorMessage(cause));
        setDetailState('error');
      });

    return () => {
      active = false;
    };
  }, [selectedReference]);

  useEffect(() => {
    if (actionDraft) actionHeadingRef.current?.focus();
  }, [actionDraft]);

  function updateDraft(field: keyof FilterDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<'arrivalFrom' | 'arrivalTo', string>> = {};
    const arrivalFrom = draft.arrivalFrom.trim() ? toGregorianIso(draft.arrivalFrom) : undefined;
    const arrivalTo = draft.arrivalTo.trim() ? toGregorianIso(draft.arrivalTo) : undefined;

    if (draft.arrivalFrom.trim() && !arrivalFrom)
      errors.arrivalFrom = 'تاریخ ورود را معتبر وارد کنید.';
    if (draft.arrivalTo.trim() && !arrivalTo) errors.arrivalTo = 'تاریخ ورود را معتبر وارد کنید.';
    if (arrivalFrom && arrivalTo && arrivalFrom > arrivalTo) {
      errors.arrivalTo = 'تاریخ پایان بازه باید پس از تاریخ آغاز باشد.';
    }

    setFilterErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setListState('loading');
    setListError(null);
    setFilters({
      ...(draft.status ? { status: draft.status } : {}),
      ...(arrivalFrom ? { arrivalFrom } : {}),
      ...(arrivalTo ? { arrivalTo } : {}),
      ...(draft.search.trim() ? { search: draft.search.trim() } : {}),
      page: 1,
      pageSize: PAGE_SIZE,
    });
    setActionMessage(null);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilterErrors({});
    setListState('loading');
    setListError(null);
    setFilters({ page: 1, pageSize: PAGE_SIZE });
  }

  function refreshList() {
    setListState('loading');
    setListError(null);
    setListRefresh((value) => value + 1);
  }

  function retryDetail() {
    if (!selectedReference) return;
    setDetail(null);
    setDetailState('loading');
    setDetailError(null);
    getStaffBooking(selectedReference)
      .then((result) => {
        setDetail(result);
        setDetailState('ready');
      })
      .catch((cause: unknown) => {
        setDetailError(errorMessage(cause));
        setDetailState('error');
      });
  }

  function openAction(action: BookingAction, trigger: HTMLButtonElement) {
    if (!detail || detail.reference !== selectedReference) return;
    triggerRef.current = trigger;
    setActionError(null);
    setActionMessage(null);
    setInternalNote('');
    setCancellationReason('');
    setActionTargetReference(detail.reference);
    setActionDraft(action);
  }

  function closeAction() {
    setActionDraft(null);
    setActionTargetReference(null);
    setActionError(null);
    triggerRef.current?.focus();
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !actionDraft || !actionTargetReference) return;
    if (actionTargetReference !== detail.reference || actionTargetReference !== selectedReference) {
      setActionDraft(null);
      setActionTargetReference(null);
      setActionError(null);
      setInternalNote('');
      setCancellationReason('');
      setActionMessage('رزرو انتخاب‌شده تغییر کرده است؛ تصمیم را دوباره بررسی کنید.');
      return;
    }
    if (!csrfToken) {
      setActionError('نشست کارکنان معتبر نیست. دوباره وارد شوید.');
      return;
    }

    setActing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result =
        actionDraft === 'confirm'
          ? await confirmStaffBooking(actionTargetReference, csrfToken, {
              ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
            })
          : actionDraft === 'reject'
            ? await rejectStaffBooking(actionTargetReference, csrfToken, {
                ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
              })
            : await cancelStaffBooking(actionTargetReference, csrfToken, {
                reason: cancellationReason.trim(),
              });

      setDetail(result);
      setActionDraft(null);
      setActionTargetReference(null);
      setInternalNote('');
      setCancellationReason('');
      setActionMessage(SUCCESS_MESSAGES[actionDraft]);
      refreshList();
      window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.status === 409) {
        const reference = actionTargetReference;
        setActionDraft(null);
        setActionTargetReference(null);
        setActionMessage('در حال دریافت آخرین وضعیت درخواست…');
        setDetail(null);
        setDetailState('loading');
        try {
          const current = await getStaffBooking(reference);
          setDetail(current);
          setDetailState('ready');
          refreshList();
          setActionMessage('این درخواست تغییر کرده است؛ آخرین وضعیت از سامانه دریافت شد.');
          window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
        } catch (refreshCause) {
          setDetailError(errorMessage(refreshCause));
          setDetailState('error');
          setActionMessage(null);
          setActionError(errorMessage(refreshCause));
        }
      } else {
        setActionError(errorMessage(cause));
      }
    } finally {
      setActing(false);
    }
  }

  function changePage(page: number) {
    setListState('loading');
    setListError(null);
    setFilters((current) => ({ ...current, page }));
  }

  return (
    <section className={styles.page} aria-labelledby="staff-bookings-title" dir="rtl">
      <header className={styles.pageHeader}>
        <div className={styles.headingRow}>
          <div>
            <h1 id="staff-bookings-title">درخواست‌های اقامت</h1>
            <p>وضعیت درخواست‌ها را بررسی و پاسخ هر مهمان را ثبت کنید.</p>
          </div>
          <button
            className={styles.refreshButton}
            type="button"
            onClick={refreshList}
            disabled={listState === 'loading'}
          >
            تازه‌سازی فهرست
          </button>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters} aria-label="فیلتر درخواست‌ها">
        <div className={styles.filterField}>
          <label htmlFor="booking-status">وضعیت درخواست</label>
          <select
            id="booking-status"
            value={draft.status}
            onChange={(event) => updateDraft('status', event.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="arrival-from">ورود از</label>
          <input
            id="arrival-from"
            type="text"
            inputMode="numeric"
            dir="ltr"
            placeholder="۱۴۰۵/۰۹/۰۱"
            value={draft.arrivalFrom}
            aria-invalid={Boolean(filterErrors.arrivalFrom)}
            aria-describedby={filterErrors.arrivalFrom ? 'arrival-from-error' : undefined}
            onChange={(event) => updateDraft('arrivalFrom', event.target.value)}
          />
          {filterErrors.arrivalFrom && (
            <span className={styles.fieldError} id="arrival-from-error">
              {filterErrors.arrivalFrom}
            </span>
          )}
        </div>
        <div className={styles.filterField}>
          <label htmlFor="arrival-to">ورود تا</label>
          <input
            id="arrival-to"
            type="text"
            inputMode="numeric"
            dir="ltr"
            placeholder="۱۴۰۵/۰۹/۳۰"
            value={draft.arrivalTo}
            aria-invalid={Boolean(filterErrors.arrivalTo)}
            aria-describedby={filterErrors.arrivalTo ? 'arrival-to-error' : undefined}
            onChange={(event) => updateDraft('arrivalTo', event.target.value)}
          />
          {filterErrors.arrivalTo && (
            <span className={styles.fieldError} id="arrival-to-error">
              {filterErrors.arrivalTo}
            </span>
          )}
        </div>
        <div className={`${styles.filterField} ${styles.searchField}`}>
          <label htmlFor="booking-search">کد رزرو یا موبایل</label>
          <input
            id="booking-search"
            type="search"
            dir="auto"
            autoComplete="off"
            value={draft.search}
            onChange={(event) => updateDraft('search', event.target.value)}
          />
        </div>
        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit">
            اعمال فیلترها
          </button>
          <button className={styles.clearButton} type="button" onClick={clearFilters}>
            پاک‌کردن
          </button>
        </div>
        {Object.keys(filterErrors).length > 0 && (
          <p className={styles.filterErrorSummary} role="alert">
            بازهٔ تاریخ را بررسی کنید.
          </p>
        )}
      </form>

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-labelledby="booking-list-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="booking-list-title">فهرست رزروها</h2>
            </div>
            {listState === 'ready' && (
              <p className={styles.count} aria-live="polite">
                {formatPersianInteger(pagination.totalItems)} درخواست
              </p>
            )}
          </div>

          {listState === 'loading' && (
            <div className={styles.statePanel} role="status" aria-live="polite" aria-busy="true">
              <span className={styles.loader} aria-hidden="true" />
              <p>در حال دریافت فهرست درخواست‌ها…</p>
            </div>
          )}
          {listState === 'error' && (
            <div className={styles.statePanel}>
              <p className={styles.errorText} role="alert">
                {listError}
              </p>
              <button className={styles.secondaryButton} type="button" onClick={refreshList}>
                تلاش دوباره
              </button>
            </div>
          )}
          {listState === 'ready' && items.length === 0 && (
            <div className={styles.statePanel} role="status">
              <span className={styles.emptyMark} aria-hidden="true">
                ◇
              </span>
              <h3>رزروی پیدا نشد.</h3>
              <p>فیلترها را تغییر دهید یا فهرست را دوباره بررسی کنید.</p>
              <button className={styles.clearButton} type="button" onClick={clearFilters}>
                پاک‌کردن فیلترها
              </button>
            </div>
          )}
          {listState === 'ready' && items.length > 0 && (
            <ul className={styles.bookingList}>
              {items.map((item) => (
                <li key={item.reference}>
                  <button
                    className={`${styles.bookingCard} ${selectedReference === item.reference ? styles.bookingCardSelected : ''}`}
                    type="button"
                    aria-pressed={selectedReference === item.reference}
                    disabled={acting}
                    onClick={() => {
                      setSelectedReference(item.reference);
                      setDetail(null);
                      setDetailState('loading');
                      setDetailError(null);
                      setActionDraft(null);
                      setActionTargetReference(null);
                      setActionError(null);
                      setInternalNote('');
                      setCancellationReason('');
                      triggerRef.current = null;
                      setActionMessage(null);
                    }}
                  >
                    <span className={styles.visuallyHidden}>
                      نمایش جزئیات رزرو {item.reference}،
                    </span>
                    <span className={styles.cardTopline}>
                      <span className={styles.reference} dir="ltr">
                        {item.reference}
                      </span>
                      <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </span>
                    <span className={styles.cardGuest}>{item.guestName}</span>
                    <span className={styles.cardMeta}>
                      <span>{item.roomType.name}</span>
                      <span dir="ltr">
                        {bookingDate(item.checkIn)} ← {bookingDate(item.checkOut)}
                      </span>
                    </span>
                    <span className={styles.cardFooter}>
                      <span dir="ltr">{item.guestPhone}</span>
                      <span>
                        {formatPersianInteger(item.roomQuantity)} اتاق ·{' '}
                        {formatPersianInteger(item.guestCount)} مهمان
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {listState === 'ready' && pagination.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="صفحه‌های رزرو">
              <button
                type="button"
                onClick={() => changePage(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                صفحهٔ قبل
              </button>
              <span>
                صفحهٔ {formatPersianInteger(pagination.page)} از{' '}
                {formatPersianInteger(pagination.totalPages)}
              </span>
              <button
                type="button"
                onClick={() => changePage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                صفحهٔ بعد
              </button>
            </nav>
          )}
        </section>

        <aside className={styles.detailPanel} aria-labelledby="booking-detail-title">
          {!selectedReference && (
            <div className={styles.detailPlaceholder}>
              <span className={styles.detailGlyph} aria-hidden="true">
                ▤
              </span>
              <h2 id="booking-detail-title">جزئیات درخواست</h2>
              <p>یک رزرو را از فهرست انتخاب کنید تا اطلاعات لازم برای پاسخ را ببینید.</p>
            </div>
          )}
          {selectedReference && detailState === 'loading' && (
            <div className={styles.statePanel} role="status" aria-busy="true">
              <span className={styles.loader} aria-hidden="true" />
              <p>در حال دریافت جزئیات رزرو…</p>
            </div>
          )}
          {selectedReference && detailState === 'error' && (
            <div className={styles.statePanel}>
              <h2 id="booking-detail-title">جزئیات رزرو</h2>
              <p className={styles.errorText} role="alert">
                {detailError}
              </p>
              <button className={styles.secondaryButton} type="button" onClick={retryDetail}>
                تلاش دوباره
              </button>
            </div>
          )}
          {detail && detailState === 'ready' && (
            <div className={styles.detailContent}>
              <div className={styles.detailHeading}>
                <div>
                  <h2 id="booking-detail-title" ref={detailHeadingRef} tabIndex={-1}>
                    جزئیات رزرو <bdi dir="ltr">{detail.reference}</bdi>
                  </h2>
                </div>
                <span className={`${styles.status} ${styles[`status_${detail.status}`]}`}>
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>

              {actionMessage && (
                <p className={styles.successMessage} role="status">
                  {actionMessage}
                </p>
              )}

              <section className={styles.guestSection} aria-labelledby="guest-info-title">
                <h3 id="guest-info-title">اطلاعات مهمان</h3>
                <dl className={styles.guestDetails}>
                  <div>
                    <dt>نام</dt>
                    <dd>{detail.guestName}</dd>
                  </div>
                  <div>
                    <dt>موبایل</dt>
                    <dd dir="ltr">{detail.guestPhone}</dd>
                  </div>
                  {detail.guestEmail && (
                    <div>
                      <dt>ایمیل</dt>
                      <dd dir="ltr">{detail.guestEmail}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className={styles.staySection} aria-labelledby="stay-info-title">
                <h3 id="stay-info-title">جزئیات اقامت</h3>
                <dl className={styles.stayDetails}>
                  <div>
                    <dt>نوع اتاق</dt>
                    <dd>{detail.roomType.name}</dd>
                  </div>
                  <div>
                    <dt>تاریخ ورود</dt>
                    <dd>
                      <bdi>{bookingDate(detail.checkIn)}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>تاریخ خروج</dt>
                    <dd>
                      <bdi>{bookingDate(detail.checkOut)}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>اتاق</dt>
                    <dd>{formatPersianInteger(detail.roomQuantity)}</dd>
                  </div>
                  <div>
                    <dt>مهمان</dt>
                    <dd>{formatPersianInteger(detail.guestCount)}</dd>
                  </div>
                </dl>
                <ul className={styles.nightList} aria-label="قیمت هر شب">
                  {detail.nights.map((night) => (
                    <li key={night.stayDate}>
                      <span>{bookingDate(night.stayDate)}</span>
                      <span>{toman(night.amountToman)}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.totalRow}>
                  <span>مبلغ کل ثبت‌شده</span>
                  <strong>{toman(detail.totalPriceToman)}</strong>
                </p>
              </section>

              {detail.internalNote && (
                <section className={styles.noteSection} aria-labelledby="internal-note-title">
                  <h3 id="internal-note-title">یادداشت داخلی</h3>
                  <p>{detail.internalNote}</p>
                </section>
              )}
              {detail.cancellationReason && (
                <section className={styles.noteSection} aria-labelledby="cancellation-reason-title">
                  <h3 id="cancellation-reason-title">دلیل لغو</h3>
                  <p>{detail.cancellationReason}</p>
                </section>
              )}

              {isActionable(detail) &&
                (!actionDraft || actionTargetReference !== detail.reference) && (
                  <div className={styles.bookingActions} aria-label="اقدام‌های رزرو">
                    {detail.status === 'PENDING_CONFIRMATION' ? (
                      <>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={(event) => openAction('confirm', event.currentTarget)}
                        >
                          تأیید رزرو
                        </button>
                        <button
                          className={styles.rejectButton}
                          type="button"
                          onClick={(event) => openAction('reject', event.currentTarget)}
                        >
                          رد درخواست
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.rejectButton}
                        type="button"
                        onClick={(event) => openAction('cancel', event.currentTarget)}
                      >
                        لغو رزرو
                      </button>
                    )}
                  </div>
                )}

              {actionDraft && actionTargetReference === detail.reference && (
                <section className={styles.actionPanel} aria-labelledby="booking-action-title">
                  <h3 id="booking-action-title" ref={actionHeadingRef} tabIndex={-1}>
                    {ACTION_LABELS[actionDraft]}
                  </h3>
                  <p>
                    {actionDraft === 'confirm'
                      ? 'با تأیید، وضعیت درخواست تغییر می‌کند و اتاق‌ها برای رزرو ثبت‌شده می‌شوند.'
                      : actionDraft === 'reject'
                        ? 'با رد درخواست، ظرفیت نگه‌داشته‌شده برای این اقامت آزاد می‌شود.'
                        : 'با لغو رزرو، ظرفیت اقامت دوباره آزاد می‌شود.'}
                  </p>
                  <form className={styles.actionForm} onSubmit={submitAction}>
                    {actionDraft === 'cancel' ? (
                      <div className={styles.actionField}>
                        <label htmlFor="cancellation-reason">دلیل لغو</label>
                        <textarea
                          id="cancellation-reason"
                          value={cancellationReason}
                          onChange={(event) => setCancellationReason(event.target.value)}
                          required
                          maxLength={500}
                          rows={3}
                        />
                      </div>
                    ) : (
                      <div className={styles.actionField}>
                        <label htmlFor="internal-note">یادداشت داخلی (اختیاری)</label>
                        <textarea
                          id="internal-note"
                          value={internalNote}
                          onChange={(event) => setInternalNote(event.target.value)}
                          maxLength={1000}
                          rows={3}
                        />
                      </div>
                    )}
                    {actionError && (
                      <p className={styles.errorText} role="alert">
                        {actionError}
                      </p>
                    )}
                    <div className={styles.actionControls}>
                      <button className={styles.primaryButton} type="submit" disabled={acting}>
                        {acting
                          ? 'در حال ثبت…'
                          : actionDraft === 'confirm'
                            ? 'بله، رزرو را تأیید می‌کنم'
                            : actionDraft === 'reject'
                              ? 'بله، درخواست را رد می‌کنم'
                              : 'بله، رزرو را لغو می‌کنم'}
                      </button>
                      <button
                        className={styles.clearButton}
                        type="button"
                        disabled={acting}
                        onClick={closeAction}
                      >
                        بازگشت
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
