import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found" id="top">
      <p className="eyebrow">۴۰۴ · نشانی پیدا نشد</p>
      <h1>این صفحه پیدا نشد</h1>
      <p>ممکن است نشانی تغییر کرده باشد یا اتاق دیگر فعال نباشد.</p>
      <Link className="button button--jade" href="/">
        بازگشت به صفحهٔ اصلی <span aria-hidden="true">←</span>
      </Link>
    </main>
  );
}
