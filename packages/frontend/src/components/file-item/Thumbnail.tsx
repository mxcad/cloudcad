import React, { useState, memo, useMemo } from 'react';
import { getFileIconComponent } from '../FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { Eye } from 'lucide-react';
import {
  getCadThumbnailUrl,
  getThumbnailUrl,
  getOriginalFileUrl,
} from '../../utils/fileUtils';

interface ThumbnailProps {
  node: FileSystemNode;
  size: number;
  onPreview?: (src: string) => void;
  galleryMode?: boolean;
}

export const Thumbnail: React.FC<ThumbnailProps> = memo(
  ({ node, size, onPreview, galleryMode }) => {
    const [imageLoadError, setImageLoadError] = useState(false);

    const isImage = useMemo(
      () =>
        !node.isFolder &&
        ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(
          node.extension?.toLowerCase() || ''
        ),
      [node.isFolder, node.extension]
    );

    const isCad = useMemo(
      () =>
        !node.isFolder &&
        ['.dwg', '.dxf', '.mxweb', '.mxwbe'].includes(node.extension?.toLowerCase() || ''),
      [node.isFolder, node.extension]
    );

    const shouldShowImage = !imageLoadError && (isImage || isCad);
    const thumbnailSrc = useMemo(
      () => (isImage ? getThumbnailUrl(node) : getCadThumbnailUrl(node)),
      [isImage, node]
    );
    const previewSrc = useMemo(
      () => (isImage ? getOriginalFileUrl(node) : thumbnailSrc),
      [isImage, node, thumbnailSrc]
    );

    // 如果不应该显示图片，返回图标组件（居中显示）
    if (!shouldShowImage) {
      return (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {getFileIconComponent(node, size)}
        </div>
      );
    }

    return (
      <div 
        className="relative group flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img
          src={thumbnailSrc}
          alt={node.name}
          className={`w-full h-full transition-all duration-200 rounded-lg ${
            galleryMode ? 'object-cover bg-black' : 'object-contain bg-slate-50'
          }`}
          style={{
            width: size,
            height: size
          }}
          onError={() => setImageLoadError(true)}
          onClick={(e) => {
            // 图库模式下不打开图片预览，让点击事件冒泡到父组件处理（打开CAD编辑器）
            if (!galleryMode && onPreview) {
              e.stopPropagation();
              onPreview(previewSrc);
            }
          }}
        />
        {!galleryMode && onPreview && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview(previewSrc);
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all duration-200 opacity-0 group-hover:opacity-100"
            title="查看原图"
          >
            <div className="p-2 bg-white/90 rounded-full shadow-lg">
              <Eye size={Math.max(16, size / 4)} className="text-slate-700" />
            </div>
          </button>
        )}
      </div>
    );
  }
);
