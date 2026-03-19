///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 项目图纸面板组件
 *
 * 显示当前项目的图纸文件列表，支持搜索和筛选。
 * 用于侧边栏的项目图纸 Tab 内容。
 */

import React, { useState, useMemo } from 'react';
import { Search, FileImage } from 'lucide-react';
import { useFileSystem } from '../hooks/file-system/useFileSystem';
import { FileSystemNode } from '../types/filesystem';
import { DrawingOpenMode } from '../types/sidebar';
import styles from './sidebar/sidebar.module.css';

interface ProjectDrawingsPanelProps {
  /** 项目 ID */
  projectId: string;
  /** 图纸打开方式 */
  openMode: DrawingOpenMode;
  /** 打开图纸回调 */
  onDrawingOpen: (node: FileSystemNode, openMode: DrawingOpenMode) => void;
  /** 图纸修改状态检查回调 */
  onDrawingModified: () => boolean;
}

/** 图纸文件扩展名 */
const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

/** 检查是否为图纸文件 */
function isDrawingFile(name: string): boolean {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = name.toLowerCase().slice(lastDot);
  return DRAWING_EXTENSIONS.includes(ext);
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化日期 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  openMode,
  onDrawingOpen,
  onDrawingModified,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // 使用 useFileSystem hook 获取文件节点
  const { nodes, loading } = useFileSystem({
    mode: 'project',
    projectId,
  });

  // 过滤图纸文件
  const drawingNodes = useMemo(() => {
    const drawings = nodes.filter(
      (node) => node.type === 'file' && isDrawingFile(node.name)
    );

    if (!searchQuery) return drawings;

    return drawings.filter((node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [nodes, searchQuery]);

  const handleDrawingClick = (node: FileSystemNode) => {
    // 检查当前图纸是否已修改
    const isModified = onDrawingModified();
    if (isModified) {
      // 如果有修改，使用 confirm 模式
      onDrawingOpen(node, 'confirm');
    } else {
      // 否则使用配置的打开方式
      onDrawingOpen(node, openMode);
    }
  };

  if (loading) {
    return (
      <div className={styles.projectDrawingsPanel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyText}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.projectDrawingsPanel}>
      {/* 搜索框 */}
      <div className={styles.searchBox}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="搜索图纸..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* 图纸列表 */}
      <div className={styles.drawingList}>
        {drawingNodes.length === 0 ? (
          <div className={styles.emptyState}>
            <FileImage size={48} className={styles.emptyIcon} />
            <div className={styles.emptyText}>
              {searchQuery ? '未找到匹配的图纸' : '当前项目暂无图纸文件'}
            </div>
          </div>
        ) : (
          drawingNodes.map((node) => (
            <div
              key={node.id}
              className={styles.drawingItem}
              onClick={() => handleDrawingClick(node)}
            >
              <div className={styles.drawingThumbnail}>
                <FileImage size={24} color="#9ca3af" />
              </div>
              <div className={styles.drawingInfo}>
                <div className={styles.drawingName}>{node.name}</div>
                <div className={styles.drawingMeta}>
                  {node.updatedAt && formatDate(node.updatedAt)}
                  {node.size !== undefined && ` · ${formatFileSize(node.size)}`}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
