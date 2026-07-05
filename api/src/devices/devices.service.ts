import { Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '../database/models/tenant/device.model';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  scopedModel() {
    return Device.schema(TenantContext.getOrThrow().schemaName);
  }

  create(dto: CreateDeviceDto) {
    return this.scopedModel().create({
      name: dto.name,
      deviceProfileId: dto.deviceProfileId ?? null,
      label: dto.label ?? null,
      status: 'active',
    });
  }

  findAll() {
    return this.scopedModel().findAll({ order: [['createdAt', 'ASC']] });
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.scopedModel().findByPk(id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device as Device;
  }

  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);
    await device.destroy();
  }
}
