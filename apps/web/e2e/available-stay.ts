import type { APIRequestContext, TestInfo } from '@playwright/test';
import { isAvailabilityResult } from '../src/lib/availability';
import { formatGregorianAsJalali } from '../src/lib/jalali-date';

const STAY_WINDOW_DAYS = 70;
const RUN_DAY_SEED = Math.floor(Date.now() / 60_000) % STAY_WINDOW_DAYS;

export type AvailableStay = {
  checkInJalali: string;
  checkOutJalali: string;
};

function dateAfterUtcDays(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstCandidateOffset(testInfo: TestInfo): number {
  const projectOffset = testInfo.project.name === 'mobile-chrome' ? 35 : 0;
  const purposeOffset = testInfo.title.includes('guest submits')
    ? 17
    : testInfo.title.includes('availability change')
      ? 38
      : 0;
  return 4 + ((RUN_DAY_SEED + projectOffset + purposeOffset) % STAY_WINDOW_DAYS);
}

export async function findAvailableGardenStay(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<AvailableStay> {
  const firstOffset = firstCandidateOffset(testInfo);
  const today = dateAfterUtcDays(0);

  for (let attempt = 0; attempt < STAY_WINDOW_DAYS; attempt += 1) {
    const offset = 4 + ((firstOffset - 4 + attempt) % STAY_WINDOW_DAYS);
    const checkIn = addUtcDays(today, offset);
    const checkOut = addUtcDays(checkIn, 2);
    const query = new URLSearchParams({ checkIn, checkOut, guests: '2' });
    const response = await request.get(`/api/availability?${query}`);
    if (!response.ok()) {
      throw new Error(`Availability setup request failed with ${response.status()}.`);
    }
    const payload: unknown = await response.json();
    if (!isAvailabilityResult(payload)) {
      throw new Error('Availability setup returned an invalid response.');
    }

    const gardenRoom = payload.roomTypes.find((room) => room.slug === 'garden-double');
    if (gardenRoom?.isAvailable && gardenRoom.availableRooms > 0) {
      const checkInJalali = formatGregorianAsJalali(checkIn);
      const checkOutJalali = formatGregorianAsJalali(checkOut);
      if (!checkInJalali || !checkOutJalali) {
        throw new Error('Could not format the available stay dates.');
      }
      return { checkInJalali, checkOutJalali };
    }
  }

  throw new Error('No available garden room was found in the seeded test window.');
}
