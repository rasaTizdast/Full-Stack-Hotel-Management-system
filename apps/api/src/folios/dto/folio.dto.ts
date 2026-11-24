import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INTEGER_STRING = /^[1-9]\d{0,18}$/;
const PUBLIC_REFERENCE = /^[A-Za-z0-9_-]{8,16}$/;
export const PAYMENT_METHODS = ['CASH', 'BANK_TERMINAL', 'BANK_TRANSFER', 'OTHER'] as const;

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class StaffFolioLookupQueryDto {
  @ApiProperty({ minLength: 8, maxLength: 16, pattern: PUBLIC_REFERENCE.source })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  @Matches(PUBLIC_REFERENCE)
  reference!: string;
}

export class CreateServiceItemDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/\S/)
  category!: string;

  @ApiProperty({ type: String, pattern: POSITIVE_INTEGER_STRING.source, example: '250000' })
  @IsString()
  @Matches(POSITIVE_INTEGER_STRING)
  currentPriceToman!: string;
}

export class UpdateServiceItemDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/\S/)
  category?: string;

  @ApiPropertyOptional({ type: String, pattern: POSITIVE_INTEGER_STRING.source })
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_INTEGER_STRING)
  currentPriceToman?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PostServiceChargeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceItemId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @ApiProperty({ format: 'date', example: '2026-11-23' })
  @IsString()
  @Matches(DATE_ONLY)
  serviceDate!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Attribute the service to an assigned room when it applies to one room.',
  })
  @IsOptional()
  @IsUUID()
  roomAssignmentId?: string;
}

export class AdjustFolioDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  correctsEntryId!: string;

  @ApiProperty({ type: String, pattern: POSITIVE_INTEGER_STRING.source, example: '50000' })
  @IsString()
  @Matches(POSITIVE_INTEGER_STRING)
  amountToman!: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}

export class RecordFolioPaymentDto {
  @ApiProperty({ type: String, pattern: POSITIVE_INTEGER_STRING.source, example: '250000' })
  @IsString()
  @Matches(POSITIVE_INTEGER_STRING)
  amountToman!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsString()
  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ maxLength: 120, description: 'Offline receipt or bank reference only.' })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  reference?: string;
}

export class RefundFolioPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  paymentEntryId!: string;

  @ApiProperty({ type: String, pattern: POSITIVE_INTEGER_STRING.source, example: '250000' })
  @IsString()
  @Matches(POSITIVE_INTEGER_STRING)
  amountToman!: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}

export class CheckoutFolioDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  onAccountReason?: string;
}

export class ServiceItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ type: String, example: '250000' })
  currentPriceToman!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ServiceItemListDto {
  @ApiProperty({ type: [ServiceItemDto] })
  items!: ServiceItemDto[];
}

export class FolioEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['DEBIT', 'CREDIT'] })
  direction!: 'DEBIT' | 'CREDIT';

  @ApiProperty({
    enum: ['ACCOMMODATION', 'SERVICE', 'FEE', 'TAX', 'DISCOUNT', 'ADJUSTMENT', 'PAYMENT', 'REFUND'],
  })
  kind!: string;

  @ApiProperty({ type: String, example: '250000' })
  amountToman!: string;

  @ApiProperty({ format: 'date' })
  serviceDate!: string;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  roomNumber!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  quantity!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  unitAmountToman!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  correctsEntryId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  correctionReason!: string | null;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS, nullable: true })
  paymentMethod!: (typeof PAYMENT_METHODS)[number] | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  paymentReference!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorUsername!: string | null;

  @ApiProperty({ type: String, example: '250000' })
  balanceAfterToman!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class FolioBookingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty()
  guestName!: string;

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
  })
  status!: string;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  actualDepartureDate!: string | null;

  @ApiProperty({ type: () => [FolioRoomAssignmentDto] })
  assignments!: FolioRoomAssignmentDto[];
}

export class FolioRoomAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  roomNumber!: string | null;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;
}

export class StaffFolioDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: FolioBookingDto })
  booking!: FolioBookingDto;

  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CLOSED_DUE'] })
  status!: 'OPEN' | 'CLOSED' | 'CLOSED_DUE';

  @ApiProperty({ type: String, example: '250000' })
  balanceToman!: string;

  @ApiProperty({ type: [FolioEntryDto] })
  entries!: FolioEntryDto[];
}

export class StaffFolioLookupDto {
  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({ minLength: 8, maxLength: 16 })
  reference!: string;

  @ApiProperty()
  guestName!: string;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiProperty({ enum: ['OPEN', 'CLOSED_DUE'] })
  folioStatus!: 'OPEN' | 'CLOSED_DUE';

  @ApiProperty({ type: String, example: '250000' })
  balanceToman!: string;
}

export class StaffFolioPrintDto {
  @ApiProperty({ enum: ['Interim folio', 'Final folio'] })
  label!: 'Interim folio' | 'Final folio';

  @ApiProperty({ format: 'date-time' })
  printedAt!: string;

  @ApiProperty()
  hotelTimezone!: string;

  @ApiProperty({ type: StaffFolioDto })
  folio!: StaffFolioDto;
}
