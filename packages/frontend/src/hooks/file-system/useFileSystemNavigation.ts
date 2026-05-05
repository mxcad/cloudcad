///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fileSystemControllerDownloadNode, fileSystemControllerDownloadNodeWithFormat } from '@/api-sdk';
import { FileSystemNode } from '../../types/filesystem';

import { handleError } from '../../utils/errorHandler';
import { isTourModeActive } from '../../contexts/TourContext';

interface UseFileSystemNavigationProps {
  urlProjectId?: string;
  currentNode: FileSystemNode | null;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  mode?: 'project' | 'personal-space';
}

const sanitizeFileName = (fileName: string): string => {
  let sanitized = fileName.replace(/[/\\]/g, '_');
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/gu, '');
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  if (sanitized.length > 250) {
    const ext = sanitized.split('.').pop() || '';
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, 250 - ext.length - 1) + '.' + ext;
  }
  return sanitized || 'unnamed';
};

export const useFileSystemNavigation = ({
  urlProjectId,
  currentNode,
  showToast,
  mode = 'project',
}: UseFileSystemNavigationProps) => {
  const navigate = useNavigate();

  // 下载格式模态框状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNode, setDownloadingNode] = useState<FileSystemNode | null>(
    null
  );

  const handleGoBack = useCallback(() => {
    if (mode === 'personal-space') {
      // 私人空间模式
      if (currentNode?.parentId) {
        navigate(`/personal-space/${currentNode.parentId}`);
      } else {
        navigate('/personal-space');
      }
    } else {
      // 项目模式
      if (currentNode?.parentId) {
        navigate(`/projects/${urlProjectId}/files/${currentNode.parentId}`);
      } else {
        navigate('/projects');
      }
    }
  }, [currentNode, navigate, urlProjectId, mode]);

  const handleEnterFolder = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        if (mode === 'personal-space') {
          navigate(`/personal-space/${node.id}`);
        } else {
          navigate(`/projects/${urlProjectId}/files/${node.id}`);
        }
      }
    },
    [navigate, urlProjectId, mode]
  );

  const handleEnterProject = useCallback(
    (projectId: string) => {
      navigate(`/projects/${projectId}/files`);
    },
    [navigate]
  );

  const handleFileOpen = useCallback(
    (node: FileSystemNode) => {
      // 检查节点是否在回收站中
      if (node.deletedAt) {
        return;
      }

      if (node.isFolder) {
        if (mode === 'personal-space') {
          navigate(`/personal-space/${node.id}`);
        } else {
          const effectiveProjectId = node.isRoot ? node.id : urlProjectId;
          navigate(`/projects/${effectiveProjectId}/files/${node.id}`);
        }
      } else {
        const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
        if (
          node.extension &&
          cadExtensions.includes(node.extension.toLowerCase())
        ) {
          // 检查是否处于引导模式
        if (isTourModeActive()) {
          // 引导模式：使用 navigate 在当前页面跳转
          const queryParams = new URLSearchParams();
          queryParams.set('nodeId', node.parentId || '');
          navigate(`/cad-editor/${node.id}?${queryParams.toString()}`);
        } else {
          // 正常模式：新标签页打开
          const queryParams = new URLSearchParams();
          queryParams.set('nodeId', node.parentId || '');
          const url = `/cad-editor/${node.id}?${queryParams.toString()}`;
          window.open(url, '_blank');
        }
        } else {
          handleDownload(node);
        }
      }
    },
    [navigate, urlProjectId, mode]
  );

  const handleDownload = useCallback(
    async (node: FileSystemNode) => {
      // 判断是否为 CAD 文件
      const isCadFile = ['.dwg', '.dxf'].some((ext) =>
        node.name.toLowerCase().endsWith(ext)
      );

      // 如果是 CAD 文件，显示格式选择模态框
      if (isCadFile && !node.isFolder) {
        setDownloadingNode(node);
        setShowDownloadFormatModal(true);
        return;
      }

      // 检查节点是否在回收站中
      if (node.deletedAt) {
        return;
      }

      try {
        console.info('开始下载文件', 'useFileSystemNavigation', {
          nodeId: node.id,
          fileName: node.name,
          isFolder: node.isFolder,
        });

        const { data: blobData } = await fileSystemControllerDownloadNode({ path: { nodeId: node.id }, responseStyle: 'blob' as any });
        const blob = blobData instanceof Blob ? blobData : new Blob([blobData as BlobPart]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = node.originalName || node.name;
        const finalFileName = node.isFolder
          ? `${sanitizeFileName(fileName)}.zip`
          : sanitizeFileName(fileName);
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast(
          node.isFolder ? '目录压缩下载成功' : '文件下载成功',
          'success'
        );
      } catch (error) {
        let errorMessage = '文件下载失败';

        if (error instanceof Error) {
          if (
            error.message.includes('CORS') ||
            error.message.includes('Network Error')
          ) {
            errorMessage =
              '下载失败：跨域请求被阻止，请检查浏览器插件或尝试禁用迅雷插件';
          } else {
            errorMessage = error.message;
          }
        }

        handleError(error, '文件下载失败');
        showToast(errorMessage, 'error');
      }
    },
    [showToast]
  );

  const handleDownloadWithFormat = useCallback(
    async (
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      }
    ) => {
      if (!downloadingNode) return;

      try {
        console.info('开始下载文件（多格式）', 'useFileSystemNavigation', {
          nodeId: downloadingNode.id,
          fileName: downloadingNode.name,
          format,
        });

        const { data: blobData } = await fileSystemControllerDownloadNodeWithFormat({
          path: { nodeId: downloadingNode.id },
          query: { format, ...(pdfOptions as any) },
          responseStyle: 'blob' as any,
        });

        const blob = blobData instanceof Blob ? blobData : new Blob([blobData as BlobPart]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const fileName = downloadingNode.originalName || downloadingNode.name;
        const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
        const finalFileName = `${sanitizeFileName(nameWithoutExt)}.${format}`;

        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast(`文件下载成功（${format.toUpperCase()} 格式）`, 'success');

        setShowDownloadFormatModal(false);
        setDownloadingNode(null);
      } catch (error) {
        let errorMessage = '文件下载失败';

        if (error instanceof Error) {
          errorMessage = error.message;
        }

        handleError(error, '文件下载失败');
        showToast(errorMessage, 'error');
      }
    },
    [downloadingNode, showToast]
  );

  return {
    handleGoBack,
    handleEnterFolder,
    handleEnterProject,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
    showDownloadFormatModal,
    setShowDownloadFormatModal,
    downloadingNode,
    setDownloadingNode,
  };
};