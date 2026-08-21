import { QueryClient } from '@tanstack/react-query';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';

/**
 * 全局唯一 QueryClient 实例。
 *
 * 从 index.tsx 抽出的共享实例：React 组件树内由 QueryClientProvider 消费，
 * 组件树外（如 MxFun 命令前置门控 vipCommandGuard）通过 getQueryData 只读
 * 访问已缓存的查询结果（例如 runtime config 的 freeExportDownloadEnabled 开关），
 * 避免在非 React 环境重复发起请求。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_DEFAULT,
      refetchOnWindowFocus: false,
    },
  },
});