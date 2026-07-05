import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { UserProfile } from '../database/models/tenant/user-profile.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

@Injectable()
export class UsersService {
  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  private scopedModel() {
    const { schemaName } = TenantContext.getOrThrow();
    return UserProfile.schema(schemaName);
  }

  async create(
    dto: CreateUserDto,
  ): Promise<{ profile: UserProfile; temporaryPassword: string }> {
    const { tenantId } = TenantContext.getOrThrow();
    const temporaryPassword = generateTemporaryPassword();

    const kcUser = await this.keycloakAdmin.createUser({
      email: dto.email,
      tenantId,
      temporaryPassword,
    });
    await this.keycloakAdmin.assignRealmRole(kcUser.id, dto.role);

    const profile = await this.scopedModel().create({
      keycloakSub: kcUser.id,
      email: dto.email,
      displayName: dto.displayName ?? null,
      role: dto.role,
      status: 'active',
    });

    return { profile, temporaryPassword };
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<UserProfile> {
    const profile = await this.scopedModel().findByPk(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);
    return profile;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserProfile> {
    const profile = await this.findOne(id);
    if (dto.displayName !== undefined) profile.displayName = dto.displayName;
    if (dto.role !== undefined) profile.role = dto.role;
    if (dto.status !== undefined) profile.status = dto.status;
    await profile.save();
    return profile;
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    profile.status = 'disabled';
    await profile.save();
  }
}
