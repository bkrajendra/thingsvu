import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { TenantContext } from '../tenancy/tenant-context';
import { TelemetryRepository } from './telemetry.repository';

@Controller({ path: 'telemetry', version: '1' })
@UseGuards(TenantGuard, RolesGuard)
@Roles('tenant_admin', 'tenant_user')
export class TelemetryController {
  constructor(private readonly repository: TelemetryRepository) {}

  @Get('latest')
  latest(@Query('deviceIds') deviceIds: string, @Query('keys') keys?: string) {
    const { schemaName } = TenantContext.getOrThrow();
    const deviceIdList = deviceIds.split(',').filter(Boolean);
    const keyList = keys ? keys.split(',').filter(Boolean) : undefined;
    return this.repository.latest(schemaName, deviceIdList, keyList);
  }

  @Get('series')
  series(
    @Query('deviceId') deviceId: string,
    @Query('key') key: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { schemaName } = TenantContext.getOrThrow();
    return this.repository.series(schemaName, {
      deviceId,
      key,
      from: from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000),
      to: to ? new Date(to) : new Date(),
    });
  }
}
