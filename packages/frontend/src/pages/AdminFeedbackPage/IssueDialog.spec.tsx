import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IssueDialog } from './IssueDialog';
import type { FeedbackRewardResponseDto } from '@/api-sdk';

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

const { showToastMock, issueMutateMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  issueMutateMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: showToastMock, showConfirm: vi.fn() }),
}));

vi.mock('@/api-sdk', () => ({
  usersControllerSearchUsers: vi.fn().mockResolvedValue({ data: { users: [] } }),
}));

vi.mock('./useFeedbackAdmin', () => ({
  useIssueReward: () => ({ mutateAsync: issueMutateMock, isPending: false }),
}));

const baseReward: FeedbackRewardResponseDto = {
  id: 'rw-1',
  feedbackId: 'fb-1',
  feedbackCode: 'FB-20261102-ABCDEF12',
  feedbackTitle: '测试反馈',
  submitter: {
    id: 'user-1',
    username: 'alice',
    nickname: '爱丽丝',
    email: 'a@x.com',
  },
  userId: null,
  user: null,
  vipTierLevel: 1,
  durationDays: 30,
  status: 'PENDING',
  issuedById: null,
  issuedAt: null,
  remark: null,
  createdAt: '2026-11-02T00:00:00.000Z',
};

describe('IssueDialog 奖励发放默认账号', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueMutateMock.mockResolvedValue({});
  });

  it('登录用户反馈 → 打开弹窗默认预选提交者账号', () => {
    render(<IssueDialog isOpen reward={baseReward} onClose={vi.fn()} onIssued={vi.fn()} />);
    // 「已选择：{name}（{email}）」提示出现 = 已预选（t mock 为 identity 不做插值）
    expect(screen.getByText(/已选择/)).toBeTruthy();
  });

  it('匿名反馈（submitter null）→ 打开弹窗不预选，保持客服搜索', () => {
    render(
      <IssueDialog
        isOpen
        reward={{ ...baseReward, submitter: null }}
        onClose={vi.fn()}
        onIssued={vi.fn()}
      />
    );
    expect(screen.queryByText(/已选择/)).toBeNull();
  });

  it('确认发放默认使用预选的提交者账号 userId', async () => {
    render(
      <IssueDialog isOpen reward={baseReward} onClose={vi.fn()} onIssued={vi.fn()} />
    );
    // 填写客服核实备注（必填）后确认发放
    fireEvent.change(screen.getByPlaceholderText(/记录核实过程/), {
      target: { value: '已核验' },
    });
    fireEvent.click(screen.getByText('确认发放'));
    await waitFor(() => expect(issueMutateMock).toHaveBeenCalled());
    expect(issueMutateMock.mock.calls[0][0].body.userId).toBe('user-1');
  });
});
