///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 限流服务单测
///////////////////////////////////////////////////////////////////////////////
import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { FeedbackRateLimitService } from './feedback-rate-limit.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import {
  FEEDBACK_CODE_QUERY_MAX,
  feedbackAnonRateKey,
  feedbackUserRateKey,
  todayStamp,
} from './feedback.constants';

describe('FeedbackRateLimitService', () => {
  let service: FeedbackRateLimitService;

  const mockRedis = {
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const mockRuntimeConfig = {
    getValue: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackRateLimitService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfig },
      ],
    }).compile();

    service = module.get<FeedbackRateLimitService>(FeedbackRateLimitService);
  });

  describe('getContentLimits', () => {
    it('should clamp min to at least 1', async () => {
      mockRuntimeConfig.getValue.mockImplementation((key: string) => {
        if (key === 'feedback.minContentLength') return 0;
        if (key === 'feedback.maxContentLength') return 5000;
        return undefined;
      });
      const limits = await service.getContentLimits();
      expect(limits.min).toBe(1);
      expect(limits.max).toBe(5000);
    });

    it('should clamp max to at most 20000', async () => {
      mockRuntimeConfig.getValue.mockImplementation((key: string) => {
        if (key === 'feedback.minContentLength') return 20;
        if (key === 'feedback.maxContentLength') return 99999;
        return undefined;
      });
      const limits = await service.getContentLimits();
      expect(limits.max).toBe(20000);
    });
  });

  describe('assertAnonymousAllowed', () => {
    it('should throw ForbiddenException when anonymous disabled', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(false);
      await expect(service.assertAnonymousAllowed('1.2.3.4')).rejects.toThrow(
        ForbiddenException
      );
      // 未走到 Redis incr
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when limit is 0', async () => {
      mockRuntimeConfig.getValue.mockImplementation((key: string) =>
        key === 'feedback.anonymousEnabled' ? true : 0
      );
      await expect(service.assertAnonymousAllowed('1.2.3.4')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ForbiddenException when used exceeds limit', async () => {
      mockRuntimeConfig.getValue.mockImplementation((key: string) =>
        key === 'feedback.anonymousEnabled' ? true : 3
      );
      mockRedis.incr.mockResolvedValue(4); // 第 4 次 > limit 3
      await expect(service.assertAnonymousAllowed('1.2.3.4')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should pass and set TTL on first increment', async () => {
      mockRuntimeConfig.getValue.mockImplementation((key: string) =>
        key === 'feedback.anonymousEnabled' ? true : 3
      );
      mockRedis.incr.mockResolvedValue(1);
      await expect(service.assertAnonymousAllowed('1.2.3.4')).resolves.toBeUndefined();
      expect(mockRedis.expire).toHaveBeenCalledWith(
        feedbackAnonRateKey('1.2.3.4', todayStamp()),
        86400
      );
    });
  });

  describe('assertUserAllowed', () => {
    it('should throw ForbiddenException when user exceeds daily limit', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(10);
      mockRedis.incr.mockResolvedValue(11);
      await expect(service.assertUserAllowed('user-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(
        feedbackUserRateKey('user-1', todayStamp())
      );
    });

    it('should pass when under limit', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(10);
      mockRedis.incr.mockResolvedValue(5);
      await expect(service.assertUserAllowed('user-1')).resolves.toBeUndefined();
    });
  });

  describe('assertCodeQueryAllowed', () => {
    it('should throw ForbiddenException when exceeding query max', async () => {
      mockRedis.incr.mockResolvedValue(FEEDBACK_CODE_QUERY_MAX + 1);
      await expect(service.assertCodeQueryAllowed('1.2.3.4')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('validateContent', () => {
    it('should return error when too short', () => {
      expect(service.validateContent('abc', { min: 5, max: 100 })).not.toBeNull();
    });
    it('should return error when too long', () => {
      expect(service.validateContent('x'.repeat(101), { min: 1, max: 100 })).not.toBeNull();
    });
    it('should return null when in range', () => {
      expect(service.validateContent('hello', { min: 1, max: 100 })).toBeNull();
    });
    // 富文本 HTML：按可见文本计数（标签/实体不计入字数）
    it('should count visible text ignoring tags', () => {
      // 「你好世界」= 4 个可见字符，标签剥离为空格后折叠：你好 世界 = 5
      const html = '<p>你好<strong>世界</strong></p>';
      expect(service.validateContent(html, { min: 6, max: 100 })).not.toBeNull();
      expect(service.validateContent(html, { min: 1, max: 100 })).toBeNull();
    });
    it('should count visible text after decoding entities', () => {
      // 'a &amp; b' → 'a & b' = 5 个可见字符
      expect(service.validateContent('a &amp; b', { min: 5, max: 100 })).toBeNull();
      expect(service.validateContent('a &amp; b', { min: 6, max: 100 })).not.toBeNull();
    });
  });
});
