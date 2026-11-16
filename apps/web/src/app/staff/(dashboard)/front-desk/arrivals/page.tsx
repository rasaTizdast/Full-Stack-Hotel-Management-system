import { StaffFrontDeskPage } from '@/components/staff/front-desk/staff-front-desk-page';
import { getFrontDeskRoomTypes } from '@/lib/staff-front-desk-route-data';

export default async function StaffArrivalsPage() {
  const roomTypeCatalog = await getFrontDeskRoomTypes();
  return <StaffFrontDeskPage
    queue="arrivals"
    roomTypes={roomTypeCatalog.roomTypes}
    roomTypesStatus={roomTypeCatalog.status}
  />;
}
