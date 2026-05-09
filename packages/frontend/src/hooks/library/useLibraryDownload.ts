///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import {
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
} from '@/api-sdk';
import { handleApiError } from '../../utils/errorHandler';
import type { LibraryType } from './useLibraryQuery';

interface UseLibraryDownloadOptions {
  libraryType: LibraryType;
}

/**
 * 资源库下载 Hook
 *
 * 提供 downloadNode 函数，支持 drawing/block 两种库类型的文件下载。
 */
export function useLibraryDownload({ libraryType }: UseLibraryDownloadOptions) {
  const downloadNode = useCallback(
    async (nodeId: string) => {
      try {
        const { data: blobData, error: responseError } = await (libraryType === 'drawing'
          ? libraryControllerDownloadDrawingNode({
              path: { nodeId },
              parseAs: 'blob'
            })
          : libraryControllerDownloadBlockNode({
              path: { nodeId },
              parseAs: 'blob'
            }));

        if (responseError) throw responseError;

        if (!blobData) {
          handleApiError(new Error('服务器返回数据为空'), '下载文件失败');
          return;
        }

        // 处理下载逻辑（后端返回文件流）
        const blob = blobData instanceof Blob ? blobData : new Blob([blobData as unknown as BlobPart]);
        const link = document.createElement('a');
        const url = window.URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', 'file');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        handleApiError(err, '下载文件失败');
      }
    },
    [libraryType]
  );

  return { downloadNode };
}
