///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 主服务单测
///////////////////////////////////////////////////////////////////////////////
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackAttachmentService } from './feedback-attachment.service';
import { FeedbackRateLimitService } from './feedback-rate-limit.service';
import { DatabaseService } from '../database/database.service';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';
import { FeedbackStatus, FeedbackType, FeedbackSource } from './feedback.enums';
import type { CreateFeedbackDto } from './dto/feedback.dto';

describe('FeedbackService', () => {
  let service: FeedbackService;

  const mockPrisma = {
    feedback: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    feedbackReward: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };

  const mockRateLimit = {
    getContentLimits: jest.fn(),
    validateContent: jest.fn(),
    assertUserAllowed: jest.fn(),
    assertAnonymousAllowed: jest.fn(),
    assertCodeQueryAllowed: jest.fn(),
  };

  const mockAttachmentService = {
    assertOwned: jest.fn(),
    assertCountLimits: jest.fn(),
    bindInTx: jest.fn(),
    toDto: jest.fn(),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // resetMocks=true 会清掉实现，需在每例前重设 $transaction（create 用事务）
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(mockPrisma)
    );
    (mockPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: FeedbackRateLimitService, useValue: mockRateLimit },
        { provide: FeedbackAttachmentService, useValue: mockAttachmentService },
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: IPERMISSION_SERVICE, useValue: mockPermissionService },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  describe('create', () => {
    const dto: CreateFeedbackDto = {
      type: FeedbackType.SUGGESTION,
      title: ' 改善界面  ',
      content: '这是一个比较详细的反馈内容，长度足够。',
      source: FeedbackSource.PC,
      anonToken: 'tok-1',
    };

    it('should create as anonymous with anonToken hash and PENDING status', async () => {
      mockRateLimit.getContentLimits.mockResolvedValue({ min: 5, max: 5000 });
      mockRateLimit.validateContent.mockReturnValue(null);
      mockRateLimit.assertAnonymousAllowed.mockResolvedValue(undefined);
      // 查询码无碰撞
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      const created = {
        id: 'fb-1',
        feedbackCode: 'FB-20261029-ABCDEF12',
        status: 'PENDING',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: new Date('2026-10-29T00:00:00Z'),
      };
      mockPrisma.feedback.create.mockResolvedValue(created);

      const result = await service.create(dto, { ip: '1.2.3.4' });

      expect(mockRateLimit.assertAnonymousAllowed).toHaveBeenCalledWith('1.2.3.4');
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SUGGESTION',
          title: '改善界面',
          source: 'PC',
          submitterId: null,
          anonTokenHash: expect.any(String), // sha256 hex
          status: 'PENDING',
          rewardStatus: 'NONE',
          // 查询码由 buildCode 随机生成，只断言格式（FB-YYYYMMDD-XXXXXXXX）
          feedbackCode: expect.stringMatching(/^FB-\d{8}-[A-Z0-9]{8}$/),
        }),
      });
      expect(result.feedbackCode).toBe('FB-20261029-ABCDEF12');
      expect(result.status).toBe('PENDING');
    });

    it('should create as logged-in user (no anonToken hash)', async () => {
      mockRateLimit.getContentLimits.mockResolvedValue({ min: 5, max: 5000 });
      mockRateLimit.validateContent.mockReturnValue(null);
      mockRateLimit.assertUserAllowed.mockResolvedValue(undefined);
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.feedback.create.mockResolvedValue({
        id: 'fb-2',
        feedbackCode: 'FB-20261029-ABCDEF13',
        status: 'PENDING',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: new Date(),
      });

      await service.create(dto, { userId: 'user-1', ip: '1.2.3.4' });

      expect(mockRateLimit.assertUserAllowed).toHaveBeenCalledWith('user-1');
      const callArg = mockPrisma.feedback.create.mock.calls[0][0];
      expect(callArg.data.submitterId).toBe('user-1');
      expect(callArg.data.anonTokenHash).toBeNull();
    });

    it('should throw BadRequest when content invalid', async () => {
      mockRateLimit.getContentLimits.mockResolvedValue({ min: 5, max: 5000 });
      mockRateLimit.validateContent.mockReturnValue('内容过短');
      await expect(
        service.create({ ...dto, content: 'ab' }, { ip: '1.2.3.4' })
      ).rejects.toThrow('内容过短');
      // 未到达限流与入库
      expect(mockRateLimit.assertAnonymousAllowed).not.toHaveBeenCalled();
      expect(mockPrisma.feedback.create).not.toHaveBeenCalled();
    });

    it('should retry code generation on collision', async () => {
      mockRateLimit.getContentLimits.mockResolvedValue({ min: 5, max: 5000 });
      mockRateLimit.validateContent.mockReturnValue(null);
      mockRateLimit.assertAnonymousAllowed.mockResolvedValue(undefined);
      // 第一次 findUnique 命中碰撞，第二次无
      mockPrisma.feedback.findUnique
        .mockResolvedValueOnce({ id: 'other' })
        .mockResolvedValueOnce(null);
      mockPrisma.feedback.create.mockResolvedValue({
        id: 'fb-3',
        feedbackCode: 'FB-X',
        status: 'PENDING',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: new Date(),
      });

      await service.create(dto, { ip: '1.2.3.4' });
      expect(mockPrisma.feedback.findUnique).toHaveBeenCalledTimes(2);
    });

    it('带 attachmentIds → assertOwned → assertCountLimits → bindInTx 按序执行', async () => {
      mockRateLimit.getContentLimits.mockResolvedValue({ min: 5, max: 5000 });
      mockRateLimit.validateContent.mockReturnValue(null);
      mockRateLimit.assertUserAllowed.mockResolvedValue(undefined);
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.feedback.create.mockResolvedValue({
        id: 'fb-4',
        feedbackCode: 'FB-X',
        status: 'PENDING',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: new Date(),
      });
      (mockAttachmentService.assertOwned as jest.Mock).mockResolvedValue([
        { id: 'att-1', type: 'IMAGE' },
        { id: 'att-2', type: 'DRAWING' },
      ]);
      (mockAttachmentService.assertCountLimits as jest.Mock).mockResolvedValue(undefined);

      await service.create(
        { ...dto, attachmentIds: ['att-1', 'att-2'] },
        { userId: 'user-1', ip: '1.2.3.4' }
      );

      expect(mockAttachmentService.assertOwned).toHaveBeenCalledWith(
        ['att-1', 'att-2'],
        expect.objectContaining({ userId: 'user-1' })
      );
      expect(mockAttachmentService.assertCountLimits).toHaveBeenCalledWith([
        { id: 'att-1', type: 'IMAGE' },
        { id: 'att-2', type: 'DRAWING' },
      ]);
      expect(mockAttachmentService.bindInTx).toHaveBeenCalledWith(
        expect.anything(),
        ['att-1', 'att-2'],
        'fb-4'
      );
      // 调用顺序：归属校验 → 数量上限 → 事务内绑定
      const order = [
        (mockAttachmentService.assertOwned as jest.Mock).mock.invocationCallOrder[0],
        (mockAttachmentService.assertCountLimits as jest.Mock).mock.invocationCallOrder[0],
        (mockAttachmentService.bindInTx as jest.Mock).mock.invocationCallOrder[0],
      ];
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);
    });
  });

  describe('queryByCode', () => {
    it('should throw NotFound when code missing', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.queryByCode('FB-X')).rejects.toThrow(NotFoundException);
    });

    it('should return result when no contact set', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        feedbackCode: 'FB-X',
        type: 'SUGGESTION',
        status: 'PENDING',
        title: 't',
        content: '反馈正文',
        rewardStatus: 'NONE',
        claimRequired: false,
        adoptNote: null,
        rejectReason: null,
        contact: null,
        createdAt: new Date(),
      });
      const r = await service.queryByCode('FB-X');
      expect(r.feedbackCode).toBe('FB-X');
      expect(r.status).toBe('PENDING');
      expect(r.content).toBe('反馈正文');
    });

    it('should throw NotFound when contact mismatch', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        feedbackCode: 'FB-X',
        type: 'SUGGESTION',
        status: 'PENDING',
        title: 't',
        rewardStatus: 'NONE',
        claimRequired: false,
        adoptNote: null,
        rejectReason: null,
        contact: 'a@b.com',
        createdAt: new Date(),
      });
      await expect(service.queryByCode('FB-X', 'wrong@b.com')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should pass when contact matches case-insensitively', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        feedbackCode: 'FB-X',
        type: 'SUGGESTION',
        status: 'PENDING',
        title: 't',
        rewardStatus: 'NONE',
        claimRequired: false,
        adoptNote: null,
        rejectReason: null,
        contact: 'A@B.com',
        createdAt: new Date(),
      });
      const r = await service.queryByCode('FB-X', 'a@b.COM');
      expect(r.feedbackCode).toBe('FB-X');
    });
  });

  describe('adminUpdateStatus (状态机)', () => {
    const baseRow = {
      id: 'fb-1',
      status: 'PENDING',
      type: 'SUGGESTION',
      title: 't',
      content: 'c',
      source: 'PC',
      submitterId: null,
      contact: null,
      pageUrl: null,
      feedbackCode: 'FB-X',
      reviewedById: null,
      reviewedAt: null,
      adoptNote: null,
      rejectReason: null,
      rewardStatus: 'NONE',
      claimRequired: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      reward: null,
      submitter: null,
    };

    it('should reject transition when already ADOPTED', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ ...baseRow, status: 'ADOPTED' });
      await expect(
        service.adminUpdateStatus('fb-1', FeedbackStatus.CLOSED, undefined, 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should require reason when rejecting', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ ...baseRow });
      await expect(
        service.adminUpdateStatus('fb-1', FeedbackStatus.REJECTED, undefined, 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should update to REVIEWING and clear rejectReason', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ ...baseRow });
      mockPrisma.feedback.update.mockResolvedValue({
        ...baseRow,
        status: 'REVIEWING',
        reviewedById: 'admin-1',
      });
      await service.adminUpdateStatus('fb-1', FeedbackStatus.REVIEWING, undefined, 'admin-1');
      const data = mockPrisma.feedback.update.mock.calls[0][0].data;
      expect(data.status).toBe('REVIEWING');
      expect(data.rejectReason).toBeNull();
      expect(data.reviewedById).toBe('admin-1');
    });

    it('should set rejectReason when rejecting', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ ...baseRow });
      mockPrisma.feedback.update.mockResolvedValue({
        ...baseRow,
        status: 'REJECTED',
        rejectReason: '重复建议',
      });
      await service.adminUpdateStatus('fb-1', FeedbackStatus.REJECTED, '重复建议', 'admin-1');
      const data = mockPrisma.feedback.update.mock.calls[0][0].data;
      expect(data.rejectReason).toBe('重复建议');
    });
  });

  describe('listRewards', () => {
    const rewardRow = {
      id: 'rw-1',
      feedbackId: 'fb-1',
      userId: 'u-1',
      vipTierLevel: 1,
      durationDays: 30,
      status: 'PENDING',
      issuedById: null,
      issuedAt: null,
      remark: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      feedback: {
        id: 'fb-1',
        title: '反馈标题',
        feedbackCode: 'FB-20261101-ABC12345',
        type: 'SUGGESTION',
        submitterId: 'u-1',
        contact: null,
        submitter: null,
      },
      user: { username: 'zhangsan', nickname: '张三' },
    };

    beforeEach(() => {
      mockPrisma.feedbackReward.findMany.mockResolvedValue([rewardRow]);
    });

    it('should query all when no filters', async () => {
      await service.listRewards({});
      const arg = mockPrisma.feedbackReward.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
      expect(arg.include.user).toBeDefined();
      expect(arg.include.feedback.select.type).toBe(true);
    });

    it('should filter by status', async () => {
      await service.listRewards({ status: 'PENDING' });
      const arg = mockPrisma.feedbackReward.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ status: 'PENDING' });
    });

    it('should filter by feedback type (分类)', async () => {
      await service.listRewards({ type: 'SUGGESTION' });
      const arg = mockPrisma.feedbackReward.findMany.mock.calls[0][0];
      expect(arg.where.feedback).toEqual({ type: 'SUGGESTION' });
    });

    it('should search feedbackCode/title/username/nickname via OR', async () => {
      await service.listRewards({ search: 'FB-2026' });
      const arg = mockPrisma.feedbackReward.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([
        { feedback: { feedbackCode: { contains: 'FB-2026', mode: 'insensitive' } } },
        { feedback: { title: { contains: 'FB-2026', mode: 'insensitive' } } },
        { user: { username: { contains: 'FB-2026', mode: 'insensitive' } } },
        { user: { nickname: { contains: 'FB-2026', mode: 'insensitive' } } },
      ]);
    });

    it('should combine status + type + search', async () => {
      await service.listRewards({ status: 'PENDING', type: 'BUG', search: 'zhangsan' });
      const arg = mockPrisma.feedbackReward.findMany.mock.calls[0][0];
      expect(arg.where.status).toBe('PENDING');
      expect(arg.where.feedback).toEqual({ type: 'BUG' });
      expect(arg.where.OR).toHaveLength(4);
    });

    it('should map feedbackType to response', async () => {
      const res = await service.listRewards({});
      expect(res.items[0].feedbackType).toBe('SUGGESTION');
      expect(res.items[0].feedbackCode).toBe('FB-20261101-ABC12345');
    });
  });

  describe('adminList', () => {
    beforeEach(() => {
      mockPrisma.feedback.count.mockResolvedValue(0);
      mockPrisma.feedback.findMany.mockResolvedValue([]);
    });

    it('should query all when no filters', async () => {
      await service.adminList({ page: 1, pageSize: 20 });
      const arg = mockPrisma.feedback.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });

    it('should filter by rewardStatus', async () => {
      await service.adminList({ page: 1, pageSize: 20, rewardStatus: 'PENDING' });
      const arg = mockPrisma.feedback.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ rewardStatus: 'PENDING' });
    });

    it('should search title/content/code/submitter account via OR', async () => {
      await service.adminList({ page: 1, pageSize: 20, search: 'zhangsan' });
      const arg = mockPrisma.feedback.findMany.mock.calls[0][0];
      expect(arg.where.OR).toHaveLength(5);
      expect(arg.where.OR[3]).toEqual({
        submitter: { username: { contains: 'zhangsan', mode: 'insensitive' } },
      });
    });

    it('should combine status + rewardStatus + type', async () => {
      await service.adminList({
        page: 1,
        pageSize: 20,
        status: 'ADOPTED',
        rewardStatus: 'ISSUED',
        type: 'BUG',
      });
      const arg = mockPrisma.feedback.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({
        type: 'BUG',
        status: 'ADOPTED',
        rewardStatus: 'ISSUED',
      });
    });
  });
});
