import { Global, Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { FileTreeModule } from '../file-system/file-tree/file-tree.module';
import { PermissionModule } from '../permission/permission.module';
import { RedisModule } from '../redis/redis.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { StorageUsageService } from './storage-usage/storage-usage.service';
import { VipController, VipAdminController } from './vip.controller';
import { VipTierService } from './vip-tier.service';
import { DurationPricingService } from './duration-pricing.service';
import { ConfigKeyRegistryService } from './config-key-registry.service';
import { MembershipService } from './membership.service';
import { RestrictionEngine } from './restriction-engine.service';
import { RESTRICTION_STRATEGY } from './interfaces/restriction-strategy.interface';
import { ProjectSizeStrategy } from './strategies/project-size.strategy';
import { PersonalStorageStrategy } from './strategies/personal-storage.strategy';
import { MaxProjectsStrategy } from './strategies/max-projects.strategy';
import { CONVERSION_ACCESS_GUARD } from '../common/interfaces/conversion-access-guard';

@Global()
@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    PermissionModule,
    RedisModule,
    RuntimeConfigModule,
    FileTreeModule,
  ],
  controllers: [VipController, VipAdminController],
  providers: [
    VipTierService,
    DurationPricingService,
    ConfigKeyRegistryService,
    MembershipService,
    RestrictionEngine,
    StorageUsageService,
    ProjectSizeStrategy,
    PersonalStorageStrategy,
    MaxProjectsStrategy,
    {
      provide: RESTRICTION_STRATEGY,
      useFactory: (
        s1: ProjectSizeStrategy,
        s2: PersonalStorageStrategy,
        s3: MaxProjectsStrategy
      ) => [s1, s2, s3],
      inject: [
        ProjectSizeStrategy,
        PersonalStorageStrategy,
        MaxProjectsStrategy,
      ],
    },
    // 转换服务（Layer3 MxcadModule/ConversionModule）通过 @Optional() 注入此门控做
    // 导出下载方向会员授权；门控抽象定义在 Layer1 common/interfaces，实现由 VIP 模块提供，
    // 双方只依赖 Layer1，符合 ADR-0007 三层依赖方向
    {
      provide: CONVERSION_ACCESS_GUARD,
      useExisting: RestrictionEngine,
    },
  ],
  exports: [
    VipTierService,
    DurationPricingService,
    ConfigKeyRegistryService,
    MembershipService,
    RestrictionEngine,
    StorageUsageService,
    RESTRICTION_STRATEGY,
    CONVERSION_ACCESS_GUARD,
  ],
})
export class VipModule {}
