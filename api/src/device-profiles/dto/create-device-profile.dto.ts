import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeviceProfileDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(['mqtt', 'http', 'default'])
  transport?: 'mqtt' | 'http' | 'default';

  @IsOptional()
  @IsIn(['access_token', 'mqtt_basic'])
  provisionType?: 'access_token' | 'mqtt_basic';

  @IsOptional()
  @IsObject()
  defaultAttributes?: Record<string, unknown>;
}
