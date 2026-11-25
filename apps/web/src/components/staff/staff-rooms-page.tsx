'use client';
import { NativeSelect } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { staffClass } from '@/components/staff/staff-classes';


import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  StaffApiError,
  createStaffRoom,
  deactivateStaffRoom,
  getStaffInventoryRoomTypes,
  getStaffRooms,
  reactivateStaffRoom,
  updateStaffRoom,
  type StaffInventoryRoomTypeOption,
  type StaffRoom,
  type StaffRoomUpdate,
  type StaffRoomsQuery,
} from '@/lib/staff-api';
import { formatPersianInteger } from '@/lib/jalali-date';
import { useStaffSession } from './staff-session-provider';

type RoomFormState = {
  roomTypeId: string;
  roomNumber: string;
  floor: string;
  features: string;
};

type RoomFilters = {
  roomTypeId: string;
  floor: string;
  activeState: '' | 'true' | 'false';
  search: string;
};

type RoomAction = 'deactivate' | 'reactivate';

const emptyDraft: RoomFormState = { roomTypeId: '', roomNumber: '', floor: '', features: '' };

function toQuery(filters: RoomFilters): StaffRoomsQuery {
  return {
    ...(filters.roomTypeId ? { roomTypeId: filters.roomTypeId } : {}),
    ...(filters.floor.trim() ? { floor: filters.floor.trim() } : {}),
    ...(filters.activeState ? { isActive: filters.activeState === 'true' } : {}),
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
  };
}

function splitFeatures(value: string): string[] {
  return value
    .split(/[،,]/)
    .map((feature) => feature.trim())
    .filter(Boolean);
}

function featuresToInput(features: string[]): string {
  return features.join('، ');
}

function formatRoomError(cause: unknown): { message: string; field?: 'roomNumber' } {
  if (cause instanceof StaffApiError) {
    if (cause.code === 'ROOM_NUMBER_TAKEN') {
      return { message: 'این شماره قبلاً برای اتاق دیگری ثبت شده است.', field: 'roomNumber' };
    }
    if (cause.code === 'ROOM_HAS_ACTIVE_ASSIGNMENTS') {
      return {
        message:
          'برای غیرفعال‌کردن اتاق، ابتدا پذیرش باید انتساب‌های جاری یا آینده را جابه‌جا کند.',
      };
    }
    if (cause.code === 'CAPACITY_BELOW_RESERVED') {
      return {
        message:
          'ظرفیت قابل عرضه با اتاق‌های رزروشده هم‌خوان نیست؛ موجودی این نوع اتاق را بررسی کنید.',
      };
    }
    if (cause.code === 'ROOM_TYPE_INACTIVE') {
      return { message: 'این نوع اتاق غیرفعال است؛ نوع اتاق فعال دیگری انتخاب کنید.' };
    }
    if (cause.fields?.some((item) => item.field === 'roomNumber')) {
      return {
        message: 'شماره اتاق را بررسی کنید؛ باید یکتا و حداکثر ۳۲ نویسه باشد.',
        field: 'roomNumber',
      };
    }
    return { message: cause.message };
  }
  return {
    message: cause instanceof Error ? cause.message : 'تغییرات ذخیره نشد. دوباره تلاش کنید.',
  };
}

function housekeepingLabel(status: StaffRoom['housekeepingStatus']): string {
  const labels: Record<StaffRoom['housekeepingStatus'], string> = {
    DIRTY: 'نیازمند نظافت',
    CLEAN: 'نظافت‌شده',
    INSPECTED: 'بازرسی‌شده',
  };
  return labels[status];
}

function roomMatchesFilters(room: StaffRoom, filters: RoomFilters): boolean {
  if (filters.roomTypeId && filters.roomTypeId !== room.roomType.id) return false;
  if (filters.floor.trim() && filters.floor.trim() !== room.floor) return false;
  if (filters.activeState && room.isActive !== (filters.activeState === 'true')) return false;
  const search = filters.search.trim().toLocaleLowerCase();
  if (
    search &&
    !room.roomNumber.toLocaleLowerCase().includes(search) &&
    !room.roomType.name.toLocaleLowerCase().includes(search)
  ) {
    return false;
  }
  return true;
}

function replaceRoom(rooms: StaffRoom[], updated: StaffRoom, filters: RoomFilters): StaffRoom[] {
  const withoutUpdated = rooms.filter((room) => room.id !== updated.id);
  if (!roomMatchesFilters(updated, filters)) return withoutUpdated;
  return [...withoutUpdated, updated].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, 'fa'),
  );
}

export function StaffRoomsPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const [rooms, setRooms] = useState<StaffRoom[]>([]);
  const [roomTypes, setRoomTypes] = useState<StaffInventoryRoomTypeOption[]>([]);
  const [filters, setFilters] = useState<RoomFilters>({
    roomTypeId: '',
    floor: '',
    activeState: '',
    search: '',
  });
  const [draft, setDraft] = useState<RoomFormState>(emptyDraft);
  const [editingRoom, setEditingRoom] = useState<StaffRoom | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hiddenRoomNumber, setHiddenRoomNumber] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    room: StaffRoom;
    action: RoomAction;
  } | null>(null);
  const loadRequestId = useRef(0);
  const confirmationButton = useRef<HTMLButtonElement>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const roomListHeading = useRef<HTMLHeadingElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const canManageRooms = Boolean(staff && ['ADMIN', 'MANAGER'].includes(staff.role));

  async function loadRooms(query: StaffRoomsQuery, nextFilters?: RoomFilters) {
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);
    setFormError(null);
    setSuccessMessage(null);
    setHiddenRoomNumber(null);
    try {
      const response = await getStaffRooms(query);
      if (loadRequestId.current !== requestId) return;
      setRooms(response.items);
      if (nextFilters) setFilters(nextFilters);
    } catch (cause) {
      if (loadRequestId.current !== requestId) return;
      setLoadError(
        cause instanceof Error ? cause.message : 'فهرست اتاق‌ها دریافت نشد. دوباره تلاش کنید.',
      );
    } finally {
      if (loadRequestId.current === requestId) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (status !== 'authenticated' || !canManageRooms) return;
    let active = true;
    const requestId = ++loadRequestId.current;
    Promise.all([getStaffRooms(), getStaffInventoryRoomTypes()])
      .then(([roomList, options]) => {
        if (!active || loadRequestId.current !== requestId) return;
        setRooms(roomList.items);
        setRoomTypes(options);
        setDraft((current) => ({
          ...current,
          roomTypeId: options.find((option) => option.isActive)?.id ?? '',
        }));
      })
      .catch((cause: unknown) => {
        if (!active || loadRequestId.current !== requestId) return;
        setLoadError(
          cause instanceof Error ? cause.message : 'فهرست اتاق‌ها دریافت نشد. دوباره تلاش کنید.',
        );
      })
      .finally(() => {
        if (active && loadRequestId.current === requestId) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageRooms, status]);

  useEffect(() => {
    if (pendingAction) confirmationButton.current?.focus();
    else if (actionTrigger.current?.isConnected) actionTrigger.current.focus();
    else if (actionTrigger.current) roomListHeading.current?.focus();
  }, [pendingAction]);

  useEffect(() => {
    if (!isEditorOpen || !editorHeading.current) return;
    const heading = editorHeading.current;
    heading.focus();
    if (typeof heading.scrollIntoView === 'function') {
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      heading.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [editingRoom?.id, isEditorOpen]);

  if (status !== 'authenticated' || !staff) return null;

  if (!canManageRooms) {
    return (
      <section className={staffClass('staff-rooms-denied')} aria-labelledby="staff-rooms-denied-title">
        <h1 id="staff-rooms-denied-title">دسترسی به مدیریت اتاق‌ها</h1>
        <p role="alert">این بخش برای مدیر اقامتگاه و مدیر شیفت در دسترس است.</p>
      </section>
    );
  }

  function updateFilter<K extends keyof RoomFilters>(field: K, value: RoomFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
    setHiddenRoomNumber(null);
  }

  function updateDraft<K extends keyof RoomFormState>(field: K, value: RoomFormState[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === 'roomNumber') setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
  }

  function toggleCreateEditor() {
    if (isEditorOpen && !editingRoom) {
      setIsEditorOpen(false);
      return;
    }
    setEditingRoom(null);
    setDraft({ ...emptyDraft, roomTypeId: activeRoomTypes[0]?.id ?? '' });
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
    setIsEditorOpen(true);
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRooms(toQuery(filters), filters);
  }

  function startEdit(room: StaffRoom) {
    setIsEditorOpen(true);
    setEditingRoom(room);
    setDraft({
      roomTypeId: room.roomType.id,
      roomNumber: room.roomNumber,
      floor: room.floor ?? '',
      features: featuresToInput(room.features),
    });
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
  }

  function cancelEdit() {
    setIsEditorOpen(false);
    setEditingRoom(null);
    setDraft({ ...emptyDraft, roomTypeId: roomTypes.find((option) => option.isActive)?.id ?? '' });
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);
    const roomNumber = draft.roomNumber.trim();
    if (!roomNumber) {
      setFieldError('شماره اتاق را وارد کنید.');
      return;
    }
    if (roomNumber.length > 32) {
      setFieldError('شماره اتاق نباید بیشتر از ۳۲ نویسه باشد.');
      return;
    }
    if (!editingRoom && !draft.roomTypeId) {
      setFormError('برای اتاق جدید یک نوع اتاق فعال انتخاب کنید.');
      return;
    }
    if (!csrfToken) {
      setFormError('نشست کارکنان منقضی شده است؛ دوباره وارد شوید.');
      return;
    }

    setIsSaving(true);
    const features = splitFeatures(draft.features);
    try {
      if (editingRoom) {
        const update: StaffRoomUpdate = {
          floor: draft.floor.trim() || null,
          features,
          ...(roomNumber !== editingRoom.roomNumber ? { roomNumber } : {}),
        };
        const updated = await updateStaffRoom(editingRoom.id, update, csrfToken);
        const matchesFilters = roomMatchesFilters(updated, filters);
        setRooms((current) => replaceRoom(current, updated, filters));
        setSuccessMessage(
          matchesFilters
            ? `اطلاعات اتاق ${updated.roomNumber} ذخیره شد.`
            : `اطلاعات اتاق ${updated.roomNumber} ذخیره شد، اما فیلترهای فعلی آن را پنهان کرده‌اند.`,
        );
        setHiddenRoomNumber(matchesFilters ? null : updated.roomNumber);
        setIsEditorOpen(false);
        setEditingRoom(null);
        setDraft({
          ...emptyDraft,
          roomTypeId: roomTypes.find((option) => option.isActive)?.id ?? '',
        });
      } else {
        const created = await createStaffRoom(
          {
            roomTypeId: draft.roomTypeId,
            roomNumber,
            floor: draft.floor.trim() || null,
            features,
          },
          csrfToken,
        );
        const matchesFilters = roomMatchesFilters(created, filters);
        setRooms((current) => replaceRoom(current, created, filters));
        setSuccessMessage(
          matchesFilters
            ? `اتاق ${created.roomNumber} اضافه شد.`
            : `اتاق ${created.roomNumber} اضافه شد، اما فیلترهای فعلی آن را پنهان کرده‌اند.`,
        );
        setHiddenRoomNumber(matchesFilters ? null : created.roomNumber);
        setIsEditorOpen(false);
        setDraft({
          ...emptyDraft,
          roomTypeId: roomTypes.find((option) => option.isActive)?.id ?? '',
        });
      }
    } catch (cause) {
      const error = formatRoomError(cause);
      if (error.field === 'roomNumber') setFieldError(error.message);
      else setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function requestRoomAction(
    room: StaffRoom,
    action: RoomAction,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    actionTrigger.current = event.currentTarget;
    setPendingAction({ room, action });
  }

  function showHiddenRoom() {
    if (!hiddenRoomNumber) return;
    const nextFilters: RoomFilters = {
      roomTypeId: '',
      floor: '',
      activeState: '',
      search: hiddenRoomNumber,
    };
    void loadRooms({ search: hiddenRoomNumber }, nextFilters);
  }

  async function confirmRoomAction() {
    if (!pendingAction || !csrfToken) {
      setPendingAction(null);
      setFormError('نشست کارکنان منقضی شده است؛ دوباره وارد شوید.');
      return;
    }
    const { room, action } = pendingAction;
    setPendingAction(null);
    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const updated =
        action === 'deactivate'
          ? await deactivateStaffRoom(room.id, csrfToken)
          : await reactivateStaffRoom(room.id, csrfToken);
      setRooms((current) => replaceRoom(current, updated, filters));
      setSuccessMessage(
        action === 'deactivate'
          ? `اتاق ${updated.roomNumber} غیرفعال شد.`
          : `اتاق ${updated.roomNumber} دوباره فعال شد.`,
      );
    } catch (cause) {
      setFormError(formatRoomError(cause).message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setPendingAction(null);
      return;
    }
    if (event.key === 'Tab') {
      const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  const activeRoomTypes = roomTypes.filter((roomType) => roomType.isActive);

  return (
    <section className={staffClass('staff-rooms')} aria-labelledby="staff-rooms-title">
      <header className={staffClass('staff-rooms__header')}>
        <div>
          <p className={staffClass('staff-rooms__eyebrow')}>مدیریت فیزیکی اقامتگاه</p>
          <h1 id="staff-rooms-title">اتاق‌ها</h1>
          <p>فهرست اتاق‌های واقعی، شماره‌ها و وضعیت فعال‌بودن را مدیریت کنید.</p>
        </div>
        <div className={staffClass('staff-rooms__header-actions')}>
          <div className={staffClass('staff-rooms__summary')} aria-live="polite">
            <strong>{formatPersianInteger(rooms.length)}</strong>
            <span>اتاق در فهرست فعلی</span>
          </div>
          <button
            className={staffClass('button button--jade staff-rooms__add-toggle')}
            type="button"
            aria-controls="staff-rooms-editor"
            aria-expanded={isEditorOpen}
            onClick={toggleCreateEditor}
            disabled={isSaving || Boolean(editingRoom)}
          >
            {editingRoom
              ? `ویرایش اتاق ${editingRoom.roomNumber}`
              : isEditorOpen
                ? 'بستن فرم افزودن اتاق'
                : 'افزودن اتاق'}
          </button>
        </div>
      </header>

      {loadError ? (
        <div className={staffClass('staff-rooms__message staff-rooms__message--error')} role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadRooms(toQuery(filters), filters)}>
            تلاش دوباره
          </button>
        </div>
      ) : null}
      {formError ? (
        <p className={staffClass('staff-rooms__message staff-rooms__message--error')} role="alert">
          {formError}
        </p>
      ) : null}
      {successMessage ? (
        <div className={staffClass('staff-rooms__message staff-rooms__message--success')} role="status">
          <p>{successMessage}</p>
          {hiddenRoomNumber ? (
            <button type="button" onClick={showHiddenRoom} disabled={isLoading || isSaving}>
              نمایش اتاق {hiddenRoomNumber}
            </button>
          ) : null}
        </div>
      ) : null}

      <form className={staffClass('staff-rooms__filters')} onSubmit={applyFilters} aria-label="فیلتر اتاق‌ها">
        <div className={staffClass('staff-rooms__filters-heading')}>
          <div>
            <h2>پیدا کردن اتاق</h2>
            <p>با نوع، طبقه، وضعیت یا شماره اتاق فهرست را محدود کنید.</p>
          </div>
        </div>
        <div className={staffClass('staff-rooms__filter-fields')}>
          <div className={staffClass('staff-rooms__field')}>
            <label htmlFor="staff-rooms-filter-type">نوع اتاق</label>
            <NativeSelect
              id="staff-rooms-filter-type"
              value={filters.roomTypeId}
              disabled={isSaving}
              onChange={(event) => updateFilter('roomTypeId', event.target.value)}
            >
              <option value="">همه انواع اتاق</option>
              {roomTypes.map((roomType) => (
                <option key={roomType.id} value={roomType.id}>
                  {roomType.name}
                  {roomType.isActive ? '' : ' (غیرفعال)'}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={staffClass('staff-rooms__field')}>
            <label htmlFor="staff-rooms-filter-floor">طبقه</label>
            <Input
              id="staff-rooms-filter-floor"
              value={filters.floor}
              disabled={isSaving}
              onChange={(event) => updateFilter('floor', event.target.value)}
            />
          </div>
          <div className={staffClass('staff-rooms__field')}>
            <label htmlFor="staff-rooms-filter-status">وضعیت اتاق</label>
            <NativeSelect
              id="staff-rooms-filter-status"
              value={filters.activeState}
              disabled={isSaving}
              onChange={(event) =>
                updateFilter('activeState', event.target.value as RoomFilters['activeState'])
              }
            >
              <option value="">فعال و غیرفعال</option>
              <option value="true">فعال</option>
              <option value="false">غیرفعال</option>
            </NativeSelect>
          </div>
          <div className={staffClass('staff-rooms__field staff-rooms__field--search')}>
            <label htmlFor="staff-rooms-filter-search">جست‌وجوی شماره اتاق</label>
            <Input
              id="staff-rooms-filter-search"
              type="search"
              value={filters.search}
              disabled={isSaving}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </div>
        </div>
        <div className={staffClass('staff-rooms__filter-actions')}>
          <button
            className={staffClass('button button--jade staff-rooms__filter-button')}
            type="submit"
            disabled={isLoading}
          >
            اعمال فیلترها
          </button>
        </div>
      </form>

      <section
        className={staffClass('staff-rooms__list')}
        aria-labelledby="staff-rooms-list-title"
        aria-busy={isLoading}
      >
        <div className={staffClass('staff-rooms__list-heading')}>
          <div>
            <h2 id="staff-rooms-list-title" ref={roomListHeading} tabIndex={-1}>
              فهرست اتاق‌ها
            </h2>
            <p>ظرفیت این نوع اتاق با تعداد اتاق‌های فعال و مسدودی‌های ثبت‌شده محاسبه می‌شود.</p>
          </div>
          <span>{formatPersianInteger(rooms.length)} مورد</span>
        </div>
        {isLoading ? (
          <p className={staffClass('staff-rooms__state')} role="status" aria-live="polite">
            در حال دریافت اتاق‌ها…
          </p>
        ) : null}
        {!isLoading && !loadError && rooms.length === 0 ? (
          <div className={staffClass('staff-rooms__empty')} role="status">
            <h3>اتاقی برای این فیلتر پیدا نشد</h3>
            <p>فیلترها را تغییر دهید یا مشخصات اتاق واقعی را ثبت کنید.</p>
          </div>
        ) : null}
        {!isLoading && rooms.length > 0 ? (
          <div className={staffClass('staff-rooms__grid')}>
            {rooms.map((room) => (
              <article
                className={staffClass('staff-rooms__card')}
                key={room.id}
                aria-labelledby={`staff-room-${room.id}`}
              >
                <div className={staffClass('staff-rooms__card-heading')}>
                  <div>
                    <p>{room.roomType.name}</p>
                    <h3 id={`staff-room-${room.id}`}>{room.roomNumber}</h3>
                  </div>
                  <span
                    className={
                      room.isActive
                        ? 'staff-rooms__status staff-rooms__status--active'
                        : 'staff-rooms__status'
                    }
                  >
                    {room.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>
                {room.isGenerated ? (
                  <p className={staffClass('staff-rooms__generated-badge')}>شمارهٔ پیشنهادی</p>
                ) : null}
                <dl className={staffClass('staff-rooms__details')}>
                  <div>
                    <dt>طبقه</dt>
                    <dd>{room.floor || 'ثبت نشده'}</dd>
                  </div>
                  <div>
                    <dt>نظافت</dt>
                    <dd>{housekeepingLabel(room.housekeepingStatus)}</dd>
                  </div>
                </dl>
                <div className={staffClass('staff-rooms__features')} aria-label="امکانات اتاق">
                  {room.features.length ? (
                    room.features.map((feature) => <span key={feature}>{feature}</span>)
                  ) : (
                    <span>امکانات ثبت نشده</span>
                  )}
                </div>
                <div className={staffClass('staff-rooms__card-actions')}>
                  <button
                    type="button"
                    className={staffClass('button button--quiet')}
                    onClick={() => startEdit(room)}
                    disabled={isSaving}
                    aria-label={`ویرایش اتاق ${room.roomNumber}`}
                  >
                    ویرایش
                  </button>
                  {room.isActive ? (
                    <button
                      type="button"
                      className={staffClass('button button--danger-quiet')}
                      onClick={(event) => requestRoomAction(room, 'deactivate', event)}
                      disabled={isSaving}
                      aria-label={`غیرفعال‌کردن اتاق ${room.roomNumber}`}
                    >
                      غیرفعال‌کردن
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={staffClass('button button--quiet')}
                      onClick={(event) => requestRoomAction(room, 'reactivate', event)}
                      disabled={isSaving}
                      aria-label={`فعال‌کردن اتاق ${room.roomNumber}`}
                    >
                      فعال‌کردن
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <form
        id="staff-rooms-editor"
        className={staffClass('staff-rooms__editor')}
        onSubmit={saveRoom}
        aria-label={editingRoom ? 'ویرایش اتاق' : 'افزودن اتاق'}
        hidden={!isEditorOpen}
      >
        <div className={staffClass('staff-rooms__editor-heading')}>
          <div>
            <p className={staffClass('staff-rooms__eyebrow')}>
              {editingRoom ? 'ویرایش اطلاعات' : 'ثبت اتاق واقعی'}
            </p>
            <h2 ref={editorHeading} tabIndex={-1}>
              {editingRoom ? `ویرایش اتاق ${editingRoom.roomNumber}` : 'افزودن اتاق'}
            </h2>
          </div>
          {editingRoom?.isGenerated ? (
            <p className={staffClass('staff-rooms__generated-note')} role="note">
              شماره‌های نمونه باید پیش از بهره‌برداری با شماره واقعی جایگزین شوند.
            </p>
          ) : null}
        </div>
        <div className={staffClass('staff-rooms__editor-fields')}>
          {!editingRoom ? (
            <div className={staffClass('staff-rooms__field')}>
              <label htmlFor="staff-room-type">نوع اتاق</label>
              <NativeSelect
                id="staff-room-type"
                value={draft.roomTypeId}
                onChange={(event) => updateDraft('roomTypeId', event.target.value)}
                disabled={isSaving || activeRoomTypes.length === 0}
              >
                <option value="">انتخاب نوع اتاق</option>
                {activeRoomTypes.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className={staffClass('staff-rooms__field staff-rooms__field--read-only')}>
              <span>نوع اتاق</span>
              <strong>{editingRoom.roomType.name}</strong>
            </div>
          )}
          <div className={staffClass('staff-rooms__field')}>
            <label htmlFor="staff-room-number">شماره اتاق</label>
            <Input
              id="staff-room-number"
              value={draft.roomNumber}
              maxLength={32}
              disabled={isSaving}
              onChange={(event) => updateDraft('roomNumber', event.target.value)}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'staff-room-number-error' : 'staff-room-number-help'}
            />
            <span id="staff-room-number-help" className={staffClass('staff-rooms__hint')}>
              شماره باید در کل اقامتگاه یکتا باشد.
            </span>
            {fieldError ? (
              <span id="staff-room-number-error" className={staffClass('staff-rooms__field-error')} role="alert">
                {fieldError}
              </span>
            ) : null}
          </div>
          <div className={staffClass('staff-rooms__field')}>
            <label htmlFor="staff-room-floor">طبقه</label>
            <Input
              id="staff-room-floor"
              value={draft.floor}
              maxLength={32}
              disabled={isSaving}
              onChange={(event) => updateDraft('floor', event.target.value)}
            />
          </div>
          <div className={staffClass('staff-rooms__field staff-rooms__field--features')}>
            <label htmlFor="staff-room-features">امکانات</label>
            <Input
              id="staff-room-features"
              value={draft.features}
              disabled={isSaving}
              onChange={(event) => updateDraft('features', event.target.value)}
              aria-describedby="staff-room-features-help"
            />
            <span id="staff-room-features-help" className={staffClass('staff-rooms__hint')}>
              امکانات را با ویرگول جدا کنید؛ مانند بالکن، نمای باغ.
            </span>
          </div>
        </div>
        {!editingRoom && activeRoomTypes.length === 0 && !isLoading ? (
          <p className={staffClass('staff-rooms__message')} role="status">
            برای ثبت اتاق، ابتدا دست‌کم یک نوع اتاق فعال ایجاد یا فعال کنید.
          </p>
        ) : null}
        <div className={staffClass('staff-rooms__editor-actions')}>
          <button
            className={staffClass('button button--quiet')}
            type="button"
            onClick={editingRoom ? cancelEdit : () => setIsEditorOpen(false)}
            disabled={isSaving}
          >
            {editingRoom ? 'لغو ویرایش' : 'بستن فرم'}
          </button>
          <button
            className={staffClass('button button--jade')}
            type="submit"
            disabled={isSaving || (!editingRoom && activeRoomTypes.length === 0)}
          >
            {isSaving ? 'در حال ذخیره…' : editingRoom ? 'ذخیره تغییرات اتاق' : 'افزودن اتاق'}
          </button>
        </div>
      </form>

      {pendingAction ? (
        <div className={staffClass('staff-rooms__dialog-backdrop')}>
          <div
            className={staffClass('staff-rooms__confirm')}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="staff-rooms-confirm-title"
            aria-describedby="staff-rooms-confirm-description"
            onKeyDown={handleDialogKeyDown}
          >
            <p className={staffClass('staff-rooms__eyebrow')}>تأیید تغییر وضعیت</p>
            <h2 id="staff-rooms-confirm-title">
              {pendingAction.action === 'deactivate'
                ? 'غیرفعال‌کردن اتاق'
                : 'فعال‌کردن دوباره اتاق'}
            </h2>
            <p id="staff-rooms-confirm-description">
              {pendingAction.action === 'deactivate'
                ? `اتاق ${pendingAction.room.roomNumber} از ظرفیت قابل عرضه خارج می‌شود. اگر انتساب جاری یا آینده داشته باشد، سامانه تغییر را نمی‌پذیرد.`
                : `اتاق ${pendingAction.room.roomNumber} دوباره به ظرفیت قابل عرضه اضافه می‌شود.`}
            </p>
            <div className={staffClass('staff-rooms__confirm-actions')}>
              <button
                type="button"
                className={staffClass('button button--quiet')}
                onClick={() => setPendingAction(null)}
              >
                بازگشت
              </button>
              <button
                ref={confirmationButton}
                type="button"
                className={
                  pendingAction.action === 'deactivate'
                    ? 'button button--danger'
                    : 'button button--jade'
                }
                onClick={() => void confirmRoomAction()}
              >
                {pendingAction.action === 'deactivate' ? 'تأیید غیرفعال‌سازی' : 'تأیید فعال‌سازی'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
