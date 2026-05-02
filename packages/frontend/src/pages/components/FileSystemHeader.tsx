import React, { useState, useEffect } from 'react';
import { BreadcrumbNavigation } from '../../components/BreadcrumbNavigation';
import { Button } from '../../components/ui/Button';
import { RefreshIcon } from '../../components/FileIcons';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';

interface FileSystemHeaderProps {
  breadcrumbs: Array<{ id: string; name: string; isRoot: boolean }>;
  mode: 'project' | 'personal-space';
  isAtRoot: boolean;
  isPersonalSpaceMode: boolean;
  isTrashView: boolean;
  isProjectTrashView: boolean;
  loading: boolean;
  canCreateProject: boolean;
  onGoBack: () => void;
  onRefresh: () => void;
  onToggleTrashView: () => void;
  onOpenCreateProject: () => void;
  onOpenCreateFolder: () => void;
  onTriggerUpload: () => void;
  onShowToast: (message: string, type: string) => void;
  setShowCreateFolderModal: (show: boolean) => void;
  uploaderRef: React.RefObject<{ triggerUpload: () => void } | null>;
}

export const FileSystemHeader: React.FC<FileSystemHeaderProps> = ({
  breadcrumbs,
  mode,
  isAtRoot,
  isPersonalSpaceMode,
  isTrashView,
  isProjectTrashView,
  loading,
  canCreateProject,
  onGoBack,
  onRefresh,
  onToggleTrashView,
  onOpenCreateProject,
  onOpenCreateFolder,
  onTriggerUpload,
  onShowToast,
  setShowCreateFolderModal,
  uploaderRef,
}) => {
  const navigate = useNavigate();
  const params = useParams<{ projectId: string; nodeId?: string }>();

  const handleBackClick = () => {
    if (isPersonalSpaceMode) {
      isAtRoot ? navigate('/personal-space') : onGoBack();
    } else {
      isAtRoot ? navigate('/projects') : onGoBack();
    }
  };

  const handleBreadcrumbNavigate = (crumb: {
    id: string;
    isRoot?: boolean;
  }) => {
    if (isPersonalSpaceMode) {
      crumb.isRoot
        ? navigate('/personal-space')
        : navigate(`/personal-space/${crumb.id}`);
    } else {
      crumb.isRoot
        ? navigate(`/projects/${params.projectId}/files`)
        : navigate(`/projects/${params.projectId}/files/${crumb.id}`);
    }
  };

  return (
    <div
      className="backdrop-blur-xl rounded-2xl p-4 shadow-sm space-y-3"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={handleBackClick}
            className="p-2 rounded-xl transition-all flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            title={
              isPersonalSpaceMode
                ? isAtRoot
                  ? '返回我的图纸'
                  : '返回上一级'
                : isAtRoot
                  ? '返回项目列表'
                  : '返回上一级'
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>

          <div
            ref={null}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs}
              onNavigate={handleBreadcrumbNavigate}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            style={{ color: 'var(--text-tertiary)' }}
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </Button>

          {!isAtRoot && (
            <Button
              variant={isTrashView ? 'primary' : 'ghost'}
              size="sm"
              onClick={onToggleTrashView}
              disabled={loading}
              title={isTrashView ? '返回文件列表' : '回收站'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          )}

          {isAtRoot
            ? canCreateProject &&
              !isPersonalSpaceMode &&
              !isProjectTrashView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenCreateProject}
                  title="新建项目"
                >
                  <FolderPlus size={16} />
                </Button>
              )
            : !isTrashView && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateFolderModal(true)}
                    disabled={loading}
                    title="新建文件夹"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      <path d="M12 11v6M9 14h6" />
                    </svg>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!params.projectId) {
                        onShowToast('请先选择一个项目再上传文件', 'warning');
                        return;
                      }
                      uploaderRef?.current?.triggerUpload();
                    }}
                    disabled={loading}
                    title="上传文件"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" />
                      <path d="M17 8L12 3L7 8M12 3V21" />
                    </svg>
                  </Button>
                </>
              )}
        </div>
      </div>
    </div>
  );
};
