import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WechatCallbackService } from './wechat-callback.service';
import { SessionCookieWriter } from '../../session-cookie.writer';
import { WechatService } from './wechat.service';
import { WechatTransactionService } from './wechat-transaction.service';
import { IAUTH_FACADE } from '@cloudcad/contracts';

describe('WechatCallbackService', () => {
  let service: WechatCallbackService;

  const mockWechatService = {
    generateState: jest.fn(),
    callbackUrlValue: '',
    getAuthUrl: jest.fn(),
    getMobileAuthUrl: jest.fn(),
  };

  const mockWechatTransactionService = {
    createTransaction: jest.fn(),
    failTransaction: jest.fn(),
    completeTransaction: jest.fn(),
    rateLimitCheck: jest.fn(),
    getTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
  };

  const mockAuthService = {
    loginWithWechat: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWechatService.generateState.mockReturnValue('csrf-token');
    mockWechatService.callbackUrlValue =
      'https://api.example.com/api/v1/auth/wechat/callback';
    mockWechatService.getAuthUrl.mockImplementation(
      (state: string, cb: string) =>
        `https://weixin.qq.com/auth?state=${state}&redirect=${cb}`
    );
    mockWechatService.getMobileAuthUrl.mockImplementation(
      (state: string, cb: string) =>
        `https://weixin.qq.com/mobile?state=${state}&redirect=${cb}`
    );
    mockWechatTransactionService.createTransaction.mockResolvedValue('txn-1');
    mockWechatTransactionService.failTransaction.mockResolvedValue(undefined);
    mockWechatTransactionService.completeTransaction.mockResolvedValue(
      undefined
    );
    mockWechatTransactionService.rateLimitCheck.mockResolvedValue(0);
    mockWechatTransactionService.deleteTransaction.mockResolvedValue(undefined);
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:8000';
      if (key === 'session.cookieSecure') return null;
      return undefined;
    });

    const module = await Test.createTestingModule({
      providers: [
        WechatCallbackService,
        { provide: WechatService, useValue: mockWechatService },
        {
          provide: WechatTransactionService,
          useValue: mockWechatTransactionService,
        },
        { provide: IAUTH_FACADE, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        SessionCookieWriter,
      ],
    }).compile();

    service = module.get(WechatCallbackService);
  });

  describe('getAuthUrl', () => {
    it('非 popup 登录创建事务并附加到回调 URL', async () => {
      const result = await service.getAuthUrl(
        'http://fe.example.com',
        'false',
        'login',
        'web',
        ''
      );
      expect(mockWechatTransactionService.createTransaction).toHaveBeenCalled();
      expect(result.transactionId).toBe('txn-1');
      expect(result.authUrl).toContain('txn=txn-1');
      const stateData = JSON.parse(
        Buffer.from(result.state, 'base64').toString()
      );
      expect(stateData.csrf).toBe('csrf-token');
      expect(stateData.origin).toBe('http://fe.example.com');
      expect(stateData.isPopup).toBe(false);
      expect(stateData.purpose).toBe('login');
    });

    it('mobile 客户端走移动端授权 URL', async () => {
      await service.getAuthUrl('', 'true', 'login', 'mobile', '');
      expect(mockWechatService.getMobileAuthUrl).toHaveBeenCalled();
      expect(mockWechatService.getAuthUrl).not.toHaveBeenCalled();
    });

    it('popup 登录不创建事务', async () => {
      const result = await service.getAuthUrl('', 'true', 'login', 'web', '');
      expect(mockWechatTransactionService.createTransaction).not.toHaveBeenCalled();
      expect(result.transactionId).toBe('');
    });
  });

  describe('handleCallback', () => {
    const makeRes = () => ({ redirect: jest.fn(), cookie: jest.fn() });
    const makeReq = (
      query: Record<string, string | undefined>,
      secure = false
    ) => ({ query, secure, ip: '1.2.3.4', headers: {} } as any);
    const stateWith = (data: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(data)).toString('base64');

    it('bind 流程：有 code 重定向到 /profile 带 code', async () => {
      const res = makeRes();
      const req = makeReq({
        code: 'c1',
        state: stateWith({
          origin: 'http://fe',
          isPopup: false,
          purpose: 'bind',
        }),
      });
      await service.handleCallback(req, res as any);
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/profile')
      );
    });

    it('登录成功 + txn：完成事务并重定向到 /login', async () => {
      mockAuthService.loginWithWechat.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1' },
      });
      const res = makeRes();
      const req = makeReq({
        code: 'c1',
        state: stateWith({
          origin: 'http://fe',
          isPopup: false,
          purpose: 'login',
        }),
        txn: 'txn-9',
      });
      await service.handleCallback(req, res as any);
      expect(mockWechatTransactionService.completeTransaction).toHaveBeenCalledWith(
        'txn-9',
        expect.objectContaining({ action: 'login', accessToken: 'at' })
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('wechat_txn=txn-9')
      );
    });

    it('登录成功（无 txn）：写 auth_token cookie 并重定向', async () => {
      mockAuthService.loginWithWechat.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1' },
      });
      const res = makeRes();
      const req = makeReq({
        code: 'c1',
        state: stateWith({
          origin: 'http://fe',
          isPopup: false,
          purpose: 'login',
        }),
      });
      await service.handleCallback(req, res as any);
      expect(res.cookie).toHaveBeenCalledWith(
        'auth_token',
        'at',
        expect.objectContaining({ httpOnly: true })
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/login')
      );
    });

    it('缺少 code + txn：失败事务并重定向带错误', async () => {
      const res = makeRes();
      const req = makeReq({
        state: stateWith({
          origin: 'http://fe',
          isPopup: false,
          purpose: 'login',
        }),
        txn: 'txn-9',
      });
      await service.handleCallback(req, res as any);
      expect(mockWechatTransactionService.failTransaction).toHaveBeenCalledWith(
        'txn-9',
        '授权失败：缺少 code'
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('wechat_error=')
      );
    });

    it('登录抛错 + txn：失败事务透传错误码', async () => {
      mockAuthService.loginWithWechat.mockRejectedValue(
        Object.assign(new Error('deactivated'), {
          response: { code: 'ACCOUNT_DEACTIVATED', graceDays: 7 },
        })
      );
      const res = makeRes();
      const req = makeReq({
        code: 'c1',
        state: stateWith({
          origin: 'http://fe',
          isPopup: false,
          purpose: 'login',
        }),
        txn: 'txn-9',
      });
      await service.handleCallback(req, res as any);
      expect(mockWechatTransactionService.failTransaction).toHaveBeenCalledWith(
        'txn-9',
        'deactivated',
        expect.objectContaining({
          errorCode: 'ACCOUNT_DEACTIVATED',
          graceDays: 7,
        })
      );
    });
  });

  describe('pollTransaction', () => {
    const req = { ip: '1.2.3.4', headers: {} } as any;

    it('缺少 txn 返回 error', async () => {
      const result = await service.pollTransaction('', req);
      expect(result.status).toBe('error');
    });

    it('超过限流阈值返回 rate_limited', async () => {
      mockWechatTransactionService.rateLimitCheck.mockResolvedValue(4);
      const result = await service.pollTransaction('txn-1', req);
      expect(result.status).toBe('rate_limited');
    });

    it('事务不存在返回 expired', async () => {
      mockWechatTransactionService.getTransaction.mockResolvedValue(null);
      const result = await service.pollTransaction('txn-1', req);
      expect(result.status).toBe('expired');
    });

    it('completed 事务删除并返回结果', async () => {
      mockWechatTransactionService.getTransaction.mockResolvedValue({
        status: 'completed',
        action: 'login',
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1' },
      });
      const result = await service.pollTransaction('txn-1', req);
      expect(result.status).toBe('completed');
      expect(result.action).toBe('login');
      expect(mockWechatTransactionService.deleteTransaction).toHaveBeenCalledWith(
        'txn-1'
      );
    });

    it('pending 事务返回 pending', async () => {
      mockWechatTransactionService.getTransaction.mockResolvedValue({
        status: 'pending',
      });
      const result = await service.pollTransaction('txn-1', req);
      expect(result.status).toBe('pending');
    });
  });
});
