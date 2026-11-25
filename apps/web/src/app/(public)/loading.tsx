export default function PublicLoading() {
  return (
    <section className="mx-auto grid min-h-[45vh] w-[min(100%_-_2rem,54rem)] content-center justify-items-center gap-4 py-16 text-muted-foreground" role="status" aria-label="در حال بارگذاری اطلاعات اقامتگاه">
      <span className="size-10 animate-spin rounded-full border-[3px] border-border border-t-primary" aria-hidden="true" />
      <span>اطلاعات اقامتگاه در حال بارگذاری است…</span>
    </section>
  );
}
