import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Folder } from 'lucide-react';
import { SelectFolderModal } from './SelectFolderModal';
import { useSaveAs } from './hooks/useSaveAs';
import { globalShowToast } from '../../contexts/NotificationContext';
import { usePermission } from '../../hooks/usePermission';
import { SystemPermission } from '../../constants/permissions';

// TODO: Replace with SDK when backend adds this endpoint — keep old import for getUserPersonalSpace

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

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentFileName,
  mxwebBlob,
  personalSpaceId,
  onClose,
  onSuccess,
}) => {
  const { hasPermission } = usePermission();
  const {
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
    saving,
    getFolderPickerProjectId,
    handleClose: resetError,
    handleFolderConfirm,
    saveMutation,
  } = useSaveAs({ isOpen, personalSpaceId, currentFileName });

  // 检查用户是否有公共资源库管理权限
  const hasLibraryPermission =
    hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
    hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);

  const handleConfirm = async () => {
    // 验证文件名
    if (!(fileName || '').trim()) {
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
        mxwebBlob,
      });

      if (result?.success) {
        globalShowToast('保存成功', 'success');
        onSuccess({
          nodeId: result.nodeId || '',
          fileName: result.fileName || '',
          path: result.path || '',
          projectId: result.projectId,
          parentId: result.parentId || '',
        });
      } else {
        setError(result?.message || '保存失败');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    }
  };

  const handleClose = () => {
    if (!saving) {
      resetError();
      onClose();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showFolderPicker}
        onClose={handleClose}
        title="另存为"
        className="max-w-md"
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