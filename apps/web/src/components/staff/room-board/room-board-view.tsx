import { NativeSelect } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { staffClass } from '@/components/staff/staff-classes';
import type { FormEvent } from 'react';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';
import type {
  StaffRoomBoardItem,
  StaffRoomBoardResponse,
  StaffRoomOccupancy,
  StaffRoomStayContext,
} from '@/lib/staff-api';
import { isDateWithinAssignmentInterval } from './room-board-date';
import { roomBoardClasses as styles } from '../tailwind-classes';

export type RoomBoardFilters = {
  date: string;
  roomTypeId: string;
  floor: string;
  occupancy: '' | StaffRoomOccupancy;
  housekeepingStatus: '' | StaffRoomBoardItem['housekeepingStatus'];
  stayContext: '' | 'NONE' | StaffRoomStayContext;
  blockKind: '' | 'NONE' | 'OUT_OF_ORDER' | 'CAPACITY_CLOSED';
};

export const EMPTY_ROOM_BOARD_FILTERS: RoomBoardFilters = {
  date: '',
  roomTypeId: '',
  floor: '',
  occupancy: '',
  housekeepingStatus: '',
  stayContext: '',
  blockKind: '',
};

export function displayRoomBoardDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

export function roomFilterMatches(room: StaffRoomBoardItem, filters: RoomBoardFilters): boolean {
  if (filters.roomTypeId && room.roomType.id !== filters.roomTypeId) return false;
  if (filters.floor.trim() && room.floor !== filters.floor.trim()) return false;
  if (filters.occupancy && room.occupancy !== filters.occupancy) return false;
  if (filters.housekeepingStatus && room.housekeepingStatus !== filters.housekeepingStatus) {
    return false;
  }
  if (
    filters.stayContext &&
    (filters.stayContext === 'NONE'
      ? room.reservationContexts.length > 0
      : !room.reservationContexts.some((context) => context.stayContext === filters.stayContext))
  ) {
    return false;
  }
  if (
    filters.blockKind &&
    (filters.blockKind === 'NONE'
      ? room.blocks.length > 0
      : !room.blocks.some((block) => block.kind === filters.blockKind))
  ) {
    return false;
  }
  return true;
}

function displayTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ثبت نشده';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

const occupancyLabels: Record<StaffRoomOccupancy, string> = {
  VACANT: 'خالی',
  UNKNOWN: 'رزرو دارد؛ حضور ثبت نشده',
  OCCUPIED: 'اشغال؛ پذیرش انجام شده',
};

const housekeepingLabels: Record<StaffRoomBoardItem['housekeepingStatus'], string> = {
  DIRTY: 'نیازمند نظافت',
  CLEAN: 'نظافت‌شده',
  INSPECTED: 'بازرسی‌شده',
};

const stayLabels: Record<StaffRoomStayContext, string> = {
  ARRIVING: 'ورود امروز',
  RESERVED: 'رزرو در جریان',
  IN_HOUSE: 'اقامت در جریان',
  DEPARTING: 'خروج امروز',
};

const blockLabels: Record<StaffRoomBoardItem['blocks'][number]['kind'], string> = {
  OUT_OF_ORDER: 'خارج از سرویس',
  CAPACITY_CLOSED: 'ظرفیت بسته',
};

function roomBoardCounts(items: StaffRoomBoardItem[]) {
  return {
    ready: items.filter(
      (room) =>
        room.isActive &&
        room.occupancy === 'VACANT' &&
        room.housekeepingStatus === 'INSPECTED' &&
        room.blocks.length === 0,
    ).length,
    dirty: items.filter(
      (room) => room.isActive && room.occupancy === 'VACANT' && room.housekeepingStatus === 'DIRTY',
    ).length,
    arriving: items.filter((room) =>
      room.reservationContexts.some((context) => context.stayContext === 'ARRIVING'),
    ).length,
    reserved: items.filter((room) =>
      room.reservationContexts.some((context) => context.stayContext === 'RESERVED'),
    ).length,
    departing: items.filter((room) =>
      room.reservationContexts.some((context) => context.stayContext === 'DEPARTING'),
    ).length,
    occupied: items.filter((room) => room.occupancy === 'OCCUPIED').length,
    blocked: items.filter((room) => room.blocks.length > 0).length,
  };
}

interface RoomBoardHeaderProps {
  board: StaffRoomBoardResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function RoomBoardHeader({
  board,
  isLoading,
  isRefreshing,
  onRefresh,
}: RoomBoardHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>پذیرش و گردش اتاق</p>
        <h1 id="staff-room-board-title">وضعیت اتاق‌ها</h1>
        <p className={styles.lead}>
          رزرو، حضور مهمان، نظافت و مسدودی هر اتاق را جداگانه بررسی کنید.
        </p>
      </div>
      <div className={styles.freshness}>
        <div>
          <span>تاریخ کاری</span>
          <strong>{board ? displayRoomBoardDate(board.date) : 'در حال دریافت'}</strong>
        </div>
        <div>
          <span>آخرین به‌روزرسانی</span>
          <strong>{board ? displayTimestamp(board.updatedAt) : '—'}</strong>
        </div>
        <button
          className={staffClass('button button--quiet')}
          type="button"
          onClick={onRefresh}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی وضعیت اتاق‌ها'}
        </button>
      </div>
    </header>
  );
}

export function RoomBoardSummary({ items }: { items: StaffRoomBoardItem[] }) {
  const counts = roomBoardCounts(items);
  return (
    <section className={styles.summary} aria-label="خلاصهٔ وضعیت اتاق‌های نمایش‌داده‌شده">
      <div>
        <strong>{formatPersianInteger(counts.ready)}</strong>
        <span>خالی و بازرسی‌شده</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.dirty)}</strong>
        <span>خالی و نیازمند نظافت</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.arriving)}</strong>
        <span>ورود امروز</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.reserved)}</strong>
        <span>رزرو در جریان</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.departing)}</strong>
        <span>خروج امروز</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.occupied)}</strong>
        <span>اشغال با ثبت پذیرش</span>
      </div>
      <div>
        <strong>{formatPersianInteger(counts.blocked)}</strong>
        <span>دارای مسدودی</span>
      </div>
    </section>
  );
}

interface RoomBoardFiltersProps {
  filters: RoomBoardFilters;
  businessDate: string;
  roomTypes: Array<{ id: string; name: string }>;
  floors: string[];
  dateError: string | null;
  disabled: boolean;
  onChange: (field: keyof RoomBoardFilters, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}

export function RoomBoardFiltersForm({
  filters,
  businessDate,
  roomTypes,
  floors,
  dateError,
  disabled,
  onChange,
  onSubmit,
  onClear,
}: RoomBoardFiltersProps) {
  return (
    <form className={styles.panel} onSubmit={onSubmit} aria-label="فیلترهای وضعیت اتاق‌ها">
      <div className={styles.sectionHeading}>
        <div>
          <h2>پیدا کردن اتاق</h2>
          <p>شرایط اقامت و وضعیت اتاق را جداگانه محدود کنید.</p>
        </div>
      </div>
      <div className={styles.filterFields}>
        <div className={styles.field}>
          <label htmlFor="room-board-date">تاریخ تابلو</label>
          <Input
            id="room-board-date"
            value={filters.date}
            onChange={(event) => onChange('date', event.target.value)}
            placeholder={`${displayRoomBoardDate(businessDate)} · پیش‌فرض`}
            inputMode="numeric"
            dir="ltr"
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'room-board-date-error' : 'room-board-date-help'}
          />
          <span id="room-board-date-help">خالی بماند تا تاریخ کاری اقامتگاه نمایش داده شود.</span>
          {dateError ? (
            <span id="room-board-date-error" className={styles.fieldError} role="alert">
              {dateError}
            </span>
          ) : null}
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-type">نوع اتاق</label>
          <NativeSelect
            id="room-board-type"
            value={filters.roomTypeId}
            onChange={(event) => onChange('roomTypeId', event.target.value)}
          >
            <option value="">همهٔ انواع اتاق</option>
            {roomTypes.map((roomType) => (
              <option key={roomType.id} value={roomType.id}>
                {roomType.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-floor">طبقه</label>
          <NativeSelect
            id="room-board-floor"
            value={filters.floor}
            onChange={(event) => onChange('floor', event.target.value)}
          >
            <option value="">همهٔ طبقه‌ها</option>
            {floors.map((floor) => (
              <option key={floor} value={floor}>
                طبقهٔ {floor}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-occupancy">وضعیت حضور</label>
          <NativeSelect
            id="room-board-occupancy"
            value={filters.occupancy}
            onChange={(event) => onChange('occupancy', event.target.value)}
          >
            <option value="">همهٔ وضعیت‌ها</option>
            <option value="VACANT">خالی</option>
            <option value="UNKNOWN">رزرو دارد؛ حضور ثبت نشده</option>
            <option value="OCCUPIED">اشغال؛ پذیرش انجام شده</option>
          </NativeSelect>
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-housekeeping">نظافت</label>
          <NativeSelect
            id="room-board-housekeeping"
            value={filters.housekeepingStatus}
            onChange={(event) => onChange('housekeepingStatus', event.target.value)}
          >
            <option value="">همهٔ وضعیت‌های نظافت</option>
            <option value="DIRTY">نیازمند نظافت</option>
            <option value="CLEAN">نظافت‌شده</option>
            <option value="INSPECTED">بازرسی‌شده</option>
          </NativeSelect>
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-stay">وضعیت رزرو</label>
          <NativeSelect
            id="room-board-stay"
            value={filters.stayContext}
            onChange={(event) => onChange('stayContext', event.target.value)}
          >
            <option value="">همهٔ اقامت‌ها</option>
            <option value="NONE">بدون رزرو فعال</option>
            <option value="ARRIVING">ورود امروز</option>
            <option value="RESERVED">رزرو در جریان</option>
            <option value="IN_HOUSE">اقامت در جریان</option>
            <option value="DEPARTING">خروج امروز</option>
          </NativeSelect>
        </div>
        <div className={styles.field}>
          <label htmlFor="room-board-block">مسدودی</label>
          <NativeSelect
            id="room-board-block"
            value={filters.blockKind}
            onChange={(event) => onChange('blockKind', event.target.value)}
          >
            <option value="">همهٔ مسدودی‌ها</option>
            <option value="NONE">بدون مسدودی</option>
            <option value="OUT_OF_ORDER">خارج از سرویس</option>
            <option value="CAPACITY_CLOSED">ظرفیت بسته</option>
          </NativeSelect>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={staffClass('button button--jade')} type="submit" disabled={disabled}>
          اعمال فیلترها
        </button>
        <button className={staffClass('button button--quiet')} type="button" onClick={onClear}>
          پاک‌کردن فیلترها
        </button>
      </div>
    </form>
  );
}

interface RoomBoardListProps {
  items: StaffRoomBoardItem[];
  date: string;
  isBusy: boolean;
}

export function RoomBoardList({ items, date, isBusy }: RoomBoardListProps) {
  return (
    <section className={styles.panel} aria-labelledby="room-board-list-title" aria-busy={isBusy}>
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="room-board-list-title">اتاق‌های {displayRoomBoardDate(date)}</h2>
          <p>رزرو، حضور ثبت‌شده، نظافت و مسدودی هر اتاق مستقل نمایش داده می‌شوند.</p>
        </div>
        <span>{formatPersianInteger(items.length)} اتاق</span>
      </div>
      {items.length === 0 ? (
        <div className={styles.empty} role="status">
          <h3>اتاقی با این فیلترها پیدا نشد</h3>
          <p>فیلترها را تغییر دهید یا پاک کنید تا همهٔ اتاق‌های تاریخ انتخاب‌شده را ببینید.</p>
        </div>
      ) : (
        <div className={styles.roomList}>
          {items.map((room) => (
            <article
              className={styles.room}
              key={room.id}
              aria-labelledby={`room-board-${room.id}`}
            >
              <div className={styles.roomIdentity}>
                <div>
                  <span>
                    {room.roomType.name} · طبقهٔ {room.floor || 'ثبت‌نشده'}
                  </span>
                  <h3 id={`room-board-${room.id}`}>اتاق {room.roomNumber}</h3>
                </div>
                {!room.isActive ? (
                  <span className={`${styles.pill} ${styles.pillBlocked}`}>غیرفعال</span>
                ) : null}
              </div>
              <div className={styles.roomState}>
                <span className={`${styles.pill} ${styles[`occupancy${room.occupancy}`]}`}>
                  <span aria-hidden="true" />
                  {occupancyLabels[room.occupancy]}
                </span>
                <span
                  className={`${styles.pill} ${styles[`housekeeping${room.housekeepingStatus}`]}`}
                >
                  <span aria-hidden="true" />
                  {housekeepingLabels[room.housekeepingStatus]}
                </span>
              </div>
              <div className={styles.roomStays}>
                {room.reservationContexts.length ? (
                  room.reservationContexts.map((context) => (
                    <div className={styles.stay} key={context.assignmentId}>
                      <strong>{stayLabels[context.stayContext]}</strong>
                      <span>رزرو {context.reference}</span>
                      <span>{context.guestName}</span>
                      <span>
                        {displayRoomBoardDate(context.startDate)} تا خروج{' '}
                        {displayRoomBoardDate(context.endDate)}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className={styles.muted}>رزرو تخصیص‌یافته‌ای برای این تاریخ ندارد.</span>
                )}
              </div>
              <div className={styles.roomBlocks}>
                {room.blocks.length ? (
                  room.blocks.map((block) => (
                    <span className={`${styles.pill} ${styles.pillBlocked}`} key={block.id}>
                      {blockLabels[block.kind]} · {displayRoomBoardDate(block.startDate)} تا{' '}
                      {displayRoomBoardDate(block.endDate)}
                    </span>
                  ))
                ) : (
                  <span className={styles.muted}>بدون مسدودی</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface AssignableBookingsProps {
  board: StaffRoomBoardResponse;
  onEdit: (reference: string, trigger: HTMLButtonElement) => void;
}

function assignmentCountOnDate(
  booking: StaffRoomBoardResponse['assignableBookings'][number],
  date: string,
) {
  return booking.assignments.filter((assignment) =>
    isDateWithinAssignmentInterval(assignment.startDate, assignment.endDate, date),
  ).length;
}

export function AssignableBookings({ board, onEdit }: AssignableBookingsProps) {
  return (
    <section className={styles.panel} aria-labelledby="room-board-bookings-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="room-board-bookings-title">تخصیص اتاق به رزروها</h2>
          <p>تعداد بدون تخصیص فقط برای تاریخ همین تابلو محاسبه شده است.</p>
        </div>
        <span>{formatPersianInteger(board.assignableBookings.length)} رزرو تأییدشده</span>
      </div>
      {board.assignableBookings.length === 0 ? (
        <p className={styles.emptyNote}>برای این تاریخ رزرو تأییدشده‌ای وجود ندارد.</p>
      ) : (
        <div className={styles.bookingList}>
          {board.assignableBookings.map((booking) => (
            <article className={styles.booking} key={booking.reference}>
              <div className={styles.bookingDetails}>
                <h3>{booking.guestName}</h3>
                <p>
                  کد رزرو <bdi dir="ltr">{booking.reference}</bdi> · {booking.roomTypeName}
                </p>
                <p>
                  {displayRoomBoardDate(booking.checkIn)} تا خروج{' '}
                  {displayRoomBoardDate(booking.checkOut)}
                </p>
              </div>
              <div className={styles.bookingCounts}>
                <strong>
                  {formatPersianInteger(booking.unassignedRoomQuantity)} واحد بدون تخصیص
                </strong>
                <span>
                  {formatPersianInteger(assignmentCountOnDate(booking, board.date))} از{' '}
                  {formatPersianInteger(booking.roomQuantity)} واحد برای این تاریخ تخصیص دارد
                </span>
              </div>
              <button
                className={staffClass('button button--quiet')}
                type="button"
                onClick={(event) => onEdit(booking.reference, event.currentTarget)}
              >
                ویرایش تخصیص اتاق {booking.reference}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
