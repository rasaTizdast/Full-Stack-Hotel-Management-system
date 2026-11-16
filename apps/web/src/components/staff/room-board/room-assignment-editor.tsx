import { useEffect, useRef, type FormEvent } from 'react';
import { formatPersianInteger, toGregorianIso } from '@/lib/jalali-date';
import type {
  StaffRoomBoardAssignableBooking,
  StaffRoomBoardItem,
} from '@/lib/staff-api';
import { displayRoomBoardDate } from './room-board-view';
import styles from './room-board.module.css';

export interface DraftAssignment {
  key: number;
  roomId: string;
  roomNumber: string;
  startDate: string;
  endDate: string;
}

export type StaleConflict =
  | { state: 'loading' }
  | { state: 'ready'; booking: StaffRoomBoardAssignableBooking }
  | { state: 'error'; message: string };

interface RoomAssignmentEditorProps {
  booking: StaffRoomBoardAssignableBooking;
  boardDate: string;
  rooms: StaffRoomBoardItem[];
  assignments: DraftAssignment[];
  reason: string;
  editorError: string | null;
  staleConflict: StaleConflict | null;
  isSaving: boolean;
  onClose: () => void;
  onUpdate: (key: number, field: 'roomId' | 'startDate' | 'endDate', value: string) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
  onReasonChange: (value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onLoadLatest: () => void;
  onChooseLatest: (booking: StaffRoomBoardAssignableBooking) => void;
  onReapplyDraft: (booking: StaffRoomBoardAssignableBooking) => void;
}

function includesDate(startInput: string, endInput: string, date: string): boolean {
  const startDate = toGregorianIso(startInput);
  const endDate = toGregorianIso(endInput);
  if (startDate && endDate) return startDate <= date && date < endDate;
  return false;
}

export function RoomAssignmentEditor({
  booking,
  boardDate,
  rooms,
  assignments,
  reason,
  editorError,
  staleConflict,
  isSaving,
  onClose,
  onUpdate,
  onRemove,
  onAdd,
  onReasonChange,
  onSave,
  onLoadLatest,
  onChooseLatest,
  onReapplyDraft,
}: RoomAssignmentEditorProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.current?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [booking.reference]);

  function roomOptionsFor(assignment: DraftAssignment) {
    const occupiedInDraft = new Set(
      assignments
        .filter((candidate) => candidate.key !== assignment.key)
        .map((candidate) => candidate.roomId),
    );
    return rooms.filter(
      (room) =>
        room.isActive &&
        room.roomType.id === booking.roomTypeId &&
        (!occupiedInDraft.has(room.id) || room.id === assignment.roomId) &&
        room.blocks.length === 0 &&
        room.reservationContexts.every((context) => context.reference === booking.reference),
    );
  }

  return (
    <section className={styles.editor} aria-labelledby="room-board-editor-title">
      <div className={`${styles.sectionHeading} ${styles.editorHeading}`}>
        <div>
          <p className={styles.eyebrow}>ویرایش کامل تخصیص</p>
          <h2 id="room-board-editor-title" ref={heading} tabIndex={-1}>
            رزرو {booking.reference} · {booking.guestName}
          </h2>
          <p>{booking.roomTypeName} · {displayRoomBoardDate(booking.checkIn)} تا خروج {displayRoomBoardDate(booking.checkOut)}</p>
        </div>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={isSaving}>
          بستن و بازگشت
        </button>
      </div>

      <p className={styles.editorNote}>
        همهٔ بازه‌های فعال این رزرو در پیش‌نویس هستند؛ بازه‌هایی که تاریخ تابلو را در بر نمی‌گیرند هنگام ذخیره حفظ می‌شوند، مگر اینکه خودتان آن‌ها را تغییر دهید یا حذف کنید.
      </p>
      {editorError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{editorError}</p> : null}

      {staleConflict ? (
        <div className={styles.conflict} aria-live="polite">
          {staleConflict.state === 'loading' ? <p role="status">در حال دریافت آخرین تخصیص‌های این رزرو…</p> : null}
          {staleConflict.state === 'error' ? (
            <div role="alert">
              <p>{staleConflict.message}</p>
              <button className="button button--quiet" type="button" onClick={onLoadLatest}>
                دریافت دوبارهٔ آخرین تخصیص‌ها
              </button>
            </div>
          ) : null}
          {staleConflict.state === 'ready' ? (
            <>
              <h3>آخرین تخصیص ثبت‌شده</h3>
              <p>پیش‌نویس فعلی شما جداگانه حفظ شده است. یکی از دو تصمیم را انتخاب کنید.</p>
              <div className={styles.latestAssignments} role="region" aria-label="آخرین تخصیص‌های ثبت‌شده">
                {staleConflict.booking.assignments.length ? staleConflict.booking.assignments.map((assignment) => (
                  <span key={assignment.id}>{assignment.roomNumber} · {displayRoomBoardDate(assignment.startDate)} تا خروج {displayRoomBoardDate(assignment.endDate)}</span>
                )) : <span>در نسخهٔ جدید تخصیصی ثبت نشده است.</span>}
              </div>
              <div className={styles.editorActions}>
                <button className="button button--quiet" type="button" onClick={() => onChooseLatest(staleConflict.booking)}>
                  بارگذاری آخرین تخصیص‌ها
                </button>
                <button className="button button--jade" type="button" onClick={() => onReapplyDraft(staleConflict.booking)}>
                  اعمال پیش‌نویس من با نسخهٔ جدید
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <form className={styles.assignmentForm} onSubmit={onSave} aria-label={`ویرایش تخصیص رزرو ${booking.reference}`}>
        <div className={styles.assignmentList}>
          {assignments.map((assignment, index) => {
            const options = roomOptionsFor(assignment);
            const boardDateIncluded = includesDate(assignment.startDate, assignment.endDate, boardDate);
            const displayRoomNumber = assignment.roomNumber || String(index + 1);
            return (
              <fieldset className={styles.assignment} key={assignment.key} aria-label={`تخصیص اتاق ${displayRoomNumber}`}>
                <legend>تخصیص اتاق {displayRoomNumber}</legend>
                {!boardDateIncluded ? <p className={styles.outsideDate}>این بازه شامل تاریخ تابلو نیست؛ در پیش‌نویس حفظ می‌شود.</p> : null}
                <div className={styles.assignmentFields}>
                  <div className={styles.field}>
                    <label htmlFor={`room-board-assignment-room-${assignment.key}`}>اتاق تخصیص {displayRoomNumber}</label>
                    <select
                      id={`room-board-assignment-room-${assignment.key}`}
                      value={assignment.roomId}
                      onChange={(event) => onUpdate(assignment.key, 'roomId', event.target.value)}
                    >
                      <option value="">انتخاب اتاق آزاد</option>
                      {options.map((room) => <option key={room.id} value={room.id}>اتاق {room.roomNumber} · طبقهٔ {room.floor || 'ثبت‌نشده'}</option>)}
                    </select>
                    <span>آزادبودن اتاق در تمام بازهٔ انتخابی را سامانه هنگام ذخیره بررسی می‌کند.</span>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`room-board-assignment-start-${assignment.key}`}>شروع تخصیص اتاق {displayRoomNumber}</label>
                    <input
                      id={`room-board-assignment-start-${assignment.key}`}
                      value={assignment.startDate}
                      onChange={(event) => onUpdate(assignment.key, 'startDate', event.target.value)}
                      inputMode="numeric"
                      dir="ltr"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`room-board-assignment-end-${assignment.key}`}>پایان تخصیص اتاق {displayRoomNumber}</label>
                    <input
                      id={`room-board-assignment-end-${assignment.key}`}
                      value={assignment.endDate}
                      onChange={(event) => onUpdate(assignment.key, 'endDate', event.target.value)}
                      inputMode="numeric"
                      dir="ltr"
                    />
                    <span>تاریخ خروج در بازهٔ تخصیص گنجانده نمی‌شود.</span>
                  </div>
                </div>
                <button
                  className="button button--danger-quiet"
                  type="button"
                  onClick={() => onRemove(assignment.key)}
                  disabled={isSaving}
                  aria-label={`حذف اتاق ${displayRoomNumber} از تخصیص`}
                >
                  حذف این بازه
                </button>
              </fieldset>
            );
          })}
        </div>
        <div className={styles.editorFooter}>
          <div className={styles.field}>
            <label htmlFor="room-board-assignment-reason">دلیل تغییر تخصیص</label>
            <textarea
              id="room-board-assignment-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => onReasonChange(event.target.value)}
              required
              rows={3}
            />
          </div>
          <p>{formatPersianInteger(booking.unassignedRoomQuantity)} واحد برای تاریخ تابلو بدون تخصیص است.</p>
          <div className={styles.editorActions}>
            <button
              className="button button--quiet"
              type="button"
              onClick={onAdd}
              disabled={isSaving || assignments.length >= booking.roomQuantity}
            >
              افزودن اتاق به تخصیص
            </button>
            <button className="button button--jade" type="submit" disabled={isSaving || Boolean(staleConflict)}>
              {isSaving ? 'در حال ذخیره…' : 'ذخیره تخصیص‌ها'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
