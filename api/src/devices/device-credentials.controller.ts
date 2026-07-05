import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { DeviceCredentialsService } from './device-credentials.service';

@Controller({ path: 'devices/:deviceId/credentials', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
@Roles('tenant_admin')
export class DeviceCredentialsController {
  constructor(private readonly service: DeviceCredentialsService) {}

  @Post()
  issue(@Param('deviceId') deviceId: string) {
    return this.service.issueAccessToken(deviceId);
  }

  @Get()
  async metadata(@Param('deviceId') deviceId: string) {
    const meta = await this.service.getMetadata(deviceId);
    if (!meta)
      throw new NotFoundException('No credential issued for this device yet');
    return meta;
  }
}
