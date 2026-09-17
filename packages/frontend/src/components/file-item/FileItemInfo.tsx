import React, { memo, useMemo } from 'react';
import { FolderOpen, Users, XCircle } from 'lucide-react';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../../utils/fileUtils';
import {
  FileNameText,
  DescriptionText,
  TruncateText,
} from '../ui/TruncateText';
import { t } from '@/languages';

interface FileItemInfoProps {
  node: FileSystemNode;
  isGrid?: boolean;
  galleryMode?: boolean;
  fontSize?: number | string;
  /** 搜索结果/回收站路径徽章（替换次级信息） */
  searchPathBadge?: React.ReactNode;
}

export const FileItemInfo: React.FC<FileItemInfoProps> = memo(
  ({
    node,
    isGrid = false,
    galleryMode = false,
    fontSize,
    searchPathBadge,
  }) => {
    const isRoot = node.isRoot;

    // 图库模式：文件名去后缀（文件夹保留原名）
    const displayName = useMemo(() => {
      if (!galleryMode || node.isFolder) return node.name;
      const lastDot = node.name.lastIndexOf('.');
      if (lastDot > 0) return node.name.slice(0, lastDot);
      return node.name;
    }, [galleryMode, node.name, node.isFolder]);

    // 图库模式：统一 12px 字号
    const resolvedFontSize = fontSize || '12px';

    const descriptionText = useMemo(() => {
      if (isRoot) {
        return node.description || t('暂无描述');
      }
      if (node.isFolder) {
        return t(
          `${node.childrenCountTrash ?? node._count?.children ?? 0} 个项目`
        );
      }
      if (galleryMode) {
        return formatDate(node.updatedAt);
      }
      return formatFileSize(node.size);
    }, [
      isRoot,
      node.description,
      node.isFolder,
      node._count?.children,
      node.childrenCountTrash,
      node.size,
      node.updatedAt,
      galleryMode,
    ]);

    // 永久失败徽标（#477）：fileStatus=FAILED 的文件节点显示红色× + 「转换失败」标签
    const failedBadge = useMemo(() => {
      if (node.isFolder || node.fileStatus !== 'FAILED') return null;
      return (
        <span
          className="inline-flex items-center gap-0.5 text-xs font-medium"
          style={{ color: 'var(--danger)' }}
          title={t('该文件转换失败，请检查文件内容')}
        >
          <XCircle size={13} aria-hidden />
          {t('转换失败')}
        </span>
      );
    }, [node.isFolder, node.fileStatus]);

    // 项目根节点元数据行（网格视图）：文件数 · 成员数，与描述分离避免挤占
    const metaStats = useMemo(() => {
      if (!isRoot) return null;
      const hasCount =
        node.childrenCount !== undefined || node.memberCount !== undefined;
      if (!hasCount) return null;
      return (
        <div
          className="flex items-center justify-center gap-2 mt-1 text-xs leading-none"
          style={{ color: 'var(--text-muted)' }}
        >
          {node.childrenCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <FolderOpen size={12} aria-hidden />
              {t('{count} 个文件', { count: String(node.childrenCount) })}
            </span>
          )}
          {node.memberCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden />
              {t('{count} 个成员', { count: String(node.memberCount) })}
            </span>
          )}
        </div>
      );
    }, [isRoot, node.childrenCount, node.memberCount]);

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
              <TruncateText
                mode="end"
                showTooltip={true}
                style={{
                  minWidth: 0,
                  width: '100%',
                  display: 'block',
                  fontSize: resolvedFontSize,
                  textAlign: 'center' as const,
                }}
              >
                {displayName}
              </TruncateText>
            ) : (
              <FileNameText
                showTooltip={true}
                style={{
                  minWidth: 0,
                  width: '100%',
                  fontSize: resolvedFontSize,
                  justifyContent: 'center' as const,
                }}
              >
                {displayName}
              </FileNameText>
            )}
          </h3>
          {failedBadge ? (
            <div className="mt-0.5 w-full flex justify-center">{failedBadge}</div>
          ) : null}
          {searchPathBadge ? (
            <div className="mt-1 w-full flex justify-center">
              {searchPathBadge}
            </div>
          ) : !galleryMode ? (
            isRoot ? (
              <>
                <p
                  className="text-xs text-slate-500 text-center mt-1 overflow-hidden w-full leading-snug"
                  style={{ minWidth: 0 }}
                >
                  <DescriptionText showTooltip={true} maxLines={2}>
                    {descriptionText}
                  </DescriptionText>
                </p>
                {metaStats}
              </>
            ) : (
              <p
                className="text-xs text-slate-500 text-center mt-1 overflow-hidden w-full"
                style={{ minWidth: 0 }}
              >
                <DescriptionText showTooltip={true}>
                  {descriptionText}
                </DescriptionText>
              </p>
            )
          ) : null}
        </>
      );
    }

    return (
      <div className="flex-1 min-w-0">
        <h3
          className="font-medium overflow-hidden w-full"
          style={{
            minWidth: 0,
            fontSize: resolvedFontSize,
            color: 'var(--text-primary)',
          }}
        >
          {galleryMode ? (
            <TruncateText
              mode="end"
              showTooltip={true}
              style={{ display: 'block', fontSize: resolvedFontSize }}
            >
              {displayName}
            </TruncateText>
          ) : (
            <FileNameText
              showTooltip={true}
              style={{ fontSize: resolvedFontSize }}
            >
              {displayName}
            </FileNameText>
          )}
        </h3>
        {failedBadge ? <div className="mt-0.5">{failedBadge}</div> : null}
        {searchPathBadge ? (
          <div className="flex items-center gap-1 mt-0.5">
            {searchPathBadge}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {node.isRoot && !galleryMode ? (
              <p
                className="text-xs overflow-hidden w-full"
                style={{ color: 'var(--text-muted)' }}
              >
                <DescriptionText
                  showTooltip={true}
                  style={{ display: 'block' }}
                >
                  {descriptionText}
                </DescriptionText>
              </p>
            ) : !galleryMode ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatDate(node.updatedAt)}
                {!node.isFolder && ` • ${formatFileSize(node.size)}`}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  }
);
