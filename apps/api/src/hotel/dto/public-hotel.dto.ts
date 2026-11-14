import { ApiProperty } from '@nestjs/swagger';

export class PublicHotelDto {
  @ApiProperty({ example: 'shiraz-garden-house' })
  slug!: string;

  @ApiProperty({ example: 'خانه‌باغ نارنج؛ هتل نمایشی' })
  name!: string;

  @ApiProperty({ example: 'شیراز، نشانی نمایشی شماره ۱' })
  address!: string;

  @ApiProperty({ example: 'اقامتگاهی خیالی برای نمایش سامانه رزرو.' })
  description!: string;

  @ApiProperty({ example: 'Asia/Tehran' })
  timezone!: string;

  @ApiProperty({ nullable: true, example: '+987112345678' })
  contactPhone!: string | null;

  @ApiProperty({ nullable: true, format: 'email', example: 'hello@example.invalid' })
  contactEmail!: string | null;
}
