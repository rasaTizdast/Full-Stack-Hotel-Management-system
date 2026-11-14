import type { ReactNode } from 'react';
import type { PublicHotel } from '@/lib/public-api';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function PublicSiteFrame({ hotel, children }: { hotel: PublicHotel; children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#page-content">
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
