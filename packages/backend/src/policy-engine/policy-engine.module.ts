///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
  imports: [DatabaseModule, CommonModule],
  controllers: [PolicyConfigController],
  providers: [PolicyEngineService, PolicyConfigService],
  exports: [PolicyEngineService, PolicyConfigService],
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
