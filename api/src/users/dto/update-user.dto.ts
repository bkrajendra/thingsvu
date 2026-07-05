import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsIn(['tenant_admin', 'tenant_user'])
  role?: 'tenant_admin' | 'tenant_user';

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
