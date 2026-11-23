import { StaffFolioPage } from '@/components/staff/folios/staff-folio-page';

export default async function StaffFolioRoute({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <StaffFolioPage bookingId={bookingId} />;
}
