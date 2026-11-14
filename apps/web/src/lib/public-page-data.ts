import { notFound } from 'next/navigation';
import { getPublicHotel, PublicApiError } from './public-api';

export async function requirePublicHotel() {
  try {
    return await getPublicHotel();
  } catch (error) {
    if (error instanceof PublicApiError && error.kind === 'not-found') {
      notFound();
    }
    throw error;
  }
}
