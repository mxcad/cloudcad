import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeedbackSubmit } from './useFeedbackSubmit';
import { feedbackControllerCreate } from '@/api-sdk';
import { FEEDBACK_ANON_TOKEN_KEY } from '@/constants/feedback';

vi.mock('@/api-sdk', () => ({
  feedbackControllerCreate: vi.fn(),
}));

describe('useFeedbackSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(FEEDBACK_ANON_TOKEN_KEY);
  });

  it('匿名提交：携带设备令牌 + source PC + 空 contact 转 undefined', async () => {
    const data = {
      id: 'fb-1',
      feedbackCode: 'FB-20261029-ABCDEF12',
      status: 'PENDING',
      rewardStatus: 'NONE',
      claimRequired: false,
      createdAt: '2026-10-29T00:00:00Z',
    };
    vi.mocked(feedbackControllerCreate).mockResolvedValue({
      data: data as any,
      error: undefined,
      response: {} as any,
      request: {} as any,
    });

    const { result } = renderHook(() => useFeedbackSubmit());
    let res: any;
    await act(async () => {
      res = await result.current.submit({
        type: 'SUGGESTION',
        title: 't',
        content: 'c'.repeat(30),
        source: 'PC',
        anonymous: true,
      });
    });

    const callArg = vi.mocked(feedbackControllerCreate).mock.calls[0][0];
    expect(callArg.body.anonToken).toMatch(/^[0-9a-f]{64}$/);
    expect(callArg.body.source).toBe('PC');
    expect(callArg.body.contact).toBeUndefined();
    expect(callArg.body.anonToken).toBe(
      localStorage.getItem(FEEDBACK_ANON_TOKEN_KEY)
    );
    expect(res.feedbackCode).toBe('FB-20261029-ABCDEF12');
  });

  it('登录提交：不携带设备令牌', async () => {
    vi.mocked(feedbackControllerCreate).mockResolvedValue({
      data: {
        id: 'fb-2',
        feedbackCode: 'FB-X',
        status: 'PENDING',
        rewardStatus: 'NONE',
        claimRequired: false,
        createdAt: '2026-10-29T00:00:00Z',
      } as any,
      error: undefined,
      response: {} as any,
      request: {} as any,
    });

    const { result } = renderHook(() => useFeedbackSubmit());
    await act(async () => {
      await result.current.submit({
        type: 'BUG',
        title: 't',
        content: 'c'.repeat(30),
        source: 'MOBILE',
        contact: 'a@b.com',
        anonymous: false,
      });
    });

    const callArg = vi.mocked(feedbackControllerCreate).mock.calls[0][0];
    expect(callArg.body.anonToken).toBeUndefined();
    expect(callArg.body.source).toBe('MOBILE');
    expect(callArg.body.contact).toBe('a@b.com');
  });

  it('提交失败：submitting 复位且异常上抛', async () => {
    vi.mocked(feedbackControllerCreate).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useFeedbackSubmit());
    await expect(
      act(async () => {
        await result.current.submit({
          type: 'SUGGESTION',
          title: 't',
          content: 'c'.repeat(30),
          source: 'PC',
          anonymous: true,
        });
      })
    ).rejects.toThrow('boom');
    expect(result.current.submitting).toBe(false);
  });
});
