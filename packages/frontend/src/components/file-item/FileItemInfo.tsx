import React, { memo, useMemo } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../../utils/fileUtils';
import { FileNameText, DescriptionText, TruncateText } from '../ui/TruncateText';

interface FileItemInfoProps {
  node: FileSystemNode;
  isGrid?: boolean;
  galleryMode?: boolean;
  fontSize?: number | string;
  /** 搜索结果/回收站路径徽章（替换次级信息） */
  searchPathBadge?: React.ReactNode;
}

export const FileItemInfo: React.FC<FileItemInfoProps> = memo(
  ({ node, isGrid = false, galleryMode = false, fontSize, searchPathBadge }) => {
    const isRoot = node.isRoot;

    // 图库模式：文件名去后缀（文件夹保留原名）
    const displayName = useMemo(
      () => {
        if (!galleryMode || node.isFolder) return node.name;
        const lastDot = node.name.lastIndexOf('.');
        if (lastDot > 0) return node.name.slice(0, lastDot);
        return node.name;
      },
      [galleryMode, node.name, node.isFolder]
    );

    // 图库模式：统一 12px 字号
    const resolvedFontSize = fontSize || '12px'
    
    const descriptionText = useMemo(
      () => {
        if (isRoot) {
          const parts: string[] = [];
          if (node.description) parts.push(node.description);
          if (node.childrenCount !== undefined) parts.push(`${node.childrenCount} 个文件`);
          if (node.memberCount !== undefined) parts.push(`${node.memberCount} 个成员`);
          return parts.join(' · ') || '暂无描述';
        }
        if (node.isFolder) {
          return `${node.childrenCountTrash ?? node._count?.children ?? 0} 个项目`;
        }
        if (galleryMode) {
          return formatDate(node.updatedAt);
        }
        return formatFileSize(node.size);
      },
      [
        isRoot,
        node.description,
        node.isFolder,
        node._count?.children,
        node.childrenCountTrash,
        node.size,
        node.updatedAt,
        galleryMode,
      ]
    );

    if (isGrid) {
      return (
        <>
          <h3
            className="font-medium overflow-hidden w-full"
            style={{
              minWidth: 0,
              fontSize: resolvedFontSize,
              color: 'var(--text-primary)',
            }}
          >
            {galleryMode ? (
              <TruncateText mode="end" showTooltip={true} style={{ minWidth: 0, width: '100%', display: 'block', fontSize: resolvedFontSize, textAlign: 'center' as const }}>
                {displayName}
              </TruncateText>
            ) : (
              <FileNameText showTooltip={true} style={{ minWidth: 0, width: '100%', fontSize: resolvedFontSize, justifyContent: 'center' as const }}>
                {displayName}
              </FileNameText>
            )}
          </h3>
          {searchPathBadge ? (
            <div className="mt-1 w-full flex justify-center">
              {searchPathBadge}
            </div>
          ) : !galleryMode ? (
            <p className="text-xs text-slate-500 text-center mt-1 overflow-hidden w-full" style={{ minWidth: 0 }}>
              <DescriptionText showTooltip={true}>{descriptionText}</DescriptionText>
            </p>
          ) : null}
        </>
      );
    }

    return (
      <div className="flex-1 min-w-0">
        <h3
          className="font-medium overflow-hidden w-full"
          style={{ minWidth: 0, fontSize: resolvedFontSize, color: 'var(--text-primary)' }}
        >
          {galleryMode ? (
            <TruncateText mode="end" showTooltip={true} style={{ display: 'block', fontSize: resolvedFontSize }}>
              {displayName}
            </TruncateText>
          ) : (
            <FileNameText showTooltip={true} style={{ fontSize: resolvedFontSize }}>
              {displayName}
            </FileNameText>
          )}
        </h3>
        {searchPathBadge ? (
          <div className="flex items-center gap-1 mt-0.5">
            {searchPathBadge}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatDate(node.updatedAt)}
              {!node.isFolder && !galleryMode && ` • ${formatFileSize(node.size)}`}
            </p>
          </div>
        )}
      </div>
    );
  }
);
