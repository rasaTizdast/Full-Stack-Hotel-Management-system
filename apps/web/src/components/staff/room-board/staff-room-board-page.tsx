'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  StaffApiError,
  getStaffRoomBoard,
  replaceStaffBookingRoomAssignments,
  type StaffRoomBoardAssignableBooking,
  type StaffRoomBoardQuery,
} from '@/lib/staff-api';
import { formatGregorianAsJalali, toGregorianIso } from '@/lib/jalali-date';
import { useStaffSession } from '../staff-session-provider';
import { isDateWithinAssignmentInterval } from './room-board-date';
import {
  RoomAssignmentEditor,
  type DraftAssignment,
  type StaleConflict,
} from './room-assignment-editor';
import {
  AssignableBookings,
  EMPTY_ROOM_BOARD_FILTERS,
  RoomBoardFiltersForm,
  RoomBoardHeader,
  RoomBoardList,
  RoomBoardSummary,
  displayRoomBoardDate,
  roomFilterMatches,
  type RoomBoardFilters,
} from './room-board-view';
import styles from './room-board.module.css';

const ROOM_BOARD_REFRESH_MS = 30_000;

function assignmentsForEditor(booking: StaffRoomBoardAssignableBooking, nextKey: () => number) {
  return booking.assignments.map((assignment) => ({
    key: nextKey(),
    roomId: assignment.roomId,
    roomNumber: assignment.roomNumber,
    startDate: formatGregorianAsJalali(assignment.startDate) ?? assignment.startDate,
    endDate: formatGregorianAsJalali(assignment.endDate) ?? assignment.endDate,
  }));
}

function assignmentErrorMessage(cause: unknown): string {
  if (!(cause instanceof StaffApiError)) {
    return cause instanceof Error ? cause.message : 'تخصیص اتاق ذخیره نشد. دوباره تلاش کنید.';
  }
  const messages: Record<string, string> = {
    ROOM_ASSIGNMENT_LIMIT: 'تعداد اتاق‌های تخصیص‌یافته نباید از تعداد اتاق‌های رزروشده بیشتر باشد.',
    ROOM_ASSIGNMENT_DUPLICATE_ROOM: 'هر اتاق را فقط یک‌بار در این تخصیص وارد کنید.',
    ROOM_ASSIGNMENT_OUTSIDE_BOOKING: 'بازهٔ هر تخصیص باید داخل تاریخ ورود و خروج رزرو باشد.',
    ROOM_TYPE_MISMATCH: 'نوع اتاق انتخابی با نوع اتاق رزرو هم‌خوان نیست.',
    ROOM_ASSIGNMENT_OVERLAP:
      'این اتاق در بخشی از بازه برای رزرو دیگری تخصیص دارد؛ اتاق دیگری انتخاب کنید.',
    ROOM_BLOCKED:
      'این اتاق در بخشی از بازه مسدود است؛ اتاق دیگری انتخاب کنید یا تاریخ را تغییر دهید.',
    BOOKING_STATUS_CONFLICT: 'این رزرو دیگر تأییدشده نیست؛ فهرست را به‌روزرسانی کنید.',
  };
  return messages[cause.code ?? ''] ?? cause.message;
}

function dateQuery(date: string | undefined): StaffRoomBoardQuery {
  return date ? { date } : {};
}

export function StaffRoomBoardPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const canViewBoard = Boolean(
    status === 'authenticated' &&
    staff &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(staff.role),
  );
  const [board, setBoard] = useState<Awaited<ReturnType<typeof getStaffRoomBoard>> | null>(null);
  const [draftFilters, setDraftFilters] = useState<RoomBoardFilters>(EMPTY_ROOM_BOARD_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<RoomBoardFilters>(EMPTY_ROOM_BOARD_FILTERS);
  const [appliedDate, setAppliedDate] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<StaffRoomBoardAssignableBooking | null>(
    null,
  );
  const [draftAssignments, setDraftAssignments] = useState<DraftAssignment[]>([]);
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState<StaleConflict | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const boardRequestId = useRef(0);
  const hasBoard = useRef(false);
  const nextDraftKey = useRef(0);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);

  const loadBoard = useCallback(async (date: string | undefined) => {
    const requestId = ++boardRequestId.current;
    if (hasBoard.current) setIsRefreshing(true);
    else setIsLoading(true);
    setRefreshError(null);
    try {
      // Fetch every room for the date so local card filters never hide assignment choices.
      const result = await getStaffRoomBoard(dateQuery(date));
      if (boardRequestId.current !== requestId) return;
      hasBoard.current = true;
      setBoard(result);
      setIsStale(false);
      setRefreshError(null);
    } catch (cause) {
      if (boardRequestId.current !== requestId) return;
      const message =
        cause instanceof Error ? cause.message : 'وضعیت اتاق‌ها دریافت نشد. دوباره تلاش کنید.';
      setRefreshError(message);
      if (hasBoard.current) setIsStale(true);
    } finally {
      if (boardRequestId.current === requestId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!canViewBoard) return;
    const initialLoad = window.setTimeout(() => void loadBoard(appliedDate), 0);
    const interval = window.setInterval(() => void loadBoard(appliedDate), ROOM_BOARD_REFRESH_MS);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      boardRequestId.current += 1;
    };
  }, [appliedDate, canViewBoard, loadBoard]);

  useEffect(() => {
    if (!selectedBooking && editorTrigger.current?.isConnected) editorTrigger.current.focus();
  }, [selectedBooking]);

  const visibleItems = useMemo(
    () => (board?.items ?? []).filter((item) => roomFilterMatches(item, appliedFilters)),
    [appliedFilters, board?.items],
  );
  const roomTypes = useMemo(() => {
    const types = new Map<string, { id: string; name: string }>();
    for (const room of board?.items ?? [])
      types.set(room.roomType.id, { id: room.roomType.id, name: room.roomType.name });
    return [...types.values()].sort((first, second) => first.name.localeCompare(second.name, 'fa'));
  }, [board?.items]);
  const floors = useMemo(
    () =>
      [
        ...new Set(
          (board?.items ?? [])
            .map((room) => room.floor)
            .filter((floor): floor is string => Boolean(floor)),
        ),
      ].sort((a, b) => a.localeCompare(b, 'fa')),
    [board?.items],
  );

  if (status !== 'authenticated' || !staff) return null;

  if (!canViewBoard) {
    return (
      <section className={styles.denied} aria-labelledby="staff-room-board-denied-title">
        <h1 id="staff-room-board-denied-title">دسترسی به وضعیت اتاق‌ها</h1>
        <p role="alert">این بخش برای پذیرش و مدیران در دسترس است.</p>
      </section>
    );
  }

  function updateFilter(field: keyof RoomBoardFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }) as RoomBoardFilters);
    if (field === 'date') setDateError(null);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedDate = draftFilters.date.trim() ? toGregorianIso(draftFilters.date) : undefined;
    if (draftFilters.date.trim() && !requestedDate) {
      setDateError('تاریخ را به شکل سال/ماه/روز شمسی معتبر وارد کنید.');
      return;
    }
    setDateError(null);
    setAppliedFilters({ ...draftFilters });
    setAppliedDate(requestedDate ?? undefined);
    setSuccessMessage(null);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_ROOM_BOARD_FILTERS);
    setAppliedFilters(EMPTY_ROOM_BOARD_FILTERS);
    setAppliedDate(undefined);
    setDateError(null);
  }

  function openAssignmentEditor(reference: string, trigger: HTMLButtonElement) {
    const booking = board?.assignableBookings.find((item) => item.reference === reference);
    if (!booking) return;
    editorTrigger.current = trigger;
    setSelectedBooking(booking);
    setDraftAssignments(assignmentsForEditor(booking, () => ++nextDraftKey.current));
    setExpectedRevision(booking.revision);
    setReason('');
    setEditorError(null);
    setStaleConflict(null);
    setSuccessMessage(null);
  }

  function closeAssignmentEditor() {
    setSelectedBooking(null);
    setExpectedRevision(null);
    setDraftAssignments([]);
    setReason('');
    setEditorError(null);
    setStaleConflict(null);
  }

  function updateAssignment(key: number, field: 'roomId' | 'startDate' | 'endDate', value: string) {
    setDraftAssignments((current) =>
      current.map((assignment) => {
        if (assignment.key !== key) return assignment;
        if (field === 'roomId') {
          const room = board?.items.find((item) => item.id === value);
          return { ...assignment, roomId: value, roomNumber: room?.roomNumber ?? '' };
        }
        return { ...assignment, [field]: value };
      }),
    );
    setEditorError(null);
  }

  function addAssignment() {
    if (!selectedBooking || !board) return;
    const selectedDateCount = draftAssignments.filter((assignment) =>
      isDateWithinAssignmentInterval(assignment.startDate, assignment.endDate, board.date),
    ).length;
    if (selectedDateCount >= selectedBooking.roomQuantity) {
      setEditorError('همهٔ واحدهای رزروشده برای این تاریخ تخصیص دارند.');
      return;
    }
    if (draftAssignments.length >= selectedBooking.roomQuantity) {
      setEditorError('برای افزودن یک بازه، ابتدا تخصیص موجود را ویرایش یا حذف کنید.');
      return;
    }
    const assignedRoomIds = new Set(draftAssignments.map((assignment) => assignment.roomId));
    const availableRoom = board.items.find(
      (room) =>
        room.isActive &&
        room.roomType.id === selectedBooking.roomTypeId &&
        !assignedRoomIds.has(room.id) &&
        room.blocks.length === 0 &&
        room.reservationContexts.every(
          (context) => context.reference === selectedBooking.reference,
        ),
    );
    if (!availableRoom) {
      setEditorError(
        'اتاق هم‌نوع و بدون تداخل برای این تاریخ پیدا نشد. فیلترهای فهرست را پاک یا تاریخ را بررسی کنید.',
      );
      return;
    }
    const startDate = selectedBooking.checkIn > board.date ? selectedBooking.checkIn : board.date;
    const assignmentKey = ++nextDraftKey.current;
    setDraftAssignments((current) => [
      ...current,
      {
        key: assignmentKey,
        roomId: availableRoom.id,
        roomNumber: availableRoom.roomNumber,
        startDate: formatGregorianAsJalali(startDate) ?? startDate,
        endDate: formatGregorianAsJalali(selectedBooking.checkOut) ?? selectedBooking.checkOut,
      },
    ]);
    setEditorError(null);
  }

  async function loadLatestAssignments() {
    if (!selectedBooking || !board) return;
    setStaleConflict({ state: 'loading' });
    try {
      // The selected date is inside the stay because this booking came from assignableBookings.
      const latestBoard = await getStaffRoomBoard({ date: board.date });
      hasBoard.current = true;
      setBoard(latestBoard);
      setIsStale(false);
      setRefreshError(null);
      const latestBooking = latestBoard.assignableBookings.find(
        (booking) => booking.reference === selectedBooking.reference,
      );
      if (!latestBooking) {
        setStaleConflict({
          state: 'error',
          message: 'رزرو دیگر در تاریخ انتخاب‌شده قابل تخصیص نیست؛ پیش‌نویس شما حفظ شده است.',
        });
        return;
      }
      setStaleConflict({ state: 'ready', booking: latestBooking });
    } catch (cause) {
      setStaleConflict({
        state: 'error',
        message: cause instanceof Error ? cause.message : 'آخرین تخصیص‌ها دریافت نشد.',
      });
    }
  }

  function chooseLatestAssignments(booking: StaffRoomBoardAssignableBooking) {
    setSelectedBooking(booking);
    setDraftAssignments(assignmentsForEditor(booking, () => ++nextDraftKey.current));
    setExpectedRevision(booking.revision);
    setStaleConflict(null);
    setEditorError(null);
    setSuccessMessage('آخرین تخصیص‌های ثبت‌شده بارگذاری شد.');
  }

  function reapplyDraftToLatest(booking: StaffRoomBoardAssignableBooking) {
    setSelectedBooking(booking);
    setExpectedRevision(booking.revision);
    setStaleConflict(null);
    setEditorError(null);
    setSuccessMessage('پیش‌نویس شما با نسخهٔ جدید آمادهٔ ذخیره است.');
  }

  async function saveAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBooking || !expectedRevision) return;
    if (staleConflict) {
      setEditorError(
        'پیش از ذخیره، آخرین تخصیص را بارگذاری کنید یا پیش‌نویس را آگاهانه با نسخهٔ جدید ادامه دهید.',
      );
      return;
    }
    if (!csrfToken) {
      setEditorError('نشست کارکنان منقضی شده است؛ دوباره وارد شوید.');
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setEditorError('دلیل تخصیص یا تغییر را وارد کنید.');
      return;
    }
    if (trimmedReason.length > 500) {
      setEditorError('دلیل تغییر نباید بیشتر از ۵۰۰ نویسه باشد.');
      return;
    }
    const assignments: Array<{ roomId: string; startDate: string; endDate: string }> = [];
    for (const assignment of draftAssignments) {
      const startDate = toGregorianIso(assignment.startDate);
      const endDate = toGregorianIso(assignment.endDate);
      if (!assignment.roomId || !startDate || !endDate || endDate <= startDate) {
        setEditorError('اتاق و بازهٔ معتبر برای هر تخصیص انتخاب کنید.');
        return;
      }
      if (startDate < selectedBooking.checkIn || endDate > selectedBooking.checkOut) {
        setEditorError('بازهٔ هر تخصیص باید داخل تاریخ ورود و خروج رزرو باشد.');
        return;
      }
      assignments.push({ roomId: assignment.roomId, startDate, endDate });
    }
    if (new Set(assignments.map((assignment) => assignment.roomId)).size !== assignments.length) {
      setEditorError('هر اتاق را فقط یک‌بار در این تخصیص وارد کنید.');
      return;
    }

    setIsSaving(true);
    setEditorError(null);
    setSuccessMessage(null);
    try {
      await replaceStaffBookingRoomAssignments(
        selectedBooking.reference,
        { assignments, expectedRevision, reason: trimmedReason },
        csrfToken,
      );
      const savedReference = selectedBooking.reference;
      const savedDate = board?.date;
      closeAssignmentEditor();
      setSuccessMessage(`تخصیص اتاق‌های رزرو ${savedReference} ذخیره شد.`);
      if (savedDate) await loadBoard(savedDate);
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.code === 'ROOM_ASSIGNMENT_STALE') {
        setEditorError(
          'تخصیص اتاق هم‌زمان تغییر کرده است. پیش‌نویس شما حفظ شد؛ نسخه‌ها را بررسی کنید.',
        );
        await loadLatestAssignments();
      } else {
        setEditorError(assignmentErrorMessage(cause));
      }
    } finally {
      setIsSaving(false);
    }
  }

  const staleBanner = Boolean(refreshError && board && isStale);
  const staleMessage =
    board && appliedDate && appliedDate !== board.date
      ? `دریافت تاریخ ${displayRoomBoardDate(appliedDate)} ناموفق بود؛ اطلاعات تاریخ ${displayRoomBoardDate(board.date)} باقی مانده است.`
      : 'نمایش داده‌ها ممکن است قدیمی باشد.';

  return (
    <section className={styles.page} aria-labelledby="staff-room-board-title">
      <RoomBoardHeader
        board={board}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadBoard(appliedDate)}
      />

      {refreshError && !board ? (
        <div className={`${styles.message} ${styles.messageError}`} role="alert">
          <p>{refreshError}</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => void loadBoard(appliedDate)}
            disabled={isRefreshing}
          >
            تلاش دوباره
          </button>
        </div>
      ) : null}
      {staleBanner ? (
        <div className={`${styles.message} ${styles.messageWarning}`} role="alert">
          <p>
            {refreshError} {staleMessage}
          </p>
          <span>نمایش داده‌ها ممکن است قدیمی باشد.</span>
        </div>
      ) : null}
      {successMessage ? (
        <p className={`${styles.message} ${styles.messageSuccess}`} role="status">
          {successMessage}
        </p>
      ) : null}
      {isLoading ? (
        <p className={styles.loading} role="status">
          در حال دریافت وضعیت اتاق‌ها…
        </p>
      ) : null}

      {board ? (
        <>
          <RoomBoardSummary items={visibleItems} />
          <RoomBoardFiltersForm
            filters={draftFilters}
            businessDate={board.businessDate}
            roomTypes={roomTypes}
            floors={floors}
            dateError={dateError}
            disabled={isLoading || isRefreshing}
            onChange={updateFilter}
            onSubmit={applyFilters}
            onClear={clearFilters}
          />
          <RoomBoardList
            items={visibleItems}
            date={board.date}
            isBusy={isLoading || isRefreshing}
          />
          <AssignableBookings board={board} onEdit={openAssignmentEditor} />
          {selectedBooking ? (
            <RoomAssignmentEditor
              booking={selectedBooking}
              boardDate={board.date}
              rooms={board.items}
              assignments={draftAssignments}
              reason={reason}
              editorError={editorError}
              staleConflict={staleConflict}
              isSaving={isSaving}
              onClose={closeAssignmentEditor}
              onUpdate={updateAssignment}
              onRemove={(key) =>
                setDraftAssignments((current) => current.filter((item) => item.key !== key))
              }
              onAdd={addAssignment}
              onReasonChange={setReason}
              onSave={saveAssignments}
              onLoadLatest={() => void loadLatestAssignments()}
              onChooseLatest={chooseLatestAssignments}
              onReapplyDraft={reapplyDraftToLatest}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
