import React, { memo, useMemo } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../../utils/fileUtils';
import { FileNameText, DescriptionText, TruncateText } from '../ui/TruncateText';

interface FileItemInfoProps {
  node: FileSystemNode;
  isGrid?: boolean;
  galleryMode?: boolean;
  fontSize?: number | string;
}

export const FileItemInfo: React.FC<FileItemInfoProps> = memo(
  ({ node, isGrid = false, galleryMode = false, fontSize }) => {
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
    const resolvedFontSize = fontSize || (galleryMode ? '12px' : undefined);

    const descriptionText = useMemo(
      () => {
        if (isRoot) {
          return node.description || '暂无描述';
        }
        if (node.isFolder) {
          return `${node._count?.children || 0} 个项目`;
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
              display: 'flex',
              justifyContent: 'center',
              fontSize: resolvedFontSize,
              color: 'var(--text-primary)',
            }}
          >
            {galleryMode ? (
              <TruncateText mode="end" showTooltip={true} style={{ minWidth: 0, width: '100%', display: 'block', fontSize: resolvedFontSize }}>
                {displayName}
              </TruncateText>
            ) : (
              <FileNameText showTooltip={true} style={{ minWidth: 0, width: '100%', fontSize: resolvedFontSize }}>
                {displayName}
              </FileNameText>
            )}
          </h3>
          {!galleryMode && (
            <p className="text-xs text-slate-500 text-center mt-1 overflow-hidden w-full" style={{ minWidth: 0 }}>
              <DescriptionText showTooltip={true}>{descriptionText}</DescriptionText>
            </p>
          )}
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
        <div className="flex items-center gap-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatDate(node.updatedAt)}
            {!node.isFolder && !galleryMode && ` • ${formatFileSize(node.size)}`}
          </p>
        </div>
      </div>
    );
  }
);
