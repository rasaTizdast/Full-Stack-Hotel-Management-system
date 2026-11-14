import { ApiProperty } from '@nestjs/swagger';

export class StaffInventoryRoomTypeDto {
  @ApiProperty({ format: 'uuid', example: '7d921ea5-0f71-4d39-9608-4fb190080065' })
  id!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;

  @ApiProperty({ example: 'garden-double' })
  slug!: string;
}

export class StaffInventoryRoomTypeOptionDto extends StaffInventoryRoomTypeDto {
  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class StaffInventoryNightDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  stayDate!: string;

  @ApiProperty({ type: Number, nullable: true, example: 4 })
  totalRooms!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  heldRooms!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  bookedRooms!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  availableRooms!: number | null;

  @ApiProperty({ nullable: true, example: '4800000' })
  nightlyPriceToman!: string | null;
}

export class StaffInventoryResponseDto {
  @ApiProperty({ type: StaffInventoryRoomTypeDto })
  roomType!: StaffInventoryRoomTypeDto;

  @ApiProperty({ format: 'date', example: '2027-05-01' })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2027-05-08', description: 'Exclusive end date.' })
  endDate!: string;

  @ApiProperty({ type: [StaffInventoryNightDto] })
  nights!: StaffInventoryNightDto[];
}
