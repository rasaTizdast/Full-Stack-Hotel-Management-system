import { ButtonLink } from '@/components/ui/button-link';

export default function NotFound() {
  return (
    <main
      className="mx-auto grid min-h-[60vh] w-[min(100%_-_2rem,54rem)] content-center justify-items-start gap-4 py-16"
      id="top"
    >
      <h1 className="mb-0 text-[clamp(2.5rem,7vw,5.5rem)] tabular-nums">این صفحه پیدا نشد</h1>
      <p className="max-w-[54ch] text-muted-foreground">
        ممکن است نشانی تغییر کرده باشد یا اتاق دیگر فعال نباشد.
      </p>
      <ButtonLink href="/" size="default">
        بازگشت به صفحهٔ اصلی
      </ButtonLink>
    </main>
  );
}
