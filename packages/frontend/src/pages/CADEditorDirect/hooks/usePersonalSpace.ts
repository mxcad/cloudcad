import { useEffect, useState, useRef } from 'react';
import { fileSystemControllerGetPersonalSpace } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

/**
 * 获取当前用户的私人空间 ID
 *
 * 同时将私人空间 ID 缓存到 mxcadManager，供 openUploadedFile 等函数使用。
 *
 * 从 CADEditorDirect.tsx 提取的独立 hook
 *
 * 修复：防止网络错误 / 5xx 错误导致无限重试死循环
 */
export function usePersonalSpace(isAuthenticated: boolean) {
  const [personalSpaceId, setPersonalSpaceId] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    retryCountRef.current = 0;

    if (!isAuthenticated) return;

    const fetchPersonalSpace = async () => {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const res = await fileSystemControllerGetPersonalSpace({
          signal: abortController.signal,
        } as any);
        if (!isMountedRef.current || abortController.signal.aborted) return;

        if (res?.data?.id) {
          setPersonalSpaceId(res.data.id);
          // 缓存到 mxcadManager
          import('@/services/mxcadManager').then(
            ({ setPersonalSpaceId: setCached }) => {
              if (isMountedRef.current) setCached(res?.data?.id || null);
            }
          );
          retryCountRef.current = 0; // 成功后重置重试计数
        }
      } catch (error: any) {
        if (!isMountedRef.current || abortController.signal.aborted) return;

        // 网络错误或 5xx 错误进行有限重试，避免无限循环
        const isRetryable =
          error?.code === 'ECONNREFUSED' ||
          error?.name === 'TypeError' ||
          error?.message?.includes('fetch') ||
          error?.status === 500 ||
          error?.status >= 500;

        if (isRetryable && retryCountRef.current < 2) {
          retryCountRef.current++;
          const delay = 1000 * retryCountRef.current; // 1s, 2s
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && !abortController.signal.aborted) {
              fetchPersonalSpace();
            }
          }, delay);
        } else {
          handleError(error, 'usePersonalSpace');
        }
      }
    };

    fetchPersonalSpace();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isAuthenticated]);

  return personalSpaceId;
}
