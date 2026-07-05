import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import { TenantGuard } from './tenant.guard';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [TenantProvisioningService, TenantResolutionMiddleware, TenantGuard],
  exports: [TenantProvisioningService, TenantResolutionMiddleware, TenantGuard],
})
export class TenancyModule {}
