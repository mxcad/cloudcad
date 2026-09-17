///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import './env';
import { INestApplication, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ClsServiceManager } from 'nestjs-cls';

import { join, resolve } from 'path';
import { mkdirSync } from 'fs';
import { PROJECT_ROOT } from './config/configuration';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtStrategyExecutor } from './auth/jwt.strategy.executor';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { IpBlacklistModule } from './ip-blacklist/ip-blacklist.module';
import { IpBlacklistGuard } from './ip-blacklist/ip-blacklist.guard';
import { IpWhitelistModule } from './ip-whitelist/ip-whitelist.module';
import { SecurityAccessAttemptModule } from './security/security-access-attempt.module';
import { SchedulerModule } from './common/schedulers/scheduler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { FileSystemModule } from './file-system/file-system.module';
import { FontsModule } from './fonts/fonts.module';
import { HealthModule } from './health/health.module';
import { MxCadModule } from './mxcad/mxcad.module';
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { AuditLogModule } from './audit/audit-log.module';
import { VersionControlModule } from './version-control/version-control.module';
import {
  SystemPermission,
  ProjectPermission,
} from './common/enums/permissions.enum';
import { CacheArchitectureModule } from './cache-architecture/cache-architecture.module';
import { RuntimeConfigModule } from './runtime-config/runtime-config.module';
import { PublicFileModule } from './public-file/public-file.module';
import { LibraryModule } from './library/library.module';
import { ShareModule } from './share';
import { VipModule } from './vip/vip.module';
import { BillingModule } from './billing/billing.module';
import { I18nModule } from './common/i18n/i18n.module';
import { BatchDownloadModule } from './batch-download/batch-download.module';
import { MetricsModule } from './metrics/metrics.module';
import { OwnershipModule } from './ownership/ownership.module';
import { AlertModule } from './alert/alert.module';
import { TaskRunModule } from './task-run/task-run.module';
import { BackupModule } from './backup/backup.module';
import { ConversionMonitorModule } from './conversion-monitor/conversion-monitor.module';

// env 文件查找路径：支持多种运行模式
// 1. 部署模式 (pkg/node)：优先从运行目录查找 (process.cwd())
// 2. 开发模式：从 backend 目录查找 (__dirname)
// 注意：pkg 打包后 __dirname 会变成虚拟路径 /snapshot/...
// 注意：必须在 ./env 预加载之后才安全读取 process.env（见 src/env.ts）
const backendDir = join(__dirname, '..');
const envFilePaths = [
  // 部署模式：优先从运行目录查找
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  // 开发模式：从 backend 目录查找
  join(backendDir, '.env.local'),
  join(backendDir, '.env'),
];

// ============================================================================
// 日志配置（ADR-0055 §1）：pino 多流落盘（stdout + 文件按天轮转）+ 全量脱敏
// 目录经 LOG_DIR env 可配（相对路径基于项目根解析，默认 data/logs）；
// 保留天数经 LOG_RETENTION_DAYS env 可配（默认 180 天）。
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const logDirRaw = process.env.LOG_DIR || 'data/logs';
// 相对路径基于项目根解析（统一使用 configuration 导出的 PROJECT_ROOT，
// 避免自写 join(__dirname, '../../../../') 因 __dirname 深度不同而解析到部署包外，
// 导致日志写入外部 data/logs 的问题）
const logDirAbs = resolve(PROJECT_ROOT, logDirRaw);
// 幂等创建日志目录（目录权限 0750，等保 8.4.3.3 防篡改；文件权限依赖进程 umask，生产建议 umask 027 → 0640）
mkdirSync(join(logDirAbs, 'backend'), { recursive: true, mode: 0o750 });
const logRetentionDays =
  parseInt(process.env.LOG_RETENTION_DAYS || '180', 10) || 180;
// 根日志级别（#325）：生产默认 warn 保持历史行为不变；需要采集
// cleanup_run 结构化清理日志（cleanup_* 指标对账）时设 LOG_LEVEL=info。
// 仅影响 pino-roll 落盘流；生产 stdout 的 pino/file 目标保持 warn 不刷屏。
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'debug');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: envFilePaths,
    }),
    LoggerModule.forRoot({
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
      pinoHttp: {
        level: logLevel,
        autoLogging: false,
        // pino redact 全量脱敏（ADR-0055 §1）：password/token/authorization/cookie/验证码/手机号/邮箱 等
        redact: {
          paths: [
            'password',
            'passwd',
            'pwd',
            'token',
            'refreshToken',
            'secret',
            'authorization',
            'cookie',
            'set-cookie',
            'req.headers.authorization',
            'req.headers.cookie',
            '*.password',
            '*.passwd',
            '*.pwd',
            '*.token',
            '*.refreshToken',
            '*.secret',
            '*.verificationCode',
            '*.code',
            '*.mobile',
            '*.phone',
            '*.email',
            '*.accessKey',
            '*.accessKeySecret',
            '*.apiKey',
          ],
          censor: '[Redacted]',
        },
        // 多流输出：stdout（容器/PM2 兜底）+ pino-roll 按天轮转落盘（保留 LOG_RETENTION_DAYS 天）
        transport: {
          targets: [
            !isProduction
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                  level: 'debug',
                }
              : {
                  target: 'pino/file',
                  options: { destination: 1 },
                  level: 'warn',
                },
            {
              target: 'pino-roll',
              options: {
                file: join(logDirAbs, 'backend', 'app.log'),
                frequency: 'daily',
                dateFormat: 'yyyy-MM-dd',
                mkdir: true,
                // 保留 N 个已轮转文件 + 当前文件（pino-roll@4 用 limit.count，非 maxFiles）
                limit: { count: logRetentionDays },
              },
              level: logLevel,
            },
          ],
        },
        mixin() {
          try {
            const cls = ClsServiceManager.getClsService();
            const traceId = cls?.get('traceId');
            const requestId = cls?.get('requestId');
            if (traceId || requestId) return { traceId, requestId };
          } catch {
            // CLS 未初始化时静默跳过
          }
          return {};
        },
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    // @nestjs/throttler 路由级限流（per-route @Throttle 装饰器，8 处已有装饰器此前空转）
    // 默认内存存储：standalone 单实例足够；多实例部署需接入 Redis 存储
    // name:'default' 对应 @Throttle({ default: { limit, ttl } }) 的配置入口
    // 全局兜底设为极高值（100000/60s），避免未挂 @Throttle 的高频接口（图纸加载等）被误伤
    ThrottlerModule.forRoot([
      { name: 'default', limit: 100000, ttl: 60000 },
    ]),
    CacheArchitectureModule, // 缓存架构模块（必须在 SchedulerModule 之前导入）
    AuthModule.forRoot(),
    CommonModule,
    IpBlacklistModule,
    IpWhitelistModule,
    SecurityAccessAttemptModule,
    UsersModule,
    RolesModule,
    FileSystemModule,
    FontsModule,

    MxCadModule,
    AdminModule,
    SchedulerModule,
    StorageModule,
    HealthModule,
    AuditLogModule,
    VersionControlModule,
    RuntimeConfigModule,
    PublicFileModule,
    LibraryModule,
    ShareModule,
    VipModule,
    BillingModule,
    I18nModule,
    BatchDownloadModule,
    MetricsModule,
    OwnershipModule,
    AlertModule,
    TaskRunModule,
    BackupModule,
    ConversionMonitorModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: CustomValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: IpBlacklistGuard,
    },
    {
      provide: APP_GUARD,
      // per-route @Throttle 装饰器限流（资金接口 createOrder 5/60s 等 8 处）
      // 在 RateLimitGuard（IP 维度全局兜底）之前执行：先严格路由级，再全局
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtStrategyExecutor,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {
  static configureSwagger(app: INestApplication): void {
    const config = new DocumentBuilder()
      .setTitle('CloudCAD API')
      .setDescription('图纸管理平台API文档')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer('/api/v1')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      ignoreGlobalPrefix: false,
      operationIdFactory: (controllerKey, methodKey) => {
        const cleanMethod = methodKey.replace(/_v\d+$/, '');
        return `${controllerKey}_${cleanMethod}`;
      },
    });

    // 添加权限枚举到 OpenAPI 规范中
    if (!document.components) {
      document.components = { schemas: {} };
    }
    if (!document.components.schemas) {
      document.components.schemas = {};
    }

    // 添加系统权限枚举
    document.components.schemas.SystemPermission = {
      type: 'string',
      enum: Object.values(SystemPermission),
      description: '系统权限枚举',
    };

    // 添加项目权限枚举
    document.components.schemas.ProjectPermission = {
      type: 'string',
      enum: Object.values(ProjectPermission),
      description: '项目权限枚举',
    };

    // 添加统一权限枚举
    document.components.schemas.Permission = {
      type: 'string',
      enum: [
        ...Object.values(SystemPermission),
        ...Object.values(ProjectPermission),
      ],
      description: '统一权限枚举',
    };

    SwaggerModule.setup('api/docs', app, document);
  }
}
