import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PublicRoomTypeDto } from './dto/public-room-type.dto';

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivePublicRoomTypes(): Promise<PublicRoomTypeDto[]> {
    const roomTypes = await this.prisma.roomType.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        description: true,
        maxGuestsPerRoom: true,
        amenities: true,
      },
    });

    return roomTypes.map((roomType) => ({
      slug: roomType.slug,
      name: roomType.name,
      description: roomType.description,
      maxGuestsPerRoom: roomType.maxGuestsPerRoom,
      amenities: roomType.amenities,
    }));
  }
}
