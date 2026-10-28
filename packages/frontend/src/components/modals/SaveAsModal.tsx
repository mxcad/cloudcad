import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { FileNameInput } from '@/components/ui/FileNameInput';
import { Folder, ChevronRight } from 'lucide-react';
import { SelectFolderModal } from './SelectFolderModal';
import { LibrarySelectFolderModal } from './LibrarySelectFolderModal';
import { useSaveAs } from './hooks/useSaveAs';
import { useLibraryFolders } from './hooks/useLibraryFolders';
import { usePermission } from '../../hooks/usePermission';
import { SystemPermission } from '../../constants/permissions';
import { t } from '@/languages';

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
    targetType?: 'personal' | 'project' | 'library';
    libraryType?: 'drawing' | 'block';
  }) => void;
  sourceNodeId?: string | null;
  sourceFileHash?: string | null;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentFileName,
  mxwebBlob,
  personalSpaceId,
  onClose,
  onSuccess,
  sourceNodeId,
  sourceFileHash,
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
    createProject,
  } = useSaveAs({
    isOpen,
    personalSpaceId,
    currentFileName,
    sourceNodeId,
    sourceFileHash,
  });

  // 「选择项目」下拉的「新建项目」入口
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createProjectError, setCreateProjectError] = useState<string | null>(
    null
  );
  const [creatingProject, setCreatingProject] = useState(false);

  const handleCreateProjectConfirm = async () => {
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    setCreateProjectError(null);
    try {
      await createProject(name);
      setShowCreateProjectDialog(false);
      setNewProjectName('');
    } catch (err) {
      setCreateProjectError(
        err instanceof Error ? err.message : t('项目创建失败')
      );
    } finally {
      setCreatingProject(false);
    }
  };

  const closeCreateProjectDialog = () => {
    if (creatingProject) return;
    setShowCreateProjectDialog(false);
    setNewProjectName('');
    setCreateProjectError(null);
  };

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
      setError(t('请输入文件名'));
      return;
    }

    // Validate file name format
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(fileName)) {
      setError(t('文件名不能包含以下字符: \\ / : * ? " < > |'));
      return;
    }

    // Resolve the effective parentId BEFORE calling mutation
    // Avoids race condition: setSelectedParentId is async, but mutation
    // would use the stale (empty) value in the same render cycle.
    let effectiveParentId = selectedParentId;
    const effectiveProjectId = selectedProjectId;

    if (!effectiveParentId) {
      if (targetType === 'personal') {
        effectiveParentId = getFolderPickerProjectId() || '';
        setSelectedParentId(effectiveParentId);
      } else if (targetType === 'project') {
        if (!effectiveProjectId) {
          setError(t('请先选择项目'));
          return;
        }
        effectiveParentId = effectiveProjectId;
        setSelectedParentId(effectiveProjectId);
      } else if (targetType === 'library') {
        setError(t('请选择公开资源库中的保存位置'));
        return;
      }
    }

    if (!effectiveParentId) {
      setError(t('请选择保存位置'));
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
          targetType: result.targetType,
          libraryType: result.libraryType,
        });
      } else {
        setError(result?.message || t('保存失败'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('保存失败，请稍后重试'));
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
        title={t('另存为')}
        className="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              {t('取消')}
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? t('保存中...') : t('保存')}
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
              {t('文件名')}
            </label>
            <FileNameInput
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t('请输入文件名')}
              disabled={saving}
              suffix={`.${format}`}
              suffixVariant="text"
            />
          </div>

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              {t('保存到')}
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
                { value: 'personal', label: t('个人空间') },
                { value: 'project', label: t('项目文件夹') },
                ...(hasLibraryPermission
                  ? [{ value: 'library' as const, label: t('公开资源库') }]
                  : []),
              ]}
            />
          </div>

          {targetType === 'project' && (
            <div>
              <label className="block font-medium mb-2 text-[var(--text-secondary)]">
                {t('选择项目')}
              </label>
              <Select
                value={selectedProjectId}
                onChange={(val) => {
                  // 「新建项目」是动作项：只开弹窗，不改选中值
                  if (val === '__create_project__') {
                    setShowCreateProjectDialog(true);
                    return;
                  }
                  setSelectedProjectId(val);
                  setSelectedParentId(val);
                  setSelectedFolderName('');
                }}
                placeholder={t('请选择项目')}
                options={[
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                  { value: '__create_project__', label: t('新建项目') },
                ]}
                disabled={saving}
              />
            </div>
          )}

          {targetType === 'library' && (
            <div>
              <label className="block font-medium mb-2 text-[var(--text-secondary)]">
                {t('选择资源库')}
              </label>
              <Select
                value={libraryType}
                onChange={(val) => {
                  setLibraryType(val as 'drawing' | 'block');
                  setSelectedFolderName('');
                  setSelectedParentId('');
                }}
                options={[
                  { value: 'drawing', label: t('图纸库') },
                  { value: 'block', label: t('图块库') },
                ]}
                disabled={saving}
              />
            </div>
          )}

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              {t('保存位置')}
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
              <Folder
                size={14}
                className="shrink-0"
                style={{ color: 'var(--text-muted)' }}
              />
              <span className="flex-1 text-left truncate">
                {selectedFolderName
                  ? selectedFolderName
                  : selectedParentId
                    ? targetType === 'personal'
                      ? t('个人空间')
                      : targetType === 'library'
                        ? t('公开资源库')
                        : projects.find((p) => p.id === selectedProjectId)
                            ?.name || t('选择文件夹')
                    : t('点击选择文件夹')}
              </span>
              <ChevronRight
                size={14}
                className="shrink-0"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-2 text-[var(--text-secondary)]">
              {t('保存格式')}
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

      <Modal
        isOpen={showCreateProjectDialog}
        onClose={closeCreateProjectDialog}
        title={t('新建项目')}
        className="max-w-sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeCreateProjectDialog}
              disabled={creatingProject}
            >
              {t('取消')}
            </Button>
            <Button
              onClick={handleCreateProjectConfirm}
              disabled={creatingProject || !newProjectName.trim()}
            >
              {creatingProject ? t('创建中...') : t('创建')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createProjectError && (
            <div className="p-3 rounded-lg bg-[var(--bg-error)] border border-[var(--border-error)] text-[var(--error)]">
              {createProjectError}
            </div>
          )}
          <div>
            <label
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('名称 *')}
            </label>
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateProjectConfirm()}
              placeholder={t('请输入项目名称')}
              autoFocus
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
