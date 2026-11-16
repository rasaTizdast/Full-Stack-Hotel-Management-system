import { StaffFrontDeskPage } from '@/components/staff/front-desk/staff-front-desk-page';
import { getFrontDeskRoomTypes } from '@/lib/staff-front-desk-route-data';

export default async function StaffArrivalsPage() {
  const roomTypes = await getFrontDeskRoomTypes();
  return <StaffFrontDeskPage queue="arrivals" roomTypes={roomTypes} />;
}
