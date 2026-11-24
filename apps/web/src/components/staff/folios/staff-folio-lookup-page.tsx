'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { lookupStaffFolio, type StaffFolioLookup } from '@/lib/staff-folios-api';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import styles from './folios.module.css';

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
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>فضای صندوق</p>
          <h1>جستجوی صورتحساب</h1>
          <p className={styles.lead}>
            کد رزرو را وارد کنید تا صورتحساب اقامت جاری یا مانده قابل‌دریافت نمایش داده شود.
          </p>
        </div>
      </header>

      <section className={styles.panel} aria-label="فرم جستجوی صورتحساب">
        <form className={styles.formGrid} onSubmit={search}>
          <label className={styles.field}>
            <span>کد رزرو</span>
            <input
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
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'در حال جستجو…' : 'جستجوی صورتحساب'}
            </button>
          </div>
        </form>
        {error ? (
          <p role="alert" className={styles.panelHint}>
            {error}
          </p>
        ) : null}
      </section>

      {folio ? (
        <section className={styles.summary} aria-label="نتیجه جستجوی صورتحساب" aria-live="polite">
          <div className={styles.guestBlock}>
            <p className={styles.eyebrow}>مهمان</p>
            <h2>{folio.guestName}</h2>
            <p>
              کد رزرو: <bdi dir="ltr">{folio.reference}</bdi>
            </p>
            <p>
              ورود {formatDate(folio.checkIn)} · خروج {formatDate(folio.checkOut)}
            </p>
            <p>{folio.folioStatus === 'OPEN' ? 'اقامت جاری' : 'مانده قابل‌دریافت'}</p>
          </div>
          <div className={styles.balanceCard}>
            <span>مانده صورتحساب</span>
            <strong>{formatToman(folio.balanceToman)}</strong>
          </div>
          <div className={styles.formActions}>
            <Link className={styles.primaryButton} href={`/staff/folios/${folio.bookingId}`}>
              باز کردن صورتحساب
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
