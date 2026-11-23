import { StaffFolioPrintPage } from '@/components/staff/folios/staff-folio-print-page';

export const dynamic = 'force-dynamic';

export default async function StaffFolioPrintRoute({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <StaffFolioPrintPage bookingId={bookingId} />;
}
