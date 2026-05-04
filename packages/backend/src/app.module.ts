///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';

import { AuthModule } from './auth/auth.module';
import { JwtStrategyExecutor } from './auth/jwt.strategy.executor';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
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
} from './common/dto/permission.dto';
import { PolicyEngineModule } from './policy-engine/policy-engine.module';
import { CacheArchitectureModule } from './cache-architecture/cache-architecture.module';
import { RuntimeConfigModule } from './runtime-config/runtime-config.module';
import { PublicFileModule } from './public-file/public-file.module';
import { LibraryModule } from './library/library.module';

// env 文件查找路径：支持多种运行模式
// 1. 部署模式 (pkg/node)：优先从运行目录查找 (process.cwd())
// 2. 开发模式：从 backend 目录查找 (__dirname)
// 注意：pkg 打包后 __dirname 会变成虚拟路径 /snapshot/...
const backendDir = join(__dirname, '..', '..');
const envFilePaths = [
  // 部署模式：优先从运行目录查找
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  // 开发模式：从 backend 目录查找
  join(backendDir, '.env.local'),
  join(backendDir, '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: envFilePaths,
    }),
    DatabaseModule,
    RedisModule,
    CacheArchitectureModule, // 缓存架构模块（必须在 SchedulerModule 之前导入）
    AuthModule,
    CommonModule,
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
    PolicyEngineModule,
    RuntimeConfigModule,
    PublicFileModule,
    LibraryModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
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
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    });

    // 去掉 URI 版本化导致的 _v1 后缀
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const method of Object.values(methods) as any[]) {
        if (method.operationId?.endsWith('_v1')) {
          method.operationId = method.operationId.slice(0, -3);
        }
      }
    }

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
