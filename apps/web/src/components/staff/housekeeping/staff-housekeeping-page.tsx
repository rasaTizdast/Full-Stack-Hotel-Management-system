'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStaffSession } from '../staff-session-provider';
import { StaffApiError, type StaffRole } from '@/lib/staff-api';
import { toGregorianIso } from '@/lib/jalali-date';
import {
  assignStaffHousekeepingTask,
  cancelStaffHousekeepingTask,
  completeStaffHousekeepingTask,
  createStaffHousekeepingTask,
  dismissStaffHousekeepingDiscrepancy,
  getStaffHousekeepingAssignees,
  getStaffHousekeepingDiscrepancies,
  getStaffHousekeepingRooms,
  getStaffHousekeepingTasks,
  reportStaffRoomDiscrepancy,
  resolveStaffHousekeepingDiscrepancy,
  startStaffHousekeepingTask,
  type HousekeepingAssignee,
  type HousekeepingDiscrepancy,
  type HousekeepingList,
  type HousekeepingRoomOption,
  type HousekeepingTask,
  type HousekeepingTaskType,
  type HousekeepingPriority,
  type HousekeepingTaskStatus,
  type HousekeepingListQuery,
  type HousekeepingDiscrepancyStatus,
} from '@/lib/staff-housekeeping-api';
import {
  HousekeepingDiscrepancyQueue,
  HousekeepingFilterBar,
  HousekeepingHeader,
  HousekeepingPagination,
  HousekeepingRoomReadiness,
  HousekeepingTaskList,
  type HousekeepingFilters,
} from './housekeeping-board-view';
import {
  AssignHousekeepingTaskDialog,
  CancelHousekeepingTaskDialog,
  CompleteHousekeepingDialog,
  CreateHousekeepingTaskDialog,
  DismissHousekeepingDiscrepancyDialog,
  ReportHousekeepingDiscrepancyDialog,
  type HousekeepingDialogState,
} from './housekeeping-dialogs';
import {
  DISCREPANCY_KIND_LABELS,
  hasHousekeepingFilters,
  sortHousekeepingTasksByUrgency,
} from './housekeeping-copy';
import styles from './housekeeping.module.css';

const PAGE_SIZE = 20;
const ROOM_OPTIONS_PAGE_SIZE = 100;
const REFRESH_INTERVAL_MS = 45_000;
const ALLOWED_ROLES: StaffRole[] = ['HOUSEKEEPER', 'RECEPTIONIST', 'MANAGER', 'ADMIN'];
const READINESS_ROLES: StaffRole[] = ['RECEPTIONIST', 'MANAGER', 'ADMIN'];
const MANAGER_ROLES: StaffRole[] = ['MANAGER', 'ADMIN'];
const EMPTY_FILTERS: HousekeepingFilters = {
  dueDate: '',
  roomId: '',
  floor: '',
  taskType: '',
  assigneeStaffUserId: '',
  status: '',
  priority: '',
};

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof StaffApiError) {
    if (cause.status === 403) return 'این اقدام برای نقش شما مجاز نیست؛ دسترسی را از مدیر شیفت بررسی کنید.';
    if (cause.status === 409) {
      const conflictMessages: Record<string, string> = {
        TASK_STATUS_CONFLICT: 'وضعیت این کار هم‌زمان تغییر کرده است؛ فهرست تازه را بررسی کنید.',
        TASK_NOT_ASSIGNED: 'این کار به شما تخصیص ندارد؛ فهرست را به‌روزرسانی کنید.',
        ROOM_NOT_CLEAN: 'اتاق هنوز وضعیت لازم برای بازرسی را ندارد؛ وضعیت نظافت را بررسی کنید.',
        ROOM_OCCUPANCY_MISMATCH: 'وضعیت حضور اتاق تغییر کرده است؛ فهرست تازه را بررسی کنید.',
        OCCUPANCY_DISCREPANCY_CONFLICT: 'وضعیت زنده با این گزارش هم‌خوان نیست؛ گزارش را تازه‌سازی و بررسی کنید.',
      };
      return conflictMessages[cause.code ?? ''] ?? 'اطلاعات هم‌زمان تغییر کرده است؛ فهرست تازه را بررسی و دوباره اقدام کنید.';
    }
    return cause.message || fallback;
  }
  return cause instanceof Error ? cause.message : fallback;
}

function dateFilterError(value: string): string | null {
  if (!value.trim()) return null;
  if (!toGregorianIso(value)) return 'تاریخ کاری را به‌شکل سال/ماه/روز شمسی معتبر وارد کنید.';
  return null;
}

export function StaffHousekeepingPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const role = staff?.role;
  const canView = status === 'authenticated' && Boolean(role && ALLOWED_ROLES.includes(role));
  const canViewReadiness = Boolean(role && READINESS_ROLES.includes(role));
  const canManage = Boolean(role && MANAGER_ROLES.includes(role));

  const [taskPage, setTaskPage] = useState<HousekeepingList<HousekeepingTask> | null>(null);
  const [discrepancyPage, setDiscrepancyPage] = useState<HousekeepingList<HousekeepingDiscrepancy> | null>(null);
  const [discrepancyStatus, setDiscrepancyStatus] = useState<HousekeepingDiscrepancyStatus>('OPEN');
  const [discrepancyPageNumber, setDiscrepancyPageNumber] = useState(1);
  const [rooms, setRooms] = useState<HousekeepingRoomOption[]>([]);
  const [assignees, setAssignees] = useState<HousekeepingAssignee[]>([]);
  const [draftFilters, setDraftFilters] = useState<HousekeepingFilters>(EMPTY_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState<HousekeepingListQuery>({ page: 1, pageSize: PAGE_SIZE });
  const [page, setPage] = useState(1);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [discrepancyError, setDiscrepancyError] = useState<string | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isDiscrepancyLoading, setIsDiscrepancyLoading] = useState(false);
  const [isAssigneesLoading, setIsAssigneesLoading] = useState(false);
  const [taskStale, setTaskStale] = useState(false);
  const [discrepancyStale, setDiscrepancyStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [busyDiscrepancyId, setBusyDiscrepancyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<HousekeepingDialogState | null>(null);

  const requestSequence = useRef(0);
  const hasTaskData = useRef(false);
  const hasDiscrepancyData = useRef(false);
  const roomsSequence = useRef(0);
  const assigneesSequence = useRef(0);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogHeading = useRef<HTMLHeadingElement | null>(null);
  const successRef = useRef<HTMLParagraphElement | null>(null);

  const query = useMemo<HousekeepingListQuery>(
    () => ({ ...appliedQuery, page, pageSize: PAGE_SIZE }),
    [appliedQuery, page],
  );

  const loadBoard = useCallback(async () => {
    if (!canView) return;
    const requestId = ++requestSequence.current;
    const hadData = hasTaskData.current;
    setIsInitialLoading(!hadData);
    setIsRefreshing(hadData);
    if (canViewReadiness) setIsDiscrepancyLoading(true);
    setTaskError(null);
    if (canViewReadiness) setDiscrepancyError(null);

    try {
      const taskRequest = Promise.resolve().then(() => getStaffHousekeepingTasks(query));
      const discrepancyRequest = canViewReadiness
        ? Promise.resolve().then(() => getStaffHousekeepingDiscrepancies({
            businessDate: query.businessDate,
            page: discrepancyPageNumber,
            pageSize: PAGE_SIZE,
            status: discrepancyStatus,
          }))
        : Promise.resolve(null);
      const [tasksResult, discrepanciesResult] = await Promise.allSettled([taskRequest, discrepancyRequest] as const);
      if (requestId !== requestSequence.current) return;

      if (tasksResult.status === 'fulfilled') {
        hasTaskData.current = true;
        setTaskPage(tasksResult.value);
        setTaskStale(false);
        setTaskError(null);
        setLastUpdatedAt(new Date());
      } else {
        setTaskError(errorMessage(tasksResult.reason, 'کارهای خانه‌داری دریافت نشد. دوباره تلاش کنید.'));
        if (hasTaskData.current) setTaskStale(true);
      }

      if (canViewReadiness && discrepanciesResult.status === 'fulfilled' && discrepanciesResult.value) {
        hasDiscrepancyData.current = true;
        setDiscrepancyPage(discrepanciesResult.value);
        setDiscrepancyStale(false);
        setDiscrepancyError(null);
      } else if (canViewReadiness && discrepanciesResult.status === 'rejected') {
        setDiscrepancyError(errorMessage(discrepanciesResult.reason, 'مغایرت‌های حضور دریافت نشد. دوباره تلاش کنید.'));
        if (hasDiscrepancyData.current) setDiscrepancyStale(true);
      }
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setTaskError(errorMessage(cause, 'کارهای خانه‌داری دریافت نشد. دوباره تلاش کنید.'));
      if (hasTaskData.current) setTaskStale(true);
      if (canViewReadiness) {
        setDiscrepancyError(errorMessage(cause, 'مغایرت‌های حضور دریافت نشد. دوباره تلاش کنید.'));
        if (hasDiscrepancyData.current) setDiscrepancyStale(true);
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsDiscrepancyLoading(false);
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [canView, canViewReadiness, discrepancyPageNumber, discrepancyStatus, query]);

  const loadRooms = useCallback(async () => {
    const requestId = ++roomsSequence.current;
    setIsRoomsLoading(true);
    setRoomsError(null);
    try {
      const firstPage = await getStaffHousekeepingRooms({ page: 1, pageSize: ROOM_OPTIONS_PAGE_SIZE });
      if (requestId !== roomsSequence.current) return;
      const allRooms = [...firstPage.items];
      for (let firstPageNumber = 2; firstPageNumber <= firstPage.pagination.totalPages; firstPageNumber += 4) {
        const pageNumbers = Array.from(
          { length: Math.min(4, firstPage.pagination.totalPages - firstPageNumber + 1) },
          (_unused, index) => firstPageNumber + index,
        );
        const nextPages = await Promise.all(pageNumbers.map((pageNumber) =>
          getStaffHousekeepingRooms({ page: pageNumber, pageSize: ROOM_OPTIONS_PAGE_SIZE }),
        ));
        if (requestId !== roomsSequence.current) return;
        allRooms.push(...nextPages.flatMap((result) => result.items));
      }
      setRooms(allRooms);
    } catch (cause) {
      if (requestId !== roomsSequence.current) return;
      setRoomsError(errorMessage(cause, 'فهرست اتاق‌ها دریافت نشد.'));
    } finally {
      if (requestId === roomsSequence.current) setIsRoomsLoading(false);
    }
  }, []);

  const loadAssignees = useCallback(async () => {
    const requestId = ++assigneesSequence.current;
    setIsAssigneesLoading(true);
    setAssigneesError(null);
    try {
      const result = await getStaffHousekeepingAssignees();
      if (requestId !== assigneesSequence.current) return;
      setAssignees(result.items);
    } catch (cause) {
      if (requestId !== assigneesSequence.current) return;
      setAssigneesError(errorMessage(cause, 'فهرست خانه‌دارهای فعال دریافت نشد.'));
    } finally {
      if (requestId === assigneesSequence.current) setIsAssigneesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void loadBoard();
    const assigneeLoadTimer = canManage
      ? window.setTimeout(() => void loadAssignees(), 0)
      : null;
    const roomLoadTimer = window.setTimeout(() => void loadRooms(), 0);
    const interval = window.setInterval(() => {
      void loadBoard();
      void loadRooms();
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (assigneeLoadTimer !== null) window.clearTimeout(assigneeLoadTimer);
      window.clearTimeout(roomLoadTimer);
      window.clearInterval(interval);
      requestSequence.current += 1;
      roomsSequence.current += 1;
      assigneesSequence.current += 1;
    };
  }, [canManage, canView, loadAssignees, loadBoard, loadRooms]);

  useEffect(() => {
    if (successMessage) successRef.current?.focus();
  }, [successMessage]);

  useEffect(() => {
    if (!dialog && dialogTrigger.current?.isConnected) dialogTrigger.current.focus();
  }, [dialog]);

  const sortedTasks = useMemo(
    () => sortHousekeepingTasksByUrgency(taskPage?.items ?? []),
    [taskPage?.items],
  );
  const filtersAreApplied = useMemo(
    () => hasHousekeepingFilters({
      dueDate: query.dueDate ?? '',
      roomId: query.roomId ?? '',
      floor: query.floor ?? '',
      taskType: query.taskType ?? '',
      assigneeStaffUserId: query.assigneeStaffUserId ?? '',
      status: query.status ?? '',
      priority: query.priority ?? '',
    }),
    [query],
  );

  if (status === 'loading') return <p className={styles.pageStatus} role="status">در حال بررسی دسترسی…</p>;
  if (status !== 'authenticated' || !staff) return <p className={styles.pageStatus} role="status">برای مشاهدهٔ این بخش وارد پنل کارکنان شوید.</p>;
  if (!ALLOWED_ROLES.includes(staff.role)) {
    return (
      <section className={styles.denied} aria-labelledby="housekeeping-denied-title">
        <h1 id="housekeeping-denied-title">دسترسی به خانه‌داری</h1>
        <p role="alert">این بخش برای خانه‌داری، پذیرش و مدیران اقامتگاه در دسترس است.</p>
      </section>
    );
  }

  function updateFilter(field: keyof HousekeepingFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
    if (field === 'dueDate') setFilterError(dateFilterError(value));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalidDate = dateFilterError(draftFilters.dueDate);
    if (invalidDate) {
      setFilterError(invalidDate);
      return;
    }
    setFilterError(null);
    setPage(1);
    setAppliedQuery({
      dueDate: draftFilters.dueDate.trim() ? toGregorianIso(draftFilters.dueDate) ?? undefined : undefined,
      roomId: draftFilters.roomId || undefined,
      floor: draftFilters.floor || undefined,
      taskType: draftFilters.taskType as HousekeepingTaskType || undefined,
      assigneeStaffUserId: draftFilters.assigneeStaffUserId || undefined,
      status: draftFilters.status as HousekeepingTaskStatus || undefined,
      priority: draftFilters.priority as HousekeepingPriority || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    setSuccessMessage(null);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedQuery({ page: 1, pageSize: PAGE_SIZE });
    setPage(1);
    setFilterError(null);
  }

  function openDialog(next: HousekeepingDialogState, trigger?: HTMLButtonElement) {
    dialogTrigger.current = trigger ?? null;
    setDialog(next);
    setActionError(null);
    setSuccessMessage(null);
  }

  function closeDialog() {
    setDialog(null);
    setActionError(null);
  }

  async function performTaskAction(task: HousekeepingTask, action: () => Promise<unknown>, success: string) {
    if (!csrfToken) return;
    setBusyTaskId(task.id);
    setActionError(null);
    try {
      await action();
      setDialog(null);
      setSuccessMessage(success);
      await loadBoard();
      if (canViewReadiness) await loadRooms();
    } catch (cause) {
      setActionError(errorMessage(cause, 'تغییر انجام نشد. دوباره تلاش کنید.'));
      if (cause instanceof StaffApiError && cause.status === 409) await loadBoard();
    } finally {
      setBusyTaskId(null);
    }
  }

  async function startTask(task: HousekeepingTask) {
    await performTaskAction(task, () => startStaffHousekeepingTask(task.id, csrfToken!), `کار اتاق ${task.room.roomNumber} شروع شد.`);
  }

  async function completeTask(task: HousekeepingTask, input: { outcome: 'DONE' | 'NEEDS_REWORK'; reason?: string }) {
    const success = input.outcome === 'NEEDS_REWORK'
      ? `نظافت دوباره برای اتاق ${task.room.roomNumber} ثبت شد.`
      : `انجام کار اتاق ${task.room.roomNumber} ثبت شد.`;
    await performTaskAction(task, () => completeStaffHousekeepingTask(task.id, input, csrfToken!), success);
  }

  async function assignTask(task: HousekeepingTask, input: { assigneeStaffUserId: string; priority?: HousekeepingPriority }) {
    await performTaskAction(task, () => assignStaffHousekeepingTask(task.id, input, csrfToken!), `مسئول کار اتاق ${task.room.roomNumber} به‌روزرسانی شد.`);
  }

  async function cancelTask(task: HousekeepingTask, reason: string) {
    await performTaskAction(task, () => cancelStaffHousekeepingTask(task.id, { reason }, csrfToken!), `کار اتاق ${task.room.roomNumber} لغو شد.`);
  }

  async function createTask(input: { roomId: string; taskType: HousekeepingTaskType; businessDate: string; priority: HousekeepingPriority; note?: string }) {
    if (!csrfToken) return;
    setBusyTaskId('create');
    setActionError(null);
    try {
      await createStaffHousekeepingTask(input, csrfToken);
      setDialog(null);
      setSuccessMessage('کار خانه‌داری ثبت شد.');
      await loadBoard();
    } catch (cause) {
      setActionError(errorMessage(cause, 'کار خانه‌داری ثبت نشد. دوباره تلاش کنید.'));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function reportDiscrepancy(roomId: string, input: { businessDate: string; observedOccupied: boolean; note: string }) {
    if (!csrfToken) return;
    setBusyTaskId('report');
    setActionError(null);
    try {
      const result = await reportStaffRoomDiscrepancy(roomId, input, csrfToken);
      setDialog(null);
      setSuccessMessage(`${DISCREPANCY_KIND_LABELS[result.kind]} برای اتاق ${result.roomNumber} ثبت شد.`);
      await loadBoard();
    } catch (cause) {
      setActionError(errorMessage(cause, 'گزارش مغایرت ثبت نشد. وضعیت اتاق را بررسی و دوباره تلاش کنید.'));
      if (cause instanceof StaffApiError && cause.status === 409) await loadBoard();
    } finally {
      setBusyTaskId(null);
    }
  }

  async function resolveDiscrepancy(item: HousekeepingDiscrepancy) {
    if (!csrfToken) return;
    setBusyDiscrepancyId(item.id);
    setActionError(null);
    try {
      await resolveStaffHousekeepingDiscrepancy(item.id, csrfToken);
      setSuccessMessage(`مغایرت اتاق ${item.roomNumber} اصلاح شد.`);
      await loadBoard();
    } catch (cause) {
      setActionError(errorMessage(cause, 'مغایرت تأیید نشد. وضعیت زندهٔ اتاق را بررسی کنید.'));
      if (cause instanceof StaffApiError && cause.status === 409) await loadBoard();
    } finally {
      setBusyDiscrepancyId(null);
    }
  }

  async function dismissDiscrepancy(item: HousekeepingDiscrepancy, reason: string) {
    if (!csrfToken) return;
    setBusyDiscrepancyId(item.id);
    setActionError(null);
    try {
      await dismissStaffHousekeepingDiscrepancy(item.id, { reason }, csrfToken);
      setDialog(null);
      setSuccessMessage(`مغایرت اتاق ${item.roomNumber} با دلیل ثبت‌شده رد شد.`);
      await loadBoard();
    } catch (cause) {
      setActionError(errorMessage(cause, 'رد مغایرت ثبت نشد. دوباره تلاش کنید.'));
      if (cause instanceof StaffApiError && cause.status === 409) await loadBoard();
    } finally {
      setBusyDiscrepancyId(null);
    }
  }

  function openAssignment(task: HousekeepingTask, trigger: HTMLButtonElement) {
    openDialog({ kind: 'assign', task }, trigger);
    void loadAssignees();
  }

  function applyPage(nextPage: number) {
    setPage(nextPage);
    setAppliedQuery((current) => ({ ...current, page: nextPage }));
  }

  function changeDiscrepancyStatus(nextStatus: HousekeepingDiscrepancyStatus) {
    setDiscrepancyStatus(nextStatus);
    setDiscrepancyPageNumber(1);
  }

  const businessDate = taskPage?.businessDate ?? discrepancyPage?.businessDate ?? null;
  const staleSources = [
    taskStale ? 'کارها' : null,
    canViewReadiness && discrepancyStale ? 'مغایرت‌ها' : null,
    canViewReadiness && roomsError && rooms.length > 0 ? 'وضعیت اتاق‌ها' : null,
  ].filter((source): source is string => Boolean(source));
  const pageHasStaleData = staleSources.length > 0;
  return (
    <section className={styles.page} aria-labelledby="housekeeping-title">
      <HousekeepingHeader
        businessDate={businessDate}
        lastUpdatedAt={lastUpdatedAt}
        isLoading={isInitialLoading}
        isRefreshing={isRefreshing}
        onRefresh={() => { void loadBoard(); void loadRooms(); }}
      />

      {pageHasStaleData && (
        <p className={styles.alert} role="alert">
          به‌روزرسانی {staleSources.join(' و ')} انجام نشد؛ اطلاعات قبلی نگه داشته شده است. پیش از اقدام حساس، فهرست را به‌روزرسانی کنید.
        </p>
      )}
      {successMessage && <p className={styles.success} role="status" tabIndex={-1} ref={successRef}>{successMessage}</p>}
      {actionError && !dialog && <p className={styles.alert} role="alert">{actionError}</p>}

      <div className={styles.actionBar}>
        {canViewReadiness && (
          <button className={styles.primaryButton} type="button" onClick={(event) => openDialog({ kind: 'create' }, event.currentTarget)} disabled={!businessDate || Boolean(roomsError)}>
            ایجاد کار
          </button>
        )}
        {staff.role === 'HOUSEKEEPER' && (
          <button className={styles.primaryButton} type="button" onClick={(event) => openDialog({ kind: 'report' }, event.currentTarget)} disabled={!businessDate || Boolean(roomsError)}>
            گزارش مغایرت حضور
          </button>
        )}
        {roomsError && (
          <span className={styles.inlineError} role="status">فهرست امن اتاق‌ها در دسترس نیست؛ <button className={styles.textButton} type="button" onClick={() => void loadRooms()} disabled={isRoomsLoading}>تلاش دوباره</button></span>
        )}
      </div>

      <HousekeepingFilterBar
        filters={draftFilters}
        appliedFilters={{
          dueDate: appliedQuery.dueDate ?? '',
          roomId: appliedQuery.roomId ?? '',
          floor: appliedQuery.floor ?? '',
          taskType: appliedQuery.taskType ?? '',
          assigneeStaffUserId: appliedQuery.assigneeStaffUserId ?? '',
          status: appliedQuery.status ?? '',
          priority: appliedQuery.priority ?? '',
        }}
        rooms={rooms}
        canFilterAssignee={canManage}
        assignees={assignees}
        assigneesLoading={isAssigneesLoading}
        assigneesError={canManage ? assigneesError : null}
        error={filterError}
        onChange={updateFilter}
        onApply={applyFilters}
        onClear={clearFilters}
        onRetryAssignees={() => void loadAssignees()}
      />

      <HousekeepingTaskList
        tasks={sortedTasks}
        isLoading={isInitialLoading}
        error={taskError}
        hasFilters={filtersAreApplied}
        onRetry={() => void loadBoard()}
        canManage={canManage}
        canOperate={Boolean(['HOUSEKEEPER', 'MANAGER', 'ADMIN'].includes(staff.role))}
        busyTaskId={busyTaskId}
        onStart={(task) => void startTask(task)}
        onComplete={(task, trigger) => openDialog({ kind: 'complete', task }, trigger)}
        onAssign={openAssignment}
        onCancel={(task, trigger) => openDialog({ kind: 'cancel', task }, trigger)}
      />

      {taskPage && <HousekeepingPagination page={taskPage.pagination.page} totalPages={taskPage.pagination.totalPages} onChange={applyPage} />}

      {canViewReadiness && (
        <HousekeepingRoomReadiness
          rooms={rooms}
          isLoading={isRoomsLoading}
          error={roomsError}
          onRetry={() => void loadRooms()}
        />
      )}

      {canViewReadiness ? (
        <>
          <HousekeepingDiscrepancyQueue
            discrepancies={discrepancyPage?.items ?? []}
            status={discrepancyStatus}
            onStatusChange={changeDiscrepancyStatus}
            isLoading={isInitialLoading || isDiscrepancyLoading}
            error={discrepancyError}
            onRetry={() => void loadBoard()}
            busyId={busyDiscrepancyId}
            onResolve={(item) => void resolveDiscrepancy(item)}
            onDismiss={(item, trigger) => openDialog({ kind: 'dismiss', discrepancy: item }, trigger)}
          />
          {discrepancyPage && <HousekeepingPagination label="صفحه‌های مغایرت‌های حضور" page={discrepancyPage.pagination.page} totalPages={discrepancyPage.pagination.totalPages} onChange={setDiscrepancyPageNumber} />}
        </>
      ) : (
        <section className={styles.reportHint} aria-labelledby="housekeeping-report-hint-title">
          <h2 id="housekeeping-report-hint-title">گزارش وضعیت حضور</h2>
          <p>اگر وضعیت مشاهده‌شده با اطلاعات ثبت‌شده تفاوت دارد، مغایرت را برای بررسی پذیرش گزارش کنید.</p>
        </section>
      )}

      {dialog?.kind === 'complete' && (
        <CompleteHousekeepingDialog task={dialog.task} headingRef={dialogHeading} busy={busyTaskId === dialog.task.id} error={actionError} onClose={closeDialog} onSubmit={(input) => void completeTask(dialog.task, input)} />
      )}
      {dialog?.kind === 'create' && (
        <CreateHousekeepingTaskDialog businessDate={businessDate ?? ''} rooms={rooms} roomsError={roomsError} headingRef={dialogHeading} busy={busyTaskId === 'create'} error={actionError} onClose={closeDialog} onRetryRooms={() => void loadRooms()} onSubmit={(input) => void createTask(input)} />
      )}
      {dialog?.kind === 'assign' && (
        <AssignHousekeepingTaskDialog task={dialog.task} assignees={assignees} assigneesLoading={isAssigneesLoading} assigneesError={assigneesError} headingRef={dialogHeading} busy={busyTaskId === dialog.task.id} error={actionError} onClose={closeDialog} onRetryAssignees={() => void loadAssignees()} onSubmit={(input) => void assignTask(dialog.task, input)} />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelHousekeepingTaskDialog task={dialog.task} headingRef={dialogHeading} busy={busyTaskId === dialog.task.id} error={actionError} onClose={closeDialog} onSubmit={(reason) => void cancelTask(dialog.task, reason)} />
      )}
      {dialog?.kind === 'report' && (
        <ReportHousekeepingDiscrepancyDialog businessDate={businessDate ?? ''} rooms={rooms} roomsError={roomsError} headingRef={dialogHeading} busy={busyTaskId === 'report'} error={actionError} onClose={closeDialog} onRetryRooms={() => void loadRooms()} onSubmit={(roomId, input) => void reportDiscrepancy(roomId, input)} />
      )}
      {dialog?.kind === 'dismiss' && (
        <DismissHousekeepingDiscrepancyDialog discrepancy={dialog.discrepancy} headingRef={dialogHeading} busy={busyDiscrepancyId === dialog.discrepancy.id} error={actionError} onClose={closeDialog} onSubmit={(reason) => void dismissDiscrepancy(dialog.discrepancy, reason)} />
      )}
    </section>
  );
}
