// 루트 앱 모듈 (전역 설정, 모든 도메인 모듈 등록)
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchModule } from './match/match.module';
import { VoiceModule } from './voice/voice.module';
import { ReportsModule } from './reports/reports.module';
import { RoomsModule } from './rooms/rooms.module';
import { CommunityModule } from './community/community.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { RedisModule } from './common/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Bull Queue 전역 Redis 연결 설정
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          return { redis: { host: 'localhost', port: 6379 } };
        }
        // Upstash TLS 연결: rediss:// URL 파싱
        const url = new URL(redisUrl);
        return {
          redis: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: decodeURIComponent(url.password),
            tls: redisUrl.startsWith('rediss://') ? {} : undefined,
          },
        };
      },
    }),
    SupabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    MatchModule,
    VoiceModule,
    ReportsModule,
    RoomsModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
