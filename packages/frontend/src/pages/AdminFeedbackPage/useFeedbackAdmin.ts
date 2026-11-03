import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  feedbackAdminControllerAdopt,
  feedbackAdminControllerIssue,
  feedbackAdminControllerList,
  feedbackAdminControllerRevoke,
  feedbackAdminControllerUpdateStatus,
} from '@/api-sdk';
import type {
  AdoptFeedbackDto,
  FeedbackResponseDto,
  IssueRewardDto,
  RevokeRewardDto,
  UpdateFeedbackStatusDto,
} from '@/api-sdk';

export interface FeedbackListFilters {
  page: number;
  pageSize: number;
  type?: string;
  status?: string;
  rewardStatus?: string;
  search?: string;
}

const FEEDBACK_KEY = ['admin-feedback-list'] as const;

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: FEEDBACK_KEY });
}

/** 反馈列表（筛选/分页；奖励状态筛选覆盖原「奖励发放」tab 的待发放工作台） */
export function useFeedbackList(filters: FeedbackListFilters) {
  return useQuery<{ items: FeedbackResponseDto[]; total: number }>({
    queryKey: [
      ...FEEDBACK_KEY,
      filters.page,
      filters.pageSize,
      filters.type ?? '',
      filters.status ?? '',
      filters.rewardStatus ?? '',
      filters.search ?? '',
    ],
    queryFn: async () => {
      const res = await feedbackAdminControllerList({
        throwOnError: true,
        query: {
          page: filters.page,
          pageSize: filters.pageSize,
          type: filters.type as never,
          status: filters.status as never,
          rewardStatus: filters.rewardStatus as never,
          search: filters.search || undefined,
        },
      });
      const d = res.data as
        | { items: FeedbackResponseDto[]; total: number }
        | undefined;
      return { items: d?.items ?? [], total: d?.total ?? 0 };
    },
  });
}

/** 采纳反馈并创建奖励（PENDING） */
export function useAdoptFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdoptFeedbackDto }) =>
      feedbackAdminControllerAdopt({ throwOnError: true, path: { id }, body }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** 改反馈状态（驳回/转处理中/关闭） */
export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateFeedbackStatusDto }) =>
      feedbackAdminControllerUpdateStatus({
        throwOnError: true,
        path: { id },
        body,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** 发放奖励（客服核实 + 绑定账号 + 写会员） */
export function useIssueReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: IssueRewardDto }) =>
      feedbackAdminControllerIssue({ throwOnError: true, path: { id }, body }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** 撤销奖励 */
export function useRevokeReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RevokeRewardDto }) =>
      feedbackAdminControllerRevoke({ throwOnError: true, path: { id }, body }),
    onSuccess: () => invalidateAll(qc),
  });
}
