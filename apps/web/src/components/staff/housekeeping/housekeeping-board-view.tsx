import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import type {
  HousekeepingCondition,
  HousekeepingDiscrepancy,
  HousekeepingDiscrepancyStatus,
  HousekeepingRoomOption,
  HousekeepingTask,
} from '@/lib/staff-housekeeping-api';
import {
  CONDITION_LABELS,
  DISCREPANCY_KIND_LABELS,
  DISCREPANCY_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './housekeeping-copy';
import styles from './housekeeping.module.css';

export interface HousekeepingFilters {
  dueDate: string;
  roomId: string;
  floor: string;
  taskType: string;
  assigneeStaffUserId: string;
  status: string;
  priority: string;
}

interface HousekeepingHeaderProps {
  businessDate: string | null;
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function HousekeepingHeader({
  businessDate,
  lastUpdatedAt,
  isLoading,
  isRefreshing,
  onRefresh,
}: HousekeepingHeaderProps) {
  const displayedDate = businessDate ? formatGregorianAsJalali(businessDate) ?? businessDate : 'در حال دریافت';
  const displayedTime = lastUpdatedAt
    ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(lastUpdatedAt)
    : null;

  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>عملیات روزانه · وضعیت نظافت</p>
        <h1 id="housekeeping-title">خانه‌داری</h1>
        <p className={styles.lead}>کارهای اتاق و وضعیت آماده‌سازی را برای تاریخ کاری جاری پیگیری کنید.</p>
      </div>
      <div className={styles.freshness}>
        <span className={styles.dateMark} aria-hidden="true">◷</span>
        <div>
          <span>تاریخ کاری هتل</span>
          <strong>{displayedDate}</strong>
          {displayedTime && <small>آخرین دریافت: {displayedTime}</small>}
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onRefresh} disabled={isLoading || isRefreshing}>
          {isRefreshing ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی فهرست'}
        </button>
      </div>
    </header>
  );
}

interface HousekeepingFilterBarProps {
  filters: HousekeepingFilters;
  rooms: HousekeepingRoomOption[];
  canFilterAssignee: boolean;
  assignees: { id: string; username: string }[];
  assigneesLoading: boolean;
  assigneesError: string | null;
  error: string | null;
  onChange: (field: keyof HousekeepingFilters, value: string) => void;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onRetryAssignees: () => void;
}

export function HousekeepingFilterBar({
  filters,
  rooms,
  canFilterAssignee,
  assignees,
  assigneesLoading,
  assigneesError,
  error,
  onChange,
  onApply,
  onClear,
  onRetryAssignees,
}: HousekeepingFilterBarProps) {
  const floors = [...new Set(rooms.map((room) => room.floor).filter((floor): floor is string => Boolean(floor)))].sort((a, b) => a.localeCompare(b, 'fa'));

  return (
    <form className={styles.filters} onSubmit={onApply}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>پیدا کردن کار</h2>
          <p>فیلترهای اتاق از وضعیت حضور و وضعیت نظافت جدا هستند.</p>
        </div>
        <button className={styles.textButton} type="button" onClick={onClear}>پاک‌کردن فیلترها</button>
      </div>
      <div className={styles.filterFields}>
        <label className={styles.field}>
          <span>موعد انجام کار</span>
          <input
            aria-label="موعد انجام کار"
            inputMode="numeric"
            value={filters.dueDate}
            aria-invalid={error ? true : undefined}
            aria-describedby={`housekeeping-due-date-help${error ? ' housekeeping-due-date-error' : ''}`}
            onChange={(event) => onChange('dueDate', event.target.value)}
            placeholder="۱۴۰۵/۰۸/۲۷"
          />
          <small id="housekeeping-due-date-help" className={styles.fieldHelp}>قالب تاریخ شمسی: سال/ماه/روز، مانند ۱۴۰۵/۰۸/۲۷</small>
          {error && <small id="housekeeping-due-date-error" className={styles.inlineError} role="alert">{error}</small>}
        </label>
        <label className={styles.field}>
          <span>اتاق</span>
          <select aria-label="اتاق" value={filters.roomId} onChange={(event) => onChange('roomId', event.target.value)}>
            <option value="">همهٔ اتاق‌ها</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>اتاق {room.roomNumber}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>طبقه</span>
          <select aria-label="طبقه" value={filters.floor} onChange={(event) => onChange('floor', event.target.value)}>
            <option value="">همهٔ طبقه‌ها</option>
            {floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>نوع کار</span>
          <select aria-label="نوع کار" value={filters.taskType} onChange={(event) => onChange('taskType', event.target.value)}>
            <option value="">همهٔ کارها</option>
            {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {canFilterAssignee && (
          <div className={styles.assigneeField}>
            <label className={styles.field}>
              <span>مسئول کار</span>
              <select
                aria-label="مسئول کار"
                value={filters.assigneeStaffUserId}
                disabled={assigneesLoading && assignees.length === 0}
                aria-describedby={assigneesError ? 'housekeeping-assignee-filter-error' : undefined}
                onChange={(event) => onChange('assigneeStaffUserId', event.target.value)}
              >
                <option value="">همهٔ مسئول‌ها</option>
                {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.username}</option>)}
              </select>
              {assigneesLoading && <small className={styles.fieldHelp} role="status">در حال دریافت خانه‌دارهای فعال…</small>}
              {assigneesError && <small id="housekeeping-assignee-filter-error" className={styles.inlineError} role="alert">فهرست مسئول‌ها دریافت نشد.</small>}
            </label>
            {assigneesError && (
              <button className={styles.textButton} type="button" onClick={onRetryAssignees}>تلاش دوباره</button>
            )}
          </div>
        )}
        <label className={styles.field}>
          <span>وضعیت کار</span>
          <select aria-label="وضعیت کار" value={filters.status} onChange={(event) => onChange('status', event.target.value)}>
            <option value="">همهٔ وضعیت‌ها</option>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>اولویت</span>
          <select aria-label="اولویت" value={filters.priority} onChange={(event) => onChange('priority', event.target.value)}>
            <option value="">همهٔ اولویت‌ها</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.filterActions}>
        <button className={styles.primaryButton} type="submit">اعمال فیلترها</button>
      </div>
    </form>
  );
}

function conditionDescription(condition: HousekeepingCondition) {
  return CONDITION_LABELS[condition];
}

interface HousekeepingTaskCardProps {
  task: HousekeepingTask;
  canManage: boolean;
  canOperate: boolean;
  isBusy: boolean;
  onStart: (task: HousekeepingTask) => void;
  onComplete: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
  onAssign: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
  onCancel: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
}

export function HousekeepingTaskCard({
  task,
  canManage,
  canOperate,
  isBusy,
  onStart,
  onComplete,
  onAssign,
  onCancel,
}: HousekeepingTaskCardProps) {
  const context = [
    task.arrivalDue ? 'ورود امروز' : null,
    task.departureDue ? 'خروج امروز' : null,
  ].filter(Boolean).join(' · ');

  return (
    <article className={`${styles.taskCard} ${task.priority === 'URGENT' ? styles.taskCardUrgent : ''}`} aria-label={`کار خانه‌داری اتاق ${task.room.roomNumber}: ${TASK_TYPE_LABELS[task.taskType]}`}>
      <div className={styles.cardTopline}>
        <div>
          <p className={styles.eyebrow}>{TASK_TYPE_LABELS[task.taskType]}</p>
          <h3>اتاق <bdi>{task.room.roomNumber}</bdi></h3>
          {task.room.floor && <span className={styles.roomMeta}>طبقه {task.room.floor}</span>}
        </div>
        <span className={`${styles.priority} ${styles[`priority${task.priority}`]}`}>{PRIORITY_LABELS[task.priority]}</span>
      </div>
      <div className={styles.taskFacts}>
        <span><strong>حضور:</strong> {task.room.occupancy === 'OCCUPIED' ? 'اشغال' : 'خالی'}</span>
        <span><strong>وضعیت اتاق:</strong> {conditionDescription(task.room.housekeepingStatus)}</span>
        <span><strong>کار:</strong> {TASK_STATUS_LABELS[task.status]}</span>
        {context && <span className={styles.dueContext}>{context}</span>}
        <span className={task.isOverdue ? styles.overdueContext : ''}>
          <strong>موعد انجام:</strong> {formatGregorianAsJalali(task.dueDate) ?? task.dueDate}{task.isOverdue ? ' · معوق' : ''}
        </span>
        <span>{task.assignee ? `مسئول: ${task.assignee.username}` : 'بدون مسئول'}</span>
      </div>
      <div className={styles.cardActions}>
        {canOperate && task.allowedActions.canStart && (
          <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={() => onStart(task)}>شروع کار</button>
        )}
        {canOperate && task.allowedActions.canComplete && (
          <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={(event) => onComplete(task, event.currentTarget)}>
            {task.taskType === 'INSPECTION' ? 'تکمیل بازرسی' : 'ثبت پایان کار'}
          </button>
        )}
        {canManage && task.allowedActions.canAssign && (
          <button className={styles.secondaryButton} type="button" disabled={isBusy} onClick={(event) => onAssign(task, event.currentTarget)}>
            {task.assignee ? 'تغییر مسئول' : 'تخصیص کار'}
          </button>
        )}
        {canManage && task.allowedActions.canCancel && (
          <button className={styles.dangerButton} type="button" disabled={isBusy} onClick={(event) => onCancel(task, event.currentTarget)}>لغو کار</button>
        )}
      </div>
    </article>
  );
}

interface HousekeepingTaskListProps {
  tasks: HousekeepingTask[];
  isLoading: boolean;
  error: string | null;
  hasFilters: boolean;
  onRetry: () => void;
  canManage: boolean;
  canOperate: boolean;
  busyTaskId: string | null;
  onStart: (task: HousekeepingTask) => void;
  onComplete: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
  onAssign: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
  onCancel: (task: HousekeepingTask, trigger: HTMLButtonElement) => void;
}

export function HousekeepingTaskList({
  tasks,
  isLoading,
  error,
  hasFilters,
  onRetry,
  canManage,
  canOperate,
  busyTaskId,
  onStart,
  onComplete,
  onAssign,
  onCancel,
}: HousekeepingTaskListProps) {
  return (
    <section className={styles.panel} aria-labelledby="housekeeping-task-list-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>فهرست اولویت‌دار</p>
          <h2 id="housekeeping-task-list-title">کارهای اتاق</h2>
        </div>
        <span>{tasks.length} مورد در این صفحه</span>
      </div>
      {isLoading && tasks.length === 0 && <p className={styles.emptyState} role="status">در حال دریافت کارهای خانه‌داری…</p>}
      {error && tasks.length === 0 && (
        <div className={styles.emptyState}>
          <p role="alert">{error}</p>
          <button className={styles.secondaryButton} type="button" onClick={onRetry}>تلاش دوباره</button>
        </div>
      )}
      {!isLoading && !error && tasks.length === 0 && (
        <div className={styles.emptyState}>
          <strong>{hasFilters ? 'کاری با این فیلترها پیدا نشد.' : 'برای این تاریخ کاری، کاری ثبت نشده است.'}</strong>
          <p>{hasFilters ? 'فیلترها را تغییر دهید یا پاک کنید.' : 'پس از ثبت کار جدید، فهرست اینجا نمایش داده می‌شود.'}</p>
        </div>
      )}
      {tasks.length > 0 && (
        <div className={styles.taskGrid}>
          {tasks.map((task) => (
            <HousekeepingTaskCard
              key={task.id}
              task={task}
              canManage={canManage}
              canOperate={canOperate}
              isBusy={busyTaskId === task.id}
              onStart={onStart}
              onComplete={onComplete}
              onAssign={onAssign}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function HousekeepingRoomReadiness({
  rooms,
  isLoading,
  error,
  onRetry,
}: {
  rooms: HousekeepingRoomOption[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [occupancyFilter, setOccupancyFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const visibleRooms = useMemo(() => rooms.filter((room) => {
    const matchesOccupancy = !occupancyFilter || room.occupancy === occupancyFilter;
    const matchesCondition = !conditionFilter || room.housekeepingStatus === conditionFilter;
    return matchesOccupancy && matchesCondition;
  }), [conditionFilter, occupancyFilter, rooms]);
  const pageCount = Math.ceil(visibleRooms.length / pageSize);
  const visiblePage = visibleRooms.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className={styles.panel} aria-labelledby="housekeeping-readiness-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>وضعیت فعلی اتاق‌های فعال</p>
          <h2 id="housekeeping-readiness-title">آمادگی اتاق‌ها</h2>
          <p>حضور و وضعیت نظافت جداگانه نمایش داده می‌شوند؛ کنترل نهایی ورود با سامانهٔ پذیرش است.</p>
        </div>
        <span>{visibleRooms.length} اتاق</span>
      </div>
      <div className={styles.readinessFilters}>
        <label className={styles.field}>
          <span>فیلتر حضور اتاق‌ها</span>
        <select aria-label="فیلتر حضور اتاق‌ها" value={occupancyFilter} onChange={(event) => { setOccupancyFilter(event.target.value); setPage(1); }}>
            <option value="">همهٔ وضعیت‌های حضور</option>
            <option value="OCCUPIED">اشغال</option>
            <option value="VACANT">خالی</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>فیلتر وضعیت نظافت</span>
        <select aria-label="فیلتر وضعیت نظافت" value={conditionFilter} onChange={(event) => { setConditionFilter(event.target.value); setPage(1); }}>
            <option value="">همهٔ وضعیت‌های نظافت</option>
            {Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className={styles.inlineError} role="alert">{error}</p>}
      {isLoading && rooms.length === 0 && <p className={styles.emptyState} role="status">در حال دریافت وضعیت اتاق‌ها…</p>}
      {!isLoading && rooms.length === 0 && !error && <p className={styles.emptyState}>اتاق فعالی برای نمایش وجود ندارد.</p>}
      {rooms.length > 0 && visibleRooms.length === 0 && <p className={styles.emptyState}>اتاقی با این فیلترهای وضعیت پیدا نشد.</p>}
      {visiblePage.length > 0 && (
        <div className={styles.readinessGrid}>
          {visiblePage.map((room) => (
            <article className={styles.readinessCard} key={room.id} aria-label={`وضعیت اتاق ${room.roomNumber}`}>
              <div className={styles.cardTopline}>
                <h3>اتاق <bdi>{room.roomNumber}</bdi></h3>
                {room.floor && <span className={styles.roomMeta}>طبقه {room.floor}</span>}
              </div>
              <div className={styles.roomReadinessFacts}>
                <span><strong>حضور:</strong> {room.occupancy === 'OCCUPIED' ? 'اشغال' : 'خالی'}</span>
                <span><strong>وضعیت نظافت:</strong> {CONDITION_LABELS[room.housekeepingStatus]}</span>
                {room.dueArrival && <span className={styles.dueContext}>ورود امروز</span>}
                {room.dueDeparture && <span className={styles.dueContext}>خروج امروز</span>}
              </div>
            </article>
          ))}
        </div>
      )}
      {pageCount > 1 && (
        <nav className={styles.pagination} aria-label="صفحه‌های آمادگی اتاق‌ها">
          <button className={styles.secondaryButton} type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحهٔ قبل</button>
          <span>صفحه {page} از {pageCount}</span>
          <button className={styles.secondaryButton} type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>صفحهٔ بعد</button>
        </nav>
      )}
      {error && rooms.length > 0 && <button className={styles.secondaryButton} type="button" onClick={onRetry}>به‌روزرسانی دوبارهٔ اتاق‌ها</button>}
    </section>
  );
}

interface HousekeepingDiscrepancyQueueProps {
  discrepancies: HousekeepingDiscrepancy[];
  status: HousekeepingDiscrepancyStatus;
  onStatusChange: (status: HousekeepingDiscrepancyStatus) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  busyId: string | null;
  onResolve: (item: HousekeepingDiscrepancy) => void;
  onDismiss: (item: HousekeepingDiscrepancy, trigger: HTMLButtonElement) => void;
}

export function HousekeepingDiscrepancyQueue({
  discrepancies,
  status,
  onStatusChange,
  isLoading,
  error,
  onRetry,
  busyId,
  onResolve,
  onDismiss,
}: HousekeepingDiscrepancyQueueProps) {
  return (
    <section className={styles.panel} aria-labelledby="housekeeping-discrepancies-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>گزارش‌های ثبت‌شده</p>
          <h2 id="housekeeping-discrepancies-title">مغایرت‌های حضور</h2>
        </div>
        <label className={styles.field}>
          <span>وضعیت گزارش</span>
          <select aria-label="وضعیت گزارش‌ها" value={status} onChange={(event) => onStatusChange(event.target.value as HousekeepingDiscrepancyStatus)}>
            <option value="OPEN">نیازمند بررسی</option>
            <option value="RESOLVED">اصلاح‌شده</option>
            <option value="DISMISSED">ردشده با توضیح</option>
          </select>
        </label>
        <span>{discrepancies.length} مورد در این صفحه</span>
      </div>
      {isLoading && discrepancies.length === 0 && <p className={styles.emptyState} role="status">در حال دریافت مغایرت‌ها…</p>}
      {error && discrepancies.length === 0 && (
        <div className={styles.emptyState}>
          <p role="alert">{error}</p>
          <button className={styles.secondaryButton} type="button" onClick={onRetry}>تلاش دوباره</button>
        </div>
      )}
      {!isLoading && !error && discrepancies.length === 0 && <p className={styles.emptyState}>برای این تاریخ مغایرتی ثبت نشده است.</p>}
      {discrepancies.length > 0 && (
        <div className={styles.discrepancyList}>
          {discrepancies.map((item) => (
            <article className={styles.discrepancyCard} key={item.id} aria-label={`${DISCREPANCY_KIND_LABELS[item.kind]} اتاق ${item.roomNumber}`}>
              <div className={styles.cardTopline}>
                <div>
                  <h3>{DISCREPANCY_KIND_LABELS[item.kind]} · اتاق <bdi>{item.roomNumber}</bdi></h3>
                  <p>
                    گزارش {item.reportedBy.username} · تاریخ کاری {formatGregorianAsJalali(item.businessDate) ?? item.businessDate}
                    {' · '}
                    <time aria-label="زمان گزارش" dateTime={item.reportedAt}>{formatHousekeepingTimestamp(item.reportedAt)}</time>
                  </p>
                </div>
                <span className={`${styles.statusTag} ${item.status === 'OPEN' ? styles.statusOpen : ''}`}>{DISCREPANCY_STATUS_LABELS[item.status]}</span>
              </div>
              <p className={styles.discrepancyFacts}>
                حضور ثبت‌شده: {item.expectedOccupied ? 'اشغال' : 'خالی'} · مشاهدهٔ کارکنان: {item.observedOccupied ? 'اشغال' : 'خالی'}
              </p>
              {item.note && <p className={styles.resolutionNote}>یادداشت گزارش: {item.note}</p>}
              {item.resolvedBy?.username && item.resolvedAt && (
                <p className={styles.resolutionNote}>
                  بررسی {item.resolvedBy.username} · <time aria-label="زمان بررسی مغایرت" dateTime={item.resolvedAt}>{formatHousekeepingTimestamp(item.resolvedAt)}</time>
                </p>
              )}
              {item.resolutionReason && <p className={styles.resolutionNote}>توضیح: {item.resolutionReason}</p>}
              {item.status === 'OPEN' && (
                <div className={styles.cardActions}>
                  <button className={styles.primaryButton} type="button" disabled={busyId === item.id} onClick={() => onResolve(item)}>تأیید اصلاح مغایرت</button>
                  <button className={styles.secondaryButton} type="button" disabled={busyId === item.id} onClick={(event) => onDismiss(item, event.currentTarget)}>رد با ذکر دلیل</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatHousekeepingTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Tehran',
  }).format(date);
}

interface HousekeepingPaginationProps {
  label?: string;
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function HousekeepingPagination({ label = 'صفحه‌های فهرست خانه‌داری', page, totalPages, onChange }: HousekeepingPaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button className={styles.secondaryButton} type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>صفحهٔ قبل</button>
      <span>صفحه {page} از {totalPages}</span>
      <button className={styles.secondaryButton} type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>صفحهٔ بعد</button>
    </nav>
  );
}
