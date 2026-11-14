export class StaffInventoryRoomTypeDto {
  id!: string;
  name!: string;
  slug!: string;
}

export class StaffInventoryRoomTypeOptionDto extends StaffInventoryRoomTypeDto {
  isActive!: boolean;
}

export class StaffInventoryNightDto {
  stayDate!: string;
  totalRooms!: number | null;
  heldRooms!: number | null;
  bookedRooms!: number | null;
  availableRooms!: number | null;
  nightlyPriceToman!: string | null;
}

export class StaffInventoryResponseDto {
  roomType!: StaffInventoryRoomTypeDto;
  startDate!: string;
  endDate!: string;
  nights!: StaffInventoryNightDto[];
}
