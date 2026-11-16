import { ApiProperty } from '@nestjs/swagger';

export class StaffStayRoomTypeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;
}

export class StaffStayAssignedRoomDto {
  @ApiProperty({ format: 'uuid', description: 'Identifier for this active assignment interval.' })
  assignmentId!: string;

  @ApiProperty({ example: '101' })
  roomNumber!: string;

  @ApiProperty({ enum: ['DIRTY', 'CLEAN', 'INSPECTED'] })
  housekeepingStatus!: 'DIRTY' | 'CLEAN' | 'INSPECTED';

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;
}

export class StaffStayWorklistItemDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{12,16}$' })
  reference!: string;

  @ApiProperty({ enum: ['CONFIRMED', 'CHECKED_IN'] })
  status!: 'CONFIRMED' | 'CHECKED_IN';

  @ApiProperty({ example: 'مریم رضایی' })
  guestName!: string;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiProperty()
  roomQuantity!: number;

  @ApiProperty({ type: StaffStayRoomTypeDto })
  roomType!: StaffStayRoomTypeDto;

  @ApiProperty({ format: 'date-time', nullable: true })
  confirmedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  checkedInAt!: string | null;

  @ApiProperty({ type: [StaffStayAssignedRoomDto] })
  assignedRooms!: StaffStayAssignedRoomDto[];
}

export class StaffStayWorklistPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 0 })
  totalItems!: number;

  @ApiProperty({ example: 0 })
  totalPages!: number;
}

export class StaffStayWorklistDto {
  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [StaffStayWorklistItemDto] })
  items!: StaffStayWorklistItemDto[];

  @ApiProperty({ type: StaffStayWorklistPaginationDto })
  pagination!: StaffStayWorklistPaginationDto;
}
