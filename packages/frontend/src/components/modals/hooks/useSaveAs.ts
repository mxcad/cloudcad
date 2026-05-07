import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fileSystemControllerGetProjects, saveControllerSaveMxwebAs } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

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
  format: 'dwg' | 'dxf';
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
  const [format, setFormat] = useState<'dwg' | 'dxf'>('dwg');
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // 查询项目列表
  const { data: projects = [] } = useQuery<ProjectWithPermission[]>({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const result = await fileSystemControllerGetProjects({ query: { filter: 'all' } });
      if (result.error) throw result.error;
      const allProjects = result.data?.nodes || [];
      return allProjects.map((project: ProjectDto) => ({
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

      // 公开资源库另存为
      if (targetType === 'library') {
        const formData = new FormData();
        formData.append('file', mxwebBlob);
        formData.append('targetType', 'library');
        formData.append('targetParentId', selectedParentId);
        formData.append('libraryType', libraryType || 'drawing');
        formData.append('fileName', fileName.trim());

        const result = await saveControllerSaveMxwebAs({ body: formData as unknown as SaveMxwebAsDto });
        const saveResult = result.data as SaveAsResult;

        return saveResult;
      }

      // 我的图纸/项目另存为
      const formData = new FormData();
      formData.append('file', mxwebBlob);
      formData.append('targetType', targetType);
      formData.append('targetParentId', selectedParentId);
      if (targetType === 'project' && selectedProjectId) {
        formData.append('projectId', selectedProjectId);
      }
      formData.append('format', format);
      formData.append('commitMessage', `Save as: ${fileName}.${format}`);
      formData.append('fileName', fileName.trim());

      const result = await saveControllerSaveMxwebAs({ body: formData as unknown as SaveMxwebAsDto });
      const saveResult = result.data as SaveAsResult;

      return saveResult;
    },
  });

  const handleConfirm = useCallback(async () => {
    if (!fileName.trim()) {
      setError('请输入文件名');
      return;
    }

    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(fileName)) {
      setError('文件名不能包含以下字符: \\ / : * ? " < > |');
      return;
    }

    if (!selectedParentId) {
      if (targetType === 'personal') {
        setSelectedParentId(getFolderPickerProjectId() || '');
      } else if (targetType === 'project') {
        if (!selectedProjectId) {
          setError('请先选择项目');
          return;
        }
        setSelectedParentId(selectedProjectId);
      } else if (targetType === 'library') {
        setError('请选择公开资源库中的保存位置');
        return;
      }
    }

    setError(null);

    try {
      const result = await saveMutation.mutateAsync({
        targetType,
        libraryType,
        selectedProjectId,
        selectedParentId,
        format,
        fileName,
        mxwebBlob: new Blob(), // placeholder, actual blob passed by caller
      });

      return result;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
      return null;
    }
  }, [fileName, selectedParentId, targetType, selectedProjectId, libraryType, format, getFolderPickerProjectId, saveMutation]);

  const handleClose = useCallback(() => {
    setError(null);
  }, []);

  const handleFolderConfirm = useCallback((targetParentId: string) => {
    setSelectedParentId(targetParentId);
    setShowFolderPicker(false);
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
    projects,
    loading: saveMutation.isPending,
    saving: saveMutation.isPending,
    getFolderPickerProjectId,
    handleConfirm,
    handleClose,
    handleFolderConfirm,
    saveMutation,
  };
};
