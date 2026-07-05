import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceCredentialsController } from './device-credentials.controller';
import { DeviceCredentialsService } from './device-credentials.service';

@Module({
  imports: [TenancyModule],
  controllers: [DevicesController, DeviceCredentialsController],
  providers: [DevicesService, DeviceCredentialsService],
  exports: [DevicesService],
})
export class DevicesModule {}
