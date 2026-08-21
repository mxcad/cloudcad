import React, { useState, memo, useMemo } from 'react';
import { getFileIconComponent } from '../FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import {
  getCadThumbnailUrl,
  getThumbnailUrl,
  CAD_EXTENSIONS,
} from '../../utils/fileUtils';

interface ThumbnailProps {
  node: FileSystemNode;
  size: number;
  galleryMode?: boolean;
  /** 外部指定的缩略图 URL（如公共资源库的公开缩略图接口），优先于内部推导 */
  thumbnailUrl?: string;
}

export const Thumbnail: React.FC<ThumbnailProps> = memo(
  ({ node, size, thumbnailUrl }) => {
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
        CAD_EXTENSIONS.includes(node.extension?.toLowerCase() || ''),
      [node.isFolder, node.extension]
    );

    const shouldShowImage = !imageLoadError && (isImage || isCad);
    const thumbnailSrc = useMemo(
      () =>
        thumbnailUrl ||
        (isImage ? getThumbnailUrl(node) : getCadThumbnailUrl(node)),
      [thumbnailUrl, isImage, node]
    );

    if (!shouldShowImage) {
      return (
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg"
          style={{ width: size, height: size }}
        >
          {getFileIconComponent(node, size)}
        </div>
      );
    }

    return (
      <div
        className="relative overflow-hidden rounded-lg"
        style={{ width: size, height: size }}
      >
        <img
          src={thumbnailSrc}
          alt={node.name}
          draggable={false}
          className="object-contain"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            imageRendering: '-webkit-optimize-contrast',
          }}
          onError={() => setImageLoadError(true)}
        />
      </div>
    );
  }
);
