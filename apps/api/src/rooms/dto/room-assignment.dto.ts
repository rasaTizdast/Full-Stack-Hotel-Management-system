import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const revisionPattern = /^[0-9a-f]{64}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export class RoomAssignmentIntervalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;

  @ApiProperty({ format: 'date', description: 'Inclusive start date.' })
  @Matches(datePattern)
  startDate!: string;

  @ApiProperty({ format: 'date', description: 'Exclusive end date.' })
  @Matches(datePattern)
  endDate!: string;
}

export class ReplaceRoomAssignmentsDto {
  @ApiProperty({
    type: [RoomAssignmentIntervalDto],
    description: 'Complete desired set. Use an empty array to remove all assignments.',
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => RoomAssignmentIntervalDto)
  assignments!: RoomAssignmentIntervalDto[];

  @ApiProperty({
    pattern: revisionPattern.source,
    description: 'Opaque revision from the board or the latest successful assignment replacement.',
  })
  @Matches(revisionPattern)
  expectedRevision!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class RoomAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  roomId!: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class RoomAssignmentSetDto {
  @ApiProperty({ description: 'Opaque revision of the booking assignment history.' })
  revision!: string;

  @ApiProperty({ type: [RoomAssignmentDto] })
  assignments!: RoomAssignmentDto[];
}
