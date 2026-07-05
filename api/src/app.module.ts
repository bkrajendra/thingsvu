import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantResolutionMiddleware } from './tenancy/tenant-resolution.middleware';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { DeviceProfilesModule } from './device-profiles/device-profiles.module';
import { DevicesModule } from './devices/devices.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    TenancyModule,
    TenantsModule,
    UsersModule,
    DeviceProfilesModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
