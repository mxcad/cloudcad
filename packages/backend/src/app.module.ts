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
import {
  INestApplication,
  Logger,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, NativeLogger } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import { ClsServiceManager } from 'nestjs-cls';
import { pino } from 'pino';

import { join, resolve } from 'path';
import { mkdirSync } from 'fs';
import { PROJECT_ROOT } from './config/configuration';
import { buildPinoHttpOptions } from './config/pino-http-options';
import { resolveLogLevels } from '@cloudcad/contracts';
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
import { NoticeCenterModule } from './notice-center/notice-center.module';

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
// 级别分裂（ADR-0076）：落盘流拿全量（默认 debug），实时流（stdout）生产默认
// 只放行 error。pino 的实例级别是硬门槛——落盘流永远拿不到根级别之外的记录，
// 所以根级别必须等于文件级别，"文件记全量"才真正成立（此前根级别 warn 让
// cleanup_run 等 info 日志在落盘前就被丢弃，#325 需临时 LOG_LEVEL=info 补救）。
// 实时排障期用 LOG_CONSOLE_LEVEL 临时放开，不动落盘级别。
const logLevels = resolveLogLevels(process.env, isProduction);
// 应用日志实例：级别分裂 transport 的唯一持有者。放在模块求值期创建，
// 因为必须在 NestFactory.create() 之前就接管 NestJS 内置 Logger（见下方注释）。
const appPinoOptions = buildPinoHttpOptions(
  logLevels,
  logDirAbs,
  logRetentionDays,
  isProduction,
);
const appLogger = pino(appPinoOptions);
// NestJS 内置 Logger（全仓 181 处 `new Logger(...)`）与框架内部 logger
//（[InstanceLoader] / [RouterExplorer] / [NestFactory]）直写 process.stdout，
// 完全绕过上面的 pino transport：LOG_CONSOLE_LEVEL=error 对它们零作用
//（实测生产前台启动 22s 打出 648 行纯文本、0 行 JSON），这些日志也不落盘。
// 用同一份实例接管：实时流按 LOG_CONSOLE_LEVEL 过滤、落盘流按 LOG_FILE_LEVEL
// 全量写 app.log。overrideLogger 在模块求值期生效，早于 NestFactory.create()，
// 故启动期（含路由映射 360 行）同样收敛。
// NativeLogger 首参的类型标注是它自己的 PinoLogger 包装类（DI 元数据用途），
// 运行时只调用 logger[level](objArg, msg)，pino 原生实例完全满足该契约。
Logger.overrideLogger(
  new NativeLogger(appLogger as unknown as PinoLogger, {
    renameContext: 'context',
  }),
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: envFilePaths,
    }),
    LoggerModule.forRoot({
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
      // pinoHttp 配置整体由 buildPinoHttpOptions 构建（src/config/pino-http-options.ts）：
      // 级别分裂的三个赋值点（根级别 / stdout 目标 / pino-roll 目标）在纯函数里可被单测断言。
      // logger: 复用上面同一个 pino 实例——nestjs-pino 的 PinoLogger 见到 `logger` 键即不新建
      // 实例（isPassedLogger），否则 cleanup_run 等业务日志会走第二个 pino-roll 写同一个 app.log。
      pinoHttp: { ...appPinoOptions, logger: appLogger },
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
    NoticeCenterModule,
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
