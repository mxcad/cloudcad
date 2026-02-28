import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesApi } from '../../services/apiService';
import { FileSystemNode } from '../../types/filesystem';
import { logger } from '../../utils/logger';
import { handleError } from '../../utils/errorHandler';

interface UseFileSystemNavigationProps {
  urlProjectId: string;
  currentNode: FileSystemNode | null;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
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
}: UseFileSystemNavigationProps) => {
  const navigate = useNavigate();

  // 下载格式模态框状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNode, setDownloadingNode] = useState<FileSystemNode | null>(
    null
  );

  const handleGoBack = useCallback(() => {
    if (currentNode?.parentId) {
      navigate(`/projects/${urlProjectId}/files/${currentNode.parentId}`);
    } else {
      navigate('/projects');
    }
  }, [currentNode, navigate, urlProjectId]);

  const handleEnterFolder = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        navigate(`/projects/${urlProjectId}/files/${node.id}`);
      }
    },
    [navigate, urlProjectId]
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
        const effectiveProjectId = node.isRoot ? node.id : urlProjectId;
        navigate(`/projects/${effectiveProjectId}/files/${node.id}`);
      } else {
        const cadExtensions = ['.dwg', '.dxf'];
        if (
          node.extension &&
          cadExtensions.includes(node.extension.toLowerCase())
        ) {
          const queryParams = new URLSearchParams();
          queryParams.set('nodeId', node.parentId || '');
          navigate(`/cad-editor/${node.id}?${queryParams.toString()}`);
        } else {
          handleDownload(node);
        }
      }
    },
    [navigate, urlProjectId, currentNode]
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
        logger.info('开始下载文件', 'useFileSystemNavigation', {
          nodeId: node.id,
          fileName: node.name,
          isFolder: node.isFolder,
        });

        const response = await filesApi.download(node.id);
        const blob = new Blob([response.data]);
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
        colorPolicy?: string;
      }
    ) => {
      if (!downloadingNode) return;

      try {
        logger.info('开始下载文件（多格式）', 'useFileSystemNavigation', {
          nodeId: downloadingNode.id,
          fileName: downloadingNode.name,
          format,
        });

        const response = await filesApi.downloadWithFormat(
          downloadingNode.id,
          format,
          pdfOptions
        );

        const blob = new Blob([response.data]);
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
