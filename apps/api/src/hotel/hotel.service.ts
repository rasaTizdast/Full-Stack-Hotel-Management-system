import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PublicHotelDto } from './dto/public-hotel.dto';

@Injectable()
export class HotelService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicHotel(): Promise<PublicHotelDto> {
    const hotel = await this.prisma.hotel.findUnique({
      where: { slug: 'shiraz-garden-house' },
      select: {
        slug: true,
        name: true,
        address: true,
        description: true,
        timezone: true,
        contactPhone: true,
        contactEmail: true,
      },
    });

    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }

    return {
      slug: hotel.slug,
      name: hotel.name,
      address: hotel.address,
      description: hotel.description,
      timezone: hotel.timezone,
      contactPhone: hotel.contactPhone,
      contactEmail: hotel.contactEmail,
    };
  }
}
