import { getPublicRoomTypes, type PublicRoomType } from './public-api';

export async function getFrontDeskRoomTypes(): Promise<PublicRoomType[]> {
  try {
    return await getPublicRoomTypes();
  } catch {
    return [];
  }
}
