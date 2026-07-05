import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TenancyModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
