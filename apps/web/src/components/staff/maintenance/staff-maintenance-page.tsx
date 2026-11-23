'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { StaffApiError, type StaffRole } from '@/lib/staff-api';
import { formatGregorianAsJalali, toGregorianIso } from '@/lib/jalali-date';
import {
  assignStaffMaintenanceRequest,
  createStaffMaintenanceRequest,
  createStaffRoomBlock,
  getStaffMaintenanceAssignees,
  getStaffMaintenanceRequests,
  getStaffMaintenanceRooms,
  getStaffRoomBlocks,
  resolveStaffMaintenanceRequest,
  restoreStaffRoomBlock,
  type MaintenanceCategory,
  type MaintenanceIdentity,
  type MaintenancePriority,
  type StaffMaintenanceRequest,
  type StaffRoomBlock,
  type StaffRoomBlockKind,
  type StaffRoomBlockStatus,
} from '@/lib/staff-maintenance-api';
import { useStaffSession } from '../staff-session-provider';
import styles from './maintenance.module.css';

const VIEW_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST'];
const CREATE_ROLES: StaffRole[] = [...VIEW_ROLES, 'HOUSEKEEPER'];
const MANAGE_ROLES: StaffRole[] = ['ADMIN', 'MANAGER'];
const PAGE_SIZE = 50;

const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  PLUMBING: 'لوله‌کشی',
  ELECTRICAL: 'برق',
  HVAC: 'تهویه و گرمایش',
  APPLIANCE: 'تجهیزات',
  STRUCTURAL: 'ساختمان',
  SAFETY: 'ایمنی',
  OTHER: 'سایر',
};
const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  LOW: 'کم',
  NORMAL: 'معمولی',
  HIGH: 'زیاد',
  URGENT: 'فوری',
};
const BLOCK_KIND_LABELS: Record<StaffRoomBlockKind, string> = {
  OUT_OF_ORDER: 'خروج از سرویس',
  CAPACITY_CLOSED: 'بسته‌شدن ظرفیت',
};
const REQUEST_STATUS_LABELS = { OPEN: 'در انتظار رسیدگی', RESOLVED: 'برطرف‌شده' } as const;
const BLOCK_STATUS_LABELS: Record<StaffRoomBlockStatus, string> = {
  ACTIVE: 'فعال',
  EXPIRED: 'پایان‌یافته',
  RESTORED: 'ظرفیت بازگشته',
};

interface MaintenanceFilters {
  roomId: string;
  floor: string;
  category: string;
  priority: string;
  requestStatus: string;
  assigneeStaffUserId: string;
  expectedDate: string;
  blockStatus: string;
  activeOn: string;
  expectedReturnDate: string;
  reason: string;
}

interface RequestForm {
  roomId: string;
  category: MaintenanceCategory;
  description: string;
  priority: MaintenancePriority;
  expectedDate: string;
}

interface BlockForm {
  roomId: string;
  kind: StaffRoomBlockKind;
  startDate: string;
  endDate: string;
  reason: string;
}

const EMPTY_FILTERS: MaintenanceFilters = {
  roomId: '',
  floor: '',
  category: '',
  priority: '',
  requestStatus: '',
  assigneeStaffUserId: '',
  expectedDate: '',
  blockStatus: '',
  activeOn: '',
  expectedReturnDate: '',
  reason: '',
};
const EMPTY_REQUEST: RequestForm = {
  roomId: '',
  category: 'PLUMBING',
  description: '',
  priority: 'NORMAL',
  expectedDate: '',
};
const EMPTY_BLOCK: BlockForm = {
  roomId: '',
  kind: 'OUT_OF_ORDER',
  startDate: '',
  endDate: '',
  reason: '',
};

function explainError(cause: unknown): string {
  if (cause instanceof StaffApiError && cause.status === 403) {
    return 'این اقدام برای نقش شما مجاز نیست؛ دسترسی را از مدیر شیفت بررسی کنید.';
  }
  if (cause instanceof StaffApiError && cause.status === 409) {
    return 'ظرفیت یا وضعیت اتاق هم‌زمان تغییر کرده است؛ فهرست را تازه کنید و دوباره بررسی کنید.';
  }
  return cause instanceof Error ? cause.message : 'درخواست انجام نشد. دوباره تلاش کنید.';
}

function jalaliDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
}

function roomLabel(roomNumber: string, floor: string | null): string {
  return floor ? `اتاق ${roomNumber} · طبقه ${floor}` : `اتاق ${roomNumber}`;
}

function DateInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        placeholder="۱۴۰۵/۰۹/۲۴"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>تاریخ شمسی به‌شکل سال/ماه/روز</small>
    </label>
  );
}

function RoomSelect({
  id,
  label,
  value,
  rooms,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rooms: Array<{ id: string; roomNumber: string; floor: string | null; roomTypeName: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">انتخاب اتاق</option>
        {rooms.map((room) => (
          <option value={room.id} key={room.id}>
            {roomLabel(room.roomNumber, room.floor)} · {room.roomTypeName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StaffMaintenancePage() {
  const { status, staff, csrfToken } = useStaffSession();
  const role = staff?.role;
  const canView = status === 'authenticated' && Boolean(role && VIEW_ROLES.includes(role));
  const canCreate = status === 'authenticated' && Boolean(role && CREATE_ROLES.includes(role));
  const canManage = Boolean(role && MANAGE_ROLES.includes(role));

  const [rooms, setRooms] = useState<
    Array<{ id: string; roomNumber: string; floor: string | null; roomTypeName: string }>
  >([]);
  const [assignees, setAssignees] = useState<MaintenanceIdentity[]>([]);
  const [requests, setRequests] = useState<StaffMaintenanceRequest[]>([]);
  const [blocks, setBlocks] = useState<StaffRoomBlock[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST);
  const [blockForm, setBlockForm] = useState(EMPTY_BLOCK);
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<string, string>>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
  const [restoreDrafts, setRestoreDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshSequence, setRefreshSequence] = useState(0);

  const requestQuery = useMemo(
    () => ({
      page: 1,
      pageSize: PAGE_SIZE,
      roomId: appliedFilters.roomId || undefined,
      floor: appliedFilters.floor || undefined,
      category: (appliedFilters.category || undefined) as MaintenanceCategory | undefined,
      priority: (appliedFilters.priority || undefined) as MaintenancePriority | undefined,
      status: (appliedFilters.requestStatus || undefined) as 'OPEN' | 'RESOLVED' | undefined,
      assigneeStaffUserId: appliedFilters.assigneeStaffUserId || undefined,
      expectedDate: appliedFilters.expectedDate || undefined,
    }),
    [appliedFilters],
  );

  const blockQuery = useMemo(
    () => ({
      page: 1,
      pageSize: PAGE_SIZE,
      roomId: appliedFilters.roomId || undefined,
      floor: appliedFilters.floor || undefined,
      status: (appliedFilters.blockStatus || undefined) as StaffRoomBlockStatus | undefined,
      activeOn: appliedFilters.activeOn || undefined,
      expectedReturnDate: appliedFilters.expectedReturnDate || undefined,
      reason: appliedFilters.reason || undefined,
    }),
    [appliedFilters],
  );

  const loadData = useCallback(async () => {
    if (!canCreate) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    const roomPromise = getStaffMaintenanceRooms();
    const requestsPromise = canView ? getStaffMaintenanceRequests(requestQuery) : null;
    const blocksPromise = canView ? getStaffRoomBlocks(blockQuery) : null;
    const assigneesPromise = canManage ? getStaffMaintenanceAssignees() : null;
    const results = await Promise.allSettled([
      roomPromise,
      requestsPromise ?? Promise.resolve(null),
      blocksPromise ?? Promise.resolve(null),
      assigneesPromise ?? Promise.resolve(null),
    ] as const);
    const errors: string[] = [];
    const [roomResult, requestsResult, blocksResult, assigneesResult] = results;
    if (roomResult.status === 'fulfilled') setRooms(roomResult.value.items);
    else errors.push(explainError(roomResult.reason));
    if (requestsResult.status === 'fulfilled' && requestsResult.value)
      setRequests(requestsResult.value.items);
    else if (requestsResult.status === 'rejected') errors.push(explainError(requestsResult.reason));
    if (blocksResult.status === 'fulfilled' && blocksResult.value)
      setBlocks(blocksResult.value.items);
    else if (blocksResult.status === 'rejected') errors.push(explainError(blocksResult.reason));
    if (assigneesResult.status === 'fulfilled' && assigneesResult.value)
      setAssignees(assigneesResult.value.items);
    else if (assigneesResult.status === 'rejected')
      errors.push(explainError(assigneesResult.reason));
    setLoadError(errors.length ? errors[0] : null);
    setIsLoading(false);
  }, [canCreate, canManage, canView, requestQuery, blockQuery]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData, refreshSequence]);

  function changeFilter<K extends keyof MaintenanceFilters>(key: K, value: MaintenanceFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dateFields: Array<[keyof MaintenanceFilters, string]> = [
      ['expectedDate', 'موعد رسیدگی'],
      ['activeOn', 'تاریخ فعالیت انسداد'],
      ['expectedReturnDate', 'تاریخ بازگشت مورد انتظار'],
    ];
    for (const [field, label] of dateFields) {
      const value = filters[field];
      if (value && !toGregorianIso(value)) {
        setFilterError(`${label} را به‌شکل تاریخ شمسی معتبر وارد کنید.`);
        return;
      }
    }
    setFilterError(null);
    setAppliedFilters({
      ...filters,
      expectedDate: filters.expectedDate ? (toGregorianIso(filters.expectedDate) ?? '') : '',
      activeOn: filters.activeOn ? (toGregorianIso(filters.activeOn) ?? '') : '',
      expectedReturnDate: filters.expectedReturnDate
        ? (toGregorianIso(filters.expectedReturnDate) ?? '')
        : '',
    });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expectedDate = toGregorianIso(requestForm.expectedDate);
    if (!requestForm.roomId || !expectedDate || requestForm.description.trim().length < 3) {
      setFormError('اتاق، شرح حداقل سه‌حرفی و موعد معتبر را وارد کنید.');
      return;
    }
    if (!csrfToken) return;
    setIsSaving(true);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await createStaffMaintenanceRequest(
        {
          roomId: requestForm.roomId,
          category: requestForm.category,
          description: requestForm.description.trim(),
          priority: requestForm.priority,
          expectedDate,
        },
        csrfToken,
      );
      setRequestForm(EMPTY_REQUEST);
      setSuccessMessage('درخواست تعمیر ثبت شد؛ برای انسداد ظرفیت باید جداگانه اقدام شود.');
      await loadData();
    } catch (cause) {
      setFormError(explainError(cause));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startDate = toGregorianIso(blockForm.startDate);
    const endDate = toGregorianIso(blockForm.endDate);
    if (
      !blockForm.roomId ||
      !startDate ||
      !endDate ||
      startDate >= endDate ||
      blockForm.reason.trim().length < 3
    ) {
      setFormError('اتاق، بازه معتبر و دلیل حداقل سه‌حرفی را وارد کنید.');
      return;
    }
    if (!csrfToken) return;
    setIsSaving(true);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await createStaffRoomBlock(
        {
          roomId: blockForm.roomId,
          kind: blockForm.kind,
          startDate,
          endDate,
          reason: blockForm.reason.trim(),
        },
        csrfToken,
      );
      setBlockForm(EMPTY_BLOCK);
      setSuccessMessage('بازه انسداد ثبت شد و ظرفیت اتاق‌ها دوباره محاسبه شد.');
      await loadData();
    } catch (cause) {
      setFormError(explainError(cause));
    } finally {
      setIsSaving(false);
    }
  }

  async function assignRequest(requestId: string) {
    const assigneeStaffUserId = assigneeDrafts[requestId];
    if (!assigneeStaffUserId || !csrfToken) return;
    setActionError(null);
    setSuccessMessage(null);
    try {
      await assignStaffMaintenanceRequest(requestId, { assigneeStaffUserId }, csrfToken);
      setSuccessMessage('مسئول درخواست به‌روزرسانی شد.');
      await loadData();
    } catch (cause) {
      setActionError(explainError(cause));
    }
  }

  async function resolveRequest(requestId: string) {
    const resolutionNote = resolutionDrafts[requestId]?.trim() ?? '';
    if (resolutionNote.length < 3 || !csrfToken) {
      setActionError('یادداشت رفع مشکل را با حداقل سه حرف وارد کنید.');
      return;
    }
    setActionError(null);
    setSuccessMessage(null);
    try {
      await resolveStaffMaintenanceRequest(requestId, { resolutionNote }, csrfToken);
      setSuccessMessage('درخواست به‌عنوان برطرف‌شده ثبت شد.');
      await loadData();
    } catch (cause) {
      setActionError(explainError(cause));
    }
  }

  async function restoreBlock(blockId: string) {
    const reason = restoreDrafts[blockId]?.trim() ?? '';
    if (reason.length < 3 || !csrfToken) {
      setActionError('دلیل بازگردانی را با حداقل سه حرف وارد کنید.');
      return;
    }
    setActionError(null);
    setSuccessMessage(null);
    try {
      await restoreStaffRoomBlock(blockId, { reason }, csrfToken);
      setSuccessMessage('ظرفیت اتاق بازگردانده شد.');
      await loadData();
    } catch (cause) {
      setActionError(explainError(cause));
    }
  }

  if (status === 'loading') {
    return (
      <p className={styles.notice} role="status">
        در حال بررسی دسترسی…
      </p>
    );
  }
  if (!canCreate) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyState}>
          <span className={styles.eyebrow}>فضای کارکنان</span>
          <h1>دسترسی به این بخش مجاز نیست</h1>
          <p>این بخش برای ثبت یا پیگیری تعمیرات در دسترس کارکنان عملیاتی است.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="maintenance-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>عملیات روزانه · تعمیر و ظرفیت</p>
          <h1 id="maintenance-title">{canView ? 'تعمیرات و انسداد اتاق' : 'ثبت درخواست تعمیر'}</h1>
          <p className={styles.lead}>
            {canView
              ? 'درخواست تعمیر به‌تنهایی اتاق را از فروش خارج نمی‌کند؛ انسداد ظرفیت نیاز به اقدام جداگانه دارد.'
              : 'مشکل را ثبت کنید تا مدیر شیفت آن را بررسی کند. ثبت درخواست، ظرفیت فروش اتاق را تغییر نمی‌دهد.'}
          </p>
        </div>
        {canView && (
          <div className={styles.headerAction}>
            <span>
              {requests.length.toLocaleString('fa-IR')} درخواست ·{' '}
              {blocks.length.toLocaleString('fa-IR')} انسداد
            </span>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setRefreshSequence((value) => value + 1)}
              disabled={isLoading}
            >
              {isLoading ? 'در حال دریافت…' : 'به‌روزرسانی فهرست'}
            </button>
          </div>
        )}
      </header>

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}
      {successMessage && (
        <p className={styles.success} role="status">
          {successMessage}
        </p>
      )}
      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      <details className={styles.formPanel} open>
        <summary>{canView ? 'ثبت درخواست تعمیر' : 'شرح درخواست تعمیر'}</summary>
        <form className={styles.formGrid} onSubmit={submitRequest}>
          <RoomSelect
            id="maintenance-request-room"
            label="اتاق برای درخواست تعمیر"
            value={requestForm.roomId}
            rooms={rooms}
            onChange={(roomId) => setRequestForm((current) => ({ ...current, roomId }))}
          />
          <label className={styles.field} htmlFor="maintenance-request-category">
            <span>نوع تعمیر</span>
            <select
              id="maintenance-request-category"
              value={requestForm.category}
              onChange={(event) =>
                setRequestForm((current) => ({
                  ...current,
                  category: event.target.value as MaintenanceCategory,
                }))
              }
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} htmlFor="maintenance-request-priority">
            <span>اولویت رسیدگی</span>
            <select
              id="maintenance-request-priority"
              value={requestForm.priority}
              onChange={(event) =>
                setRequestForm((current) => ({
                  ...current,
                  priority: event.target.value as MaintenancePriority,
                }))
              }
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <DateInput
            id="maintenance-request-date"
            label="موعد تقریبی رسیدگی"
            value={requestForm.expectedDate}
            onChange={(expectedDate) => setRequestForm((current) => ({ ...current, expectedDate }))}
          />
          <label
            className={`${styles.field} ${styles.wideField}`}
            htmlFor="maintenance-request-description"
          >
            <span>شرح مشکل</span>
            <textarea
              id="maintenance-request-description"
              minLength={3}
              maxLength={1000}
              rows={3}
              value={requestForm.description}
              onChange={(event) =>
                setRequestForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="برای نمونه: شیر روشویی اتاق نشتی دارد"
              required
            />
          </label>
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
          <div className={styles.formActions}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={isSaving || rooms.length === 0}
            >
              {isSaving ? 'در حال ثبت…' : 'ثبت درخواست تعمیر'}
            </button>
            {rooms.length === 0 && !isLoading && (
              <small>اتاق فعالی برای ثبت درخواست پیدا نشد.</small>
            )}
          </div>
        </form>
      </details>

      {canManage && (
        <details className={styles.formPanel}>
          <summary>ثبت انسداد اتاق و بازه بازگشت</summary>
          <p className={styles.panelHint}>
            بازه پایان‌انحصاری است؛ تاریخ بازگشت مورد انتظار دیگر جزو شب‌های مسدود نیست.
          </p>
          <form className={styles.formGrid} onSubmit={submitBlock}>
            <RoomSelect
              id="maintenance-block-room"
              label="اتاق برای انسداد"
              value={blockForm.roomId}
              rooms={rooms}
              onChange={(roomId) => setBlockForm((current) => ({ ...current, roomId }))}
            />
            <label className={styles.field} htmlFor="maintenance-block-kind">
              <span>نوع انسداد</span>
              <select
                id="maintenance-block-kind"
                value={blockForm.kind}
                onChange={(event) =>
                  setBlockForm((current) => ({
                    ...current,
                    kind: event.target.value as StaffRoomBlockKind,
                  }))
                }
              >
                {Object.entries(BLOCK_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <DateInput
              id="maintenance-block-start"
              label="شروع انسداد"
              value={blockForm.startDate}
              onChange={(startDate) => setBlockForm((current) => ({ ...current, startDate }))}
            />
            <DateInput
              id="maintenance-block-end"
              label="تاریخ بازگشت مورد انتظار"
              value={blockForm.endDate}
              onChange={(endDate) => setBlockForm((current) => ({ ...current, endDate }))}
            />
            <label
              className={`${styles.field} ${styles.wideField}`}
              htmlFor="maintenance-block-reason"
            >
              <span>دلیل انسداد</span>
              <textarea
                id="maintenance-block-reason"
                minLength={3}
                maxLength={500}
                rows={2}
                value={blockForm.reason}
                onChange={(event) =>
                  setBlockForm((current) => ({ ...current, reason: event.target.value }))
                }
                required
              />
            </label>
            {formError && (
              <p className={styles.error} role="alert">
                {formError}
              </p>
            )}
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSaving || rooms.length === 0}
              >
                ثبت بازه انسداد
              </button>
            </div>
          </form>
        </details>
      )}

      {canView && (
        <>
          <details className={styles.filterPanel}>
            <summary>فیلتر درخواست‌ها و انسدادها</summary>
            <form className={styles.filterGrid} onSubmit={applyFilters}>
              <RoomSelect
                id="maintenance-filter-room"
                label="فیلتر اتاق"
                value={filters.roomId}
                rooms={rooms}
                onChange={(roomId) => changeFilter('roomId', roomId)}
              />
              <label className={styles.field} htmlFor="maintenance-filter-floor">
                <span>طبقه</span>
                <input
                  id="maintenance-filter-floor"
                  value={filters.floor}
                  onChange={(event) => changeFilter('floor', event.target.value)}
                />
              </label>
              <label className={styles.field} htmlFor="maintenance-filter-category">
                <span>دسته تعمیر</span>
                <select
                  id="maintenance-filter-category"
                  value={filters.category}
                  onChange={(event) => changeFilter('category', event.target.value)}
                >
                  <option value="">همه دسته‌ها</option>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field} htmlFor="maintenance-filter-request-status">
                <span>وضعیت درخواست</span>
                <select
                  id="maintenance-filter-request-status"
                  value={filters.requestStatus}
                  onChange={(event) => changeFilter('requestStatus', event.target.value)}
                >
                  <option value="">همه درخواست‌ها</option>
                  <option value="OPEN">در انتظار رسیدگی</option>
                  <option value="RESOLVED">برطرف‌شده</option>
                </select>
              </label>
              <label className={styles.field} htmlFor="maintenance-filter-block-status">
                <span>وضعیت انسداد</span>
                <select
                  id="maintenance-filter-block-status"
                  value={filters.blockStatus}
                  onChange={(event) => changeFilter('blockStatus', event.target.value)}
                >
                  <option value="">همه انسدادها</option>
                  <option value="ACTIVE">فعال</option>
                  <option value="EXPIRED">پایان‌یافته</option>
                  <option value="RESTORED">ظرفیت بازگشته</option>
                </select>
              </label>
              <DateInput
                id="maintenance-filter-date"
                label="موعد رسیدگی"
                value={filters.expectedDate}
                onChange={(value) => changeFilter('expectedDate', value)}
              />
              <DateInput
                id="maintenance-filter-active-on"
                label="انسداد فعال در تاریخ"
                value={filters.activeOn}
                onChange={(value) => changeFilter('activeOn', value)}
              />
              <DateInput
                id="maintenance-filter-return"
                label="تاریخ بازگشت مورد انتظار"
                value={filters.expectedReturnDate}
                onChange={(value) => changeFilter('expectedReturnDate', value)}
              />
              <label className={styles.field} htmlFor="maintenance-filter-assignee">
                <span>مسئول رسیدگی</span>
                <select
                  id="maintenance-filter-assignee"
                  value={filters.assigneeStaffUserId}
                  onChange={(event) => changeFilter('assigneeStaffUserId', event.target.value)}
                  disabled={!canManage}
                >
                  <option value="">همه مسئولان</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.username}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field} htmlFor="maintenance-filter-reason">
                <span>دلیل انسداد</span>
                <input
                  id="maintenance-filter-reason"
                  value={filters.reason}
                  onChange={(event) => changeFilter('reason', event.target.value)}
                />
              </label>
              {filterError && (
                <p className={styles.error} role="alert">
                  {filterError}
                </p>
              )}
              <div className={styles.formActions}>
                <button className={styles.primaryButton} type="submit">
                  اعمال فیلتر
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setAppliedFilters(EMPTY_FILTERS);
                    setFilterError(null);
                  }}
                >
                  پاک‌کردن فیلترها
                </button>
              </div>
            </form>
          </details>

          <section className={styles.panel} aria-labelledby="maintenance-requests-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>صف مستقل تعمیر</p>
                <h2 id="maintenance-requests-heading">درخواست‌های تعمیر</h2>
                <p>درخواست‌های تعمیر روی ظرفیت فروش اثر نمی‌گذارند.</p>
              </div>
              <span className={styles.count}>{requests.length.toLocaleString('fa-IR')} مورد</span>
            </div>
            {requests.length ? (
              <div className={styles.cardList}>
                {requests.map((item) => (
                  <article
                    className={styles.recordCard}
                    aria-label={`درخواست تعمیر اتاق ${item.room.roomNumber}`}
                    key={item.id}
                    data-maintenance-request-id={item.id}
                  >
                    <div className={styles.recordTopline}>
                      <div>
                        <h3>{roomLabel(item.room.roomNumber, item.room.floor)}</h3>
                        <p>
                          {item.room.roomTypeName} · {CATEGORY_LABELS[item.category]} · اولویت{' '}
                          {PRIORITY_LABELS[item.priority]}
                        </p>
                      </div>
                      <span
                        className={`${styles.status} ${item.status === 'OPEN' ? styles.statusOpen : styles.statusDone}`}
                      >
                        {REQUEST_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className={styles.description}>{item.description}</p>
                    <dl className={styles.metadata}>
                      <div>
                        <dt>موعد</dt>
                        <dd>{jalaliDate(item.expectedDate)}</dd>
                      </div>
                      <div>
                        <dt>ثبت</dt>
                        <dd>{timestamp(item.openedAt)}</dd>
                      </div>
                      <div>
                        <dt>مسئول</dt>
                        <dd>{item.assignee?.username ?? 'تخصیص‌نیافته'}</dd>
                      </div>
                    </dl>
                    {item.resolutionNote && (
                      <p className={styles.resolution}>نتیجه: {item.resolutionNote}</p>
                    )}
                    {canManage && item.status === 'OPEN' && (
                      <div className={styles.managerActions}>
                        <div className={styles.inlineAction}>
                          <label
                            className={styles.field}
                            htmlFor={`maintenance-assignee-${item.id}`}
                          >
                            <span>واگذاری به</span>
                            <select
                              id={`maintenance-assignee-${item.id}`}
                              value={assigneeDrafts[item.id] ?? item.assignee?.id ?? ''}
                              onChange={(event) =>
                                setAssigneeDrafts((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">انتخاب مسئول</option>
                              {assignees.map((assignee) => (
                                <option key={assignee.id} value={assignee.id}>
                                  {assignee.username}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() => void assignRequest(item.id)}
                          >
                            ثبت مسئول
                          </button>
                        </div>
                        <div className={styles.inlineAction}>
                          <label
                            className={styles.field}
                            htmlFor={`maintenance-resolution-${item.id}`}
                          >
                            <span>یادداشت رفع مشکل</span>
                            <input
                              id={`maintenance-resolution-${item.id}`}
                              value={resolutionDrafts[item.id] ?? ''}
                              onChange={(event) =>
                                setResolutionDrafts((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() => void resolveRequest(item.id)}
                          >
                            ثبت رفع مشکل
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyInline}>
                {isLoading ? 'در حال دریافت درخواست‌ها…' : 'درخواستی با این فیلترها پیدا نشد.'}
              </p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="maintenance-blocks-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>ظرفیت فیزیکی</p>
                <h2 id="maintenance-blocks-heading">انسدادهای اتاق</h2>
                <p>بازه انسداد از تاریخ شروع تا پیش از تاریخ بازگشت را پوشش می‌دهد.</p>
              </div>
              <span className={styles.count}>{blocks.length.toLocaleString('fa-IR')} مورد</span>
            </div>
            {blocks.length ? (
              <div className={styles.cardList}>
                {blocks.map((item) => (
                  <article
                    className={styles.recordCard}
                    aria-label={`انسداد اتاق ${item.room.roomNumber}`}
                    key={item.id}
                    data-room-block-id={item.id}
                  >
                    <div className={styles.recordTopline}>
                      <div>
                        <h3>{roomLabel(item.room.roomNumber, item.room.floor)}</h3>
                        <p>
                          {item.room.roomTypeName} · {BLOCK_KIND_LABELS[item.kind]}
                        </p>
                      </div>
                      <span
                        className={`${styles.status} ${item.status === 'ACTIVE' ? styles.statusOpen : styles.statusDone}`}
                      >
                        {BLOCK_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className={styles.description}>{item.reason}</p>
                    <dl className={styles.metadata}>
                      <div>
                        <dt>شروع</dt>
                        <dd>{jalaliDate(item.startDate)}</dd>
                      </div>
                      <div>
                        <dt>بازگشت مورد انتظار</dt>
                        <dd>{jalaliDate(item.expectedReturnDate)}</dd>
                      </div>
                      <div>
                        <dt>ثبت‌کننده</dt>
                        <dd>{item.createdBy?.username ?? '—'}</dd>
                      </div>
                    </dl>
                    {canManage && item.status === 'ACTIVE' && (
                      <div className={styles.restoreAction}>
                        <label className={styles.field} htmlFor={`maintenance-restore-${item.id}`}>
                          <span>دلیل بازگردانی</span>
                          <input
                            id={`maintenance-restore-${item.id}`}
                            value={restoreDrafts[item.id] ?? ''}
                            onChange={(event) =>
                              setRestoreDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => void restoreBlock(item.id)}
                        >
                          بازگرداندن اتاق به ظرفیت فروش
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyInline}>
                {isLoading ? 'در حال دریافت انسدادها…' : 'انسدادی با این فیلترها پیدا نشد.'}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
