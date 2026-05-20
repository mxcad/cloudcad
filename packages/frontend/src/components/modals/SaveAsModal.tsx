import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { FileNameInput } from '@/components/ui/FileNameInput';
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
  /** 另存为到本地（触发下载弹框） */
  onDownloadLocal?: () => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentFileName,
  mxwebBlob,
  personalSpaceId,
  onClose,
  onSuccess,
  onDownloadLocal,
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
    // Validate file name
    if (!(fileName || '').trim()) {
      setError('请输入文件名');
      return;
    }

    // Validate file name format
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(fileName)) {
      setError('文件名不能包含以下字符: \\ / : * ? " < > |');
      return;
    }

    // Resolve the effective parentId BEFORE calling mutation
    // Avoids race condition: setSelectedParentId is async, but mutation
    // would use the stale (empty) value in the same render cycle.
    let effectiveParentId = selectedParentId;
    let effectiveProjectId = selectedProjectId;

    if (!effectiveParentId) {
      if (targetType === 'personal') {
        effectiveParentId = getFolderPickerProjectId() || '';
        setSelectedParentId(effectiveParentId);
      } else if (targetType === 'project') {
        if (!effectiveProjectId) {
          setError('请先选择项目');
          return;
        }
        effectiveParentId = effectiveProjectId;
        setSelectedParentId(effectiveProjectId);
      } else if (targetType === 'library') {
        setError('请选择公开资源库中的保存位置');
        return;
      }
    }

    if (!effectiveParentId) {
      setError('请选择保存位置');
      return;
    }

    setError(null);

    try {
      const result = await saveMutation.mutateAsync({
        targetType,
        libraryType,
        selectedProjectId: effectiveProjectId,
        selectedParentId: effectiveParentId,
        format,
        fileName,
        mxwebBlob,
      });

      if (result?.success) {
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
            {onDownloadLocal && (
              <Button variant="outline" onClick={onDownloadLocal} disabled={saving}>
                另存为到本地
              </Button>
            )}
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-error)', border: '1px solid var(--border-error)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              文件名
            </label>
            <FileNameInput
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="请输入文件名"
              disabled={saving}
              suffix={`.${format}`}
              suffixVariant="text"
            />
          </div>

          <div>
            <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              保存到
            </label>
            <Select
              value={targetType}
              onChange={(val) => {
                setTargetType(val as 'personal' | 'project' | 'library');
                if (val === 'personal') {
                  setSelectedParentId(personalSpaceId || '');
                } else {
                  setSelectedParentId(val);
                }
              }}
              options={[
                { value: 'personal', label: '我的图纸' },
                { value: 'project', label: '项目文件夹' },
                ...(hasLibraryPermission ? [{ value: 'library' as const, label: '公开资源库' }] : []),
              ]}
            />
          </div>

          {targetType === 'project' && (
            <div>
              <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                选择项目
              </label>
              <Select
                value={selectedProjectId}
                onChange={(val) => {
                  setSelectedProjectId(val);
                  setSelectedParentId(val);
                }}
                placeholder="请选择项目"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                disabled={saving}
              />
            </div>
          )}

          {targetType === 'library' && (
            <div>
              <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                选择资源库
              </label>
              <Select
                value={libraryType}
                onChange={(val) => setLibraryType(val as 'drawing' | 'block')}
                options={[
                  { value: 'drawing', label: '图纸库' },
                  { value: 'block', label: '图块库' },
                ]}
                disabled={saving}
              />
            </div>
          )}

          <div>
            <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              保存位置
            </label>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setShowFolderPicker(true);
              }}
              className="w-full"
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
            </Button>
          </div>

          <div>
            <label className="block font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              保存格式
            </label>
            <Select
              value={format}
              onChange={(val) => setFormat(val as 'dwg' | 'dxf' | 'pdf' | 'mxweb')}
              options={[
                { value: 'dwg', label: 'DWG' },
                { value: 'dxf', label: 'DXF' },
                { value: 'pdf', label: 'PDF' },
                { value: 'mxweb', label: 'MXWEB' },
              ]}
              disabled={saving}
            />
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