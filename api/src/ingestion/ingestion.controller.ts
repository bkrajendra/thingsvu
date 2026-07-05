import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DeviceTokenGuard, type DeviceAuthContext } from './device-token.guard';
import { TelemetryPayloadDto } from './dto/telemetry-payload.dto';
import { IngestionService } from './ingestion.service';

@Controller({ path: 'device', version: '1' })
@UseGuards(DeviceTokenGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('telemetry')
  @HttpCode(204)
  async telemetry(@Req() req: Request & { deviceAuth?: DeviceAuthContext }, @Body() dto: TelemetryPayloadDto): Promise<void> {
    await this.ingestionService.ingest(req.deviceAuth!, dto);
  }
}
