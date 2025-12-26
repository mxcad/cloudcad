import React from 'react';
import { FileSystemNode } from '../types/filesystem';

// ============ 基础 SVG 图标组件 ============

interface IconProps {
  size?: number;
  className?: string;
}

// 文件夹图标 - 精致版本
export const FolderIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件夹背部 */}
    <path
      d="M4 16C4 12.6863 6.68629 10 10 10H26L30 14H54C57.3137 14 60 16.6863 60 20V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V16Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 文件夹前盖 */}
    <path
      d="M4 22C4 18.6863 6.68629 16 10 16H26L30 20H54C57.3137 20 60 22.6863 60 26V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V22Z"
      fill="#FEF3C7"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 文件夹标签 */}
    <path
      d="M4 16V20C4 20.5523 4.44772 21 5 21H25L30 16H5C4.44772 16 4 16.4477 4 16Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 高光效果 */}
    <path
      d="M12 20V50C12 51.1046 12.8954 52 14 52H50C51.1046 52 52 51.1046 52 50V22C52 20.8954 51.1046 20 50 20H14C12.8954 20 12 20.8954 12 22V20Z"
      fill="url(#folderGradient)"
      fillOpacity="0.5"
    />
    <defs>
      <linearGradient id="folderGradient" x1="12" y1="20" x2="52" y2="52" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" stopOpacity="0.6" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

// 文件夹打开状态
export const FolderOpenIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 打开的文件夹 */}
    <path
      d="M4 24C4 20.6863 6.68629 18 10 18H26L30 22H54C57.3137 22 60 24.6863 60 28V50C60 53.3137 57.3137 56 54 56H10C6.68629 56 4 53.3137 4 50V24Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 文件夹前盖（打开状态） */}
    <path
      d="M4 28C4 24.6863 6.68629 22 10 22H26L30 26H54C57.3137 26 60 28.6863 60 32V50C60 53.3137 57.3137 56 54 56H10C6.68629 56 4 53.3137 4 50V28Z"
      fill="#FEF3C7"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 内部文件示意 */}
    <rect x="14" y="32" width="36" height="4" rx="1" fill="#F59E0B" fillOpacity="0.3" />
    <rect x="14" y="40" width="28" height="4" rx="1" fill="#F59E0B" fillOpacity="0.3" />
    <rect x="14" y="48" width="32" height="4" rx="1" fill="#F59E0B" fillOpacity="0.3" />
  </svg>
);

// DWG 文件图标 - 专业CAD图纸
export const DwgIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件背景 - 工程蓝 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#1E40AF"
      stroke="#3B82F6"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path d="M40 4V16H52" fill="#60A5FA" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round"/>
    
    {/* CAD 图案 - 建筑平面图风格 */}
    <rect x="16" y="20" width="32" height="28" rx="2" fill="none" stroke="white" strokeWidth="2"/>
    <path d="M16 32H48" stroke="white" strokeWidth="1.5" strokeDasharray="4 2"/>
    <path d="M32 20V48" stroke="white" strokeWidth="1.5" strokeDasharray="4 2"/>
    {/* 门符号 */}
    <path d="M44 32L48 28" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    <path d="M44 32L48 36" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    {/* 标注线 */}
    <path d="M14 18L10 18" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    <path d="M50 18L54 18" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    <path d="M32 18V16M32 48V50" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    
    {/* DWG 标签 */}
    <rect x="16" y="49" width="20" height="7" rx="1" fill="#3B82F6"/>
    <text x="26" y="54.5" fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">DWG</text>
  </svg>
);

// DXF 文件图标 - CAD数据交换格式
export const DxfIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件背景 - 工程绿 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#047857"
      stroke="#10B981"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path d="M40 4V16H52" fill="#34D399" stroke="#10B981" strokeWidth="2" strokeLinejoin="round"/>
    
    {/* DXF 图案 - 数据流和几何图形 */}
    {/* 箭头数据流 */}
    <path d="M14 24H50" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M46 20L50 24L46 28" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* 几何元素 */}
    <circle cx="20" cy="38" r="8" stroke="#34D399" strokeWidth="2" fill="none"/>
    <rect x="34" y="34" width="12" height="12" transform="rotate(45 40 40)" stroke="#34D399" strokeWidth="2" fill="none"/>
    {/* 坐标点 */}
    <circle cx="32" cy="44" r="2" fill="#34D399"/>
    
    {/* DXF 标签 */}
    <rect x="16" y="49" width="20" height="7" rx="1" fill="#10B981"/>
    <text x="26" y="54.5" fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">DXF</text>
  </svg>
);

// PDF 文件图标
export const PdfIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件背景 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#FEE2E2"
      stroke="#DC2626"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path d="M40 4V16H52" fill="#FECACA" stroke="#DC2626" strokeWidth="2" strokeLinejoin="round"/>
    {/* PDF 标识 - 文档图标 */}
    <rect x="14" y="20" width="24" height="28" rx="2" fill="#DC2626" />
    <rect x="16" y="22" width="20" height="24" rx="1" fill="#FEE2E2" />
    {/* PDF 文字 */}
    <text x="26" y="34" fontSize="8" fill="#DC2626" textAnchor="middle" fontWeight="bold">PDF</text>
    {/* 线条示意 */}
    <line x1="18" y1="40" x2="34" y2="40" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/>
    <line x1="18" y1="44" x2="30" y2="44" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// 图片文件图标
export const ImageIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件背景 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#DBEAFE"
      stroke="#2563EB"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path d="M40 4V16H52" fill="#93C5FD" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round"/>
    {/* 图片内容 */}
    <rect x="14" y="20" width="24" height="24" rx="2" fill="#2563EB" fillOpacity="0.2" />
    {/* 山峰和太阳 */}
    <path d="M14 44L22 32L28 40L34 28L44 44" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="32" cy="26" r="4" fill="#FCD34D" />
    {/* 相机图标 */}
    <circle cx="28" cy="48" r="4" stroke="#2563EB" strokeWidth="1.5" fill="none"/>
    <circle cx="28" cy="48" r="1.5" fill="#2563EB" />
    <path d="M26 48L24 50" stroke="#2563EB" strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

// 通用文件图标
export const FileIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 文件背景 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#F1F5F9"
      stroke="#64748B"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path d="M40 4V16H52" fill="#E2E8F0" stroke="#64748B" strokeWidth="2" strokeLinejoin="round"/>
    {/* 文件内容线 */}
    <line x1="16" y1="26" x2="36" y2="26" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
    <line x1="16" y1="34" x2="40" y2="34" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
    <line x1="16" y1="42" x2="32" y2="42" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ============ 获取文件图标组件 ============

export const getFileIconComponent = (
  node: FileSystemNode,
  size: number = 48
): React.ReactNode => {
  if (node.isFolder) {
    return <FolderIcon size={size} className="flex-shrink-0" />;
  }

  const extension = node.extension?.toLowerCase() || '';

  switch (extension) {
    case '.dwg':
      return <DwgIcon size={size} className="flex-shrink-0" />;
    case '.dxf':
      return <DxfIcon size={size} className="flex-shrink-0" />;
    case '.pdf':
      return <PdfIcon size={size} className="flex-shrink-0" />;
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
      return <ImageIcon size={size} className="flex-shrink-0" />;
    default:
      return <FileIcon size={size} className="flex-shrink-0" />;
  }
};

// ============ 状态图标 ============

export const LoadingIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`animate-spin ${className}`}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray="31.4 31.4"
    />
  </svg>
);

export const EmptyFolderIcon: React.FC<IconProps> = ({ size = 64, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 大文件夹 */}
    <path
      d="M4 20C4 16.6863 6.68629 14 10 14H26L30 18H54C57.3137 18 60 20.6863 60 24V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V20Z"
      fill="#FEF3C7"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    <path
      d="M4 26C4 22.6863 6.68629 20 10 20H26L30 24H54C57.3137 24 60 26.6863 60 30V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V26Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* 云朵 */}
    <circle cx="32" cy="40" r="8" fill="white" fillOpacity="0.6" />
    <circle cx="24" cy="42" r="6" fill="white" fillOpacity="0.6" />
    <circle cx="40" cy="42" r="6" fill="white" fillOpacity="0.6" />
    {/* 文字 */}
    <text x="32" y="56" fontSize="8" fill="#F59E0B" textAnchor="middle">空</text>
  </svg>
);

// ============ 面包屑图标 ============

export const HomeIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M9 22V12H15V22"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M9 18L15 12L9 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ============ 操作图标 ============

export const UploadIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 8L12 3L7 8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 3V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 10L12 15L17 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 15V3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AddFolderIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M4 5C4 4.44772 4.44772 4 5 4H9L11 6H19C19.5523 6 20 6.44772 20 7V19C20 19.5523 19.5523 20 19 20H5C4.44772 20 4 19.5523 4 19V5Z"
      fill="currentColor"
      fillOpacity="0.2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M10 12V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 14H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const DeleteIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 6H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M10 9V17M14 9V17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M17 3C17.2623 2.73765 17.5744 2.52901 17.9176 2.38687C18.2607 2.24473 18.6266 2.17212 19 2.17212C19.3734 2.17212 19.7393 2.24473 20.0824 2.38687C20.4256 2.52901 20.7377 2.73765 21 3C21.2623 3.26265 21.471 3.57477 21.6131 3.91789C21.7553 4.26101 21.8279 4.62689 21.8279 5C21.8279 5.37311 21.7553 5.73899 21.6131 6.08211C21.471 6.42523 21.2623 6.73735 21 7L8 20L3 21L4 16L17 3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle
      cx="11"
      cy="11"
      r="8"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M21 21L16.65 16.65"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M21 3V7H17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 21V17H7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GridIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

export const ListIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M8 6H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 12H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 18H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
  </svg>
);

export const BackIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M19 12H5M5 12L12 19M5 12L12 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M20 6L9 17L4 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MoreIcon: React.FC<IconProps> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="12" cy="12" r="1" fill="currentColor"/>
    <circle cx="12" cy="5" r="1" fill="currentColor"/>
    <circle cx="12" cy="19" r="1" fill="currentColor"/>
  </svg>
);
