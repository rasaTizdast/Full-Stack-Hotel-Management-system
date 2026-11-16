import type { FormEvent, RefObject } from 'react';
import Link from 'next/link';
import type { StaffRoomBoardItem } from '@/lib/staff-api';
import type { StaffStayWorklistItem } from '@/lib/staff-front-desk-api';
import { assignmentsOnDate } from './front-desk-domain';
import { StaffDialogSurface } from './staff-dialog-surface';
import styles from './staff-front-desk.module.css';

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

export function ActionDialog({ kind, stay, manager, reason, error, roomRecovery, busy, headingRef, onReasonChange, onClose, onSubmit }: ActionDialogProps) {
  const checkIn = kind === 'check-in';
  const title = checkIn ? 'تأیید ورود مهمان' : 'ثبت عدم مراجعه مهمان';
  return (
    <StaffDialogSurface labelledBy="action-dialog-title" onClose={onClose}>
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
    </StaffDialogSurface>
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
  headingRef: RefObject<HTMLHeadingElement | null>;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function MoveDialog({ stay, businessDate, rooms, loading, reason, error, roomRecovery, busy, headingRef, onReasonChange, onClose, onSubmit }: MoveDialogProps) {
  const activeAssignments = assignmentsOnDate(stay, businessDate);
  return (
    <StaffDialogSurface labelledBy="move-dialog-title" onClose={onClose}>
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
    </StaffDialogSurface>
  );
}
