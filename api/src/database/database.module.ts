import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule, getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { ControlTenant } from './models/control/tenant.model';
import { ControlPlatformAdmin } from './models/control/platform-admin.model';
import { ControlDeviceTokenIndex } from './models/control/device-token-index.model';
import { UserProfile } from './models/tenant/user-profile.model';
import { DeviceProfile } from './models/tenant/device-profile.model';
import { Device } from './models/tenant/device.model';
import { DeviceCredential } from './models/tenant/device-credential.model';
import { DeviceTag } from './models/tenant/device-tag.model';
import { DeviceTagMap } from './models/tenant/device-tag-map.model';
import { DeviceAttribute } from './models/tenant/device-attribute.model';
import { TelemetryLatest } from './models/tenant/telemetry-latest.model';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        logging: false,
      }),
    }),
  ],
  providers: [
    {
      provide: 'CONTROL_MODELS_REGISTERED',
      inject: [getConnectionToken()],
      useFactory: (sequelize: Sequelize) => {
        ControlTenant.initModel(sequelize);
        ControlPlatformAdmin.initModel(sequelize);
        ControlDeviceTokenIndex.initModel(sequelize);
        // Tenant-schema models are schema-agnostic at init time (bound per-call
        // via Model.schema(schemaName)) but still must be registered against the
        // live Sequelize connection once at bootstrap, the same as control models.
        UserProfile.initModel(sequelize);
        DeviceProfile.initModel(sequelize);
        Device.initModel(sequelize);
        DeviceCredential.initModel(sequelize);
        DeviceTag.initModel(sequelize);
        DeviceTagMap.initModel(sequelize);
        DeviceAttribute.initModel(sequelize);
        TelemetryLatest.initModel(sequelize);
        return true;
      },
    },
  ],
  exports: [SequelizeModule, 'CONTROL_MODELS_REGISTERED'],
})
export class DatabaseModule {}
