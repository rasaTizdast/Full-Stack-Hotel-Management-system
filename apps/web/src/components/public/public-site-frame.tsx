import type { ReactNode } from 'react';
import type { PublicHotel } from '@/lib/public-api';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function PublicSiteFrame({ hotel, children }: { hotel: PublicHotel; children: ReactNode }) {
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:text-primary focus:shadow-lg" href="#page-content">
        رفتن به محتوای اصلی
      </a>
      <SiteHeader hotel={hotel} />
      <main id="page-content" className="page-content">
        {children}
      </main>
      <SiteFooter hotel={hotel} />
    </>
  );
}
