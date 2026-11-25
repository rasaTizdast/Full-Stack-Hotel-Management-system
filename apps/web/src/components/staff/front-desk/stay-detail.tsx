import { Input } from '@/components/ui/input';
import type { FormEvent } from 'react';
import Link from 'next/link';
import type { StaffBookingDetail } from '@/lib/staff-bookings-api';
import { formatPersianInteger, toGregorianIso } from '@/lib/jalali-date';
import { dateLabel } from './front-desk-domain';
import type { AmendmentDraft } from './front-desk-types';
import { frontDeskClasses as styles } from '../tailwind-classes';

interface StayDetailProps {
  id: string;
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

function amendmentChanges(detail: StaffBookingDetail, draft: AmendmentDraft): string[] {
  return [
    draft.guestName !== detail.guestName
      ? `نام مهمان: ${detail.guestName} ← ${draft.guestName}`
      : null,
    draft.guestPhone !== detail.guestPhone ? 'شماره تماس مهمان تغییر می‌کند.' : null,
    draft.guestEmail !== (detail.guestEmail ?? '') ? 'رایانامه مهمان تغییر می‌کند.' : null,
    Number(draft.guestCount) !== detail.guestCount
      ? `تعداد مهمانان: ${formatPersianInteger(detail.guestCount)} ← ${formatPersianInteger(Number(draft.guestCount) || 0)}`
      : null,
    Number(draft.roomQuantity) !== detail.roomQuantity
      ? `تعداد اتاق: ${formatPersianInteger(detail.roomQuantity)} ← ${formatPersianInteger(Number(draft.roomQuantity) || 0)}`
      : null,
    toGregorianIso(draft.checkIn) !== detail.checkIn ? 'تاریخ ورود تغییر می‌کند.' : null,
    toGregorianIso(draft.checkOut) !== detail.checkOut ? 'تاریخ خروج تغییر می‌کند.' : null,
  ].filter((change): change is string => Boolean(change));
}

function StaySummary({
  detail,
  canAmend,
  onEdit,
}: Pick<StayDetailProps, 'detail' | 'canAmend' | 'onEdit'> & { detail: StaffBookingDetail }) {
  return (
    <>
      <dl className={styles.detailFacts}>
        <div>
          <dt>مهمان</dt>
          <dd>{detail.guestName}</dd>
        </div>
        <div>
          <dt>تماس</dt>
          <dd dir="ltr">{detail.guestPhone}</dd>
        </div>
        {detail.guestEmail && (
          <div>
            <dt>رایانامه</dt>
            <dd dir="ltr">{detail.guestEmail}</dd>
          </div>
        )}
        <div>
          <dt>تعداد مهمانان</dt>
          <dd>{formatPersianInteger(detail.guestCount)}</dd>
        </div>
        <div>
          <dt>اتاق</dt>
          <dd>{detail.roomType.name}</dd>
        </div>
        <div>
          <dt>اقامت</dt>
          <dd>
            {dateLabel(detail.checkIn)} تا {dateLabel(detail.checkOut)}
          </dd>
        </div>
      </dl>
      {detail.id && (
        <Link className={styles.secondaryButton} href={`/staff/folios/${detail.id}`}>
          مشاهده صورتحساب اقامت
        </Link>
      )}
      {canAmend && (
        <button className={styles.secondaryButton} type="button" onClick={onEdit}>
          ویرایش جزئیات اقامت
        </button>
      )}
    </>
  );
}

function AmendmentPreview({ changes }: { changes: string[] }) {
  return (
    <section className={styles.preview} aria-label="پیش‌نمایش تغییرات">
      <h3>پیش‌نمایش تغییرات</h3>
      {changes.length ? (
        <ul>
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      ) : (
        <p>تغییری وارد نشده است.</p>
      )}
      <p>
        این پیش‌نمایش فقط فیلدهای تغییرکرده را نشان می‌دهد؛ وضعیت و جزئیات نهایی پس از پاسخ سامانه
        تازه‌سازی می‌شود.
      </p>
    </section>
  );
}

function AmendmentForm({
  detail,
  draft,
  busy,
  onDraftChange,
  onCancelEdit,
  onSubmit,
}: Pick<
  StayDetailProps,
  'detail' | 'draft' | 'busy' | 'onDraftChange' | 'onCancelEdit' | 'onSubmit'
> & { detail: StaffBookingDetail }) {
  const changes = amendmentChanges(detail, draft);
  return (
    <form className={styles.formGrid} onSubmit={onSubmit}>
      <label>
        نام مهمان
        <Input
          value={draft.guestName}
          onChange={(event) => onDraftChange('guestName', event.target.value)}
        />
      </label>
      <label>
        شماره تماس
        <Input
          dir="ltr"
          value={draft.guestPhone}
          onChange={(event) => onDraftChange('guestPhone', event.target.value)}
        />
      </label>
      <label>
        رایانامه
        <Input
          type="email"
          dir="ltr"
          value={draft.guestEmail}
          onChange={(event) => onDraftChange('guestEmail', event.target.value)}
        />
      </label>
      <label>
        تعداد مهمانان
        <Input
          type="number"
          min="1"
          max="20"
          aria-label="تعداد مهمانان"
          value={draft.guestCount}
          onChange={(event) => onDraftChange('guestCount', event.target.value)}
        />
      </label>
      <label>
        تعداد اتاق
        <Input
          type="number"
          min="1"
          max="20"
          aria-label="تعداد اتاق"
          value={draft.roomQuantity}
          onChange={(event) => onDraftChange('roomQuantity', event.target.value)}
        />
      </label>
      <label>
        ورود
        <Input
          inputMode="numeric"
          value={draft.checkIn}
          onChange={(event) => onDraftChange('checkIn', event.target.value)}
        />
      </label>
      <label>
        خروج
        <Input
          inputMode="numeric"
          value={draft.checkOut}
          onChange={(event) => onDraftChange('checkOut', event.target.value)}
        />
      </label>
      <AmendmentPreview changes={changes} />
      <div className={styles.dialogActions}>
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? 'در حال ثبت…' : 'ثبت تغییرات'}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onCancelEdit}
          disabled={busy}
        >
          انصراف
        </button>
      </div>
    </form>
  );
}

export function StayDetail({
  id,
  reference,
  detail,
  loading,
  error,
  canAmend,
  editing,
  draft,
  busy,
  onClose,
  onEdit,
  onCancelEdit,
  onDraftChange,
  onSubmit,
}: StayDetailProps) {
  return (
    <section id={id} className={styles.detailPanel} aria-label={`جزئیات اقامت ${reference}`}>
      <header>
        <div>
          <p className={styles.eyebrow}>جزئیات اقامت</p>
          <h2>{reference}</h2>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          بستن جزئیات
        </button>
      </header>
      {loading && <p role="status">در حال دریافت جزئیات اقامت…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {detail &&
        (editing ? (
          <AmendmentForm
            detail={detail}
            draft={draft}
            busy={busy}
            onDraftChange={onDraftChange}
            onCancelEdit={onCancelEdit}
            onSubmit={onSubmit}
          />
        ) : (
          <StaySummary detail={detail} canAmend={canAmend} onEdit={onEdit} />
        ))}
    </section>
  );
}
