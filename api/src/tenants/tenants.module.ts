import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RedisModule } from '../redis/redis.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TenancyModule, RedisModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
