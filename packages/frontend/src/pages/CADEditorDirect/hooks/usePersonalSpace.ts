import { useEffect, useState } from 'react';
import { fileSystemControllerGetPersonalSpace } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

/**
 * 获取当前用户的私人空间 ID
 *
 * 同时将私人空间 ID 缓存到 mxcadManager，供 openUploadedFile 等函数使用。
 *
 * 从 CADEditorDirect.tsx 提取的独立 hook
 */
export function usePersonalSpace(isAuthenticated: boolean) {
  const [personalSpaceId, setPersonalSpaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const fetchPersonalSpace = async () => {
      try {
        const res = await fileSystemControllerGetPersonalSpace() as any;
        if (cancelled) return;

        if (res?.data?.id) {
          setPersonalSpaceId(res.data.id);
          // 缓存到 mxcadManager
          import('@/services/mxcadManager').then(
            ({ setPersonalSpaceId: setCached }) => {
              setCached(res?.data?.id || null);
            }
          );
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'CADEditorDirect:usePersonalSpace');
        }
      }
    };

    fetchPersonalSpace();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return personalSpaceId;
}
