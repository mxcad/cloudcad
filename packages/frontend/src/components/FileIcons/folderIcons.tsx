import React from 'react';
import { t } from '@/languages';
import { IconProps } from './types';

// 文件夹图标 - 精致版本
export const FolderIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
}) => (
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
      <linearGradient
        id="folderGradient"
        x1="12"
        y1="20"
        x2="52"
        y2="52"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="white" stopOpacity="0.6" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

// 文件夹打开状态
export const FolderOpenIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
}) => (
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
    <rect
      x="14"
      y="32"
      width="36"
      height="4"
      rx="1"
      fill="#F59E0B"
      fillOpacity="0.3"
    />
    <rect
      x="14"
      y="40"
      width="28"
      height="4"
      rx="1"
      fill="#F59E0B"
      fillOpacity="0.3"
    />
    <rect
      x="14"
      y="48"
      width="32"
      height="4"
      rx="1"
      fill="#F59E0B"
      fillOpacity="0.3"
    />
  </svg>
);

// 项目图标 - 类似文件夹但有建筑感
export const ProjectIcon: React.FC<IconProps> = ({
  size = 24,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 项目图标 - 类似文件夹但有建筑感 */}
    {/* 建筑屋顶 */}
    <path
      d="M32 6L10 22V54C10 56.2091 11.7909 58 14 58H50C52.2091 58 54 56.2091 54 54V22L32 6Z"
      fill="#0891B2"
      stroke="#06B6D4"
      strokeWidth="2"
    />
    {/* 建筑正立面 */}
    <rect
      x="16"
      y="28"
      width="32"
      height="24"
      rx="1"
      fill="white"
      fillOpacity="0.9"
    />
    {/* 门 */}
    <rect x="26" y="38" width="12" height="14" rx="1" fill="#06B6D4" />
    {/* 窗户 */}
    <rect x="20" y="32" width="8" height="6" rx="1" fill="#0891B2" />
    <rect x="36" y="32" width="8" height="6" rx="1" fill="#0891B2" />
    {/* 项目标签 */}
    <text
      x="32"
      y="18"
      fontSize="10"
      fill="white"
      textAnchor="middle"
      fontWeight="bold"
    >
      PROJ
    </text>
  </svg>
);

// 空文件夹状态图标
export const EmptyFolderIcon: React.FC<IconProps> = ({
  size = 64,
  className = '',
}) => (
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
    <text x="32" y="56" fontSize="8" fill="#F59E0B" textAnchor="middle">
      {t('空')}
    </text>
  </svg>
);
