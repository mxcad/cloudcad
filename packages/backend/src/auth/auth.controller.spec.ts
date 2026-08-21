import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { IAUTH_FACADE } from './interfaces/auth-facade.interface';
import { WECHAT_CALLBACK_SERVICE } from './interfaces/service-interfaces';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;
  let mockWechatCallbackService: any;
  let mockConfigService: any;

  const mockResponse = () => {
    const res: any = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    mockAuthService = {
      logout: jest.fn().mockResolvedValue(undefined),
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1' },
      }),
    };
    mockWechatCallbackService = {};
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'session.name') {
          return 'connect.sid';
        }
        if (key === 'session.cookieSecure') {
          return false;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IAUTH_FACADE, useValue: mockAuthService },
        { provide: WECHAT_CALLBACK_SERVICE, useValue: mockWechatCallbackService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('logout', () => {
    const mockRequest = (userId?: string) =>
      ({
        user: userId ? { id: userId } : undefined,
        headers: userId ? { authorization: 'Bearer access-token' } : {},
        session: userId ? { userId } : undefined,
      }) as any;

    it('未登录时也清除全部 cookie（幂等登出）', async () => {
      const response = mockResponse();

      await controller.logout(
        mockRequest(undefined) as any,
        mockRequest(undefined) as any,
        response as any
      );

      expect(response.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(response.clearCookie).toHaveBeenCalledWith('auth_token', {
        path: '/',
      });
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/api/v1/auth/refresh',
      });
      expect(response.clearCookie).toHaveBeenCalledTimes(3);
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });

    it('已登录时撤销 token 并清除全部 cookie', async () => {
      const response = mockResponse();
      const req = mockRequest('user-1');

      await controller.logout(req, req, response as any);

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'user-1',
        'access-token',
        expect.anything()
      );
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/api/v1/auth/refresh',
      });
    });

    it('login 写入的 refresh_token cookie path 与 logout 清除的 path 一致', async () => {
      const loginResponse = mockResponse();
      await controller.login(
        { email: 'test@example.com', password: 'password' } as any,
        {} as any,
        loginResponse as any
      );

      const logoutResponse = mockResponse();
      await controller.logout(
        mockRequest('user-1') as any,
        mockRequest('user-1') as any,
        logoutResponse as any
      );

      const written = loginResponse.cookie.mock.calls.find(
        (call: any[]) => call[0] === 'refresh_token'
      );
      const cleared = logoutResponse.clearCookie.mock.calls.find(
        (call: any[]) => call[0] === 'refresh_token'
      );

      expect(written).toBeDefined();
      expect(cleared).toBeDefined();
      expect(cleared[1]).toEqual({ path: written[2].path });
    });
  });

  describe('cookie Secure 协议自适应', () => {
    const loginReq = (secure: boolean) => ({ secure }) as any;

    const setup = (cookieSecure: boolean | null) => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'session.name') return 'connect.sid';
        if (key === 'session.cookieSecure') return cookieSecure;
        return undefined;
      });
    };

    const getAuthTokenCookieSecure = async (reqSecure: boolean) => {
      const response = mockResponse();
      await controller.login({} as any, loginReq(reqSecure), response as any);
      const call = response.cookie.mock.calls.find(
        (c: any[]) => c[0] === 'auth_token'
      );
      return call[2].secure as boolean;
    };

    it('cookieSecure 未设置(null) + http(req.secure=false) → auth_token 不带 Secure', async () => {
      setup(null);
      expect(await getAuthTokenCookieSecure(false)).toBe(false);
    });

    it('cookieSecure 未设置(null) + https(req.secure=true) → auth_token 带 Secure', async () => {
      setup(null);
      expect(await getAuthTokenCookieSecure(true)).toBe(true);
    });

    it('cookieSecure 显式 false + https(req.secure=true) → 仍不带 Secure（显式优先）', async () => {
      setup(false);
      expect(await getAuthTokenCookieSecure(true)).toBe(false);
    });

    it('SESSION_COOKIE_SECURE=auto → 与未设置等价，按协议自适应', async () => {
      // 说明：parseCookieSecure 将 "auto" 解析为 null，此处模拟 configService 已返回 null
      setup(null);
      expect(await getAuthTokenCookieSecure(false)).toBe(false);
      expect(await getAuthTokenCookieSecure(true)).toBe(true);
    });
  });
});
