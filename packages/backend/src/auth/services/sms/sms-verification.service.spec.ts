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

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { SmsVerificationService } from './sms-verification.service';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';

/** 内存版 Redis 假实现：覆盖 verifyCode 用到的 get/incr/ttl/expire/del */
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    incr: jest.fn(async (key: string) => {
      const next = (parseInt(store.get(key) || '0', 10) || 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    ttl: jest.fn(async () => 60),
    expire: jest.fn(async () => 1),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return keys.length;
    }),
  };
}

const PHONE = '13800000000';
const codeKey = `sms_verification:code:+86${PHONE}`;
const attemptsKey = `sms_verification:verify_attempts:+86${PHONE}:${
  new Date().toISOString().slice(0, 10)
}`;

describe('SmsVerificationService.verifyCode', () => {
  let service: SmsVerificationService;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis = createMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsVerificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'cacheTTL'
                ? { verificationCode: 900, verificationRateLimit: 60 }
                : undefined
            ),
          },
        },
        { provide: RuntimeConfigService, useValue: { getValue: jest.fn() } },
        { provide: getRedisConnectionToken(), useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SmsVerificationService>(SmsVerificationService);
  });

  it('验证码未存储或已过期时返回 false 且不计次', async () => {
    const result = await service.verifyCode(PHONE, '000000');

    expect(result).toEqual({
      valid: false,
      message: '验证码已过期，请重新获取',
    });
    expect(mockRedis.incr).not.toHaveBeenCalled();
  });

  it('正确验证码通过并清除计数', async () => {
    mockRedis.store.set(codeKey, '123456');

    const result = await service.verifyCode(PHONE, '123456');

    expect(result.valid).toBe(true);
    expect(mockRedis.store.has(codeKey)).toBe(false);
    expect(mockRedis.store.has(attemptsKey)).toBe(false);
  });

  it('错答按 4/3/2/1/0 递减，第 6 次拦截（与邮箱验证码上限口径一致）', async () => {
    mockRedis.store.set(codeKey, '123456');

    for (let remaining = 4; remaining >= 0; remaining--) {
      const result = await service.verifyCode(PHONE, '000000');
      expect(result.message).toBe(`验证码错误，剩余 ${remaining} 次尝试机会`);
      expect(result.remainingAttempts).toBe(remaining);
    }
    expect(mockRedis.store.has(codeKey)).toBe(true);

    const exhausted = await service.verifyCode(PHONE, '000000');
    expect(exhausted.valid).toBe(false);
    expect(exhausted.message).toBe('验证次数已用完，请重新获取验证码');
    expect(mockRedis.store.has(codeKey)).toBe(false);
    expect(mockRedis.store.has(attemptsKey)).toBe(false);
  });

  it('并发错答不得绕过次数上限：计数只来自原子 incr，不读 get', async () => {
    mockRedis.store.set(codeKey, '123456');

    // 10 个并发错答：旧 get→判定→incr 两步实现会全部读到 0 而绕过上限，
    // 原子 incr 保证最多 5 次被放行（带 remainingAttempts 的即为放行的错答）
    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.verifyCode(PHONE, '000000'))
    );
    const accepted = results.filter((r) => r.remainingAttempts !== undefined).length;
    expect(accepted).toBeLessThanOrEqual(5);
    expect(mockRedis.get).not.toHaveBeenCalledWith(attemptsKey);
  });

  it('配置缺失时构造期立刻失败，而不是静默兜底验证码有效期（#483）', () => {
    // 历史实现是 `cacheTTL?.verificationCode ?? 300`，与 configuration.ts 的默认 900
    // 悄悄差 3 倍：运维改 .env 以为改了验证码有效期，实际生效的仍是配置中心的值。
    // 配置面不提供兜底后，取值失败必须在这里暴露出来，不许再各写一份默认值。
    expect(() =>
      new SmsVerificationService(
        { get: () => undefined } as never,
        { getValue: jest.fn() } as never,
        mockRedis as never
      )
    ).toThrow(/verificationCode/);
  });
});

describe('SmsVerificationService 短信 provider 指纹热重建（ADR-0082 #502）', () => {
  let service: SmsVerificationService;
  let values: Record<string, unknown>;
  let runtimeConfigGetValue: jest.Mock;

  const baseValues: Record<string, unknown> = {
    smsEnabled: true,
    smsProvider: 'aliyun',
    aliyunSmsAccessKeyId: 'LTAI-ak',
    aliyunSmsAccessKeySecret: 'aliyun-sk',
    aliyunSmsSignName: 'CloudCAD',
    aliyunSmsTemplateCode: 'SMS_123',
    aliyunSmsRegionId: 'cn-hangzhou',
    tencentSmsSecretId: 'AKID-tid',
    tencentSmsSecretKey: 'tencent-sk',
    tencentSmsAppId: '1400000000',
    tencentSmsSignName: 'CloudCAD',
    tencentSmsTemplateCode: '100000',
    tencentSmsRegion: 'ap-guangzhou',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    values = { ...baseValues };

    const module = await Test.createTestingModule({
      providers: [
        SmsVerificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'cacheTTL'
                ? { verificationCode: 900, verificationRateLimit: 60 }
                : undefined
            ),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: {
            getValue: (runtimeConfigGetValue = jest.fn(async (key: string) => values[key])),
          },
        },
        { provide: getRedisConnectionToken(), useValue: createMockRedis() },
      ],
    }).compile();

    service = module.get<SmsVerificationService>(SmsVerificationService);
  });

  it('getProvider 不再读取 smsEnabled：总闸语义与 provider 选择分离', async () => {
    const getProvider = (service as never as {
      getProvider: () => Promise<{ name: string }>;
    }).getProvider.bind(service);

    // 回归（缺陷 #2）：旧实现在 !smsEnabled 时回落 MockSmsProvider，导致
    // `smsEnabled=false` 下 send-sms-code 照样落码——开关形同虚设，与
    // account-binding / forgot-password 的 4 个 sibling 端点结论相反。
    // 现在总闸门禁在 sendVerificationCode，getProvider 只回答「用哪个 provider」，
    // 因此翻转 smsEnabled 既不改变 provider，也不改变指纹（不触发重建）。
    values.smsEnabled = false;
    const first = await getProvider();
    expect(first.name).toBe('aliyun');

    values.smsEnabled = true;
    const second = await getProvider();
    expect(second).toBe(first);

    expect(values).toHaveProperty('smsEnabled');
  });

  it('smsEnabled=false → sendVerificationCode 直接拒绝，且不解析 provider（总闸生效）', async () => {
    values.smsEnabled = false;

    await expect(service.sendVerificationCode(PHONE)).rejects.toThrow(
      '短信服务未启用'
    );
    // 门禁在 provider 解析之前短路：若门禁失效，会去读 smsProvider 并落码
    expect(runtimeConfigGetValue).not.toHaveBeenCalledWith('smsProvider');
  });

  it('smsEnabled=true + smsProvider=mock → Mock 是唯一的开发期 Mock 入口', async () => {
    values.smsEnabled = true;
    values.smsProvider = 'mock';

    const provider = (service as never as {
      getProvider: () => Promise<{ name: string }>;
    }).getProvider();

    expect((await provider).name).toBe('mock');
  });

  it('启用 + aliyun 凭据完整 → 阿里云 provider；配置不变时复用同一实例', async () => {
    const first = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();
    const second = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();

    expect(first.name).toBe('aliyun');
    expect(second).toBe(first);
  });

  it('凭据被改写 → 指纹变化，重建 provider', async () => {
    const first = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();

    values.aliyunSmsAccessKeyId = 'LTAI-ak-2';

    const second = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();

    expect(second.name).toBe('aliyun');
    expect(second).not.toBe(first);
  });

  it('启用但所选服务商凭据缺失 → 回落 Mock 模式（不抛错）', async () => {
    values.aliyunSmsAccessKeyId = '';
    values.aliyunSmsAccessKeySecret = '';

    const provider = (service as never as {
      getProvider: () => Promise<{ name: string }>;
    }).getProvider();

    expect((await provider).name).toBe('mock');
  });

  it('smsProvider 切换 aliyun → tencent → 腾讯云 provider', async () => {
    const first = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();
    expect(first.name).toBe('aliyun');

    values.smsProvider = 'tencent';

    const second = await (
      service as never as { getProvider: () => Promise<{ name: string }> }
    ).getProvider();

    expect(second.name).toBe('tencent');
    expect(second).not.toBe(first);
  });

  it('smsProvider=mock → Mock 模式', async () => {
    values.smsProvider = 'mock';

    const provider = (service as never as {
      getProvider: () => Promise<{ name: string }>;
    }).getProvider();

    expect((await provider).name).toBe('mock');
  });
});
