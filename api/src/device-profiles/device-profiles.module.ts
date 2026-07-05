import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DeviceProfilesController } from './device-profiles.controller';
import { DeviceProfilesService } from './device-profiles.service';

@Module({
  imports: [TenancyModule],
  controllers: [DeviceProfilesController],
  providers: [DeviceProfilesService],
  exports: [DeviceProfilesService],
})
export class DeviceProfilesModule {}
