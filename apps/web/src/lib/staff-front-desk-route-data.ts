import { getPublicRoomTypes, type PublicRoomType } from './public-api';

export type FrontDeskRoomTypesResult =
  | { status: 'ready'; roomTypes: PublicRoomType[] }
  | { status: 'error'; roomTypes: [] };

export async function getFrontDeskRoomTypes(): Promise<FrontDeskRoomTypesResult> {
  try {
    return { status: 'ready', roomTypes: await getPublicRoomTypes() };
  } catch {
    return { status: 'error', roomTypes: [] };
  }
}
