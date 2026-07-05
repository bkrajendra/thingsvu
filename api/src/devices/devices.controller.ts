import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DevicesService } from './devices.service';

@Controller({ path: 'devices', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Get()
  @Roles('tenant_admin', 'tenant_user')
  findAll() {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @Roles('tenant_admin', 'tenant_user')
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Delete(':id')
  @Roles('tenant_admin')
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
