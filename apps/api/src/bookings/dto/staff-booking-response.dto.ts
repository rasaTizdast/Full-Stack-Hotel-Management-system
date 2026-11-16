import { ApiProperty } from '@nestjs/swagger';

export class StaffBookingRoomTypeDto {
  @ApiProperty({ example: 'garden-double' })
  slug!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;
}

export class StaffBookingListItemDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{12,16}$', example: 'BKGHTL8Q27KS' })
  reference!: string;

  @ApiProperty({
    enum: [
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'CHECKED_IN',
      'CHECKED_OUT',
      'NO_SHOW',
    ],
    example: 'PENDING_CONFIRMATION',
  })
  status!: string;

  @ApiProperty({ format: 'date', example: '2027-05-01' })
  checkIn!: string;

  @ApiProperty({ format: 'date', example: '2027-05-04' })
  checkOut!: string;

  @ApiProperty({ example: 2 })
  guestCount!: number;

  @ApiProperty({ example: 1 })
  roomQuantity!: number;

  @ApiProperty({ example: 'مریم رضایی' })
  guestName!: string;

  @ApiProperty({ example: '+989121234567' })
  guestPhone!: string;

  @ApiProperty({ type: StaffBookingRoomTypeDto })
  roomType!: StaffBookingRoomTypeDto;

  @ApiProperty({ format: 'date-time', example: '2027-04-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2027-04-02T12:00:00.000Z' })
  expiresAt!: string;
}

export class StaffBookingNightDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  stayDate!: string;

  @ApiProperty({ example: '4800000' })
  nightlyPriceToman!: string;

  @ApiProperty({ example: 1 })
  roomQuantity!: number;

  @ApiProperty({ example: '4800000' })
  amountToman!: string;
}

export class StaffBookingStatusTimestampsDto {
  @ApiProperty({ format: 'date-time', nullable: true, example: '2027-04-01T12:30:00.000Z' })
  confirmedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  rejectedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  cancelledAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, example: null })
  expiredAt!: string | null;
}

export class StaffBookingDetailDto extends StaffBookingListItemDto {
  @ApiProperty({ format: 'email', nullable: true, example: 'guest@example.invalid' })
  guestEmail!: string | null;

  @ApiProperty({ example: '14400000' })
  totalPriceToman!: string;

  @ApiProperty({ nullable: true, example: 'Inventory checked by staff.' })
  internalNote!: string | null;

  @ApiProperty({ nullable: true, example: null })
  cancellationReason!: string | null;

  @ApiProperty({ type: StaffBookingStatusTimestampsDto })
  statusTimestamps!: StaffBookingStatusTimestampsDto;

  @ApiProperty({ type: [StaffBookingNightDto] })
  nights!: StaffBookingNightDto[];
}

export class StaffBookingPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 0 })
  totalItems!: number;

  @ApiProperty({ example: 0 })
  totalPages!: number;
}

export class StaffBookingListDto {
  @ApiProperty({ type: [StaffBookingListItemDto] })
  items!: StaffBookingListItemDto[];

  @ApiProperty({ type: StaffBookingPaginationDto })
  pagination!: StaffBookingPaginationDto;
}
