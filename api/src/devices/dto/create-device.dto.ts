import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  deviceProfileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
