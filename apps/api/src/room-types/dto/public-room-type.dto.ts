import { ApiProperty } from '@nestjs/swagger';

export class PublicRoomTypeDto {
  @ApiProperty({ example: 'garden-double' })
  slug!: string;

  @ApiProperty({ example: 'اتاق دوتخته باغ' })
  name!: string;

  @ApiProperty({ example: 'اتاقی روشن با منظره باغ.' })
  description!: string;

  @ApiProperty({ minimum: 1, maximum: 20, example: 2 })
  maxGuestsPerRoom!: number;

  @ApiProperty({ type: [String], example: ['wifi', 'breakfast'] })
  amenities!: string[];
}
