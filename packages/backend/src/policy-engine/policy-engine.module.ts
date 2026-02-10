import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { PolicyEngineService } from './services/policy-engine.service';
import { PolicyConfigService } from './services/policy-config.service';
import { PolicyConfigController } from './controllers/policy-config.controller';

/**
 * 策略引擎模块
 *
 * 提供动态权限策略功能
 */
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
  ],
  controllers: [PolicyConfigController],
  providers: [
    PolicyEngineService,
    PolicyConfigService,
  ],
  exports: [
    PolicyEngineService,
    PolicyConfigService,
  ],
})
export class PolicyEngineModule {
  constructor(
    private readonly policyEngine: PolicyEngineService,
    private readonly policyConfig: PolicyConfigService,
  ) {
    // 模块初始化时可以注册默认策略
    this.registerDefaultPolicies();
  }

  /**
   * 注册默认策略
   */
  private registerDefaultPolicies(): void {
    // 这里可以注册一些默认的策略实例
    // 实际的策略配置应该从数据库加载
  }
}