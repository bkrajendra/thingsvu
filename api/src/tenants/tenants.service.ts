import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantProvisioningService } from '../tenancy/tenant-provisioning.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly provisioning: TenantProvisioningService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  create(dto: CreateTenantDto) {
    return this.provisioning.provision(dto);
  }

  findAll() {
    return ControlTenant.findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<ControlTenant> {
    const tenant = await ControlTenant.findByPk(id);
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<ControlTenant> {
    const tenant = await this.findOne(id);
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.status !== undefined) tenant.status = dto.status;
    await tenant.save();
    // TenantResolutionMiddleware caches this row under tenant:<slug> for
    // 60s; without invalidating it here, suspending a tenant leaves its
    // web-facing routes reachable for up to a minute after the update.
    await this.redis.del(`tenant:${tenant.slug}`);
    return tenant;
  }
}
