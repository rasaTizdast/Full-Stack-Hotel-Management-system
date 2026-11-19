'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  createStaffAdminAccount,
  deactivateStaffAdminAccount,
  getStaffAdminAccounts,
  updateStaffAdminAccountRole,
  type StaffAdminAccount,
  type StaffAdminAccountsPage as StaffAdminAccountsResult,
} from '@/lib/staff-admin-api';
import { formatGregorianAsJalali } from '@/lib/jalali-date';
import { getStaffRoleLabel } from '@/lib/staff-navigation';
import type { StaffRole } from '@/lib/staff-api';
import { useStaffSession } from './staff-session-provider';

const PAGE_SIZE = 25;
const roles: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPER', 'CASHIER'];

type AccountAction = { account: StaffAdminAccount; kind: 'role' | 'deactivate' } | null;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'درخواست انجام نشد. دوباره تلاش کنید.';
}

function createdDate(value: string): string {
  const dateOnly = formatGregorianAsJalali(value);
  if (dateOnly) return dateOnly;

  const instant = new Date(value);
  if (!value.includes('T') || Number.isNaN(instant.getTime())) return value;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const gregorianDate = [part('year'), part('month'), part('day')].join('-');
  const jalaliDate = formatGregorianAsJalali(gregorianDate);
  if (!jalaliDate) return value;

  const tehranTime = new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return `${jalaliDate}، ${tehranTime}`;
}

function shouldShowAccountEmail(account: StaffAdminAccount): boolean {
  return account.email.trim().toLowerCase() !== account.username.trim().toLowerCase();
}

export function StaffAccountsPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const [result, setResult] = useState<StaffAdminAccountsResult | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('RECEPTIONIST');
  const [action, setAction] = useState<AccountAction>(null);
  const [actionRole, setActionRole] = useState<StaffRole>('RECEPTIONIST');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isAdmin = status === 'authenticated' && staff?.role === 'ADMIN';
  const loadRequestId = useRef(0);

  const loadAccounts = useCallback(async (requestedPage: number) => {
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getStaffAdminAccounts(requestedPage, PAGE_SIZE);
      if (requestId !== loadRequestId.current) return;
      setResult(response);
    } catch (cause) {
      if (requestId !== loadRequestId.current) return;
      setLoadError(errorText(cause));
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadAccounts(page);
    });
    return () => {
      active = false;
      loadRequestId.current += 1;
    };
  }, [isAdmin, loadAccounts, page]);

  if (status !== 'authenticated' || !staff) return null;
  if (!isAdmin) {
    return (
      <section className="staff-accounts-denied" aria-labelledby="staff-accounts-denied-title">
        <h1 id="staff-accounts-denied-title">دسترسی به مدیریت کارکنان</h1>
        <p role="alert">این بخش فقط برای مدیر اقامتگاه در دسترس است.</p>
        <Link href="/staff">بازگشت به نمای کلی</Link>
      </section>
    );
  }

  function beginAction(account: StaffAdminAccount, kind: 'role' | 'deactivate') {
    setAction({ account, kind });
    setActionRole(account.role);
    setReason('');
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || isSaving) return;
    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim();
    try {
      const created = await createStaffAdminAccount(
        { username: normalizedUsername, email: normalizedEmail, initialPassword, role: newRole },
        csrfToken,
      );
      setUsername('');
      setEmail('');
      setInitialPassword('');
      setNewRole('RECEPTIONIST');
      setResult((current) => {
        if (!current || current.page !== 1) return current;
        return {
          ...current,
          items: [created, ...current.items].slice(0, current.pageSize),
          total: current.total + 1,
        };
      });
      if (page !== 1) setPage(1);
      setSuccessMessage(`حساب ${created.username} ایجاد شد.`);
    } catch (cause) {
      setFormError(errorText(cause));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAccountAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !csrfToken || isSaving) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setFormError(
        action.kind === 'role' ? 'دلیل تغییر نقش را وارد کنید.' : 'دلیل غیرفعال‌سازی را وارد کنید.',
      );
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const updated =
        action.kind === 'role'
          ? await updateStaffAdminAccountRole(
              action.account.id,
              actionRole,
              trimmedReason,
              csrfToken,
            )
          : await deactivateStaffAdminAccount(action.account.id, trimmedReason, csrfToken);
      setResult((current) =>
        current
          ? { ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setSuccessMessage(
        action.kind === 'role'
          ? `نقش ${updated.username} تغییر کرد.`
          : `حساب ${updated.username} غیرفعال شد.`,
      );
      setAction(null);
      setReason('');
    } catch (cause) {
      setFormError(errorText(cause));
    } finally {
      setIsSaving(false);
    }
  }

  function renderAccountActions(account: StaffAdminAccount) {
    return (
      <div className="staff-accounts__actions">
        <button className="staff-accounts__secondary" type="button" onClick={() => beginAction(account, 'role')}>
          تغییر نقش
        </button>
        {account.isActive && (
          <button className="staff-accounts__danger" type="button" onClick={() => beginAction(account, 'deactivate')}>
            غیرفعال‌سازی
          </button>
        )}
        {action?.account.id === account.id && (
          <form className="staff-accounts__action-form" aria-label={`${action.kind === 'role' ? 'تغییر نقش' : 'غیرفعال‌سازی'} حساب ${account.username}`} onSubmit={handleAccountAction}>
            {action.kind === 'role' ? (
              <>
                <label>
                  نقش تازه
                  <select value={actionRole} onChange={(event) => setActionRole(event.target.value as StaffRole)}>
                    {roles.map((role) => <option key={role} value={role}>{getStaffRoleLabel(role)}</option>)}
                  </select>
                </label>
                <label>
                  دلیل تغییر نقش
                  <textarea required value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
                </label>
                <button className="staff-accounts__primary" type="submit" disabled={isSaving}>ذخیره نقش</button>
              </>
            ) : (
              <>
                <p>نشست‌های فعال این همکار نیز با غیرفعال‌سازی از دسترس خارج می‌شوند.</p>
                <label>
                  دلیل غیرفعال‌سازی
                  <textarea required value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
                </label>
                <button className="staff-accounts__danger" type="submit" disabled={isSaving}>
                  {isSaving ? 'در حال ثبت…' : 'تأیید غیرفعال‌سازی'}
                </button>
              </>
            )}
            {formError && <p className="staff-accounts__error" role="alert">{formError}</p>}
            <button className="staff-accounts__text-button" type="button" onClick={() => { setAction(null); setFormError(null); }}>
              انصراف
            </button>
          </form>
        )}
      </div>
    );
  }

  const accounts = result?.items ?? [];
  const lastPage = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section className="staff-accounts" aria-labelledby="staff-accounts-title">
      <header className="staff-accounts__header">
        <div>
          <p className="staff-accounts__eyebrow">مدیریت دسترسی</p>
          <h1 id="staff-accounts-title">مدیریت کارکنان</h1>
          <p>حساب‌های پنل، نقش‌ها و وضعیت ورود اولیه را در یک‌جا پیگیری کنید.</p>
        </div>
        <button
          className="staff-accounts__primary"
          type="button"
          aria-expanded={showCreate}
          aria-controls="staff-account-create"
          onClick={() => {
            setShowCreate((open) => !open);
            setFormError(null);
            setSuccessMessage(null);
          }}
        >
          {showCreate ? 'بستن فرم' : 'افزودن حساب'}
        </button>
      </header>

      {successMessage && <p className="staff-accounts__notice" role="status">{successMessage}</p>}

      {showCreate && (
        <form id="staff-account-create" className="staff-accounts__form" method="post" onSubmit={handleCreate}>
          <div className="staff-accounts__form-heading">
            <h2>حساب تازه</h2>
            <p>گذرواژه آغازین را فقط به خود همکار تحویل دهید؛ پس از ثبت دوباره نمایش داده نمی‌شود.</p>
          </div>
          <div className="staff-accounts__fields">
            <label>
              نام کاربری
              <input autoComplete="username" required maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              ایمیل کاری
              <input type="email" autoComplete="email" required maxLength={254} dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              گذرواژه آغازین
              <input type="password" autoComplete="new-password" required value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} />
            </label>
            <label>
              نقش
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as StaffRole)}>
                {roles.map((role) => <option key={role} value={role}>{getStaffRoleLabel(role)}</option>)}
              </select>
            </label>
          </div>
          {formError && !action && <p className="staff-accounts__error" role="alert">{formError}</p>}
          <div className="staff-accounts__form-actions">
            <button className="staff-accounts__primary" type="submit" disabled={isSaving}>
              {isSaving ? 'در حال ایجاد…' : 'ایجاد حساب'}
            </button>
          </div>
        </form>
      )}

      <section className="staff-accounts__list" aria-labelledby="staff-accounts-list-title">
        <div className="staff-accounts__list-heading">
          <div>
            <h2 id="staff-accounts-list-title">حساب‌های ثبت‌شده</h2>
            {result && <p>{result.total.toLocaleString('fa-IR')} حساب</p>}
          </div>
          <button className="staff-accounts__secondary" type="button" onClick={() => void loadAccounts(page)} disabled={isLoading}>
            {isLoading ? 'در حال دریافت…' : 'به‌روزرسانی فهرست'}
          </button>
        </div>

        {isLoading && !result ? (
          <p className="staff-accounts__state" aria-live="polite" aria-busy="true">در حال دریافت حساب‌های کارکنان…</p>
        ) : loadError ? (
          <div className="staff-accounts__state staff-accounts__state--error">
            <p role="alert">{loadError}</p>
            <button className="staff-accounts__secondary" type="button" onClick={() => void loadAccounts(page)}>تلاش دوباره</button>
          </div>
        ) : accounts.length === 0 ? (
          <p className="staff-accounts__state">هنوز حسابی ثبت نشده است.</p>
        ) : (
          <div className="staff-accounts__table-wrap">
            <table className="staff-accounts__table">
              <caption className="staff-accounts__visually-hidden">فهرست حساب‌های کارکنان و دسترسی آن‌ها</caption>
              <thead>
                <tr><th scope="col">کارمند</th><th scope="col">نقش</th><th scope="col">وضعیت</th><th scope="col">ورود اولیه</th><th scope="col">تاریخ ایجاد</th><th scope="col"><span className="staff-accounts__visually-hidden">عملیات</span></th></tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <th scope="row">
                      <strong>{account.username}</strong>
                      {shouldShowAccountEmail(account) && <a href={`mailto:${account.email}`} dir="ltr">{account.email}</a>}
                    </th>
                    <td>{getStaffRoleLabel(account.role)}</td>
                    <td><span className={`staff-accounts__status${account.isActive ? ' staff-accounts__status--active' : ''}`}>{account.isActive ? 'فعال' : 'غیرفعال'}</span></td>
                    <td>{account.mustChangePassword ? 'گذرواژه آغازین تغییر نشده' : 'تکمیل‌شده'}</td>
                    <td>{createdDate(account.createdAt)}</td>
                    <td>{renderAccountActions(account)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !loadError && accounts.length > 0 && (
          <ul className="staff-accounts__mobile-cards" aria-label="فهرست حساب‌های کارکنان">
            {accounts.map((account) => (
              <li className="staff-accounts__mobile-card" key={account.id}>
                <header>
                  <h3>{account.username}</h3>
                  <span className={`staff-accounts__status${account.isActive ? ' staff-accounts__status--active' : ''}`}>
                    {account.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                </header>
                {shouldShowAccountEmail(account) && (
                  <a className="staff-accounts__mobile-email" href={`mailto:${account.email}`} dir="ltr">
                    {account.email}
                  </a>
                )}
                <dl>
                  <div><dt>نقش</dt><dd>{getStaffRoleLabel(account.role)}</dd></div>
                  <div><dt>ورود اولیه</dt><dd>{account.mustChangePassword ? 'گذرواژه آغازین تغییر نشده' : 'تکمیل‌شده'}</dd></div>
                  <div><dt>تاریخ ایجاد</dt><dd>{createdDate(account.createdAt)}</dd></div>
                </dl>
                {renderAccountActions(account)}
              </li>
            ))}
          </ul>
        )}

        {result && result.total > result.pageSize && (
          <nav className="staff-accounts__pagination" aria-label="صفحه‌های حساب کارکنان">
            <button className="staff-accounts__secondary" type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}>صفحه قبل</button>
            <span>صفحه {page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span>
            <button className="staff-accounts__secondary" type="button" disabled={page >= lastPage || isLoading} onClick={() => setPage((current) => current + 1)}>صفحه بعد</button>
          </nav>
        )}
      </section>
    </section>
  );
}
