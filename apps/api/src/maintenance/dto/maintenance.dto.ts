import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HousekeepingPriority,
  MaintenanceCategory,
  MaintenanceRequestStatus,
  RoomBlockKind,
} from '../../generated/prisma/enums';
import {
  IsEnum,
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

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimQuery(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function toOptionalInteger(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  return Number(value);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateMaintenanceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({ enum: MaintenanceCategory })
  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Matches(/\S/)
  description!: string;

  @ApiPropertyOptional({ enum: HousekeepingPriority, default: HousekeepingPriority.NORMAL })
  @IsOptional()
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;

  @ApiProperty({ format: 'date', description: 'Expected resolution date in the hotel calendar.' })
  @IsString()
  @Matches(DATE_ONLY)
  expectedDate!: string;
}

export class MaintenanceRequestQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100_000, default: 1 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;

  @ApiPropertyOptional({ enum: MaintenanceCategory })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;

  @ApiPropertyOptional({ enum: HousekeepingPriority })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;

  @ApiPropertyOptional({ enum: MaintenanceRequestStatus })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(MaintenanceRequestStatus)
  status?: MaintenanceRequestStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsUUID()
  assigneeStaffUserId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  expectedDate?: string;
}

export class AssignMaintenanceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assigneeStaffUserId!: string;
}

export class ResolveMaintenanceRequestDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  resolutionNote!: string;
}

export class CreateRoomBlockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({ format: 'date', example: '2026-11-24' })
  @IsString()
  @Matches(DATE_ONLY)
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-11-27' })
  @IsString()
  @Matches(DATE_ONLY)
  endDate!: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-11-27', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  expectedReturnDate?: string;

  @ApiProperty({ enum: RoomBlockKind })
  @IsEnum(RoomBlockKind)
  kind!: RoomBlockKind;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}

export class RestoreRoomBlockDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}

export class RoomBlockQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100_000, default: 1 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;

  @ApiPropertyOptional({ enum: RoomBlockKind })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(RoomBlockKind)
  kind?: RoomBlockKind;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'RESTORED', 'EXPIRED'] })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(/^(ACTIVE|RESTORED|EXPIRED)$/)
  status?: 'ACTIVE' | 'RESTORED' | 'EXPIRED';

  @ApiPropertyOptional({ format: 'date', description: 'Find blocks overlapping this date.' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  activeOn?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Filter by the expected return date.' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  expectedReturnDate?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason?: string;
}

export class MaintenanceStaffIdentityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;
}

export class MaintenanceAssigneeListDto {
  @ApiProperty({ type: [MaintenanceStaffIdentityDto] })
  items!: MaintenanceStaffIdentityDto[];
}

export class MaintenanceRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  floor!: string | null;

  @ApiProperty()
  roomTypeName!: string;
}

export class MaintenanceRoomListDto {
  @ApiProperty({ type: [MaintenanceRoomDto] })
  items!: MaintenanceRoomDto[];
}

export class MaintenanceRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MaintenanceRoomDto })
  room!: MaintenanceRoomDto;

  @ApiProperty({ enum: MaintenanceCategory })
  category!: MaintenanceCategory;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: HousekeepingPriority })
  priority!: HousekeepingPriority;

  @ApiProperty({ enum: MaintenanceRequestStatus })
  status!: MaintenanceRequestStatus;

  @ApiProperty({ format: 'date' })
  expectedDate!: string;

  @ApiProperty({ format: 'date-time' })
  openedAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  assignedAt!: string | null;

  @ApiPropertyOptional({ type: MaintenanceStaffIdentityDto, nullable: true })
  assignee!: MaintenanceStaffIdentityDto | null;

  @ApiProperty({ type: MaintenanceStaffIdentityDto })
  createdBy!: MaintenanceStaffIdentityDto;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiPropertyOptional({ type: MaintenanceStaffIdentityDto, nullable: true })
  resolvedBy!: MaintenanceStaffIdentityDto | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionNote!: string | null;
}

export class MaintenancePaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class MaintenanceRequestListDto {
  @ApiProperty({ type: [MaintenanceRequestDto] })
  items!: MaintenanceRequestDto[];

  @ApiProperty({ type: MaintenancePaginationDto })
  pagination!: MaintenancePaginationDto;
}

export class RoomBlockDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MaintenanceRoomDto })
  room!: MaintenanceRoomDto;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date', description: 'Exclusive end date of the block.' })
  endDate!: string;

  @ApiProperty({ format: 'date', nullable: true, description: 'Optional expected return date.' })
  expectedReturnDate!: string | null;

  @ApiProperty({ enum: RoomBlockKind })
  kind!: RoomBlockKind;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ['ACTIVE', 'RESTORED', 'EXPIRED'] })
  status!: 'ACTIVE' | 'RESTORED' | 'EXPIRED';

  @ApiProperty({ type: MaintenanceStaffIdentityDto, nullable: true })
  createdBy!: MaintenanceStaffIdentityDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class RoomBlockListDto {
  @ApiProperty({ type: [RoomBlockDto] })
  items!: RoomBlockDto[];

  @ApiProperty({ type: MaintenancePaginationDto })
  pagination!: MaintenancePaginationDto;
}
