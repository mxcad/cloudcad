import React from 'react';
import { IconProps } from './types';

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
    <path
      d="M40 4V16H52"
      fill="#60A5FA"
      stroke="#3B82F6"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* CAD 图案 - 建筑平面图风格 */}
    <rect
      x="16"
      y="20"
      width="32"
      height="28"
      rx="2"
      fill="none"
      stroke="white"
      strokeWidth="2"
    />
    <path
      d="M16 32H48"
      stroke="white"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    />
    <path
      d="M32 20V48"
      stroke="white"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    />
    {/* 门符号 */}
    <path
      d="M44 32L48 28"
      stroke="#60A5FA"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M44 32L48 36"
      stroke="#60A5FA"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* 标注线 */}
    <path
      d="M14 18L10 18"
      stroke="#60A5FA"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M50 18L54 18"
      stroke="#60A5FA"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M32 18V16M32 48V50"
      stroke="#60A5FA"
      strokeWidth="2"
      strokeLinecap="round"
    />

    {/* DWG 标签 */}
    <rect x="16" y="49" width="20" height="7" rx="1" fill="#3B82F6" />
    <text
      x="26"
      y="54.5"
      fontSize="7"
      fill="white"
      textAnchor="middle"
      fontWeight="bold"
    >
      DWG
    </text>
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
    <path
      d="M40 4V16H52"
      fill="#34D399"
      stroke="#10B981"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* DXF 图案 - 数据流和几何图形 */}
    {/* 箭头数据流 */}
    <path d="M14 24H50" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M46 20L50 24L46 28"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 几何元素 */}
    <circle
      cx="20"
      cy="38"
      r="8"
      stroke="#34D399"
      strokeWidth="2"
      fill="none"
    />
    <rect
      x="34"
      y="34"
      width="12"
      height="12"
      transform="rotate(45 40 40)"
      stroke="#34D399"
      strokeWidth="2"
      fill="none"
    />
    {/* 坐标点 */}
    <circle cx="32" cy="44" r="2" fill="#34D399" />

    {/* DXF 标签 */}
    <rect x="16" y="49" width="20" height="7" rx="1" fill="#10B981" />
    <text
      x="26"
      y="54.5"
      fontSize="7"
      fill="white"
      textAnchor="middle"
      fontWeight="bold"
    >
      DXF
    </text>
  </svg>
);
