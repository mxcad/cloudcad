import React, { useEffect } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { FileNameInput } from '@/components/ui/FileNameInput';
import { Folder, ChevronRight } from 'lucide-react';
import { SelectFolderModal } from './SelectFolderModal';
import { LibrarySelectFolderModal } from './LibrarySelectFolderModal';
import { useSaveAs } from './hooks/useSaveAs';
import { useLibraryFolders } from './hooks/useLibraryFolders';
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
    resetError,
    selectedFolderName,
    setSelectedFolderName,
    handleFolderConfirm,
    saveMutation,
  } = useSaveAs({ isOpen, personalSpaceId, currentFileName });

  // 检查用户是否有公共资源库管理权限
  const hasLibraryPermission =
    hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
    hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);

  const { getLibrary } = useLibraryFolders(libraryType);

  // 切换 library/更换资源库类型时自动获取库根目录
  useEffect(() => {
    if (targetType !== 'library') return;
    getLibrary()
      .then((lib) => setSelectedParentId(lib.id))
      .catch(() => {});
  }, [targetType, libraryType, getLibrary]);

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
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
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
            <div className="p-3 rounded-lg bg-[var(--bg-error)] border border-[var(--border-error)] text-[var(--error)]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
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
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              保存到
            </label>
            <Select
              value={targetType}
              onChange={(val) => {
                const newType = val as 'personal' | 'project' | 'library';
                setTargetType(newType);
                setSelectedFolderName('');
                if (newType === 'personal') {
                  setSelectedParentId(personalSpaceId || '');
                } else if (newType === 'project') {
                  setSelectedParentId(selectedProjectId || '');
                } else {
                  setSelectedParentId('');
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
              <label className="block font-medium mb-2 text-[var(--text-secondary)]">
                选择项目
              </label>
              <Select
                value={selectedProjectId}
                onChange={(val) => {
                  setSelectedProjectId(val);
                  setSelectedParentId(val);
                  setSelectedFolderName('');
                }}
                placeholder="请选择项目"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                disabled={saving}
              />
            </div>
          )}

          {targetType === 'library' && (
            <div>
              <label className="block font-medium mb-2 text-[var(--text-secondary)]">
                选择资源库
              </label>
              <Select
                value={libraryType}
                onChange={(val) => {
                  setLibraryType(val as 'drawing' | 'block');
                  setSelectedFolderName('');
                  setSelectedParentId('');
                }}
                options={[
                  { value: 'drawing', label: '图纸库' },
                  { value: 'block', label: '图块库' },
                ]}
                disabled={saving}
              />
            </div>
          )}

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              保存位置
            </label>
            <div
              className="flex items-center w-full h-[24px] px-2 py-1 text-xs gap-1.5 rounded-[3px] cursor-pointer transition-all duration-200 hover:border-[var(--border-strong)]"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
              onClick={() => setShowFolderPicker(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowFolderPicker(true);
                }
              }}
            >
              <Folder size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="flex-1 text-left truncate">
                {selectedFolderName
                  ? selectedFolderName
                  : selectedParentId
                    ? targetType === 'personal'
                      ? '我的图纸'
                      : targetType === 'library'
                        ? '公开资源库'
                        : projects.find((p) => p.id === selectedProjectId)?.name || '选择文件夹'
                    : '点击选择文件夹'}
              </span>
              <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              保存格式
            </label>
            <Select
              value={format}
              onChange={(val) => setFormat(val as 'dwg' | 'dxf' | 'mxweb')}
              options={[
                { value: 'dwg', label: 'DWG' },
                { value: 'dxf', label: 'DXF' },
                { value: 'mxweb', label: 'MXWEB' },
              ]}
              disabled={saving}
            />
          </div>
        </div>
      </Modal>

      {targetType === 'library' ? (
        <LibrarySelectFolderModal
          isOpen={showFolderPicker}
          libraryType={libraryType}
          currentNodeId=""
          onClose={() => setShowFolderPicker(false)}
          onConfirm={handleFolderConfirm}
        />
      ) : (
        <SelectFolderModal
          isOpen={showFolderPicker}
          currentNodeId=""
          projectId={getFolderPickerProjectId()}
          onClose={() => setShowFolderPicker(false)}
          onConfirm={handleFolderConfirm}
        />
      )}
    </>
  );
};