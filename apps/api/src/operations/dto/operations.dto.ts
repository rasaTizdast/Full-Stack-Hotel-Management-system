import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE_AMOUNT = /^(0|[1-9]\d{0,18})$/;

export class StaffReportQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Gregorian business date.' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  date?: string;
}

export class NightCloseConfirmationDto {
  @ApiProperty({ format: 'date' })
  @IsString()
  @Matches(DATE_ONLY)
  businessDate!: string;

  @ApiProperty({ format: 'date' })
  @IsString()
  @Matches(DATE_ONLY)
  nextBusinessDate!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  roomNightCount!: number;

  @ApiProperty({ pattern: WHOLE_AMOUNT.source })
  @IsString()
  @Matches(WHOLE_AMOUNT)
  accommodationAmountToman!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  warningCount!: number;
}

export class RunNightCloseDto {
  @ApiProperty({ format: 'date', description: 'Must match the current hotel business date.' })
  @IsString()
  @Matches(DATE_ONLY)
  businessDate!: string;

  @ApiProperty({ type: NightCloseConfirmationDto })
  @IsObject()
  @ValidateNested()
  @Type(() => NightCloseConfirmationDto)
  confirmation!: NightCloseConfirmationDto;
}

export class OperationSignalDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ minimum: 0 })
  count!: number;

  @ApiProperty({ type: [String] })
  references!: string[];
}

export class NightClosePreviewDto {
  @ApiProperty()
  hotelName!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ format: 'date' })
  nextBusinessDate!: string;

  @ApiProperty({ type: [OperationSignalDto] })
  blockers!: OperationSignalDto[];

  @ApiProperty({ type: [OperationSignalDto] })
  warnings!: OperationSignalDto[];

  @ApiProperty({ minimum: 0 })
  warningCount!: number;

  @ApiProperty({
    type: 'object',
    properties: { roomNightCount: { type: 'integer' }, amountToman: { type: 'string' } },
  })
  accommodation!: { roomNightCount: number; amountToman: string };

  @ApiProperty()
  canClose!: boolean;
}

export class NightCloseResultDto {
  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ format: 'date' })
  nextBusinessDate!: string;

  @ApiProperty({ enum: ['COMPLETED'] })
  status!: 'COMPLETED';

  @ApiProperty({ minimum: 0 })
  roomNightCount!: number;

  @ApiProperty()
  accommodationAmountToman!: string;

  @ApiProperty({ minimum: 0 })
  warningCount!: number;

  @ApiProperty({ format: 'date-time' })
  completedAt!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class StaffReportStayDto {
  @ApiProperty()
  reference!: string;

  @ApiProperty()
  guestName!: string;

  @ApiProperty({ format: 'date' })
  checkIn!: string;

  @ApiProperty({ format: 'date' })
  checkOut!: string;

  @ApiProperty()
  roomTypeName!: string;

  @ApiProperty({ minimum: 1 })
  roomQuantity!: number;

  @ApiProperty({ type: [String] })
  rooms!: string[];
}

export class StaffOperationsReportDto {
  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [StaffReportStayDto] })
  arrivals!: StaffReportStayDto[];

  @ApiProperty({ type: [StaffReportStayDto] })
  departures!: StaffReportStayDto[];

  @ApiProperty({ type: [StaffReportStayDto] })
  inHouse!: StaffReportStayDto[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  rooms!: {
    total: number;
    occupied: number;
    available: number;
    occupancyPercent: number;
    readiness: { inspected: number; clean: number; dirty: number };
  };

  @ApiProperty({ type: 'object', additionalProperties: true })
  blocks!: { outOfOrder: number; capacityClosed: number; total: number };

  @ApiProperty({ type: 'object', additionalProperties: true })
  pendingRequests!: { reservations: number; maintenance: number };

  @ApiProperty({ type: 'object', additionalProperties: true })
  openBalances!: {
    count: number;
    balanceToman: string;
    items: Array<{ reference: string; guestName: string; balanceToman: string }>;
  };

  @ApiProperty({ type: 'object', additionalProperties: true })
  dailyTotals!: { debitsToman: string; creditsToman: string };
}
