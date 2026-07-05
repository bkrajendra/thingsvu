import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  imports: [DatabaseModule],
  providers: [TenantProvisioningService],
  exports: [TenantProvisioningService],
})
export class TenancyModule {}
