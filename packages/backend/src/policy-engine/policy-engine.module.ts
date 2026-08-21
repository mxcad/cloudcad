///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { PolicyEngineService } from './services/policy-engine.service';
import { PolicyConfigService } from './services/policy-config.service';
import { PolicyConfigController } from './controllers/policy-config.controller';
import { PolicyFactoryService } from './services/policy-factory.service';
/**
 * 策略引擎模块
 *
 * 提供动态权限策略功能
 */
/**
 * 权限策略引擎模块
 *
 * ⚠️ 状态：未激活（能力完整，生产链路未接线）
 * - 唯一入口 checkSystemPermissionWithContext 无生产调用方（业务代码均走 checkSystemPermission）
 * - PermissionPolicy 策略表无数据；registerDefaultPolicies 为空实现
 * - 当前不影响任何权限判定（ContextPermissionStrategy 为 @Optional() 注入）
 * 激活条件：① 业务调用方改走带 context 的权限检查并传 context；② 管理员配置策略数据
 */
@Module({
  imports: [DatabaseModule, CommonModule, PermissionModule],
  controllers: [PolicyConfigController],
  providers: [PolicyFactoryService, PolicyEngineService, PolicyConfigService],
  exports: [PolicyFactoryService, PolicyEngineService, PolicyConfigService],
})
export class PolicyEngineModule {
  constructor(
    private readonly policyEngine: PolicyEngineService,
    private readonly policyConfig: PolicyConfigService
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
