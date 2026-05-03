import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { filesApi } from '@/services/filesApi';
import type { FileSystemNode } from './useFileSystemData';

export interface UseFileSystemNavigationOptions {
  urlProjectId?: string;
  currentNode: FileSystemNode | null;
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  mode?: 'project' | 'personal-space';
}

function sanitizeFileName(fileName: string): string {
  let sanitized = fileName.replace(/[/\\]/g, '_');
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/gu, '');
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  if (sanitized.length > 250) {
    const ext = sanitized.split('.').pop() || '';
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, 250 - ext.length - 1) + '.' + ext;
  }
  return sanitized || 'unnamed';
}

export function useFileSystemNavigation(options: UseFileSystemNavigationOptions) {
  const router = useRouter();

  const showDownloadFormatModal = ref(false);
  const downloadingNode = ref<FileSystemNode | null>(null);

  function handleGoBack(): void {
    if (options.mode === 'personal-space') {
      if (options.currentNode?.parentId) {
        router.push(`/personal-space/${options.currentNode.parentId}`);
      } else {
        router.push('/personal-space');
      }
    } else {
      if (options.currentNode?.parentId) {
        router.push(`/projects/${options.urlProjectId}/files/${options.currentNode.parentId}`);
      } else {
        router.push('/projects');
      }
    }
  }

  function handleEnterFolder(node: FileSystemNode): void {
    if (node.isFolder) {
      if (options.mode === 'personal-space') {
        router.push(`/personal-space/${node.id}`);
      } else {
        router.push(`/projects/${options.urlProjectId}/files/${node.id}`);
      }
    }
  }

  function handleEnterProject(projectId: string): void {
    router.push(`/projects/${projectId}/files`);
  }

  function handleFileOpen(node: FileSystemNode): void {
    if (node.deletedAt) {
      return;
    }

    if (node.isFolder) {
      if (options.mode === 'personal-space') {
        router.push(`/personal-space/${node.id}`);
      } else {
        const effectiveProjectId = node.isRoot ? node.id : options.urlProjectId;
        router.push(`/projects/${effectiveProjectId}/files/${node.id}`);
      }
    } else {
      const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
      if (node.extension && cadExtensions.includes(node.extension.toLowerCase())) {
        const queryParams = new URLSearchParams();
        queryParams.set('nodeId', node.parentId || '');
        const url = `/cad-editor/${node.id}?${queryParams.toString()}`;
        window.open(url, '_blank');
      } else {
        handleDownload(node);
      }
    }
  }

  async function handleDownload(node: FileSystemNode): Promise<void> {
    const isCadFile = ['.dwg', '.dxf'].some((ext) =>
      node.name.toLowerCase().endsWith(ext)
    );

    if (isCadFile && !node.isFolder) {
      downloadingNode.value = node;
      showDownloadFormatModal.value = true;
      return;
    }

    if (node.deletedAt) {
      return;
    }

    try {
      const response = await filesApi.download(node.id);
      const blob = new Blob([response.data as BlobPart]);
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

      options.showToast(
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
          errorMessage = '下载失败：跨域请求被阻止，请检查浏览器插件或尝试禁用迅雷插件';
        } else {
          errorMessage = error.message;
        }
      }

      options.showToast(errorMessage, 'error');
    }
  }

  async function handleDownloadWithFormat(
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    }
  ): Promise<void> {
    if (!downloadingNode.value) return;

    try {
      const response = await filesApi.downloadWithFormat(
        downloadingNode.value.id,
        format,
        pdfOptions
      );

      const blob = new Blob([response.data as BlobPart]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const fileName = downloadingNode.value.originalName || downloadingNode.value.name;
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
      const finalFileName = `${sanitizeFileName(nameWithoutExt)}.${format}`;

      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      options.showToast(`文件下载成功（${format.toUpperCase()} 格式）`, 'success');

      showDownloadFormatModal.value = false;
      downloadingNode.value = null;
    } catch (error) {
      let errorMessage = '文件下载失败';

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      options.showToast(errorMessage, 'error');
    }
  }

  return {
    showDownloadFormatModal,
    downloadingNode,
    setDownloadingNode: (node: FileSystemNode | null) => { downloadingNode.value = node; },
    setShowDownloadFormatModal: (show: boolean) => { showDownloadFormatModal.value = show; },
    handleGoBack,
    handleEnterFolder,
    handleEnterProject,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
  };
}
