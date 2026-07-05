import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createClient, type RedisClientType } from 'redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const SESSION_REDIS_CLIENT = 'SESSION_REDIS_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        }),
    },
    {
      // `connect-redis@9` peer-depends on the `redis` (node-redis v5) client, not `ioredis`:
      // its RedisStore calls `client.set(key, val, { expiration: { type: 'EX', value: ttl } })`
      // and `client.mGet`/`client.scanIterator`, none of which exist (or work the same way) on
      // an ioredis instance. REDIS_CLIENT stays ioredis for Task 7's tenant-cache reuse; this
      // second client exists solely to back the express-session store in main.ts.
      provide: SESSION_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const client = createClient({
          socket: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
          },
        });
        await client.connect();
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT, SESSION_REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @Inject(SESSION_REDIS_CLIENT)
    private readonly sessionRedisClient: RedisClientType,
  ) {}

  // Without this, both underlying sockets stay open past app.close() (e.g. in e2e
  // afterAll hooks), which leaves dangling handles that jest reports as a worker
  // that "failed to exit gracefully".
  async onModuleDestroy(): Promise<void> {
    this.redisClient.disconnect();
    if (this.sessionRedisClient.isOpen) {
      await this.sessionRedisClient.quit();
    }
  }
}
