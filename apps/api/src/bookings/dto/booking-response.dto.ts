import { ApiProperty } from '@nestjs/swagger';

export class BookingRoomTypeDto {
  @ApiProperty({ example: 'garden-double' })
  slug!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;
}

export class BookingPriceNightDto {
  @ApiProperty({ format: 'date', example: '2027-05-01' })
  stayDate!: string;

  @ApiProperty({ example: '4800000' })
  nightlyPriceToman!: string;

  @ApiProperty({ example: 1 })
  roomQuantity!: number;

  @ApiProperty({ example: '4800000' })
  amountToman!: string;
}

export class BookingPriceSummaryDto {
  @ApiProperty({ example: 3 })
  numberOfNights!: number;

  @ApiProperty({ example: '14400000' })
  totalPriceToman!: string;

  @ApiProperty({ type: [BookingPriceNightDto] })
  nights!: BookingPriceNightDto[];
}

export class BookingResponseDto {
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
  @ApiProperty({ type: BookingRoomTypeDto })
  roomType!: BookingRoomTypeDto;

  @ApiProperty({ type: BookingPriceSummaryDto })
  priceSummary!: BookingPriceSummaryDto;
}
