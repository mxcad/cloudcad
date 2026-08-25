///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { FolderPlus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  EmptyFolderIcon,
  RefreshIcon,
  ProjectIcon,
} from '@/components/FileIcons';
import type { ProjectFilterType } from '@/api-sdk';
import { useDelayedLoading } from '@/hooks/common/useDelayedLoading';
import { t } from '@/languages';

export interface FileSystemStatesProps {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  isAtRoot: boolean;
  isTrashView: boolean;
  searchTerm: string;
  canCreateProject: boolean;
  projectFilter: ProjectFilterType;
  onRefresh: () => void;
  onCreateProject: () => void;
  /** 自定义空状态视图（覆盖默认的 empty view） */
  renderEmptyView?: React.ReactNode;
  /** 是否在项目根目录下（非普通文件夹），空状态时显示不同文案 */
  isEmptyProject?: boolean;
}

export const FileSystemStates: React.FC<FileSystemStatesProps> = ({
  loading,
  error,
  isEmpty,
  isAtRoot,
  isTrashView,
  searchTerm,
  canCreateProject,
  projectFilter,
  onRefresh,
  onCreateProject,
  renderEmptyView,
  isEmptyProject,
}) => {
  // 防闪烁：loading 快速结束（缓存命中/快速返回）时不闪现 spinner，
  // 延迟窗口期内 loading 分支渲染 null（isEmpty 在 loading 期间恒 false，不会提前出空态）
  const showLoading = useDelayedLoading(loading);

  if (showLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div
            className="w-16 h-16 rounded-full border-4"
            style={{ borderColor: 'var(--border-default)' }}
          />
          <div
            className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--primary-600)' }}
          />
        </div>
        <p className="mt-4 font-medium" style={{ color: 'var(--text-muted)' }}>
          {t('加载中...')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--error-dim)' }}
        >
          <AlertCircle size={32} style={{ color: 'var(--error)' }} />
        </div>
        <p className="font-medium mb-4" style={{ color: 'var(--error)' }}>
          {error}
        </p>
        <Button onClick={onRefresh} variant="outline">
          <RefreshIcon size={16} className="mr-2" />
          {t('重试')}
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    const isProjectsEmpty = isAtRoot && !isTrashView;

    if (renderEmptyView) {
      return <>{renderEmptyView}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center py-16">
        {isEmptyProject ? (
          <ProjectIcon
            size={80}
            className="mb-6 animate-float"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          />
        ) : (
          <EmptyFolderIcon
            size={80}
            className="mb-6 animate-float"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          />
        )}
        <h3
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {isTrashView
            ? t('回收站是空的')
            : isProjectsEmpty
              ? t('暂无项目')
              : isEmptyProject
                ? t('项目中暂无文件')
                : t('这个文件夹是空的')}
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {isTrashView
            ? isAtRoot
              ? t('已删除的文件和项目会出现在这里')
              : t('已删除的文件会出现在这里')
            : searchTerm
              ? t('没有找到匹配的内容')
              : isProjectsEmpty
                ? t('开始创建您的第一个项目')
                : isEmptyProject
                  ? t('开始上传文件到该项目')
                  : t('上传文件或创建文件夹来开始使用')}
        </p>
        {isProjectsEmpty &&
          canCreateProject &&
          !isTrashView &&
          projectFilter !== 'joined' && (
            <Button
              onClick={onCreateProject}
              variant="outline"
              size="sm"
              className="hover:shadow-md transition-all"
            >
              <FolderPlus size={14} className="mr-2" />
              {t('创建项目')}
            </Button>
          )}
      </div>
    );
  }

  return null;
};
