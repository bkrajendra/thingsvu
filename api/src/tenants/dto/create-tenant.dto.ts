import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,30}$/, {
    message: 'slug must start with a lowercase letter and contain only lowercase letters, digits, underscores',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
