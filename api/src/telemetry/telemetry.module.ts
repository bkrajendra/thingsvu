import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryRepository } from './telemetry.repository';

@Module({
  imports: [DatabaseModule, TenancyModule],
  controllers: [TelemetryController],
  providers: [TelemetryRepository],
})
export class TelemetryModule {}
