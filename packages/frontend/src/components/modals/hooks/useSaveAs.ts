import { useState, useEffect, useCallback } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { stripDrawingExtension } from '@cloudcad/platform';
import {
  saveControllerSaveMxwebAs,
  projectControllerCreateProject,
} from '@/api-sdk';
import { fetchProjects } from '@/lib/projects';
import { uploadMxCadFile } from '@/utils/mxcadUploadUtils';
import { calculateFileHash } from '@/utils/hashUtils';
import { t } from '@/languages';

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
  /**
   * 落点类型（客户端提交值回填）：后端响应不带它，但「打开新图纸」必须知道
   * 资源库落点才能拼出 `?library=`——否则库节点会被当成普通节点去查。
   */
  targetType?: 'personal' | 'project' | 'library';
  libraryType?: 'drawing' | 'block';
}

export const useSaveAs = ({
  isOpen,
  personalSpaceId,
  currentFileName,
  sourceNodeId,
  sourceFileHash,
}: {
  isOpen: boolean;
  personalSpaceId: string | null;
  currentFileName: string;
  sourceNodeId?: string | null;
  sourceFileHash?: string | null;
}) => {
  const [targetType, setTargetType] = useState<
    'personal' | 'project' | 'library'
  >('personal');
  const [libraryType, setLibraryType] = useState<'drawing' | 'block'>(
    'drawing'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [format, setFormat] = useState<'dwg' | 'dxf' | 'mxweb'>('dwg');
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  /** 刚新建的项目 id：等它出现在项目列表后自动选中（优先于「选第一个」） */
  const [pendingNewProjectId, setPendingNewProjectId] = useState<
    string | null
  >(null);

  const queryClient = useQueryClient();

  // 查询项目列表
  const { data: projects = [] } = useQuery<ProjectWithPermission[]>({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const { nodes } = await fetchProjects({ filter: 'all' });
      return nodes.map((project) => ({
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

      // 基名归一（剥掉 .dwg/.dxf/.dwt 与 .mxweb 的任意层叠），否则打开
      // `plan.dwg.mxweb` 的节点另存为时会默认成「plan.dwg」，提交后再叠一层
      // 后缀得到 `plan.dwg.mxweb`——分享出去显示的名字就是这串内部标识
      setFileName(stripDrawingExtension(currentFileName) || 'untitled');
      setPendingNewProjectId(null);
    }
  }, [isOpen, personalSpaceId, currentFileName]);

  // 自动选择项目：刚新建的项目优先（等它出现在列表里再选，期间不回退选第一个，
  // 否则会先误选旧项目再跳变）；否则未选时选第一个
  useEffect(() => {
    if (projects.length === 0) return;
    if (pendingNewProjectId) {
      const newProject = projects.find((p) => p.id === pendingNewProjectId);
      if (newProject) {
        setSelectedProjectId(newProject.id);
        setSelectedParentId(newProject.id);
        setPendingNewProjectId(null);
      }
      return;
    }
    if (!selectedProjectId) {
      const firstProject = projects[0];
      if (firstProject) {
        setSelectedProjectId(firstProject.id);
        setSelectedParentId(firstProject.id);
      }
    }
  }, [projects, selectedProjectId, pendingNewProjectId]);

  // 新建项目（「选择项目」下拉的「新建项目」入口）：
  // 创建后刷新项目列表，新项目入列后由上面的 effect 自动选中
  const createProject = useCallback(
    async (name: string) => {
      const result = await projectControllerCreateProject({
        body: { name: name.trim() },
        throwOnError: true,
      });
      const newId = (result.data as unknown as { id?: string })?.id;
      if (newId) {
        setPendingNewProjectId(newId);
      }
      queryClient.invalidateQueries({ queryKey: ['projects', 'all'] });
    },
    [queryClient]
  );

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
      const {
        targetType,
        libraryType,
        selectedProjectId,
        selectedParentId,
        format,
        fileName,
        mxwebBlob,
      } = params;

      // 分片上传 mxweb 到 uploads 缓存。
      // 用户在输入框里可能带格式后缀（含历史双层 `plan.dwg.mxweb`），提交前统一
      // 归一：默认名与提交名共用 platform 的同一判据，否则会滚出
      // `plan.dwg.mxweb.dwg` 这类叠扩展名节点，分享/列表里显示的图纸名随之变脏
      const baseName = stripDrawingExtension(fileName) || 'untitled';

      const file = new File([mxwebBlob], `${baseName}.mxweb`, {
        type: mxwebBlob.type || 'application/octet-stream',
      });
      const hash = await calculateFileHash(file);
      await uploadMxCadFile({
        file,
        hash,
        nodeId: '',
        forceUpload: true,
        skipDb: true,
      });

      // 通过 hash 调用 save-as 端点（传普通对象，SDK formDataBodySerializer 负责序列化）
      const result = await saveControllerSaveMxwebAs({
        body: {
          hash,
          targetType,
          targetParentId: selectedParentId,
          ...(targetType === 'project' && selectedProjectId
            ? { projectId: selectedProjectId }
            : {}),
          ...(targetType === 'library'
            ? { libraryType: libraryType || 'drawing' }
            : {}),
          format,
          commitMessage: `Save as: ${baseName}.${format}`,
          fileName: baseName,
          ...(sourceNodeId ? { sourceNodeId } : {}),
          ...(sourceFileHash ? { sourceFileHash } : {}),
        } as never,
      });
      if (result.error) {
        const errBody = result.error as { message?: string };
        throw new Error(errBody.message || t('保存失败'));
      }
      const saveResult: SaveAsResult = (result.data ?? {}) as SaveAsResult;

      // 后端响应只给 nodeId/fileName/path/parentId，落点类型是客户端才知道的事实。
      // 回填给调用方，让「打开新图纸」能按库/非库拼正确的 URL（库节点必须带
      // ?library=，否则被当成普通节点查询 → 打开失败）。
      return {
        ...saveResult,
        targetType,
        libraryType:
          targetType === 'library' ? libraryType || 'drawing' : undefined,
      };
    },
  });

  const handleFolderConfirm = useCallback(
    (targetParentId: string, folderName?: string) => {
      setSelectedParentId(targetParentId);
      setSelectedFolderName(folderName || '');
      setShowFolderPicker(false);
    },
    []
  );

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
    createProject,
  };
};
