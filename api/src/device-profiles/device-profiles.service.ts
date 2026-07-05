import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceProfile } from '../database/models/tenant/device-profile.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateDeviceProfileDto } from './dto/create-device-profile.dto';

@Injectable()
export class DeviceProfilesService {
  private scopedModel() {
    return DeviceProfile.schema(TenantContext.getOrThrow().schemaName);
  }

  create(dto: CreateDeviceProfileDto) {
    return this.scopedModel().create({
      name: dto.name,
      transport: dto.transport ?? 'http',
      provisionType: dto.provisionType ?? 'access_token',
      defaultAttributes: dto.defaultAttributes ?? {},
    });
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<DeviceProfile> {
    const profile = await this.scopedModel().findByPk(id);
    if (!profile) throw new NotFoundException(`Device profile ${id} not found`);
    return profile as DeviceProfile;
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    await profile.destroy();
  }
}
