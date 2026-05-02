import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Folder } from 'lucide-react';
import { SelectFolderModal } from './SelectFolderModal';
import { projectsApi } from '../../services/projectsApi';
import { mxcadApi } from '../../services/mxcadApi';
import { libraryApi } from '../../services/libraryApi';
import { globalShowToast } from '../../contexts/NotificationContext';
import { usePermission } from '../../hooks/usePermission';
import { SystemPermission } from '../../constants/permissions';

interface SaveAsModalProps {
  isOpen: boolean;
  currentFileName: string;
  mxwebBlob: Blob;
  personalSpaceId: string | null;
  onClose: () => void;
  onSuccess: (result: {
    nodeId: string;
    fileName: string;
    path: string;
    projectId?: string;
    parentId: string;
  }) => void;
}

interface ProjectWithPermission {
  id: string;
  name: string;
  hasUploadPermission: boolean;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentFileName,
  mxwebBlob,
  personalSpaceId,
  onClose,
  onSuccess,
}) => {
  const { hasPermission } = usePermission();
  const [targetType, setTargetType] = useState<
    'personal' | 'project' | 'library'
  >('personal');
  const [libraryType, setLibraryType] = useState<'drawing' | 'block'>(
    'drawing'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [format, setFormat] = useState<'dwg' | 'dxf'>('dwg');
  const [fileName, setFileName] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectWithPermission[]>([]);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 检查用户是否有公共资源库管理权限
  const hasLibraryPermission =
    hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
    hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);

  const loadProjects = async () => {
    try {
      const response = await projectsApi.list('all');
      const allProjects = (response.data as any)?.nodes || [];

      const projectList = allProjects.map((project: any) => ({
        id: project.id,
        name: project.name,
        hasUploadPermission: true,
      }));

      setProjects(projectList);

      if (projectList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectList[0].id);
        setSelectedParentId(projectList[0].id);
      }
    } catch (err) {
      console.error('加载项目失败', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTargetType('personal');
      setSelectedProjectId('');

      // 优先使用 props 传入的 personalSpaceId（来自 API）
      // 如果没有，则尝试从 localStorage 获取（作为后备）
      const initialParentId = personalSpaceId || '';
      setSelectedParentId(initialParentId);
      setFormat('dwg');
      setError(null);
      setProjects([]);

      // 从当前文件名提取名称（不含扩展名）
      const baseName = currentFileName.replace(/\.[^/.]+$/, '');
      setFileName(baseName || 'untitled');
    }
  }, [isOpen, personalSpaceId, currentFileName]);

  // 计算当前应该传递给SelectFolderModal的projectId
  const getFolderPickerProjectId = () => {
    if (targetType === 'project') {
      return selectedProjectId;
    }
    // 私人空间模式：只使用 props 传入的 personalSpaceId
    return personalSpaceId || undefined;
  };

  useEffect(() => {
    if (isOpen && targetType === 'project') {
      loadProjects();
    }
  }, [isOpen, targetType]);

  const handleConfirm = async () => {
    // 验证文件名
    if (!fileName.trim()) {
      setError('请输入文件名');
      return;
    }

    // 验证文件名格式
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(fileName)) {
      setError('文件名不能包含以下字符: \\ / : * ? " < > |');
      return;
    }

    // 如果没有选择保存位置，设置默认值
    if (!selectedParentId) {
      if (targetType === 'personal') {
        // 我的图纸：保存到根目录
        setSelectedParentId(getFolderPickerProjectId() || '');
      } else if (targetType === 'project') {
        // 项目模式：保存到项目根目录
        if (!selectedProjectId) {
          setError('请先选择项目');
          return;
        }
        setSelectedParentId(selectedProjectId);
      } else if (targetType === 'library') {
        // 公开资源库模式：需要选择保存位置
        setError('请选择公开资源库中的保存位置');
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // 公开资源库另存为
      if (targetType === 'library') {
        const libResult =
          libraryType === 'drawing'
            ? await libraryApi.saveDrawingAs(
                mxwebBlob,
                selectedParentId,
                fileName.trim(),
                (percentage) => console.log('上传进度:', percentage)
              )
            : await libraryApi.saveBlockAs(
                mxwebBlob,
                selectedParentId,
                fileName.trim(),
                (percentage) => console.log('上传进度:', percentage)
              );

        const libSaveResult = libResult as unknown as {
          nodeId: string;
          fileName: string;
          path: string;
          parentId: string;
        };

        globalShowToast('保存成功', 'success');
        onSuccess({
          nodeId: libSaveResult.nodeId,
          fileName: libSaveResult.fileName,
          path: libSaveResult.path,
          parentId: libSaveResult.parentId,
        });
        setSaving(false);
        return;
      }

      // 我的图纸/项目另存为
      const result = await mxcadApi.saveMxwebAs(
        mxwebBlob,
        targetType,
        selectedParentId,
        targetType === 'project' ? selectedProjectId : undefined,
        format,
        (percentage) => {
          console.log('上传进度:', percentage);
        },
        `Save as: ${fileName}.${format}`,
        fileName.trim()
      );

      const saveResult = result as {
        success: boolean;
        message?: string;
        nodeId?: string;
        fileName?: string;
        path?: string;
        projectId?: string;
        parentId?: string;
      };

      if (saveResult.success) {
        globalShowToast('保存成功', 'success');
        onSuccess({
          nodeId: saveResult.nodeId || '',
          fileName: saveResult.fileName || '',
          path: saveResult.path || '',
          projectId: saveResult.projectId,
          parentId: saveResult.parentId || '',
        });
      } else {
        setError(saveResult.message || '保存失败');
      }
    } catch (err: any) {
      setError(err.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setError(null);
      onClose();
    }
  };

  const handleFolderConfirm = (targetParentId: string) => {
    setSelectedParentId(targetParentId);
    setShowFolderPicker(false);
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showFolderPicker}
        onClose={handleClose}
        title="另存为"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={handleClose} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              文件名
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="请输入文件名"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={saving}
              />
              <span className="text-slate-500">.{format}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              保存到
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setTargetType('personal');
                  setSelectedParentId(personalSpaceId || '');
                }}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  targetType === 'personal'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                我的图纸
              </button>
              <button
                type="button"
                onClick={() => setTargetType('project')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  targetType === 'project'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                项目文件夹
              </button>
              {hasLibraryPermission && (
                <button
                  type="button"
                  onClick={() => setTargetType('library')}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                    targetType === 'library'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  公开资源库
                </button>
              )}
            </div>
          </div>

          {targetType === 'project' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                选择项目
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedParentId(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={saving}
              >
                <option value="">请选择项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'library' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                选择资源库
              </label>
              <select
                value={libraryType}
                onChange={(e) => {
                  setLibraryType(e.target.value as 'drawing' | 'block');
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={saving}
              >
                <option value="drawing">图纸库</option>
                <option value="block">图块库</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              保存位置
            </label>
            <button
              type="button"
              onClick={() => {
                console.log(
                  'Click save location, targetType:',
                  targetType,
                  'selectedParentId:',
                  selectedParentId,
                  'personalSpaceId:',
                  personalSpaceId
                );
                setShowFolderPicker(true);
              }}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg flex items-center gap-3 hover:bg-slate-50"
            >
              <Folder className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left truncate">
                {selectedParentId
                  ? targetType === 'personal'
                    ? '我的图纸'
                    : projects.find((p) => p.id === selectedProjectId)?.name ||
                      '选择文件夹'
                  : '点击选择文件夹'}
              </span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              保存格式
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat('dwg')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  format === 'dwg'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                DWG
              </button>
              <button
                type="button"
                onClick={() => setFormat('dxf')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                  format === 'dxf'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                DXF
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <SelectFolderModal
        isOpen={showFolderPicker}
        currentNodeId=""
        projectId={getFolderPickerProjectId()}
        onClose={() => setShowFolderPicker(false)}
        onConfirm={handleFolderConfirm}
      />
    </>
  );
};
