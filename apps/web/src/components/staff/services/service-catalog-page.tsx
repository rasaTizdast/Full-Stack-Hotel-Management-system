'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StaffApiError } from '@/lib/staff-api';
import {
  createStaffServiceItem,
  getStaffServiceItems,
  updateStaffServiceItem,
  type StaffServiceItem,
  type StaffServiceItemInput,
} from '@/lib/staff-folios-api';
import { useStaffSession } from '../staff-session-provider';
import styles from './services.module.css';

interface ServiceDraft extends StaffServiceItemInput {
  isActive: boolean;
}

const EMPTY_FORM: StaffServiceItemInput = { name: '', category: '', currentPriceToman: '' };

function errorMessage(error: unknown): string {
  if (error instanceof StaffApiError && error.status === 409) {
    return 'نام این خدمت از قبل در فهرست ثبت شده است.';
  }
  if (error instanceof Error) return error.message;
  return 'ذخیره انجام نشد. دوباره تلاش کنید.';
}

function formatToman(value: string): string {
  try {
    return new Intl.NumberFormat('en-US').format(BigInt(value));
  } catch {
    return value;
  }
}

export function ServiceCatalogPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const canManage =
    status === 'authenticated' && (staff?.role === 'ADMIN' || staff?.role === 'MANAGER');
  const [items, setItems] = useState<StaffServiceItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await getStaffServiceItems();
      setError(null);
      setItems(response.items);
      setDrafts(
        Object.fromEntries(
          response.items.map((item) => [
            item.id,
            {
              name: item.name,
              category: item.category,
              currentPriceToman: item.currentPriceToman,
              isActive: item.isActive,
            },
          ]),
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    if (!/^[1-9]\d*$/.test(form.currentPriceToman)) {
      setError('قیمت باید یک عدد صحیح مثبت به تومان باشد.');
      return;
    }
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await createStaffServiceItem(form, csrfToken);
      setForm(EMPTY_FORM);
      setSuccess('خدمت جدید به فهرست اضافه شد.');
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsCreating(false);
    }
  }

  async function saveItem(item: StaffServiceItem) {
    if (!csrfToken) return;
    const draft = drafts[item.id];
    if (!draft) return;
    if (!/^[1-9]\d*$/.test(draft.currentPriceToman)) {
      setError('قیمت باید یک عدد صحیح مثبت به تومان باشد.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateStaffServiceItem(item.id, draft, csrfToken);
      setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setDrafts((current) => ({
        ...current,
        [updated.id]: {
          name: updated.name,
          category: updated.category,
          currentPriceToman: updated.currentPriceToman,
          isActive: updated.isActive,
        },
      }));
      setSuccess('تغییرات خدمت ذخیره شد؛ ردیف‌های قبلی صورتحساب ثابت می‌مانند.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <p className={styles.status} role="status">
        در حال دریافت فهرست خدمات…
      </p>
    );
  }
  if (!canManage) {
    return (
      <main className={styles.page}>
        <h1>فهرست خدمات</h1>
        <p className={styles.error} role="alert">
          مدیریت خدمات برای نقش شما فعال نیست.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>خدمات اقامتگاه</p>
          <h1>فهرست خدمات</h1>
          <p className={styles.lead}>
            قیمت هر خدمت هنگام ثبت در صورتحساب ذخیره می‌شود و تغییر امروز، ثبت‌های قبلی را عوض
            نمی‌کند.
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            setIsLoading(true);
            void load();
          }}
        >
          تازه‌سازی فهرست
        </button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          {success}
        </p>
      )}

      <section className={styles.panel} aria-labelledby="service-create-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ثبت خدمت جدید</p>
            <h2 id="service-create-heading">افزودن به فهرست</h2>
          </div>
          <span className={styles.count}>{items.length} خدمت</span>
        </div>
        <form className={styles.formGrid} onSubmit={(event) => void createItem(event)}>
          <label className={styles.field}>
            <span>نام خدمت</span>
            <input
              value={form.name}
              maxLength={120}
              required
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>دسته‌بندی</span>
            <input
              value={form.category}
              maxLength={80}
              required
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
          </label>
          <label className={styles.field}>
            <span>قیمت فعلی · تومان</span>
            <input
              dir="ltr"
              inputMode="numeric"
              pattern="[0-9]+"
              value={form.currentPriceToman}
              required
              onChange={(event) =>
                setForm((current) => ({ ...current, currentPriceToman: event.target.value }))
              }
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={isCreating || !csrfToken}
            >
              {isCreating ? 'در حال ذخیره…' : 'افزودن خدمت'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="service-list-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>قیمت‌های قابل استفاده</p>
            <h2 id="service-list-heading">خدمات ثبت‌شده</h2>
          </div>
          <span className={styles.panelHint}>غیرفعال‌سازی، ردیف‌های پیشین را نگه می‌دارد.</span>
        </div>
        {items.length === 0 ? (
          <p className={styles.emptyState}>هنوز خدمتی ثبت نشده است.</p>
        ) : (
          <div className={styles.serviceList}>
            {items.map((item) => {
              const draft = drafts[item.id];
              if (!draft) return null;
              return (
                <article
                  className={styles.serviceRow}
                  key={item.id}
                  aria-label={`ویرایش خدمت ${item.name}`}
                >
                  <div className={styles.serviceSummary}>
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {item.category} ·{' '}
                        <span dir="ltr">{formatToman(item.currentPriceToman)}</span> تومان
                      </p>
                    </div>
                    <span className={item.isActive ? styles.activeBadge : styles.inactiveBadge}>
                      {item.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>نام خدمت</span>
                      <input
                        value={draft.name}
                        maxLength={120}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, name: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>دسته‌بندی</span>
                      <input
                        value={draft.category}
                        maxLength={80}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, category: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>قیمت فعلی · تومان</span>
                      <input
                        dir="ltr"
                        inputMode="numeric"
                        pattern="[0-9]+"
                        value={draft.currentPriceToman}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, currentPriceToman: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className={styles.checkField}>
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, isActive: event.target.checked },
                          }))
                        }
                      />
                      <span>برای ثبت‌های جدید فعال باشد</span>
                    </label>
                  </div>
                  <div className={styles.formActions}>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={busyId === item.id || !csrfToken}
                      onClick={() => void saveItem(item)}
                    >
                      {busyId === item.id ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
