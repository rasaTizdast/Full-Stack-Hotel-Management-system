import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';

export function SiteHeader({ hotel }: { hotel: PublicHotel }) {
  return (
    <header className="site-header" id="top">
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label={`صفحهٔ اصلی ${hotel.name}`}>
          <svg className="brand__mark" viewBox="0 0 44 44" aria-hidden="true">
            <path
              d="M22 4c3.5 7 8.8 8.5 15 7-1.5 6.2 0 11.5 7 15-7 3.5-8.5 8.8-7 15-6.2-1.5-11.5 0-15 7-3.5-7-8.8-8.5-15-7 1.5-6.2 0-11.5-7-15 7-3.5 8.5-8.8 7-15 6.2 1.5 11.5 0 15-7Z"
              transform="translate(0 -4) scale(.94)"
              fill="currentColor"
            />
            <circle cx="20.7" cy="20.5" r="4.4" fill="#f4efdf" />
          </svg>
          <span className="brand__name">{hotel.name}</span>
        </Link>
        <nav className="site-nav" aria-label="ناوبری اصلی">
          <Link href="/">اقامتگاه</Link>
          <Link href="/rooms">اتاق‌ها</Link>
        </nav>
        <Link className="site-header__cta" href="/rooms">
          آشنایی با اتاق‌ها <span aria-hidden="true">←</span>
        </Link>
      </div>
    </header>
  );
}
