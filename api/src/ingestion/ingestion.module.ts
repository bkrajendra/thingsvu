import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DeviceTokenGuard } from './device-token.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionController],
  providers: [IngestionService, DeviceTokenGuard],
})
export class IngestionModule {}
