///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { FolderOpen } from 'lucide-react';
import type { FileSystemNode } from '@/types/filesystem';
import { FileItem } from '@/components/FileItem';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import type { ProjectFilterType } from '@/services/projectApi';
import styles from '@/components/sidebar/sidebar.module.css';

interface ProjectListViewProps {
  projects: FileSystemNode[];
  searchQuery: string;
  projectFilter: ProjectFilterType;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  nodePermissions: Map<string, {
    canEdit: boolean;
    canDelete: boolean;
    canManageMembers: boolean;
    canManageRoles: boolean;
  }>;
  onEnterProject: (project: FileSystemNode) => void;
  onEditProject: (project: FileSystemNode) => void;
  onShowMembers: (project: FileSystemNode) => void;
  onShowRoles: (project: FileSystemNode) => void;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({
  projects,
  searchQuery,
  projectFilter,
  onProjectFilterChange,
  nodePermissions,
  onEnterProject,
  onEditProject,
  onShowMembers,
  onShowRoles,
}) => {
  const filteredProjects = searchQuery
    ? projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : projects;

  return (
    <div className={styles.projectDrawingsPanel}>
      {/* 项目列表标题 */}
      <div className={styles.sectionTitle}>
        <FolderOpen size={16} />
        <span>我的项目 ({projects.length})</span>
      </div>

      {/* 项目过滤 Tab */}
      <div className={styles.projectFilterTabs}>
        {[
          { key: 'all', label: '全部' },
          { key: 'owned', label: '我创建的' },
          { key: 'joined', label: '我加入的' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`${styles.projectFilterTab} ${projectFilter === tab.key ? styles.active : ''}`}
            onClick={() => onProjectFilterChange(tab.key as ProjectFilterType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 项目列表 */}
      <div className={styles.drawingList}>
        {filteredProjects.length === 0 ? (
          <div className={styles.emptyState}>
            <FolderOpen size={48} className={styles.emptyIcon} />
            <div className={styles.emptyText}>暂无项目，请先创建项目</div>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const projectPerms = nodePermissions.get(project.id);
            return (
              <FileItem
                key={`project-space-${project.id}`}
                node={project}
                isSelected={false}
                viewMode="list"
                isMultiSelectMode={false}
                isTrash={false}
                {...getFileItemPermissionProps(project, {
                  projectPermissions: {},
                  nodePermissions: projectPerms,
                  disableUpload: true,
                })}
                onSelect={() => {}}
                onEnter={onEnterProject}
                onDownload={() => {}}
                onDelete={() => {}}
                onRename={() => {}}
                onEdit={projectPerms?.canEdit ? () => onEditProject(project) : undefined}
                onShowMembers={
                  projectPerms?.canManageMembers
                    ? () => onShowMembers(project)
                    : undefined
                }
                onShowRoles={
                  projectPerms?.canManageRoles
                    ? () => onShowRoles(project)
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
};
