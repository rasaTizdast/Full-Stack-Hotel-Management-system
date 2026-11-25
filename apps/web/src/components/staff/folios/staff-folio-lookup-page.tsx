'use client';

import { useState, type FormEvent } from 'react';
import { lookupStaffFolio, type StaffFolioLookup } from '@/lib/staff-folios-api';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const folioStyles = {
  page: 'grid min-w-0 gap-4 text-foreground',
  header: 'flex min-w-0 items-end justify-between gap-4 max-md:items-start max-md:flex-col',
  eyebrow: 'mb-1 text-[length:var(--text-caption)] font-bold text-accent-brand',
  lead: 'mt-2 max-w-[70ch] text-sm leading-7 text-muted-foreground',
  panel: 'min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5',
  formGrid: 'mt-3 grid grid-cols-1 items-end gap-3 md:grid-cols-3',
  field: 'grid min-w-0 gap-1.5 text-sm font-semibold text-foreground',
  formActions: 'col-span-full flex flex-wrap items-center justify-start gap-3',
  panelHint: 'mt-3 rounded-lg bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive',
  summary: 'grid min-w-0 grid-cols-1 items-stretch gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.5fr)]',
  guestBlock: 'grid content-start gap-1 text-sm text-muted-foreground [&_h2]:m-0 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-primary-strong [&_p:not(:first-child)]:my-1',
  balanceCard: 'grid content-center justify-items-start gap-1 rounded-lg border-s-4 border-highlight bg-surface-soft p-4 max-md:border-s-0 max-md:border-t-4',
};

function formatToman(value: string): string {
  try {
    return `${new Intl.NumberFormat('en-US').format(BigInt(value))} تومان`;
  } catch {
    return `${value} تومان`;
  }
}

function formatDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

export function StaffFolioLookupPage() {
  const [reference, setReference] = useState('');
  const [folio, setFolio] = useState<StaffFolioLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exactReference = reference.trim();
    if (!exactReference) return;

    setBusy(true);
    setError(null);
    setFolio(null);
    try {
      setFolio(await lookupStaffFolio(exactReference));
    } catch {
      setError('صورتحساب فعالی با این کد پیدا نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={folioStyles.page}>
      <header className={folioStyles.header}>
        <div>
          <p className={folioStyles.eyebrow}>فضای صندوق</p>
          <h1>جستجوی صورتحساب</h1>
          <p className={folioStyles.lead}>
            کد رزرو را وارد کنید تا صورتحساب اقامت جاری یا مانده قابل‌دریافت نمایش داده شود.
          </p>
        </div>
      </header>

      <Card className={folioStyles.panel} aria-label="فرم جستجوی صورتحساب">
        <CardContent className="p-0">
        <form className={folioStyles.formGrid} onSubmit={search}>
          <label className={folioStyles.field}>
            <span>کد رزرو</span>
            <Input
              autoComplete="off"
              dir="ltr"
              maxLength={16}
              minLength={8}
              required
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              aria-label="کد رزرو"
            />
          </label>
          <div className={folioStyles.formActions}>
            <Button type="submit" disabled={busy}>
              {busy ? 'در حال جستجو…' : 'جستجوی صورتحساب'}
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className={folioStyles.panelHint}>
            {error}
          </p>
        ) : null}
        </CardContent>
      </Card>

      {folio ? (
        <section className={folioStyles.summary} aria-label="نتیجه جستجوی صورتحساب" aria-live="polite">
          <div className={folioStyles.guestBlock}>
            <p className={folioStyles.eyebrow}>مهمان</p>
            <h2>{folio.guestName}</h2>
            <p>
              کد رزرو: <bdi dir="ltr">{folio.reference}</bdi>
            </p>
            <p>
              ورود {formatDate(folio.checkIn)} · خروج {formatDate(folio.checkOut)}
            </p>
            <p>{folio.folioStatus === 'OPEN' ? 'اقامت جاری' : 'مانده قابل‌دریافت'}</p>
          </div>
          <div className={folioStyles.balanceCard}>
            <span>مانده صورتحساب</span>
            <strong>{formatToman(folio.balanceToman)}</strong>
          </div>
          <div className={folioStyles.formActions}>
            <ButtonLink href={`/staff/folios/${folio.bookingId}`}>
              باز کردن صورتحساب
            </ButtonLink>
          </div>
        </section>
      ) : null}
    </main>
  );
}
