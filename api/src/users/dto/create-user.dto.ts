import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsIn(['tenant_admin', 'tenant_user'])
  role!: 'tenant_admin' | 'tenant_user';
}
