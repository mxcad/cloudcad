///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { FolderPlus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyFolderIcon, RefreshIcon } from '@/components/FileIcons';

interface FileSystemStatesProps {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  isAtRoot: boolean;
  isTrashView: boolean;
  isProjectTrashView: boolean;
  searchTerm: string;
  canCreateProject: boolean;
  onRefresh: () => void;
  onCreateProject: () => void;
}

export const FileSystemStates: React.FC<FileSystemStatesProps> = ({
  loading,
  error,
  isEmpty,
  isAtRoot,
  isTrashView,
  isProjectTrashView,
  searchTerm,
  canCreateProject,
  onRefresh,
  onCreateProject,
}) => {
  if (loading) {
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
        <p
          className="mt-4 font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          加载中...
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
          重试
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    const isProjectsEmpty = isAtRoot && !isTrashView && !isProjectTrashView;

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <EmptyFolderIcon
          size={80}
          className="mb-6 animate-float"
          style={{ color: 'var(--text-muted)', opacity: 0.5 }}
        />
        <h3
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {isProjectTrashView
            ? '回收站是空的'
            : isTrashView
              ? '回收站是空的'
              : isProjectsEmpty
                ? '暂无项目'
                : '这个文件夹是空的'}
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {isProjectTrashView
            ? '删除的项目会出现在这里'
            : isTrashView
              ? '删除的文件和文件夹会出现在这里'
              : searchTerm
                ? '没有找到匹配的内容'
                : isProjectsEmpty
                  ? '开始创建您的第一个项目'
                  : '上传文件或创建文件夹来开始使用'}
        </p>
        {isProjectsEmpty &&
          canCreateProject &&
          !isProjectTrashView &&
          !isTrashView && (
            <Button
              onClick={onCreateProject}
              variant="outline"
              size="sm"
              className="hover:shadow-md transition-all"
            >
              <FolderPlus size={14} className="mr-2" />
              创建项目
            </Button>
          )}
      </div>
    );
  }

  return null;
};
