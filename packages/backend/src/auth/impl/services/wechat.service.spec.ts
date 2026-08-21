import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { WechatService } from './wechat.service';

const originalFetch = global.fetch;

describe('WechatService', () => {
  let service: WechatService;

  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');

    mockConfigService.get.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        WECHAT_APP_ID: 'wx_test',
        WECHAT_APP_SECRET: 'secret',
        WECHAT_CALLBACK_URL: 'https://example.com/api/v1/auth/wechat/callback',
      };
      return map[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatService,
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WechatService>(WechatService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getAccessToken', () => {
    it('成功获取 access_token 并写入幂等缓存', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ access_token: 'at1', openid: 'o1' }),
      }) as unknown as typeof fetch;

      const result = await service.getAccessToken('code1');

      expect(result.access_token).toBe('at1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'wechat:access_token:wx_test:code1:lock',
        '1',
        'EX',
        15,
        'NX'
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'wechat:access_token:wx_test:code1',
        600,
        JSON.stringify({ access_token: 'at1', openid: 'o1' })
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        'wechat:access_token:wx_test:code1:lock'
      );
    });

    it('命中幂等缓存时不调用微信 API', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ access_token: 'at1', openid: 'o1' })
      );
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await service.getAccessToken('code1');

      expect(result.access_token).toBe('at1');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('微信返回 errcode 时抛出"微信授权失败"（不被 catch 吞掉）', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ errcode: 40029, errmsg: 'code been used' }),
      }) as unknown as typeof fetch;

      await expect(service.getAccessToken('code1')).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(service.getAccessToken('code1')).rejects.toThrow(
        /微信授权失败/
      );
    });

    it('fetch 网络异常时抛出"微信授权服务异常"', async () => {
      mockRedis.get.mockResolvedValue(null);
      global.fetch = jest
        .fn()
        .mockRejectedValue(
          new TypeError('fetch failed')
        ) as unknown as typeof fetch;

      await expect(service.getAccessToken('code1')).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(service.getAccessToken('code1')).rejects.toThrow(
        /微信授权服务异常/
      );
    });

    it('Redis 读取失败时降级直调微信 API', async () => {
      mockRedis.get.mockRejectedValue(new Error('redis down'));
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ access_token: 'at1', openid: 'o1' }),
      }) as unknown as typeof fetch;

      const result = await service.getAccessToken('code1');

      expect(result.access_token).toBe('at1');
    });

    it('Redis 写入失败时不影响登录流程', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error('redis down'));
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ access_token: 'at1', openid: 'o1' }),
      }) as unknown as typeof fetch;

      const result = await service.getAccessToken('code1');

      expect(result.access_token).toBe('at1');
    });

    it('并发重放：未抢到锁时等待持锁者写缓存后命中，不再调用微信 API', async () => {
      mockRedis.set.mockResolvedValue(null); // NX 未抢到锁
      mockRedis.get
        .mockResolvedValueOnce(null) // 首次读缓存 miss
        .mockResolvedValueOnce(
          // 等待后重读命中
          JSON.stringify({ access_token: 'at1', openid: 'o1' })
        );
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await service.getAccessToken('code1');

      expect(result.access_token).toBe('at1');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('getUserInfo', () => {
    it('微信返回 errcode 时抛出"获取用户信息失败"（不被 catch 吞掉）', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ errcode: 40003, errmsg: 'invalid openid' }),
      }) as unknown as typeof fetch;

      await expect(service.getUserInfo('at1', 'o1')).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(service.getUserInfo('at1', 'o1')).rejects.toThrow(
        /获取用户信息失败/
      );
    });
  });

  describe('getAuthUrl / getMobileAuthUrl', () => {
    it('state 做 URL 编码：含 +/=/ 的 base64 不会被 query 解析破坏', () => {
      // base64 JSON 常见字符 + / = 若不编码，+ 会被 Express 解析为空格，
      // 回调侧 validateState 失败导致登录/绑定全链路 400（历史缺陷）
      const state = Buffer.from(
        JSON.stringify({ csrf: 'a'.repeat(64), purpose: 'bind' })
      ).toString('base64');
      expect(state).toMatch(/[+/=]/);

      const authUrl = service.getAuthUrl(state);
      const encodedState = encodeURIComponent(state);
      expect(authUrl).toContain(`state=${encodedState}`);
      expect(authUrl).not.toContain(`state=${state}`);

      const mobileAuthUrl = service.getMobileAuthUrl(state);
      expect(mobileAuthUrl).toContain(`state=${encodedState}`);
    });
  });

  describe('refreshAccessToken', () => {
    it('微信返回 errcode 时抛出"刷新授权失败"（不被 catch 吞掉）', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ errcode: 40030, errmsg: 'invalid refresh_token' }),
      }) as unknown as typeof fetch;

      await expect(service.refreshAccessToken('rt1')).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(service.refreshAccessToken('rt1')).rejects.toThrow(
        /刷新授权失败/
      );
    });
  });
});
