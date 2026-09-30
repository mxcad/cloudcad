import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';

/**
 * 支付成功后的统一刷新动作（唯一出口）：refreshUser（会员 UI 即时更新）
 * + 失效存储配额缓存（会员扩容后配额条即时更新）。
 *
 * 内部吞错：刷新失败不阻断支付成功流程，页面可手动刷新兜底
 * （各支付弹窗 onSuccess 原本就用 try/catch 包裹这一对调用）。
 */
export function usePaymentRefresh() {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await refreshUser();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.fileSystem.storageQuota,
      });
    } catch {
      // 刷新失败不阻断支付成功链路
    }
  }, [refreshUser, queryClient]);
}
