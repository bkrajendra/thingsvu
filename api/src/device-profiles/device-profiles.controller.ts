import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CreateDeviceProfileDto } from './dto/create-device-profile.dto';
import { DeviceProfilesService } from './device-profiles.service';

@Controller({ path: 'device-profiles', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
export class DeviceProfilesController {
  constructor(private readonly service: DeviceProfilesService) {}

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateDeviceProfileDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('tenant_admin', 'tenant_user')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles('tenant_admin', 'tenant_user')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @Roles('tenant_admin')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
