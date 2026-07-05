import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule, getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { ControlTenant } from './models/control/tenant.model';
import { ControlPlatformAdmin } from './models/control/platform-admin.model';
import { ControlDeviceTokenIndex } from './models/control/device-token-index.model';

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
        return true;
      },
    },
  ],
  exports: [SequelizeModule, 'CONTROL_MODELS_REGISTERED'],
})
export class DatabaseModule {}
