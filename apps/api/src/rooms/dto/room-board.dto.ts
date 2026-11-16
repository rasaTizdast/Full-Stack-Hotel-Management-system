import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HousekeepingStatus, RoomBlockKind } from '../../generated/prisma/enums';
import { StaffRoomDto } from './staff-room-response.dto';

const stayContexts = ['ARRIVING', 'RESERVED', 'DEPARTING'] as const;
const occupancies = ['VACANT', 'UNKNOWN', 'OCCUPIED'] as const;
const stayContextFilters = ['NONE', ...stayContexts] as const;
const blockKindFilters = ['NONE', ...Object.values(RoomBlockKind)] as const;
export type ReservationContext = (typeof stayContexts)[number];

export class RoomBoardQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;

  @ApiPropertyOptional({ enum: HousekeepingStatus })
  @IsOptional()
  @IsEnum(HousekeepingStatus)
  housekeepingStatus?: HousekeepingStatus;

  @ApiPropertyOptional({ enum: occupancies })
  @IsOptional()
  @IsIn(occupancies)
  occupancy?: (typeof occupancies)[number];

  @ApiPropertyOptional({ enum: stayContextFilters })
  @IsOptional()
  @IsIn(stayContextFilters)
  stayContext?: (typeof stayContextFilters)[number];

  @ApiPropertyOptional({ enum: blockKindFilters })
  @IsOptional()
  @IsIn(blockKindFilters)
  blockKind?: (typeof blockKindFilters)[number];
}

class RoomBoardReservationContextDto {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty()
  guestName!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ enum: stayContexts })
  stayContext!: ReservationContext;
}

class RoomBoardBlockDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RoomBlockKind })
  kind!: RoomBlockKind;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;
}

export class RoomBoardItemDto extends StaffRoomDto {
  @ApiProperty({
    enum: occupancies,
    description:
      'UNKNOWN means the room has reservation context without evidence of a checked-in stay.',
  })
  occupancy!: (typeof occupancies)[number];

  @ApiProperty({ type: [RoomBoardReservationContextDto] })
  reservationContexts!: RoomBoardReservationContextDto[];

  @ApiProperty({ type: [RoomBoardBlockDto] })
  blocks!: RoomBoardBlockDto[];
}

class RoomBoardAssignmentIntervalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  roomId!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;
}

class RoomBoardAssignableBookingDto {
  @ApiProperty()
  reference!: string;

  @ApiProperty()
  guestName!: string;

  @ApiProperty({ format: 'uuid' })
  roomTypeId!: string;

  @ApiProperty()
  roomTypeName!: string;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiProperty()
  roomQuantity!: number;

  @ApiProperty({ description: 'Opaque revision of the complete active assignment set.' })
  revision!: string;

  @ApiProperty({ description: 'Number of units without assignments on the selected board date.' })
  unassignedRoomQuantity!: number;

  @ApiProperty({
    type: [RoomBoardAssignmentIntervalDto],
    description:
      'Complete current active assignment set, including intervals outside the selected date.',
  })
  assignments!: RoomBoardAssignmentIntervalDto[];
}

export class RoomBoardDto {
  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: [RoomBoardItemDto] })
  items!: RoomBoardItemDto[];

  @ApiProperty({ type: [RoomBoardAssignableBookingDto] })
  assignableBookings!: RoomBoardAssignableBookingDto[];
}
