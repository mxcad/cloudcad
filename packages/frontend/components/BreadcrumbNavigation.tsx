import React, { useRef } from 'react';
import { ChevronRightIcon, FolderIcon } from './FileIcons';
import { BreadcrumbItem } from '../types/filesystem';
import { TruncateText } from './ui/TruncateText';

interface BreadcrumbNavigationProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (crumb: BreadcrumbItem, element: HTMLButtonElement) => void;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  breadcrumbs,
  onNavigate,
}) => {
  // 存储所有面包屑项的引用
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 如果没有面包屑，不渲染
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-0.5 text-xs sm:text-sm whitespace-nowrap">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={crumb.id}>
            {/* 分隔符 - 除了第一项 */}
            {index > 0 && (
              <ChevronRightIcon
                size={12}
                sm:size={14}
                className="text-slate-400 flex-shrink-0"
              />
            )}

            {/* 面包屑项 */}
            <button
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={(e) => {
                if (!isLast) {
                  onNavigate(crumb, e.currentTarget);
                }
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all duration-200
                ${
                  isLast
                    ? 'text-slate-900 font-medium cursor-default'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                }
              `}
              disabled={isLast}
              title={crumb.name}
            >
              {/* 图标 */}
              {crumb.isRoot ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="flex-shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4"
                >
                  <path
                    d="M32 6L10 22V54C10 56.2091 11.7909 58 14 58H50C52.2091 58 54 56.2091 54 54V22L32 6Z"
                    fill="#0891D1"
                    stroke="#06B6D4"
                    strokeWidth="2"
                  />
                  <rect
                    x="16"
                    y="28"
                    width="32"
                    height="24"
                    rx="1"
                    fill="white"
                    fillOpacity="0.9"
                  />
                  <rect
                    x="26"
                    y="38"
                    width="12"
                    height="14"
                    rx="1"
                    fill="#06B6D4"
                  />
                  <rect
                    x="20"
                    y="32"
                    width="8"
                    height="6"
                    rx="1"
                    fill="#0891D1"
                  />
                  <rect
                    x="36"
                    y="32"
                    width="8"
                    height="6"
                    rx="1"
                    fill="#0891D1"
                  />
                </svg>
              ) : (
                <FolderIcon
                  size={14}
                  className="flex-shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4"
                />
              )}
              {/* 名称 */}
              <TruncateText
                maxWidth={80}
                smMaxWidth={120}
                mdMaxWidth={150}
                lgMaxWidth={200}
                className="text-slate-900"
              >
                {crumb.name}
              </TruncateText>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
