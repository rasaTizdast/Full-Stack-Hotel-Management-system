'use client';
import { Button } from '@/components/ui/button';

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto grid min-h-[60vh] w-[min(100%_-_2rem,54rem)] content-center justify-items-start gap-4 py-16" role="alert" aria-labelledby="error-heading">
      <h1 id="error-heading" className="mb-0 text-[clamp(2.5rem,7vw,5.5rem)] tabular-nums">اطلاعات فعلاً در دسترس نیست</h1>
      <p className="max-w-[54ch] text-muted-foreground">اتصال موقتاً برقرار نشد. چند لحظهٔ دیگر دوباره تلاش کنید.</p>
      <Button type="button" onClick={reset}>
        تلاش دوباره
      </Button>
    </section>
  );
}
