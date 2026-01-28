import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtStrategyExecutor } from './auth/jwt.strategy.executor';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { SchedulerModule } from './common/schedulers/scheduler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { FileSystemModule } from './file-system/file-system.module';
import { FontsModule } from './fonts/fonts.module';
import { GalleryModule } from './gallery/gallery.module';
import { HealthModule } from './health/health.module';
import { MxCadModule } from './mxcad/mxcad.module';
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { AuditLogModule } from './audit/audit-log.module';
import { SystemPermission, ProjectPermission } from './common/dto/permission.dto';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    CommonModule,
    UsersModule,
    RolesModule,
    FileSystemModule,
    FontsModule,
    GalleryModule,
    MxCadModule,
    AdminModule,
    SchedulerModule,
    StorageModule,
    HealthModule,
    AuditLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
      useClass: JwtStrategyExecutor,
    },
  ],
})
export class AppModule {
  static configureSwagger(app: any) {
    const config = new DocumentBuilder()
      .setTitle('CloudCAD API')
      .setDescription('图纸管理平台API文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

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
      enum: [...Object.values(SystemPermission), ...Object.values(ProjectPermission)],
      description: '统一权限枚举',
    };

    SwaggerModule.setup('api/docs', app, document);
  }
}
