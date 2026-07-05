import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/sequelize';
import { randomBytes } from 'node:crypto';
import { Sequelize } from 'sequelize';
import { hashDeviceToken } from '../common/device-token.util';
import { DeviceCredential } from '../database/models/tenant/device-credential.model';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { TenantContext } from '../tenancy/tenant-context';
import { DevicesService } from './devices.service';

@Injectable()
export class DeviceCredentialsService {
  constructor(
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
    @Inject(getConnectionToken()) private readonly sequelize: Sequelize,
  ) {}

  async issueAccessToken(
    deviceId: string,
  ): Promise<{ token: string; credential: DeviceCredential }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await this.devicesService.findOne(deviceId);

    const token = randomBytes(24).toString('base64url');
    const tokenHash = hashDeviceToken(
      token,
      this.config.get<string>('DEVICE_TOKEN_HASH_SECRET')!,
    );
    const ScopedCredential = DeviceCredential.schema(schemaName);

    const credential = await this.sequelize.transaction(async (transaction) => {
      const existing = await ScopedCredential.findOne({
        where: { deviceId },
        transaction,
      });
      if (existing) {
        await ControlDeviceTokenIndex.destroy({
          where: { tokenHash: existing.get('tokenHash') as string },
          transaction,
        });
        await existing.destroy({ transaction });
      }

      const created = await ScopedCredential.create(
        { deviceId, credentialType: 'access_token', tokenHash },
        { transaction },
      );
      await ControlDeviceTokenIndex.create(
        { tokenHash, tenantId, deviceId, credentialType: 'access_token' },
        { transaction },
      );
      return created;
    });

    return { token, credential };
  }

  async getMetadata(
    deviceId: string,
  ): Promise<{ credentialType: string; createdAt: Date } | null> {
    const { schemaName } = TenantContext.getOrThrow();
    const credential = await DeviceCredential.schema(schemaName).findOne({
      where: { deviceId },
    });
    if (!credential) return null;
    return {
      credentialType: credential.get('credentialType'),
      createdAt: credential.get('createdAt') as Date,
    };
  }
}
