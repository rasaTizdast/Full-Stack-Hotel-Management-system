import { Controller, Get, Query, Put, Body } from '@nestjs/common';
import { RequireStaffRoles } from '../staff-auth/require-staff-roles.decorator';
import { StaffInventoryRangeQueryDto } from './dto/staff-inventory-range-query.dto';
import { StaffInventoryResponseDto } from './dto/staff-inventory-response.dto';
import { UpdateStaffInventoryDto } from './dto/update-staff-inventory.dto';
import { StaffInventoryService } from './staff-inventory.service';

@Controller('staff/inventory')
export class StaffInventoryController {
  constructor(private readonly staffInventory: StaffInventoryService) {}

  @RequireStaffRoles('ADMIN', 'RECEPTIONIST')
  @Get()
  findRange(@Query() query: StaffInventoryRangeQueryDto): Promise<StaffInventoryResponseDto> {
    return this.staffInventory.findRange(query);
  }

  @RequireStaffRoles('ADMIN')
  @Put()
  updateRange(@Body() dto: UpdateStaffInventoryDto): Promise<StaffInventoryResponseDto> {
    return this.staffInventory.updateRange(dto);
  }
}
