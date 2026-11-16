'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { useStaffSession } from '@/components/staff/staff-session-provider';
import { getStaffBooking, type StaffBookingDetail } from '@/lib/staff-bookings-api';
import {
  StaffApiError,
  getStaffRoomBoard,
  type StaffRole,
  type StaffRoomBoardItem,
} from '@/lib/staff-api';
import {
  formatGregorianAsJalali,
  formatPersianInteger,
  getHotelTodayIso,
  toGregorianIso,
} from '@/lib/jalali-date';
import {
  amendStaffStay,
  checkInStaffStay,
  createStaffWalkIn,
  getStaffStayWorklist,
  markStaffStayNoShow,
  moveStaffStayRoom,
  type StaffStayQueue,
  type StaffStayWorklist,
  type StaffStayWorklistItem,
  type StaffWalkInInput,
} from '@/lib/staff-front-desk-api';
import type { PublicRoomType } from '@/lib/public-api';
import styles from './staff-front-desk.module.css';

const PAGE_SIZE = 20;
const ALLOWED_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST'];

const QUEUE_COPY: Record<StaffStayQueue, { title: string; lead: string; empty: string; loading: string }> = {
  arrivals: {
    title: 'ورودهای مهمانان',
    lead: 'ورودهای برنامه‌ریزی‌شده و اقامت‌های معوق را پیگیری کنید.',
    empty: 'برای این تاریخ ورودی ثبت نشده است.',
    loading: 'در حال دریافت فهرست ورودها',
  },
  'in-house': {
    title: 'مهمانان حاضر',
    lead: 'اقامت‌های واردشده و موعدهای خروج را ببینید.',
    empty: 'برای این تاریخ مهمان حاضر ثبت نشده است.',
    loading: 'در حال دریافت فهرست مهمانان حاضر',
  },
  departures: {
    title: 'موعدهای خروج',
    lead: 'اقامت‌های واردشده‌ای که موعد خروجشان رسیده یا گذشته است.',
    empty: 'برای این تاریخ موعد خروجی ثبت نشده است.',
    loading: 'در حال دریافت فهرست موعدهای خروج',
  },
};

const ROOM_STATUS: Record<StaffStayWorklistItem['assignedRooms'][number]['housekeepingStatus'], string> = {
  DIRTY: 'نیازمند نظافت',
  CLEAN: 'نظافت‌شده؛ نیازمند بازرسی',
  INSPECTED: 'بازرسی‌شده',
};

type ListState = 'loading' | 'ready' | 'error';
type DialogState =
  | { kind: 'check-in'; stay: StaffStayWorklistItem }
  | { kind: 'no-show'; stay: StaffStayWorklistItem }
  | { kind: 'walk-in' }
  | { kind: 'move'; stay: StaffStayWorklistItem }
  | null;

interface StaffFrontDeskPageProps {
  queue: StaffStayQueue;
  roomTypes?: PublicRoomType[];
}

interface WalkInDraft {
  roomTypeSlug: string;
  checkOut: string;
  guestCount: string;
  roomQuantity: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
}

function nextIsoDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function dateLabel(date: string): string {
  return formatGregorianAsJalali(date) ?? date;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof StaffApiError)) return 'درخواست انجام نشد. دوباره تلاش کنید.';
  if (error.status === 0) return 'ارتباط با سامانه برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.';
  if (error.status === 403) return 'دسترسی شما برای انجام این کار تأیید نشد. صفحه را تازه‌سازی کنید یا با سرپرست شیفت تماس بگیرید.';
  switch (error.code) {
    case 'ROOM_ASSIGNMENT_INCOMPLETE':
      return 'تخصیص اتاق‌ها کامل نیست. ابتدا اتاق‌های باقی‌مانده را در وضعیت اتاق‌ها تخصیص دهید.';
    case 'ROOM_NOT_INSPECTED':
      return 'ورود ثبت نشد؛ وضعیت بازرسی اتاق‌ها باید از سوی سامانه تأیید شود.';
    case 'ROOM_ASSIGNMENT_OVERLAP':
    case 'ROOM_BLOCKED':
      return 'ورود ثبت نشد؛ یکی از اتاق‌ها با یک رزرو یا محدودیت هم‌پوشانی دارد. وضعیت اتاق‌ها را بررسی کنید.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'شناسه امن درخواست قبلاً برای اطلاعات دیگری استفاده شده است. پیش از شروع درخواست تازه، وضعیت ثبت قبلی را بررسی کنید.';
    default:
      return error.message || 'درخواست انجام نشد. دوباره تلاش کنید.';
  }
}

function hasRoomRecovery(error: unknown): boolean {
  return error instanceof StaffApiError && [
    'ROOM_ASSIGNMENT_INCOMPLETE',
    'ROOM_NOT_INSPECTED',
    'ROOM_ASSIGNMENT_OVERLAP',
    'ROOM_BLOCKED',
  ].includes(error.code ?? '');
}

function isManager(role: StaffRole | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

function assignmentsOnDate(stay: StaffStayWorklistItem, date: string) {
  return stay.assignedRooms.filter((room) => room.startDate <= date && date < room.endDate);
}

function isStayActiveOn(stay: StaffStayWorklistItem, date: string): boolean {
  return stay.checkIn <= date && date < stay.checkOut;
}

function assignmentSummary(stay: StaffStayWorklistItem, businessDate: string): string {
  const assigned = assignmentsOnDate(stay, businessDate).length;
  return `${formatPersianInteger(assigned)} از ${formatPersianInteger(stay.roomQuantity)} اتاق تخصیص یافته`;
}

function canMoveTo(room: StaffRoomBoardItem, sourceRoomNumbers: string[]): boolean {
  return (
    room.isActive &&
    room.housekeepingStatus === 'INSPECTED' &&
    room.occupancy === 'VACANT' &&
    room.blocks.length === 0 &&
    !sourceRoomNumbers.includes(room.roomNumber)
  );
}

function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
  ));
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function StaffFrontDeskPage({ queue, roomTypes = [] }: StaffFrontDeskPageProps) {
  const { status, staff, csrfToken } = useStaffSession();
  const allowed = status === 'authenticated' && Boolean(staff && ALLOWED_ROLES.includes(staff.role));
  const copy = QUEUE_COPY[queue];
  const [dateDraft, setDateDraft] = useState(() => dateLabel(getHotelTodayIso()));
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState({ date: getHotelTodayIso(), search: '', page: 1, pageSize: PAGE_SIZE });
  const [worklist, setWorklist] = useState<StaffStayWorklist | null>(null);
  const [listState, setListState] = useState<ListState>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogReason, setDialogReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogRoomRecovery, setDialogRoomRecovery] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [amendDraft, setAmendDraft] = useState({ guestName: '', guestPhone: '', guestEmail: '', guestCount: '', roomQuantity: '', checkIn: '', checkOut: '' });
  const [moveRooms, setMoveRooms] = useState<StaffRoomBoardItem[]>([]);
  const [moveRoomsLoading, setMoveRoomsLoading] = useState(false);
  const [walkInDraft, setWalkInDraft] = useState<WalkInDraft>({ roomTypeSlug: roomTypes[0]?.slug ?? '', checkOut: '', guestCount: '1', roomQuantity: '1', guestName: '', guestPhone: '', guestEmail: '' });
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInFieldError, setWalkInFieldError] = useState<string | null>(null);
  const [walkInRetry, setWalkInRetry] = useState(false);
  const actionHeadingRef = useRef<HTMLHeadingElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const dialogWasOpenRef = useRef(false);
  const walkInKeyRef = useRef<{ signature: string; key: string; input: StaffWalkInInput } | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const selectedDate = worklist?.date ?? query.date;
  const detailCanAmend = Boolean(detail && detail.status === 'CONFIRMED' && detail.checkIn >= (worklist?.businessDate ?? query.date));

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    getStaffStayWorklist(queue, query)
      .then((result) => {
        if (!current) return;
        setWorklist(result);
        setListState('ready');
      })
      .catch((error: unknown) => {
        if (!current) return;
        setListError(error instanceof StaffApiError && error.status === 403
          ? 'دسترسی شما برای مشاهده این فهرست تأیید نشد. با سرپرست شیفت تماس بگیرید.'
          : safeErrorMessage(error));
        setListState('error');
      });
    return () => { current = false; };
  }, [allowed, queue, query, refreshNumber]);

  useEffect(() => {
    if (!selectedReference || !allowed) return;
    let current = true;
    getStaffBooking(selectedReference)
      .then((result) => {
        if (!current) return;
        setDetail(result);
        setAmendDraft({
          guestName: result.guestName,
          guestPhone: result.guestPhone,
          guestEmail: result.guestEmail ?? '',
          guestCount: String(result.guestCount),
          roomQuantity: String(result.roomQuantity),
          checkIn: dateLabel(result.checkIn),
          checkOut: dateLabel(result.checkOut),
        });
      })
      .catch((error: unknown) => {
        if (current) setDetailError(safeErrorMessage(error));
      })
      .finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; };
  }, [selectedReference, allowed, refreshNumber]);

  useEffect(() => {
    if (dialog) {
      dialogWasOpenRef.current = true;
      actionHeadingRef.current?.focus();
      return;
    }
    if (dialogWasOpenRef.current) {
      dialogWasOpenRef.current = false;
      dialogTriggerRef.current?.focus();
    }
  }, [dialog]);

  useEffect(() => {
    if (successMessage) successRef.current?.focus();
  }, [successMessage]);

  const items = useMemo(() => worklist?.items ?? [], [worklist]);
  const groupedItems = useMemo(() => {
    if (queue === 'arrivals') {
      return {
        primary: items.filter((item) => item.checkIn === selectedDate),
        secondary: items.filter((item) => item.checkIn < selectedDate),
      };
    }
    if (queue === 'in-house') {
      return {
        primary: items.filter((item) => item.checkOut > selectedDate),
        secondary: items.filter((item) => item.checkOut <= selectedDate),
      };
    }
    return { primary: items, secondary: [] };
  }, [items, queue, selectedDate]);

  function refreshList() {
    setListState('loading');
    setListError(null);
    if (selectedReference) {
      setDetailLoading(true);
      setDetailError(null);
    }
    setRefreshNumber((value) => value + 1);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = toGregorianIso(dateDraft);
    if (!date) {
      setFilterError('تاریخ را به شکل سال/ماه/روز معتبر وارد کنید.');
      return;
    }
    setFilterError(null);
    setListState('loading');
    setListError(null);
    setQuery({ date, search: searchDraft.trim(), page: 1, pageSize: PAGE_SIZE });
  }

  function openDetail(reference: string) {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setSelectedReference(reference);
  }

  function openDialog(nextDialog: DialogState, trigger?: HTMLElement) {
    if (trigger) dialogTriggerRef.current = trigger;
    else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      dialogTriggerRef.current = document.activeElement;
    }
    setDialog(nextDialog);
    setDialogReason('');
    setDialogError(null);
    setDialogRoomRecovery(false);
    const preserveWalkInAttempt = nextDialog?.kind === 'walk-in' && walkInRetry && walkInKeyRef.current !== null;
    if (!preserveWalkInAttempt) {
      setWalkInError(null);
      setWalkInFieldError(null);
    }
    if (nextDialog?.kind === 'walk-in') {
      if (!preserveWalkInAttempt) {
        const businessDate = worklist?.businessDate ?? query.date;
        setWalkInDraft((current) => ({
          ...current,
          roomTypeSlug: current.roomTypeSlug || roomTypes[0]?.slug || '',
          checkOut: dateLabel(nextIsoDate(businessDate)),
        }));
        setWalkInRetry(false);
      }
    }
    if (nextDialog?.kind === 'move') {
      setMoveRooms([]);
      setMoveRoomsLoading(true);
      getStaffRoomBoard({ date: worklist?.businessDate ?? query.date, roomTypeId: nextDialog.stay.roomType.id })
        .then((board) => setMoveRooms(board.items))
        .catch((error: unknown) => setDialogError(safeErrorMessage(error)))
        .finally(() => setMoveRoomsLoading(false));
    }
  }

  function closeDialog() {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError(null);
    setDialogRoomRecovery(false);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !csrfToken) return;
    setDialogError(null);
    setDialogRoomRecovery(false);
    setDialogBusy(true);
    try {
      if (dialog.kind === 'check-in') {
        if (!isStayActiveOn(dialog.stay, worklist?.businessDate ?? query.date)) {
          setDialogError('ورود فقط در بازه فعال این اقامت در تاریخ کاری جاری در دسترس است.');
          return;
        }
        await checkInStaffStay(dialog.stay.reference, csrfToken, {
          ...(isManager(staff?.role) && dialogReason.trim() ? { earlyCheckInReason: dialogReason.trim() } : {}),
        });
        setSuccessMessage(`ورود مهمان ${dialog.stay.guestName} ثبت شد.`);
      } else if (dialog.kind === 'no-show') {
        if (!isStayActiveOn(dialog.stay, worklist?.businessDate ?? query.date)) {
          setDialogError('ثبت عدم مراجعه فقط در بازه فعال این اقامت در تاریخ کاری جاری در دسترس است.');
          return;
        }
        if (!dialogReason.trim()) {
          setDialogError('ثبت دلیل برای عدم مراجعه الزامی است.');
          return;
        }
        await markStaffStayNoShow(dialog.stay.reference, csrfToken, { reason: dialogReason.trim() });
        setSuccessMessage(`عدم مراجعه رزرو ${dialog.stay.reference} ثبت شد.`);
      } else if (dialog.kind === 'move') {
        const form = new FormData(event.currentTarget);
        const targetRoomId = String(form.get('targetRoomId') ?? '');
        const sourceAssignmentId = String(form.get('sourceAssignmentId') ?? '');
        const businessDate = worklist?.businessDate ?? query.date;
        if (dialog.stay.status !== 'CHECKED_IN' || !isStayActiveOn(dialog.stay, businessDate)) {
          setDialogError('انتقال اتاق فقط در بازه فعال اقامت در تاریخ کاری جاری در دسترس است.');
          return;
        }
        const assignment = assignmentsOnDate(dialog.stay, businessDate).find(
          (room) => room.assignmentId === sourceAssignmentId,
        );
        if (!assignment || !targetRoomId || !dialogReason.trim()) {
          setDialogError(assignment ? 'اتاق مقصد و دلیل انتقال را کامل کنید.' : 'برای تاریخ کاری جاری تخصیص اتاق فعالی وجود ندارد؛ ابتدا برنامه اتاق را بررسی کنید.');
          return;
        }
        await moveStaffStayRoom(dialog.stay.reference, csrfToken, {
          sourceAssignmentId: assignment.assignmentId,
          targetRoomId,
          reason: dialogReason.trim(),
        });
        setSuccessMessage(`درخواست انتقال اتاق رزرو ${dialog.stay.reference} ثبت شد.`);
      }
      setDialog(null);
      refreshList();
    } catch (error) {
      setDialogError(safeErrorMessage(error));
      setDialogRoomRecovery(hasRoomRecovery(error));
    } finally {
      setDialogBusy(false);
    }
  }

  async function submitWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setWalkInError(null);
    setWalkInFieldError(null);
    let attempt = walkInRetry ? walkInKeyRef.current : null;
    if (!attempt) {
      if (!worklist) return;
      if (query.date !== worklist.businessDate) {
        setWalkInFieldError('ثبت ورود حضوری فقط برای تاریخ کاری جاری در دسترس است.');
        return;
      }
      const checkOut = toGregorianIso(walkInDraft.checkOut);
      if (!checkOut || checkOut <= worklist.businessDate) {
        setWalkInFieldError('تاریخ خروج باید پس از تاریخ کاری امروز باشد.');
        return;
      }
      const input: StaffWalkInInput = {
        roomTypeSlug: walkInDraft.roomTypeSlug,
        checkIn: worklist.businessDate,
        checkOut,
        guestCount: Number(walkInDraft.guestCount),
        roomQuantity: Number(walkInDraft.roomQuantity),
        guestName: walkInDraft.guestName.trim(),
        guestPhone: walkInDraft.guestPhone.trim(),
        ...(walkInDraft.guestEmail.trim() ? { guestEmail: walkInDraft.guestEmail.trim() } : {}),
      };
      const signature = JSON.stringify(input);
      if (!walkInKeyRef.current || walkInKeyRef.current.signature !== signature) {
        const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-walkin`;
        walkInKeyRef.current = { signature, key, input };
      }
      attempt = walkInKeyRef.current;
    }
    if (!attempt) return;
    setDialogBusy(true);
    try {
      const result = await createStaffWalkIn(attempt.input, csrfToken, attempt.key);
      setDialog(null);
      setWalkInRetry(false);
      walkInKeyRef.current = null;
      setSuccessMessage(`ورود حضوری ثبت شد؛ کد پیگیری ${result.reference}.`);
      refreshList();
    } catch (error) {
      setWalkInRetry(true);
      setWalkInError(safeErrorMessage(error));
    } finally {
      setDialogBusy(false);
    }
  }

  function startNewWalkInRequest() {
    if (dialogBusy) return;
    walkInKeyRef.current = null;
    setWalkInRetry(false);
    setWalkInError(null);
    setWalkInFieldError(null);
  }

  async function submitAmendment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !csrfToken) return;
    const checkIn = toGregorianIso(amendDraft.checkIn);
    const checkOut = toGregorianIso(amendDraft.checkOut);
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setDetailError('تاریخ‌های اقامت را معتبر وارد کنید؛ خروج باید پس از ورود باشد.');
      return;
    }
    const payload = {
      ...(amendDraft.guestName.trim() !== detail.guestName ? { guestName: amendDraft.guestName.trim() } : {}),
      ...(amendDraft.guestPhone.trim() !== detail.guestPhone ? { guestPhone: amendDraft.guestPhone.trim() } : {}),
      ...(amendDraft.guestEmail.trim() !== (detail.guestEmail ?? '') ? { guestEmail: amendDraft.guestEmail.trim() || null } : {}),
      ...(Number(amendDraft.guestCount) !== detail.guestCount ? { guestCount: Number(amendDraft.guestCount) } : {}),
      ...(Number(amendDraft.roomQuantity) !== detail.roomQuantity ? { roomQuantity: Number(amendDraft.roomQuantity) } : {}),
      ...(checkIn !== detail.checkIn ? { checkIn } : {}),
      ...(checkOut !== detail.checkOut ? { checkOut } : {}),
    };
    if (Object.keys(payload).length === 0) {
      setDetailError('تغییری برای ثبت انتخاب نشده است.');
      return;
    }
    setDetailError(null);
    setDialogBusy(true);
    try {
      await amendStaffStay(detail.reference, csrfToken, payload);
      setEditingDetail(false);
      setSuccessMessage(`تغییرات اقامت ${detail.reference} ثبت شد؛ جزئیات تازه دریافت می‌شود.`);
      refreshList();
    } catch (error) {
      setDetailError(safeErrorMessage(error));
    } finally {
      setDialogBusy(false);
    }
  }

  if (status === 'loading') return <p className={styles.status} role="status">در حال بررسی دسترسی…</p>;
  if (status !== 'authenticated' || !staff) return <p className={styles.status} role="status">برای مشاهده این صفحه وارد پنل کارکنان شوید.</p>;
  if (!ALLOWED_ROLES.includes(staff.role)) {
    return <section className={styles.accessDenied} role="alert"><h1>دسترسی به میز پذیرش ندارید</h1><p>این فهرست برای کارکنان پذیرش و مدیریت اقامتگاه در دسترس است.</p></section>;
  }

  return (
    <section className={styles.page} aria-labelledby="front-desk-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>پذیرش · عملیات اقامت</p>
          <h1 id="front-desk-title">{copy.title}</h1>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        <nav className={styles.queueNav} aria-label="فهرست‌های پذیرش">
          <Link aria-current={queue === 'arrivals' ? 'page' : undefined} href="/staff/front-desk/arrivals">ورودها</Link>
          <Link aria-current={queue === 'in-house' ? 'page' : undefined} href="/staff/front-desk/in-house">مهمانان حاضر</Link>
          <Link aria-current={queue === 'departures' ? 'page' : undefined} href="/staff/front-desk/departures">موعدهای خروج</Link>
        </nav>
      </header>

      {successMessage && <p className={styles.success} tabIndex={-1} ref={successRef} role="status">{successMessage}</p>}

      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.filterFields}>
          <label>تاریخ کاری
            <input aria-label="تاریخ کاری" inputMode="numeric" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} placeholder="۱۴۰۵/۰۸/۲۷" />
          </label>
          <label>جست‌وجو در نام، کد یا اتاق
            <input aria-label="جست‌وجو در نام، کد یا اتاق" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
          </label>
        </div>
        <button className={styles.primaryButton} type="submit">اعمال فیلترها</button>
        {filterError && <p className={styles.error} role="alert">{filterError}</p>}
      </form>

      {queue === 'arrivals' && (
        <div className={styles.actionBar}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={listState !== 'ready' || !worklist || query.date !== worklist.businessDate}
            onClick={(event) => openDialog({ kind: 'walk-in' }, event.currentTarget)}
          >ثبت ورود بدون رزرو قبلی</button>
          {listState === 'ready' && worklist && query.date !== worklist.businessDate
            ? <span role="status">ثبت ورود حضوری فقط برای تاریخ کاری جاری در دسترس است.</span>
            : <span>تاریخ ورود حضوری بر اساس تاریخ کاری سامانه ثبت می‌شود.</span>}
        </div>
      )}

      {listState === 'loading' && <p className={styles.status} role="status">{copy.loading}</p>}
      {listState === 'error' && (
        <div className={styles.errorPanel}>
          <p role="alert">{listError}</p>
          <button className={styles.secondaryButton} type="button" onClick={refreshList}>تلاش دوباره</button>
        </div>
      )}
      {listState === 'ready' && worklist && (
        <>
          <div className={styles.freshness}>
            <span>تاریخ انتخاب‌شده: <strong>{dateLabel(worklist.date)}</strong></span>
            <button className={styles.secondaryButton} type="button" onClick={refreshList}>دریافت دوباره</button>
          </div>
          {items.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : (
            <div className={styles.groups}>
              <WorklistGroup
                queue={queue}
                title={queue === 'arrivals'
                  ? query.date === worklist.businessDate ? 'ورودهای امروز' : 'ورودهای تاریخ انتخاب‌شده'
                  : queue === 'in-house' ? 'اقامت‌های در جریان' : 'موعدهای رسیده'}
                items={groupedItems.primary}
                selectedDate={selectedDate}
                businessDate={worklist.businessDate}
                onCheckIn={(stay, trigger) => openDialog({ kind: 'check-in', stay }, trigger)}
                onNoShow={(stay, trigger) => openDialog({ kind: 'no-show', stay }, trigger)}
                onMove={(stay, trigger) => openDialog({ kind: 'move', stay }, trigger)}
                onDetail={(stay) => openDetail(stay.reference)}
              />
              {groupedItems.secondary.length > 0 && (
                <WorklistGroup
                  queue={queue}
                  title={queue === 'arrivals'
                    ? query.date === worklist.businessDate ? 'ورودهای معوق' : 'ورودهای پیش از تاریخ انتخاب‌شده'
                    : 'موعد خروج گذشته'}
                  items={groupedItems.secondary}
                  selectedDate={selectedDate}
                  businessDate={worklist.businessDate}
                  onCheckIn={(stay, trigger) => openDialog({ kind: 'check-in', stay }, trigger)}
                  onNoShow={(stay, trigger) => openDialog({ kind: 'no-show', stay }, trigger)}
                  onMove={(stay, trigger) => openDialog({ kind: 'move', stay }, trigger)}
                  onDetail={(stay) => openDetail(stay.reference)}
                />
              )}
            </div>
          )}
          {worklist.pagination.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="صفحه‌های فهرست">
              <button className={styles.secondaryButton} type="button" disabled={query.page <= 1} onClick={() => { setListState('loading'); setQuery((current) => ({ ...current, page: current.page - 1 })); }}>صفحه پیشین</button>
              <span>صفحه {formatPersianInteger(worklist.pagination.page)} از {formatPersianInteger(worklist.pagination.totalPages)}</span>
              <button className={styles.secondaryButton} type="button" disabled={query.page >= worklist.pagination.totalPages} onClick={() => { setListState('loading'); setQuery((current) => ({ ...current, page: current.page + 1 })); }}>صفحه بعد</button>
            </nav>
          )}
        </>
      )}

      {selectedReference && (
        <StayDetail
          reference={selectedReference}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          canAmend={Boolean(detailCanAmend)}
          editing={editingDetail}
          draft={amendDraft}
          busy={dialogBusy}
          onClose={() => { setSelectedReference(null); setDetail(null); setDetailError(null); setEditingDetail(false); }}
          onEdit={() => setEditingDetail(true)}
          onCancelEdit={() => { setEditingDetail(false); setDetailError(null); }}
          onDraftChange={(key, value) => setAmendDraft((current) => ({ ...current, [key]: value }))}
          onSubmit={submitAmendment}
        />
      )}

      {dialog?.kind === 'walk-in' && (
        <WalkInDialog
          roomTypes={roomTypes}
          draft={walkInDraft}
          error={walkInError}
          fieldError={walkInFieldError}
          retry={walkInRetry}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onClose={closeDialog}
          onStartNewRequest={startNewWalkInRequest}
          onDraftChange={(key, value) => setWalkInDraft((current) => ({ ...current, [key]: value }))}
          onSubmit={submitWalkIn}
        />
      )}
      {(dialog?.kind === 'check-in' || dialog?.kind === 'no-show') && (
        <ActionDialog
          kind={dialog.kind}
          stay={dialog.stay}
          manager={isManager(staff.role)}
          reason={dialogReason}
          error={dialogError}
          roomRecovery={dialogRoomRecovery}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onReasonChange={setDialogReason}
          onClose={closeDialog}
          onSubmit={submitAction}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          stay={dialog.stay}
          businessDate={worklist?.businessDate ?? query.date}
          rooms={moveRooms.filter((room) => canMoveTo(room, dialog.stay.assignedRooms.map((assigned) => assigned.roomNumber)))}
          loading={moveRoomsLoading}
          reason={dialogReason}
          error={dialogError}
          roomRecovery={dialogRoomRecovery}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onReasonChange={setDialogReason}
          onClose={closeDialog}
          onSubmit={submitAction}
        />
      )}
    </section>
  );
}

interface WorklistGroupProps {
  queue: StaffStayQueue;
  title: string;
  items: StaffStayWorklistItem[];
  selectedDate: string;
  businessDate: string;
  onCheckIn: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onNoShow: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onMove: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onDetail: (stay: StaffStayWorklistItem) => void;
}

function WorklistGroup({ queue, title, items, selectedDate, businessDate, onCheckIn, onNoShow, onMove, onDetail }: WorklistGroupProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.group} aria-label={title}>
      <header><h2>{title}</h2><span>{formatPersianInteger(items.length)} اقامت</span></header>
      <div className={styles.stayList}>
        {items.map((stay) => {
          const activeAssignments = assignmentsOnDate(stay, businessDate);
          const assigned = activeAssignments.length;
          const missingRooms = Math.max(0, stay.roomQuantity - assigned);
          const dueOut = stay.checkOut <= selectedDate;
          const actionableToday = isStayActiveOn(stay, businessDate);
          const canMoveToday = stay.status === 'CHECKED_IN' && actionableToday;
          return (
            <article className={styles.stayCard} key={stay.reference} aria-label={`${stay.guestName} · ${stay.reference}`}>
              <div className={styles.cardTop}>
                <div><h3>{stay.guestName}</h3><p dir="ltr">{stay.reference}</p></div>
                <span className={dueOut && queue === 'in-house' ? styles.statusDue : styles.statusNeutral}>
                  {queue === 'arrivals'
                    ? stay.checkIn < selectedDate
                      ? selectedDate === businessDate ? 'ورود معوق' : 'ورود پیش از تاریخ انتخاب‌شده'
                      : selectedDate === businessDate ? 'ورود امروز' : 'ورود در تاریخ انتخاب‌شده'
                    : queue === 'in-house'
                      ? dueOut ? selectedDate === businessDate ? 'موعد خروج امروز' : 'موعد خروج در تاریخ انتخاب‌شده' : 'اقامت در جریان'
                      : 'موعد خروج رسیده'}
                </span>
              </div>
              <dl className={styles.stayFacts}>
                <div><dt>ورود</dt><dd>{dateLabel(stay.checkIn)}</dd></div>
                <div><dt>خروج</dt><dd>{dateLabel(stay.checkOut)}</dd></div>
                <div><dt>نوع اتاق</dt><dd>{stay.roomType.name}</dd></div>
                <div><dt>تعداد اتاق</dt><dd>{formatPersianInteger(stay.roomQuantity)}</dd></div>
              </dl>
              {queue !== 'departures' && (
                <div className={styles.readiness}>
                  <strong>{assignmentSummary(stay, businessDate)}</strong>
                  {missingRooms > 0 && <Link href="/staff/rooms">تکمیل تخصیص اتاق‌ها ({formatPersianInteger(missingRooms)} اتاق)</Link>}
                  {stay.assignedRooms.length > 0 && (
                    <ul aria-label="اتاق‌های تخصیص‌یافته">
                      {stay.assignedRooms.map((room) => (
                        <li key={room.assignmentId}>
                          <span>اتاق {room.roomNumber}</span>
                          <span>{ROOM_STATUS[room.housekeepingStatus]}</span>
                          <span>{dateLabel(room.startDate)} تا {dateLabel(room.endDate)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeAssignments.some((room) => room.housekeepingStatus !== 'INSPECTED') && (
                    <Link href="/staff/rooms">بازبینی وضعیت و بازرسی اتاق‌ها</Link>
                  )}
                  <small>تعداد تخصیص برای تاریخ کاری جاری است؛ آمادگی کل بازه و محدودیت‌ها را سامانه هنگام ثبت ورود بررسی می‌کند.</small>
                </div>
              )}
              {queue === 'departures' && <p className={styles.readOnlyNote}>فهرست اطلاع‌رسانی؛ ثبت خروج در این بخش انجام نمی‌شود.</p>}
              <div className={styles.cardActions}>
                {queue === 'arrivals' && stay.status === 'CONFIRMED' && <>
                  <button className={styles.primaryButton} type="button" disabled={!actionableToday} onClick={(event) => onCheckIn(stay, event.currentTarget)}>ثبت ورود</button>
                  <button className={styles.secondaryButton} type="button" disabled={!actionableToday} onClick={(event) => onNoShow(stay, event.currentTarget)}>ثبت عدم مراجعه</button>
                </>}
                {queue === 'arrivals' && stay.status === 'CONFIRMED' && !actionableToday && <span role="status">این اقامت خارج از بازه فعال تاریخ کاری جاری است؛ عملیات ورود و عدم مراجعه در دسترس نیست.</span>}
                {queue === 'in-house' && <button className={styles.secondaryButton} type="button" disabled={!canMoveToday} onClick={(event) => onMove(stay, event.currentTarget)}>انتقال اتاق</button>}
                {queue === 'in-house' && !canMoveToday && <span role="status">انتقال اتاق فقط برای اقامت واردشده در بازه فعال تاریخ کاری جاری در دسترس است.</span>}
                {queue !== 'departures' && <button className={styles.textButton} type="button" onClick={() => onDetail(stay)}>نمایش جزئیات</button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface ActionDialogProps {
  kind: 'check-in' | 'no-show';
  stay: StaffStayWorklistItem;
  manager: boolean;
  reason: string;
  error: string | null;
  roomRecovery: boolean;
  busy: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function ActionDialog({ kind, stay, manager, reason, error, roomRecovery, busy, headingRef, onReasonChange, onClose, onSubmit }: ActionDialogProps) {
  const checkIn = kind === 'check-in';
  const title = checkIn ? 'تأیید ورود مهمان' : 'ثبت عدم مراجعه مهمان';
  return (
    <div className={styles.dialogBackdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" onKeyDown={(event) => handleDialogKeyDown(event, onClose)}>
        <h2 id="action-dialog-title" tabIndex={-1} ref={headingRef}>{title}</h2>
        <p>{checkIn ? `ورود مهمان ${stay.guestName} با کد ${stay.reference} ثبت می‌شود.` : `ثبت عدم مراجعه برای رزرو ${stay.reference} ظرفیت باقی‌مانده را طبق سامانه آزاد می‌کند.`}</p>
        {checkIn && manager && <label>دلیل ورود زودهنگام <span>در صورت نیاز؛ سامانه مجازبودن زمان را بررسی می‌کند.</span>
          <textarea aria-label="دلیل ورود زودهنگام" value={reason} maxLength={500} onChange={(event) => onReasonChange(event.target.value)} />
        </label>}
        {!checkIn && <label>دلیل عدم مراجعه <span>این توضیح در سابقه عملیات ثبت می‌شود.</span>
          <textarea aria-label="دلیل عدم مراجعه" value={reason} maxLength={500} onChange={(event) => onReasonChange(event.target.value)} />
        </label>}
        {error && <p className={styles.error} role="alert">{error}{roomRecovery && <> <Link href="/staff/rooms">بررسی وضعیت اتاق‌ها</Link></>}</p>}
        <form onSubmit={onSubmit} className={styles.dialogActions}>
          <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : checkIn ? 'تأیید و ثبت ورود' : 'ثبت عدم مراجعه'}</button>
          <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={busy}>بازگشت</button>
        </form>
      </section>
    </div>
  );
}

interface WalkInDialogProps {
  roomTypes: PublicRoomType[];
  draft: WalkInDraft;
  error: string | null;
  fieldError: string | null;
  retry: boolean;
  busy: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onStartNewRequest: () => void;
  onDraftChange: (key: keyof WalkInDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function WalkInDialog({ roomTypes, draft, error, fieldError, retry, busy, headingRef, onClose, onStartNewRequest, onDraftChange, onSubmit }: WalkInDialogProps) {
  return (
    <div className={styles.dialogBackdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="walk-in-title" onKeyDown={(event) => handleDialogKeyDown(event, onClose)}>
        <h2 id="walk-in-title" tabIndex={-1} ref={headingRef}>ثبت ورود بدون رزرو قبلی</h2>
        <p>این اقامت با تاریخ کاری امروز ثبت می‌شود. ظرفیت و نرخ نهایی را سامانه بررسی می‌کند.</p>
        <form className={styles.formGrid} onSubmit={onSubmit}>
          <label>نام مهمان<input aria-label="نام مهمان" required minLength={2} maxLength={160} value={draft.guestName} disabled={busy || retry} onChange={(event) => onDraftChange('guestName', event.target.value)} /></label>
          <label>شماره تماس<input aria-label="شماره تماس" required inputMode="tel" dir="ltr" value={draft.guestPhone} disabled={busy || retry} onChange={(event) => onDraftChange('guestPhone', event.target.value)} /></label>
          <label>نوع اتاق<select aria-label="نوع اتاق" required value={draft.roomTypeSlug} disabled={busy || retry} onChange={(event) => onDraftChange('roomTypeSlug', event.target.value)}>
            <option value="">انتخاب کنید</option>{roomTypes.map((roomType) => <option key={roomType.slug} value={roomType.slug}>{roomType.name}</option>)}
          </select></label>
          <label>تاریخ خروج<input aria-label="تاریخ خروج" required inputMode="numeric" placeholder="۱۴۰۵/۰۸/۲۸" value={draft.checkOut} disabled={busy || retry} onChange={(event) => onDraftChange('checkOut', event.target.value)} /></label>
          <label>تعداد مهمانان<input aria-label="تعداد مهمانان" type="number" min="1" max="20" required value={draft.guestCount} disabled={busy || retry} onChange={(event) => onDraftChange('guestCount', event.target.value)} /></label>
          <label>تعداد اتاق<input aria-label="تعداد اتاق" type="number" min="1" max="20" required value={draft.roomQuantity} disabled={busy || retry} onChange={(event) => onDraftChange('roomQuantity', event.target.value)} /></label>
          <label className={styles.wideField}>رایانامه، در صورت تمایل<input aria-label="رایانامه" type="email" dir="ltr" value={draft.guestEmail} disabled={busy || retry} onChange={(event) => onDraftChange('guestEmail', event.target.value)} /></label>
          {fieldError && <p className={styles.error} role="alert">{fieldError}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {retry && <div className={styles.retryNote} role="note" aria-label="هشدار درباره درخواست ناموفق">
            <p>پاسخ درخواست قبلی دریافت نشد و ممکن است در سامانه ثبت شده باشد. برای جلوگیری از ثبت تکراری، تلاش دوباره با همان اطلاعات و همان شناسه امن انجام می‌شود.</p>
            <p>اگر اطلاعات را تغییر دهید و درخواست تازه‌ای بسازید، ممکن است اقامت تکراری ثبت شود. ابتدا وضعیت درخواست قبلی را بررسی کنید.</p>
            <button className={styles.secondaryButton} type="button" onClick={onStartNewRequest} disabled={busy}>لغو تلاش و شروع درخواست جدید</button>
          </div>}
          <div className={styles.dialogActions}>
            <button className={styles.primaryButton} type="submit" disabled={busy || roomTypes.length === 0}>{busy ? 'در حال ثبت…' : retry ? 'تلاش دوباره با همان درخواست' : 'ثبت ورود قطعی'}</button>
            <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={busy}>بازگشت</button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface MoveDialogProps {
  stay: StaffStayWorklistItem;
  businessDate: string;
  rooms: StaffRoomBoardItem[];
  loading: boolean;
  reason: string;
  error: string | null;
  roomRecovery: boolean;
  busy: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function MoveDialog({ stay, businessDate, rooms, loading, reason, error, roomRecovery, busy, headingRef, onReasonChange, onClose, onSubmit }: MoveDialogProps) {
  const activeAssignments = assignmentsOnDate(stay, businessDate);
  return (
    <div className={styles.dialogBackdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="move-dialog-title" onKeyDown={(event) => handleDialogKeyDown(event, onClose)}>
        <h2 id="move-dialog-title" tabIndex={-1} ref={headingRef}>انتقال مهمان به اتاق دیگر</h2>
        <p>انتقال از اتاق انتخاب‌شده در روز کاری جاری بررسی می‌شود؛ سامانه تداخل کل بازه باقی‌مانده را کنترل می‌کند.</p>
        <form onSubmit={onSubmit}>
          <label>اتاق فعلی<select aria-label="اتاق فعلی" name="sourceAssignmentId" required disabled={activeAssignments.length === 0} defaultValue={activeAssignments[0]?.assignmentId ?? ''}>
            {activeAssignments.length === 0
              ? <option value="">تخصیص فعالی برای این تاریخ وجود ندارد</option>
              : activeAssignments.map((room) => <option key={room.assignmentId} value={room.assignmentId}>اتاق {room.roomNumber}</option>)}
          </select></label>
          {activeAssignments.length === 0 && <p className={styles.notice} role="status">برای تاریخ کاری جاری تخصیص اتاقی فعال نیست؛ پیش از انتقال، برنامه اتاق را بررسی کنید.</p>}
          <label>اتاق مقصد<select aria-label="اتاق مقصد" name="targetRoomId" required defaultValue="">
            <option value="">انتخاب اتاق بازرسی‌شده</option>{rooms.map((room) => <option key={room.id} value={room.id}>اتاق {room.roomNumber}</option>)}
          </select></label>
          {loading && <p role="status">در حال بررسی اتاق‌های پیشنهادی…</p>}
          {!loading && rooms.length === 0 && <p className={styles.notice}>اتاق بازرسی‌شده و آزاد برای بررسی پیدا نشد. امکان نهایی انتقال را سامانه تعیین می‌کند.</p>}
          <label>دلیل انتقال<textarea aria-label="دلیل انتقال" required maxLength={500} value={reason} onChange={(event) => onReasonChange(event.target.value)} /></label>
          {error && <p className={styles.error} role="alert">{error}{roomRecovery && <> <Link href="/staff/rooms">بررسی وضعیت اتاق‌ها</Link></>}</p>}
          <div className={styles.dialogActions}>
            <button className={styles.primaryButton} type="submit" disabled={busy || loading || activeAssignments.length === 0 || rooms.length === 0}>{busy ? 'در حال ثبت…' : 'ثبت انتقال'}</button>
            <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={busy}>بازگشت</button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface AmendmentDraft {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestCount: string;
  roomQuantity: string;
  checkIn: string;
  checkOut: string;
}

interface StayDetailProps {
  reference: string;
  detail: StaffBookingDetail | null;
  loading: boolean;
  error: string | null;
  canAmend: boolean;
  editing: boolean;
  draft: AmendmentDraft;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (key: keyof AmendmentDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function StayDetail({ reference, detail, loading, error, canAmend, editing, draft, busy, onClose, onEdit, onCancelEdit, onDraftChange, onSubmit }: StayDetailProps) {
  const changes = detail ? [
    draft.guestName !== detail.guestName ? `نام مهمان: ${detail.guestName} ← ${draft.guestName}` : null,
    draft.guestPhone !== detail.guestPhone ? 'شماره تماس مهمان تغییر می‌کند.' : null,
    draft.guestEmail !== (detail.guestEmail ?? '') ? 'رایانامه مهمان تغییر می‌کند.' : null,
    Number(draft.guestCount) !== detail.guestCount ? `تعداد مهمانان: ${formatPersianInteger(detail.guestCount)} ← ${formatPersianInteger(Number(draft.guestCount) || 0)}` : null,
    Number(draft.roomQuantity) !== detail.roomQuantity ? `تعداد اتاق: ${formatPersianInteger(detail.roomQuantity)} ← ${formatPersianInteger(Number(draft.roomQuantity) || 0)}` : null,
    toGregorianIso(draft.checkIn) !== detail.checkIn ? 'تاریخ ورود تغییر می‌کند.' : null,
    toGregorianIso(draft.checkOut) !== detail.checkOut ? 'تاریخ خروج تغییر می‌کند.' : null,
  ].filter(Boolean) : [];
  return (
    <section className={styles.detailPanel} role="region" aria-label={`جزئیات اقامت ${reference}`}>
      <header><div><p className={styles.eyebrow}>جزئیات اقامت</p><h2>{reference}</h2></div><button className={styles.secondaryButton} type="button" onClick={onClose}>بستن جزئیات</button></header>
      {loading && <p role="status">در حال دریافت جزئیات اقامت…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {detail && <>
        {!editing ? <>
          <dl className={styles.detailFacts}>
            <div><dt>مهمان</dt><dd>{detail.guestName}</dd></div><div><dt>تماس</dt><dd dir="ltr">{detail.guestPhone}</dd></div>
            {detail.guestEmail && <div><dt>رایانامه</dt><dd dir="ltr">{detail.guestEmail}</dd></div>}
            <div><dt>تعداد مهمانان</dt><dd>{formatPersianInteger(detail.guestCount)}</dd></div><div><dt>اتاق</dt><dd>{detail.roomType.name}</dd></div>
            <div><dt>اقامت</dt><dd>{dateLabel(detail.checkIn)} تا {dateLabel(detail.checkOut)}</dd></div>
          </dl>
          {canAmend && <button className={styles.secondaryButton} type="button" onClick={onEdit}>ویرایش جزئیات اقامت</button>}
        </> : <form className={styles.formGrid} onSubmit={onSubmit}>
          <label>نام مهمان<input value={draft.guestName} onChange={(event) => onDraftChange('guestName', event.target.value)} /></label>
          <label>شماره تماس<input dir="ltr" value={draft.guestPhone} onChange={(event) => onDraftChange('guestPhone', event.target.value)} /></label>
          <label>رایانامه<input type="email" dir="ltr" value={draft.guestEmail} onChange={(event) => onDraftChange('guestEmail', event.target.value)} /></label>
          <label>تعداد مهمانان<input type="number" min="1" max="20" aria-label="تعداد مهمانان" value={draft.guestCount} onChange={(event) => onDraftChange('guestCount', event.target.value)} /></label>
          <label>تعداد اتاق<input type="number" min="1" max="20" aria-label="تعداد اتاق" value={draft.roomQuantity} onChange={(event) => onDraftChange('roomQuantity', event.target.value)} /></label>
          <label>ورود<input inputMode="numeric" value={draft.checkIn} onChange={(event) => onDraftChange('checkIn', event.target.value)} /></label>
          <label>خروج<input inputMode="numeric" value={draft.checkOut} onChange={(event) => onDraftChange('checkOut', event.target.value)} /></label>
          <section className={styles.preview} role="region" aria-label="پیش‌نمایش تغییرات"><h3>پیش‌نمایش تغییرات</h3>{changes.length ? <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul> : <p>تغییری وارد نشده است.</p>}<p>این پیش‌نمایش فقط فیلدهای تغییرکرده را نشان می‌دهد؛ وضعیت و جزئیات نهایی پس از پاسخ سامانه تازه‌سازی می‌شود.</p></section>
          <div className={styles.dialogActions}><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : 'ثبت تغییرات'}</button><button className={styles.secondaryButton} type="button" onClick={onCancelEdit} disabled={busy}>انصراف</button></div>
        </form>}
      </>}
    </section>
  );
}
