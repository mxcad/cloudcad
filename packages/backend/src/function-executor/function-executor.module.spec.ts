///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { BatchDelegateConversionExecutor } from './batch-delegate.executor';
import { CloudFaaSExecutor } from './cloud-faas/cloud-faas.executor';
import { FaaS_PROVIDER } from './cloud-faas/interfaces/faas-provider.interface';
import { IFunctionExecutor } from './function-executor.interface';
import { HttpConversionExecutor } from './http-conversion.executor';
import { ProcessPoolExecutor } from './process-pool.executor';
import {
  selectFaasProvider,
  selectFunctionExecutor,
} from './function-executor.module';
import { HuaweiExecutor } from './cloud-faas/providers/huawei.executor';
import { AliyunExecutor } from './cloud-faas/providers/aliyun.executor';
import { LambdaExecutor } from './cloud-faas/providers/aws.executor';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';

function makeConfigService(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => overrides[key] ?? undefined),
  } as unknown as ConfigService;
}

const select = (overrides: Record<string, string> = {}) =>
  selectFaasProvider(makeConfigService(overrides));

describe('selectFaasProvider 按 CLOUD_FAAS_PROVIDER 选择厂商', () => {
  it('未设置时回默认华为', () => {
    expect(select()).toBeInstanceOf(HuaweiExecutor);
  });

  it('显式 huawei 选择华为', () => {
    expect(select({ CLOUD_FAAS_PROVIDER: 'huawei' })).toBeInstanceOf(HuaweiExecutor);
  });

  it('aliyun 选择阿里云', () => {
    expect(select({ CLOUD_FAAS_PROVIDER: 'aliyun' })).toBeInstanceOf(AliyunExecutor);
  });

  it('aws 选择 AWS Lambda', () => {
    expect(select({ CLOUD_FAAS_PROVIDER: 'aws' })).toBeInstanceOf(LambdaExecutor);
  });

  it('未知值告警并回退华为', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    expect(select({ CLOUD_FAAS_PROVIDER: 'tencent' })).toBeInstanceOf(HuaweiExecutor);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown FaaS provider: tencent'));
  });
});

describe('FaaS_PROVIDER 工厂解析并注入 CloudFaaSExecutor', () => {
  it('执行器拿到的正是工厂解析出的 provider 实例', async () => {
    // 用与 function-executor.module.ts 完全相同的 provider 定义，
    // 验证 @Inject(FaaS_PROVIDER) 这条注入链真的走得通。
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: makeConfigService({ CLOUD_FAAS_PROVIDER: 'aws' }),
        },
        {
          provide: FaaS_PROVIDER,
          useFactory: selectFaasProvider,
          inject: [ConfigService],
        },
        CloudFaaSExecutor,
      ],
    }).compile();

    const provider = module.get(FaaS_PROVIDER);
    expect(provider).toBeInstanceOf(LambdaExecutor);
    expect((module.get(CloudFaaSExecutor) as any).provider).toBe(provider);
  });
});

describe('IFunctionExecutor 工厂按 FUNCTION_EXECUTOR 选定 adapter', () => {
  async function resolveExecutor(mode?: string) {
    // 用与 function-executor.module.ts 完全相同的 provider 定义，
    // 验证 useFactory: selectFunctionExecutor + inject 这条接线真的走得通。
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: makeConfigService(mode ? { FUNCTION_EXECUTOR: mode } : {}),
        },
        ProcessPoolExecutor,
        HttpConversionExecutor,
        CloudFaaSExecutor,
        {
          provide: FaaS_PROVIDER,
          useFactory: selectFaasProvider,
          inject: [ConfigService],
        },
        { provide: ClsService, useValue: {} },
        { provide: MXCAD_CONVERSION_SERVICE, useValue: {} },
        {
          provide: IFunctionExecutor,
          useFactory: selectFunctionExecutor,
          inject: [
            ConfigService,
            ProcessPoolExecutor,
            HttpConversionExecutor,
            CloudFaaSExecutor,
          ],
        },
      ],
    }).compile();

    const executor = module.get(IFunctionExecutor);
    await module.close();
    return executor;
  }

  it('未设置时回默认 process-pool（进程内 spawn 恒可用）', async () => {
    expect(await resolveExecutor()).toBeInstanceOf(ProcessPoolExecutor);
  });

  it('conversion-service 选择 HttpConversionExecutor', async () => {
    expect(await resolveExecutor('conversion-service')).toBeInstanceOf(
      HttpConversionExecutor,
    );
  });

  it('cloud-faas 选择 CloudFaaSExecutor', async () => {
    expect(await resolveExecutor('cloud-faas')).toBeInstanceOf(CloudFaaSExecutor);
  });

  it('未知值回退 process-pool', async () => {
    expect(await resolveExecutor('nope')).toBeInstanceOf(ProcessPoolExecutor);
  });

  it('各 adapter 的 isRemote 声明与转发安全性一致', async () => {
    // FUNCTION_EXECUTOR 的配置读取只在本模块一处；FileConversionService 不再读配置，
    // 只按执行器自声明的 isRemote === true 转发。本地执行器的 invoke 回调本服务，
    // 转发即 convertFile↔invoke 无限递归死锁。此处把「模块选谁」与「能否转发」
    // 绑在同一条断言上，防止两者漂移。
    expect((await resolveExecutor()).isRemote).toBe(false);
    expect((await resolveExecutor('conversion-service')).isRemote).toBe(true);
    expect((await resolveExecutor('cloud-faas')).isRemote).toBe(false);
  });
});

describe('BATCH_DOWNLOAD_DELEGATE_WORKFLOW：批量委托能力在唯一 seam 上包装', () => {
  // batchDownload 配置段返回对象（delegateWorkflow 开关），其余 key 走 undefined
  function makeDelegateConfigService(
    overrides: Record<string, string> = {}
  ): ConfigService {
    return {
      get: jest.fn((key: string) => {
        if (key === 'batchDownload') return { delegateWorkflow: true };
        return overrides[key] ?? undefined;
      }),
    } as unknown as ConfigService;
  }

  async function resolveDelegateExecutor(mode?: string) {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: makeDelegateConfigService(
            mode ? { FUNCTION_EXECUTOR: mode } : {}
          ),
        },
        ProcessPoolExecutor,
        HttpConversionExecutor,
        CloudFaaSExecutor,
        {
          provide: FaaS_PROVIDER,
          useFactory: selectFaasProvider,
          inject: [ConfigService],
        },
        { provide: ClsService, useValue: {} },
        { provide: MXCAD_CONVERSION_SERVICE, useValue: {} },
        {
          provide: IFunctionExecutor,
          useFactory: selectFunctionExecutor,
          inject: [
            ConfigService,
            ProcessPoolExecutor,
            HttpConversionExecutor,
            CloudFaaSExecutor,
          ],
        },
      ],
    }).compile();

    const executor = module.get(IFunctionExecutor);
    await module.close();
    return executor;
  }

  it('开关开启时包装 base 执行器，带批量原语（submitBatch/waitBatch）', async () => {
    const executor = await resolveDelegateExecutor();
    expect(executor).toBeInstanceOf(BatchDelegateConversionExecutor);
    const delegate = executor as BatchDelegateConversionExecutor;
    expect(typeof delegate.submitBatch).toBe('function');
    expect(typeof delegate.waitBatch).toBe('function');
    // 委托能力叠加在既有 base（默认 process-pool）之上，invoke 等原语透传 base
    expect((delegate as any).base).toBeInstanceOf(ProcessPoolExecutor);
    expect(executor.isRemote).toBe(false);
  });

  it('base 为 conversion-service 时 isRemote 随 base 为 true', async () => {
    const executor = await resolveDelegateExecutor('conversion-service');
    expect(executor).toBeInstanceOf(BatchDelegateConversionExecutor);
    expect(executor.isRemote).toBe(true);
  });
  // 开关关闭（batchDownload 配置缺省）时不包装：既有用例「未设置时回默认
  // process-pool」已断言 IFunctionExecutor 是裸 ProcessPoolExecutor（无批量原语）。
});
