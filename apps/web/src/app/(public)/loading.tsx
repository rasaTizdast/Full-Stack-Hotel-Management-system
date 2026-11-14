export default function PublicLoading() {
  return (
    <section className="loading-state" role="status" aria-label="در حال بارگذاری اطلاعات اقامتگاه">
      <span className="loading-state__ornament" aria-hidden="true" />
      <span>اطلاعات اقامتگاه در حال بارگذاری است…</span>
    </section>
  );
}
