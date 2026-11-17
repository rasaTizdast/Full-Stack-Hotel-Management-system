import type { FormEvent, RefObject } from 'react';
import type { PublicRoomType } from '@/lib/public-api';
import type { WalkInDraft } from './front-desk-types';
import { StaffDialogSurface } from './staff-dialog-surface';
import styles from './staff-front-desk.module.css';

interface WalkInDialogProps {
  roomTypes: PublicRoomType[];
  roomTypesStatus: 'ready' | 'error';
  draft: WalkInDraft;
  error: string | null;
  fieldError: string | null;
  retry: boolean;
  busy: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onStartNewRequest: () => void;
  onRetryRoomTypes: () => void;
  onDraftChange: (key: keyof WalkInDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface RoomTypeNoticeProps {
  status: 'ready' | 'error';
  onRetry: () => void;
  busy: boolean;
}

function RoomTypeNotice({ status, onRetry, busy }: RoomTypeNoticeProps) {
  const failed = status === 'error';
  return (
    <div className={styles.notice}>
      {failed
        ? <p className={styles.error} role="alert">فهرست نوع اتاق دریافت نشد. اتصال را بررسی و دوباره تلاش کنید.</p>
        : <p role="status">هیچ نوع اتاق فعالی برای ثبت ورود حضوری در دسترس نیست.</p>}
      <button className={styles.secondaryButton} type="button" onClick={onRetry} disabled={busy}>
        {failed ? 'تلاش دوباره برای دریافت فهرست نوع اتاق‌ها' : 'به‌روزرسانی فهرست نوع اتاق‌ها'}
      </button>
    </div>
  );
}

interface WalkInFieldsProps {
  roomTypes: PublicRoomType[];
  draft: WalkInDraft;
  disabled: boolean;
  onDraftChange: (key: keyof WalkInDraft, value: string) => void;
}

function WalkInFields({ roomTypes, draft, disabled, onDraftChange }: WalkInFieldsProps) {
  return (
    <>
      <label>نام مهمان<input aria-label="نام مهمان" name="guestName" autoComplete="name" required minLength={2} maxLength={160} value={draft.guestName} disabled={disabled} onChange={(event) => onDraftChange('guestName', event.target.value)} /></label>
      <label>شماره تماس<input aria-label="شماره تماس" name="guestPhone" type="tel" autoComplete="tel" required inputMode="tel" dir="ltr" value={draft.guestPhone} disabled={disabled} onChange={(event) => onDraftChange('guestPhone', event.target.value)} /></label>
      <label>نوع اتاق<select aria-label="نوع اتاق" required value={draft.roomTypeSlug} disabled={disabled} onChange={(event) => onDraftChange('roomTypeSlug', event.target.value)}>
        <option value="">انتخاب کنید</option>{roomTypes.map((roomType) => <option key={roomType.slug} value={roomType.slug}>{roomType.name}</option>)}
      </select></label>
      <label>تاریخ خروج<input aria-label="تاریخ خروج" required inputMode="numeric" placeholder="۱۴۰۵/۰۸/۲۸" value={draft.checkOut} disabled={disabled} onChange={(event) => onDraftChange('checkOut', event.target.value)} /></label>
      <label>تعداد مهمانان<input aria-label="تعداد مهمانان" type="number" min="1" max="20" required value={draft.guestCount} disabled={disabled} onChange={(event) => onDraftChange('guestCount', event.target.value)} /></label>
      <label>تعداد اتاق<input aria-label="تعداد اتاق" type="number" min="1" max="20" required value={draft.roomQuantity} disabled={disabled} onChange={(event) => onDraftChange('roomQuantity', event.target.value)} /></label>
      <label className={styles.wideField}>رایانامه، در صورت تمایل<input aria-label="رایانامه" name="guestEmail" type="email" autoComplete="email" dir="ltr" value={draft.guestEmail} disabled={disabled} onChange={(event) => onDraftChange('guestEmail', event.target.value)} /></label>
    </>
  );
}

interface WalkInRetryWarningProps {
  onStartNewRequest: () => void;
  busy: boolean;
}

function WalkInRetryWarning({ onStartNewRequest, busy }: WalkInRetryWarningProps) {
  return (
    <div className={styles.retryNote} role="note" aria-label="هشدار درباره درخواست ناموفق">
      <p>پاسخ درخواست قبلی دریافت نشد و ممکن است در سامانه ثبت شده باشد. برای جلوگیری از ثبت تکراری، تلاش دوباره با همان اطلاعات و همان شناسه امن انجام می‌شود.</p>
      <p>اگر اطلاعات را تغییر دهید و درخواست تازه‌ای بسازید، ممکن است اقامت تکراری ثبت شود. ابتدا وضعیت درخواست قبلی را بررسی کنید.</p>
      <button className={styles.secondaryButton} type="button" onClick={onStartNewRequest} disabled={busy}>لغو تلاش و شروع درخواست جدید</button>
    </div>
  );
}

export function WalkInDialog({ roomTypes, roomTypesStatus, draft, error, fieldError, retry, busy, headingRef, onClose, onStartNewRequest, onRetryRoomTypes, onDraftChange, onSubmit }: WalkInDialogProps) {
  const hasRoomTypes = roomTypes.length > 0;
  return (
    <StaffDialogSurface labelledBy="walk-in-title" onClose={onClose}>
      <h2 id="walk-in-title" tabIndex={-1} ref={headingRef}>ثبت ورود بدون رزرو قبلی</h2>
      <p>این اقامت با تاریخ کاری امروز ثبت می‌شود. ظرفیت و نرخ نهایی را سامانه بررسی می‌کند.</p>
      <form className={styles.formGrid} onSubmit={onSubmit}>
        {hasRoomTypes
          ? <WalkInFields roomTypes={roomTypes} draft={draft} disabled={busy || retry} onDraftChange={onDraftChange} />
          : <RoomTypeNotice status={roomTypesStatus} onRetry={onRetryRoomTypes} busy={busy} />}
        {hasRoomTypes && fieldError && <p className={styles.error} role="alert">{fieldError}</p>}
        {hasRoomTypes && error && <p className={styles.error} role="alert">{error}</p>}
        {hasRoomTypes && retry && <WalkInRetryWarning onStartNewRequest={onStartNewRequest} busy={busy} />}
        <div className={styles.dialogActions}>
          {hasRoomTypes && <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : retry ? 'تلاش دوباره با همان درخواست' : 'ثبت ورود قطعی'}</button>}
          <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={busy}>بازگشت</button>
        </div>
      </form>
    </StaffDialogSurface>
  );
}
