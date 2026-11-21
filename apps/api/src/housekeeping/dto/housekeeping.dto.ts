import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HousekeepingCompletionOutcome,
  HousekeepingPriority,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
  HousekeepingStatus,
  RoomDiscrepancyStatus,
  RoomDiscrepancyType,
} from '../../generated/prisma/enums';
import {
  IsBoolean,
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
  ValidateIf,
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

export class StaffHousekeepingTaskQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Filter tasks due on this exact date.' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

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

  @ApiPropertyOptional({ enum: HousekeepingTaskType })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(HousekeepingTaskType)
  taskType?: HousekeepingTaskType;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsUUID()
  assigneeStaffUserId?: string;

  @ApiPropertyOptional({ enum: HousekeepingTaskStatus })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(HousekeepingTaskStatus)
  status?: HousekeepingTaskStatus;

  @ApiPropertyOptional({ enum: HousekeepingPriority })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;
}

export class CreateHousekeepingTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({ enum: HousekeepingTaskType })
  @IsEnum(HousekeepingTaskType)
  taskType!: HousekeepingTaskType;

  @ApiProperty({ format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate!: string;

  @ApiPropertyOptional({ enum: HousekeepingPriority, default: HousekeepingPriority.NORMAL })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;

  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignHousekeepingTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assigneeStaffUserId!: string;

  @ApiPropertyOptional({ enum: HousekeepingPriority })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HousekeepingPriority)
  priority?: HousekeepingPriority;
}

export class CompleteHousekeepingTaskDto {
  @ApiProperty({ enum: HousekeepingCompletionOutcome })
  @IsEnum(HousekeepingCompletionOutcome)
  outcome!: HousekeepingCompletionOutcome;

  @ApiPropertyOptional({ maxLength: 500, description: 'Required for NEEDS_REWORK.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class ReasonDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ReportRoomDiscrepancyDto {
  @ApiProperty({ format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate!: string;

  @ApiProperty()
  @IsBoolean()
  observedOccupied!: boolean;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class StaffRoomOptionsQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100_000 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;
}

export class StaffDiscrepancyQueryDto {
  @ApiPropertyOptional({ format: 'date' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate?: string;

  @ApiPropertyOptional({ enum: RoomDiscrepancyStatus })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(RoomDiscrepancyStatus)
  status?: RoomDiscrepancyStatus;

  @ApiPropertyOptional({ enum: RoomDiscrepancyType })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsEnum(RoomDiscrepancyType)
  kind?: RoomDiscrepancyType;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }: { value: unknown }) => trimQuery(value))
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100_000 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100 })
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class StaffHousekeepingRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  floor!: string | null;

  @ApiProperty({ enum: HousekeepingStatus })
  housekeepingStatus!: HousekeepingStatus;

  @ApiProperty({ enum: ['VACANT', 'OCCUPIED'] })
  occupancy!: 'VACANT' | 'OCCUPIED';

  @ApiProperty()
  dueArrival!: boolean;

  @ApiProperty()
  dueDeparture!: boolean;
}

export class HousekeepingPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class StaffHousekeepingRoomOptionsDto {
  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [StaffHousekeepingRoomDto] })
  items!: StaffHousekeepingRoomDto[];

  @ApiProperty({ type: HousekeepingPaginationDto })
  pagination!: HousekeepingPaginationDto;
}

export class HousekeepingAssigneeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;
}

export class HousekeepingAssigneeListDto {
  @ApiProperty({ type: [HousekeepingAssigneeDto] })
  items!: HousekeepingAssigneeDto[];
}

export class HousekeepingTaskRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  floor!: string | null;

  @ApiProperty({ enum: HousekeepingStatus })
  housekeepingStatus!: HousekeepingStatus;

  @ApiProperty({ enum: ['VACANT', 'OCCUPIED'] })
  occupancy!: 'VACANT' | 'OCCUPIED';
}

export class HousekeepingAllowedActionsDto {
  @ApiProperty()
  canAssign!: boolean;

  @ApiProperty()
  canStart!: boolean;

  @ApiProperty()
  canComplete!: boolean;

  @ApiProperty()
  canCancel!: boolean;
}

export class HousekeepingTaskDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: HousekeepingTaskType })
  taskType!: HousekeepingTaskType;

  @ApiProperty({ enum: HousekeepingTaskStatus })
  status!: HousekeepingTaskStatus;

  @ApiProperty({ enum: HousekeepingPriority })
  priority!: HousekeepingPriority;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty()
  isOverdue!: boolean;

  @ApiProperty()
  arrivalDue!: boolean;

  @ApiProperty()
  departureDue!: boolean;

  @ApiProperty({ type: HousekeepingTaskRoomDto })
  room!: HousekeepingTaskRoomDto;

  @ApiPropertyOptional({ type: HousekeepingAssigneeDto, nullable: true })
  assignee!: HousekeepingAssigneeDto | null;

  @ApiPropertyOptional({ enum: HousekeepingCompletionOutcome, nullable: true })
  completionOutcome!: HousekeepingCompletionOutcome | null;

  @ApiPropertyOptional({ nullable: true })
  completionReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty({ type: HousekeepingAllowedActionsDto })
  allowedActions!: HousekeepingAllowedActionsDto;
}

export class StaffHousekeepingTaskListDto {
  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [HousekeepingTaskDto] })
  items!: HousekeepingTaskDto[];

  @ApiProperty({ type: HousekeepingPaginationDto })
  pagination!: HousekeepingPaginationDto;
}

export class RoomDiscrepancyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  roomId!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  floor!: string | null;

  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ enum: RoomDiscrepancyType })
  kind!: RoomDiscrepancyType;

  @ApiProperty()
  expectedOccupied!: boolean;

  @ApiProperty()
  observedOccupied!: boolean;

  @ApiProperty({ enum: RoomDiscrepancyStatus })
  status!: RoomDiscrepancyStatus;

  @ApiProperty()
  note!: string;

  @ApiProperty({ format: 'date-time' })
  reportedAt!: string;

  @ApiProperty({ type: HousekeepingAssigneeDto })
  reportedBy!: HousekeepingAssigneeDto;

  @ApiPropertyOptional({ type: HousekeepingAssigneeDto, nullable: true })
  resolvedBy!: HousekeepingAssigneeDto | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionReason!: string | null;
}

export class StaffRoomDiscrepancyListDto {
  @ApiProperty({ format: 'date' })
  businessDate!: string;

  @ApiProperty({ type: [RoomDiscrepancyDto] })
  items!: RoomDiscrepancyDto[];

  @ApiProperty({ type: HousekeepingPaginationDto })
  pagination!: HousekeepingPaginationDto;
}
