import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  feedbackAdminControllerAdopt,
  feedbackAdminControllerBatchRemove,
  feedbackAdminControllerIssue,
  feedbackAdminControllerList,
  feedbackAdminControllerRemove,
  feedbackAdminControllerUpdateStatus,
} from '@/api-sdk';
import type {
  AdoptFeedbackDto,
  FeedbackResponseDto,
  IssueRewardDto,
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
    // 占位期保留上一页数据引用（React Query v5 keepPreviousData 已废弃）：
    // 滚动分页 useAccumulatedPagination 依赖「displayNodes 引用未变占位期」语义，
    // 翻页瞬间 items 引用不变，累积列表不塌缩
    placeholderData: (prev) => prev,
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

/** 删除单条反馈记录（级联删奖励凭据与附件；已发放会员不回收） */
export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      feedbackAdminControllerRemove({ throwOnError: true, path: { id } }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** 批量删除反馈记录（不存在的 ID 不报错，返回删除数与未找到数） */
export function useBatchDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await feedbackAdminControllerBatchRemove({
        throwOnError: true,
        body: { ids },
      });
      return res.data as { deleted: number; notFoundIds: string[] } | undefined;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
