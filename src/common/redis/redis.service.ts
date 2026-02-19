import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      console.warn('Redis URL not configured, using in-memory fallback');
      return;
    }

    this.client = new Redis(redisUrl, {
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (!this.client) return;
    await this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    if (!this.client) return;
    await this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) return [];
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    if (!this.client) return 0;
    return this.client.scard(key);
  }

  // Redis 연결 확인 (ping → pong)
  async ping(): Promise<string> {
    if (!this.client) return 'no-redis';
    return this.client.ping();
  }
}
