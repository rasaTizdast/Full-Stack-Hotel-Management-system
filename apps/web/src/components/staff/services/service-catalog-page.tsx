'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StaffApiError } from '@/lib/staff-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  createStaffServiceItem,
  getStaffServiceItems,
  updateStaffServiceItem,
  type StaffServiceItem,
  type StaffServiceItemInput,
} from '@/lib/staff-folios-api';
import { useStaffSession } from '../staff-session-provider';

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
      <p
        className={'m-0 rounded-xl bg-muted px-4 py-3 text-sm leading-7 text-muted-foreground'}
        role="status"
      >
        در حال دریافت فهرست خدمات…
      </p>
    );
  }
  if (!canManage) {
    return (
      <main className={'grid min-w-0 gap-4 text-foreground'}>
        <h1 className="text-3xl font-bold text-primary-strong">فهرست خدمات</h1>
        <p
          className={
            'm-0 rounded-xl bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive'
          }
          role="alert"
        >
          مدیریت خدمات برای نقش شما فعال نیست.
        </p>
      </main>
    );
  }

  return (
    <main className={'grid min-w-0 gap-4 text-foreground'}>
      <header
        className={'flex flex-col items-start justify-between gap-4 pb-2 sm:flex-row sm:items-end'}
      >
        <div>
          <p className={'mb-1 text-xs font-bold text-accent-brand'}>خدمات اقامتگاه</p>
          <h1 className="text-3xl font-bold text-primary-strong">فهرست خدمات</h1>
          <p className={'mt-2 max-w-prose text-sm leading-7 text-muted-foreground'}>
            قیمت هر خدمت هنگام ثبت در صورتحساب ذخیره می‌شود و تغییر امروز، ثبت‌های قبلی را عوض
            نمی‌کند.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            setIsLoading(true);
            void load();
          }}
        >
          تازه‌سازی فهرست
        </Button>
      </header>

      {error && (
        <p
          className={
            'm-0 rounded-xl bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive'
          }
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          className={'m-0 rounded-xl bg-success-soft px-4 py-3 text-sm leading-7 text-success'}
          role="status"
        >
          {success}
        </p>
      )}

      <section aria-labelledby="service-create-heading">
        <Card className="rounded-2xl border-border p-4 sm:p-5">
          <div
            className={
              'flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center'
            }
          >
            <div>
              <p className={'mb-1 text-xs font-bold text-accent-brand'}>ثبت خدمت جدید</p>
              <h2 id="service-create-heading" className="text-lg font-bold text-primary-strong">
                افزودن به فهرست
              </h2>
            </div>
            <span
              className={
                'inline-flex shrink-0 items-center rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground'
              }
            >
              {items.length} خدمت
            </span>
          </div>
          <form
            className={'mt-4 grid grid-cols-1 items-end gap-3 lg:grid-cols-3'}
            onSubmit={(event) => void createItem(event)}
          >
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
              <span>نام خدمت</span>
              <Input
                value={form.name}
                maxLength={120}
                required
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
              <span>دسته‌بندی</span>
              <Input
                value={form.category}
                maxLength={80}
                required
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
              <span>قیمت فعلی · تومان</span>
              <Input
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
            <div className={'col-span-full flex flex-wrap items-center justify-start gap-3'}>
              <Button type="submit" disabled={isCreating || !csrfToken}>
                {isCreating ? 'در حال ذخیره…' : 'افزودن خدمت'}
              </Button>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="service-list-heading">
        <Card className="rounded-2xl border-border p-4 sm:p-5">
          <div
            className={
              'flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center'
            }
          >
            <div>
              <p className={'mb-1 text-xs font-bold text-accent-brand'}>قیمت‌های قابل استفاده</p>
              <h2 id="service-list-heading" className="text-lg font-bold text-primary-strong">
                خدمات ثبت‌شده
              </h2>
            </div>
            <span className={'mt-2 max-w-prose text-sm leading-7 text-muted-foreground'}>
              غیرفعال‌سازی، ردیف‌های پیشین را نگه می‌دارد.
            </span>
          </div>
          {items.length === 0 ? (
            <p
              className={
                'm-0 rounded-xl bg-surface-soft px-4 py-3 text-sm leading-7 text-muted-foreground'
              }
            >
              هنوز خدمتی ثبت نشده است.
            </p>
          ) : (
            <div className={'mt-4 grid gap-3'}>
              {items.map((item) => {
                const draft = drafts[item.id];
                if (!draft) return null;
                return (
                  <Card
                    role="article"
                    className="grid gap-3 rounded-2xl border-border bg-surface-soft p-4"
                    key={item.id}
                    aria-label={`ویرایش خدمت ${item.name}`}
                  >
                    <div
                      className={
                        'flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center'
                      }
                    >
                      <div>
                        <h3 className="text-base font-bold text-primary-strong">{item.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.category} ·{' '}
                          <span dir="ltr">{formatToman(item.currentPriceToman)}</span> تومان
                        </p>
                      </div>
                      <Badge variant={item.isActive ? 'success' : 'secondary'}>
                        {item.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    </div>
                    <div className={'mt-4 grid grid-cols-1 items-end gap-3 lg:grid-cols-3'}>
                      <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
                        <span>نام خدمت</span>
                        <Input
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
                      <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
                        <span>دسته‌بندی</span>
                        <Input
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
                      <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground">
                        <span>قیمت فعلی · تومان</span>
                        <Input
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
                      <label
                        className="col-span-full flex items-center gap-2 text-sm text-foreground"
                      >
                        <Checkbox
                          checked={draft.isActive}
                          onCheckedChange={(checked) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.id]: { ...draft, isActive: checked },
                            }))
                          }
                        />
                        <span>برای ثبت‌های جدید فعال باشد</span>
                      </label>
                    </div>
                    <div
                      className={'col-span-full flex flex-wrap items-center justify-start gap-3'}
                    >
                      <Button
                        type="button"
                        disabled={busyId === item.id || !csrfToken}
                        onClick={() => void saveItem(item)}
                      >
                        {busyId === item.id ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
