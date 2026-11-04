///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 奖励服务单测（采纳/发放/撤销）
///////////////////////////////////////////////////////////////////////////////
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FeedbackRewardService } from './feedback-reward.service';
import { DatabaseService } from '../database/database.service';
import { MembershipService } from '../vip/membership.service';

describe('FeedbackRewardService', () => {
  let service: FeedbackRewardService;

  const mockTx: any = {
    feedback: {
      update: jest.fn(),
    },
    feedbackReward: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    feedback: {
      findUnique: jest.fn(),
    },
    feedbackReward: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    vipTier: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(mockTx)),
  };

  const mockMembership = {
    activate: jest.fn(),
  };

  const mockEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction 是 async，clearAllMocks 清掉实现，重新挂
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => cb(mockTx)
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackRewardService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: MembershipService, useValue: mockMembership },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<FeedbackRewardService>(FeedbackRewardService);
  });

  describe('adopt (采纳原子性)', () => {
    const dto = { vipTierLevel: 1, durationDays: 30, note: '已采纳' };

    it('should adopt anon feedback: transaction sets ADOPTED + PENDING reward + claimRequired', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: null,
        status: 'PENDING',
      });
      mockPrisma.feedbackReward.findUnique
        .mockResolvedValueOnce(null) // 已有奖励检查
        .mockResolvedValueOnce({
          id: 'rw-1',
          feedbackId: 'fb-1',
          userId: null,
          vipTierLevel: 1,
          durationDays: 30,
          status: 'PENDING',
          issuedById: null,
          issuedAt: null,
          remark: null,
          createdAt: new Date(),
          feedback: { feedbackCode: 'FB-X', title: 't' },
        });
      mockTx.feedback.update.mockResolvedValue({
        id: 'fb-1',
        status: 'ADOPTED',
        claimRequired: true,
      });
      mockTx.feedbackReward.create.mockResolvedValue({
        id: 'rw-1',
        feedbackId: 'fb-1',
        status: 'PENDING',
      });

      const result = await service.adopt('fb-1', dto, 'admin-1');

      // 反馈置为已采纳 + claimRequired（匿名须认领）
      const updateData = mockTx.feedback.update.mock.calls[0][0].data;
      expect(updateData.status).toBe('ADOPTED');
      expect(updateData.rewardStatus).toBe('PENDING');
      expect(updateData.claimRequired).toBe(true);
      // 同一事务内创建 PENDING 奖励
      expect(mockTx.feedbackReward.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          feedbackId: 'fb-1',
          vipTierLevel: 1,
          durationDays: 30,
          status: 'PENDING',
        }),
      });
      // 返回奖励（loadRewardWithFeedback 按奖励 id 查）
      expect(result.id).toBe('rw-1');
      expect(mockPrisma.feedbackReward.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'rw-1' } })
      );
    });

    it('should set claimRequired=false for logged-in submitter', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: 'user-1',
        status: 'PENDING',
      });
      mockPrisma.feedbackReward.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'rw-1',
        feedbackId: 'fb-1',
        userId: null,
        vipTierLevel: 1,
        durationDays: 30,
        status: 'PENDING',
        issuedById: null,
        issuedAt: null,
        remark: null,
        createdAt: new Date(),
        feedback: { feedbackCode: 'FB-X', title: 't' },
      });
      mockTx.feedback.update.mockResolvedValue({ id: 'fb-1', claimRequired: false });
      mockTx.feedbackReward.create.mockResolvedValue({ id: 'rw-1', status: 'PENDING' });

      await service.adopt('fb-1', dto, 'admin-1');
      expect(mockTx.feedback.update.mock.calls[0][0].data.claimRequired).toBe(false);
    });

    it('should block double adopt', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: null,
        status: 'ADOPTED',
      });
      await expect(service.adopt('fb-1', dto, 'admin-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should block when reward record already exists', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: null,
        status: 'PENDING',
      });
      mockPrisma.feedbackReward.findUnique.mockResolvedValueOnce({
        id: 'rw-1',
        status: 'PENDING',
      });
      await expect(service.adopt('fb-1', dto, 'admin-1')).rejects.toThrow(
        BadRequestException
      );
      // 未进入事务
      expect(mockTx.feedback.update).not.toHaveBeenCalled();
    });
  });

  describe('issue (发放)', () => {
    const rewardRow = {
      id: 'rw-1',
      feedbackId: 'fb-1',
      userId: null,
      vipTierLevel: 1,
      durationDays: 30,
      status: 'PENDING',
      issuedById: null,
      issuedAt: null,
      remark: null,
      createdAt: new Date(),
    };

    it('should require remark', async () => {
      await expect(
        service.issue('rw-1', { userId: 'user-1', remark: '  ' }, 'cs-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should block when reward not PENDING', async () => {
      mockPrisma.feedbackReward.findUnique.mockResolvedValue({
        ...rewardRow,
        status: 'ISSUED',
      });
      await expect(
        service.issue('rw-1', { userId: 'user-1', remark: '核实通过' }, 'cs-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should bind user + activate membership + set ISSUED', async () => {
      mockPrisma.feedbackReward.findUnique.mockResolvedValue(rewardRow);
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 1,
        baseMonthlyPrice: 1500,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: null,
      });
      mockPrisma.feedbackReward.findUnique
        .mockResolvedValueOnce(rewardRow) // 初始 reward 查询
        .mockResolvedValueOnce({
          ...rewardRow,
          status: 'ISSUED',
          userId: 'user-1',
          issuedAt: new Date(),
          feedback: { feedbackCode: 'FB-X', title: 't' },
        }); // loadRewardWithFeedback
      mockTx.feedbackReward.update.mockResolvedValue({
        ...rewardRow,
        status: 'ISSUED',
      });
      mockTx.feedback.update.mockResolvedValue({ id: 'fb-1', rewardStatus: 'ISSUED' });

      await service.issue('rw-1', { userId: 'user-1', remark: '核实通过' }, 'cs-1');

      // MembershipService.activate 被调用（写 UserMembership 唯一入口）
      expect(mockMembership.activate).toHaveBeenCalledWith(
        mockTx,
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );
      const rewData = mockTx.feedbackReward.update.mock.calls[0][0].data;
      expect(rewData.status).toBe('ISSUED');
      expect(rewData.userId).toBe('user-1');
      // 匿名绑定：feedback.submitterId 写 user-1 + claimRequired=false
      const fbData = mockTx.feedback.update.mock.calls[0][0].data;
      expect(fbData.submitterId).toBe('user-1');
      expect(fbData.claimRequired).toBe(false);
      // 推送会员变更事件
      expect(mockEmitter.emit).toHaveBeenCalled();
    });
  });

  describe('档位校验', () => {
    it('should reject invalid tier level', async () => {
      await expect(
        service.adopt('fb-1', { vipTierLevel: 9, durationDays: 30 }, 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });
    it('should reject invalid duration days', async () => {
      await expect(
        service.adopt('fb-1', { vipTierLevel: 1, durationDays: 15 }, 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('奖励发放默认账号（submitter 映射）', () => {
    const rewardRow = {
      id: 'rw-1',
      feedbackId: 'fb-1',
      userId: null,
      vipTierLevel: 1,
      durationDays: 30,
      status: 'PENDING',
      issuedById: null,
      issuedAt: null,
      remark: null,
      createdAt: new Date(),
    };
    const tierRow = { id: 'tier-1', level: 1, baseMonthlyPrice: 0 };
    const issueDto = { userId: 'user-1', remark: '已核实' };

    it('登录用户反馈 → 返回 submitter（奖励发放默认账号）', async () => {
      mockPrisma.feedbackReward.findUnique
        .mockResolvedValueOnce(rewardRow) // issue 初始奖励查询
        .mockResolvedValueOnce({
          ...rewardRow,
          feedback: {
            feedbackCode: 'FB-X',
            title: 't',
            submitter: { id: 'user-1', username: 'alice', nickname: '爱丽丝', email: 'a@x.com' },
          },
        }); // loadRewardWithFeedback
      mockPrisma.vipTier.findUnique.mockResolvedValue(tierRow);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: 'user-1',
      });
      mockTx.feedbackReward.update.mockResolvedValue(rewardRow);
      mockTx.feedback.update.mockResolvedValue({ id: 'fb-1', rewardStatus: 'ISSUED' });

      const result = await service.issue('rw-1', issueDto, 'admin-1');
      expect(result.submitter).toEqual({
        id: 'user-1',
        username: 'alice',
        nickname: '爱丽丝',
        email: 'a@x.com',
      });
    });

    it('匿名反馈 → submitter 为 null（须客服搜索绑定）', async () => {
      mockPrisma.feedbackReward.findUnique
        .mockResolvedValueOnce(rewardRow)
        .mockResolvedValueOnce({
          ...rewardRow,
          feedback: { feedbackCode: 'FB-X', title: 't', submitter: null },
        });
      mockPrisma.vipTier.findUnique.mockResolvedValue(tierRow);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        submitterId: null,
      });
      mockTx.feedbackReward.update.mockResolvedValue(rewardRow);
      mockTx.feedback.update.mockResolvedValue({ id: 'fb-1', rewardStatus: 'ISSUED' });

      const result = await service.issue('rw-1', issueDto, 'admin-1');
      expect(result.submitter).toBeNull();
    });
  });
});
