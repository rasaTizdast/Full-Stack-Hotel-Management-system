import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AvailabilityCriteria } from './date-range';
import { AvailabilityNightDto } from './dto/availability-night.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { AvailabilityRoomTypeDto } from './dto/availability-room-type.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: AvailabilityCriteria): Promise<AvailabilityResponseDto> {
    const roomTypes = await this.prisma.roomType.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        maxGuestsPerRoom: true,
        inventory: {
          where: {
            stayDate: { gte: criteria.checkInDate, lt: criteria.checkOutDate },
          },
          orderBy: { stayDate: 'asc' },
          select: {
            stayDate: true,
            totalRooms: true,
            heldRooms: true,
            bookedRooms: true,
            nightlyPriceToman: true,
          },
        },
      },
    });

    const responseRoomTypes = roomTypes.map((roomType): AvailabilityRoomTypeDto => {
      const inventoryByDate = new Map(
        roomType.inventory.map((inventory) => [
          inventory.stayDate.toISOString().slice(0, 10),
          inventory,
        ]),
      );
      const capacityMet = criteria.guests <= roomType.maxGuestsPerRoom;
      const nightlyBreakdown = criteria.stayDateStrings.map((stayDate): AvailabilityNightDto => {
        const inventory = inventoryByDate.get(stayDate);
        const physicalRoomsAvailable = inventory
          ? inventory.totalRooms - inventory.heldRooms - inventory.bookedRooms
          : 0;
        const availableRooms = capacityMet ? physicalRoomsAvailable : 0;
        return {
          stayDate,
          isAvailable: Boolean(inventory && capacityMet && availableRooms > 0),
          availableRooms,
          nightlyPriceToman: inventory ? inventory.nightlyPriceToman.toString() : null,
        };
      });
      const isAvailable = capacityMet && nightlyBreakdown.every((night) => night.isAvailable);
      const availableRooms = isAvailable
        ? Math.min(...nightlyBreakdown.map((night) => night.availableRooms))
        : 0;
      const totalPriceToman = isAvailable
        ? nightlyBreakdown
            .reduce((total, night) => total + BigInt(night.nightlyPriceToman!), 0n)
            .toString()
        : null;

      return {
        slug: roomType.slug,
        name: roomType.name,
        maxGuestsPerRoom: roomType.maxGuestsPerRoom,
        isAvailable,
        availableRooms,
        totalPriceToman,
        nightlyBreakdown,
      };
    });

    return {
      checkIn: criteria.checkIn,
      checkOut: criteria.checkOut,
      guests: criteria.guests,
      numberOfNights: criteria.numberOfNights,
      roomTypes: responseRoomTypes,
    };
  }
}
