import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HousekeepingStatus } from '../../generated/prisma/enums';

export class StaffRoomTypeSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Garden double' })
  name!: string;

  @ApiProperty({ example: 'garden-double' })
  slug!: string;
}

export class StaffRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '201' })
  roomNumber!: string;

  @ApiPropertyOptional({ example: '2', nullable: true })
  floor!: string | null;

  @ApiProperty({ type: [String] })
  features!: string[];

  @ApiProperty({ enum: ['DIRTY', 'CLEAN', 'INSPECTED'] })
  housekeepingStatus!: HousekeepingStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isGenerated!: boolean;

  @ApiProperty({ type: StaffRoomTypeSummaryDto })
  roomType!: StaffRoomTypeSummaryDto;
}

export class StaffRoomListDto {
  @ApiProperty({ type: [StaffRoomDto] })
  items!: StaffRoomDto[];
}
