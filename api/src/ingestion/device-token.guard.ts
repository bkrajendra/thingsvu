import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { hashDeviceToken } from '../common/device-token.util';
import { ControlDeviceTokenIndex } from '../database/models/control/device-token-index.model';
import { ControlTenant } from '../database/models/control/tenant.model';

export interface DeviceAuthContext {
  tenantId: string;
  deviceId: string;
  schemaName: string;
}

@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { deviceAuth?: DeviceAuthContext }>();
    const token = req.headers['x-device-token'];
    if (!token || Array.isArray(token)) {
      throw new UnauthorizedException('Missing X-Device-Token header');
    }

    const tokenHash = hashDeviceToken(token, this.config.get<string>('DEVICE_TOKEN_HASH_SECRET')!);
    const indexRow = await ControlDeviceTokenIndex.findByPk(tokenHash);
    if (!indexRow) {
      throw new UnauthorizedException('Invalid device token');
    }

    const tenant = await ControlTenant.findByPk(indexRow.get('tenantId') as string);
    if (!tenant || tenant.status !== 'active') {
      throw new UnauthorizedException('Tenant is not active');
    }

    req.deviceAuth = {
      tenantId: tenant.id,
      deviceId: indexRow.get('deviceId') as string,
      schemaName: tenant.schemaName,
    };
    return true;
  }
}
