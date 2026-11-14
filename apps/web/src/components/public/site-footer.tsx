import type { PublicHotel } from '@/lib/public-api';

export function SiteFooter({ hotel }: { hotel: PublicHotel }) {
  return (
    <footer className="site-footer" id="location">
      <div className="site-footer__main">
        <div>
          <p className="eyebrow site-footer__eyebrow">برای روزهای آرام در شیراز</p>
          <h2>{hotel.name}</h2>
          <p className="site-footer__address">{hotel.address}</p>
        </div>
        <div className="site-footer__contact">
          <h3>راه‌های تماس</h3>
          {hotel.contactPhone ? (
            <a href={`tel:${hotel.contactPhone}`}>{hotel.contactPhone}</a>
          ) : null}
          {hotel.contactEmail ? (
            <a href={`mailto:${hotel.contactEmail}`}>{hotel.contactEmail}</a>
          ) : null}
          {!hotel.contactPhone && !hotel.contactEmail ? (
            <p>اطلاعات تماس هنوز ثبت نشده است.</p>
          ) : null}
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>درخواست اقامت پس از بررسی کارکنان قطعی می‌شود.</span>
        <a href="#top">بازگشت به بالا ↑</a>
      </div>
    </footer>
  );
}
