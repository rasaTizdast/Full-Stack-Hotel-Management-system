import { AvailabilityNightDto } from './availability-night.dto';

export class AvailabilityRoomTypeDto {
  slug!: string;
  name!: string;
  maxGuestsPerRoom!: number;
  isAvailable!: boolean;
  availableRooms!: number;
  totalPriceToman!: string | null;
  nightlyBreakdown!: AvailabilityNightDto[];
}
