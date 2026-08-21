import React from 'react';
import { IconProps } from './types';

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
    <path
      d="M40 4V16H52"
      fill="#FECACA"
      stroke="#DC2626"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* PDF 标识 - 文档图标 */}
    <rect x="14" y="20" width="24" height="28" rx="2" fill="#DC2626" />
    <rect x="16" y="22" width="20" height="24" rx="1" fill="#FEE2E2" />
    {/* PDF 文字 */}
    <text
      x="26"
      y="34"
      fontSize="8"
      fill="#DC2626"
      textAnchor="middle"
      fontWeight="bold"
    >
      PDF
    </text>
    {/* 线条示意 */}
    <line
      x1="18"
      y1="40"
      x2="34"
      y2="40"
      stroke="#DC2626"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="18"
      y1="44"
      x2="30"
      y2="44"
      stroke="#DC2626"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// 图片文件图标
export const ImageIcon: React.FC<IconProps> = ({
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
    {/* 文件背景 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#DBEAFE"
      stroke="#2563EB"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path
      d="M40 4V16H52"
      fill="#93C5FD"
      stroke="#2563EB"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* 图片内容 */}
    <rect
      x="14"
      y="20"
      width="24"
      height="24"
      rx="2"
      fill="#2563EB"
      fillOpacity="0.2"
    />
    {/* 山峰和太阳 */}
    <path
      d="M14 44L22 32L28 40L34 28L44 44"
      stroke="#2563EB"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="32" cy="26" r="4" fill="#FCD34D" />
    {/* 相机图标 */}
    <circle
      cx="28"
      cy="48"
      r="4"
      stroke="#2563EB"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="28" cy="48" r="1.5" fill="#2563EB" />
    <path
      d="M26 48L24 50"
      stroke="#2563EB"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

// 通用文件图标
export const FileIcon: React.FC<IconProps> = ({
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
    {/* 文件背景 */}
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#F1F5F9"
      stroke="#64748B"
      strokeWidth="2"
    />
    {/* 文件折角 */}
    <path
      d="M40 4V16H52"
      fill="#E2E8F0"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* 文件内容线 */}
    <line
      x1="16"
      y1="26"
      x2="36"
      y2="26"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="16"
      y1="34"
      x2="40"
      y2="34"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="16"
      y1="42"
      x2="32"
      y2="42"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
