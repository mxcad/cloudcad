import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fileSystemControllerGetProjects } from '@/api-sdk';
import type { FileSystemNodeDto } from '@/api-sdk';
import { uploadMxCadFile } from '@/utils/mxcadUploadUtils';
import { calculateFileHash } from '@/utils/hashUtils';

interface ProjectWithPermission {
  id: string;
  name: string;
  hasUploadPermission: boolean;
}

interface SaveAsParams {
  targetType: 'personal' | 'project' | 'library';
  libraryType?: 'drawing' | 'block';
  selectedProjectId: string;
  selectedParentId: string;
  format: 'dwg' | 'dxf' | 'mxweb';
  fileName: string;
  mxwebBlob: Blob;
}

interface SaveAsResult {
  success: boolean;
  message?: string;
  nodeId?: string;
  fileName?: string;
  path?: string;
  projectId?: string;
  parentId?: string;
}

export const useSaveAs = ({
  isOpen,
  personalSpaceId,
  currentFileName,
}: {
  isOpen: boolean;
  personalSpaceId: string | null;
  currentFileName: string;
}) => {
  const [targetType, setTargetType] = useState<'personal' | 'project' | 'library'>('personal');
  const [libraryType, setLibraryType] = useState<'drawing' | 'block'>('drawing');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [format, setFormat] = useState<'dwg' | 'dxf' | 'mxweb'>('dwg');
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');

  // 查询项目列表
  const { data: projects = [] } = useQuery<ProjectWithPermission[]>({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const result = await fileSystemControllerGetProjects({ query: { filter: 'all' } });
      if (result.error) throw result.error;
      const allProjects = result.data?.nodes || [];
      return allProjects.map((project: FileSystemNodeDto) => ({
        id: project.id,
        name: project.name,
        hasUploadPermission: true,
      }));
    },
    enabled: isOpen && targetType === 'project',
  });

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setTargetType('personal');
      setSelectedProjectId('');
      const initialParentId = personalSpaceId || '';
      setSelectedParentId(initialParentId);
      setSelectedFolderName('');
      setFormat('dwg');
      setError(null);

      const baseName = currentFileName.replace(/\.[^/.]+$/, '');
      setFileName(baseName || 'untitled');
    }
  }, [isOpen, personalSpaceId, currentFileName]);

  // 项目切换时自动选择第一个项目
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const firstProject = projects[0];
      if (firstProject) {
        setSelectedProjectId(firstProject.id);
        setSelectedParentId(firstProject.id);
      }
    }
  }, [projects, selectedProjectId]);

  // 计算文件夹选择器的 projectId
  const getFolderPickerProjectId = useCallback(() => {
    if (targetType === 'project') {
      return selectedProjectId;
    }
    return personalSpaceId || undefined;
  }, [targetType, selectedProjectId, personalSpaceId]);

  // 保存 mutation
  const saveMutation = useMutation({
    mutationFn: async (params: SaveAsParams): Promise<SaveAsResult> => {
      const { targetType, libraryType, selectedProjectId, selectedParentId, format, fileName, mxwebBlob } = params;

      // 分片上传 mxweb 到 uploads 缓存
      const file = new File([mxwebBlob], `${fileName || 'untitled'}.mxweb`, {
        type: mxwebBlob.type || 'application/octet-stream',
      });
      const hash = await calculateFileHash(file);
      await uploadMxCadFile({ file, hash, nodeId: '', forceUpload: true, skipDb: true });

      // 通过 hash 调用 save-as 端点
      const formData = new FormData();
      formData.append('hash', hash);
      formData.append('targetType', targetType);
      formData.append('targetParentId', selectedParentId);
      if (targetType === 'project' && selectedProjectId) {
        formData.append('projectId', selectedProjectId);
      }
      if (targetType === 'library') {
        formData.append('libraryType', libraryType || 'drawing');
      }
      formData.append('format', format);
      formData.append('commitMessage', `Save as: ${fileName}.${format}`);
      formData.append('fileName', fileName.trim());

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/mxcad/save-as', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ message: '保存失败' }));
        throw new Error((errBody as { message?: string }).message || '保存失败');
      }
      const wrapped = await response.json();
      const saveResult: SaveAsResult = wrapped.data || wrapped;

      return saveResult;
    },
  });

  const handleFolderConfirm = useCallback((targetParentId: string, folderName?: string) => {
    setSelectedParentId(targetParentId);
    setSelectedFolderName(folderName || '');
    setShowFolderPicker(false);
  }, []);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    targetType,
    setTargetType,
    libraryType,
    setLibraryType,
    selectedProjectId,
    setSelectedProjectId,
    selectedParentId,
    setSelectedParentId,
    format,
    setFormat,
    fileName,
    setFileName,
    error,
    setError,
    showFolderPicker,
    setShowFolderPicker,
    selectedFolderName,
    setSelectedFolderName,
    projects,
    loading: saveMutation.isPending,
    saving: saveMutation.isPending,
    getFolderPickerProjectId,
    resetError,
    handleFolderConfirm,
    saveMutation,
  };
};
