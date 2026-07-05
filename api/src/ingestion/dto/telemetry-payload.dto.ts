import { IsNumber, IsObject, IsOptional } from 'class-validator';

export class TelemetryPayloadDto {
  @IsOptional()
  @IsNumber()
  ts?: number;

  @IsObject()
  values!: Record<string, number | string | boolean | Record<string, unknown>>;
}
