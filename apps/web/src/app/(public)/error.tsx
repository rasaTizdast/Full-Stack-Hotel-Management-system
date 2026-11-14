'use client';

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <section className="error-state" role="alert" aria-labelledby="error-heading">
      <p className="eyebrow">ارتباط با اقامتگاه</p>
      <h1 id="error-heading">اطلاعات فعلاً در دسترس نیست</h1>
      <p>اتصال موقتاً برقرار نشد. چند لحظهٔ دیگر دوباره تلاش کنید.</p>
      <button className="button button--jade" type="button" onClick={reset}>
        تلاش دوباره
      </button>
    </section>
  );
}
