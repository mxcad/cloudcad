import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';

// Mock AuthGuard
jest.mock('@nestjs/passport', () => ({
  AuthGuard: jest.fn().mockImplementation(() => {
    return class MockAuthGuard {
      async canActivate() {
        return true;
      }
    };
  }),
}));

// Mock ExtractJwt
jest.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(),
  },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let tokenBlacklistService: TokenBlacklistService;

  const mockTokenBlacklistService = {
    isBlacklisted: jest.fn(),
  };

  const mockExecutionContext = (headers: any = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
      }),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
      ],
    }).setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    tokenBlacklistService = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no token is provided', async () => {
      (ExtractJwt.fromAuthHeaderAsBearerToken as jest.Mock).mockReturnValue(() => null);
      
      const context = mockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when token is valid and not blacklisted', async () => {
      const token = 'valid.jwt.token';
      (ExtractJwt.fromAuthHeaderAsBearerToken as jest.Mock).mockReturnValue(() => token);
      mockTokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      
      const context = mockExecutionContext({ authorization: `Bearer ${token}` });
      const result = await guard.canActivate(context);

      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(token);
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when token is blacklisted', async () => {
      const token = 'blacklisted.jwt.token';
      (ExtractJwt.fromAuthHeaderAsBearerToken as jest.Mock).mockReturnValue(() => token);
      mockTokenBlacklistService.isBlacklisted.mockResolvedValue(true);
      
      const context = mockExecutionContext({ authorization: `Bearer ${token}` });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException when token validation fails', async () => {
      const token = 'invalid.jwt.token';
      (ExtractJwt.fromAuthHeaderAsBearerToken as jest.Mock).mockReturnValue(() => token);
      mockTokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      
      // Mock super.canActivate to throw an error
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate').mockRejectedValue(new Error('Invalid token'));
      
      const context = mockExecutionContext({ authorization: `Bearer ${token}` });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(token);
    });

    it('should handle TokenBlacklistService errors gracefully', async () => {
      const token = 'valid.jwt.token';
      (ExtractJwt.fromAuthHeaderAsBearerToken as jest.Mock).mockReturnValue(() => token);
      mockTokenBlacklistService.isBlacklisted.mockRejectedValue(new Error('Redis error'));
      
      const context = mockExecutionContext({ authorization: `Bearer ${token}` });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(token);
    });
  });
});
