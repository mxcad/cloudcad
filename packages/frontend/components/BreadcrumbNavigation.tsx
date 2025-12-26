import React from 'react';
import { HomeIcon, ChevronRightIcon } from './FileIcons';
import { BreadcrumbItem } from '../../types/filesystem';

interface BreadcrumbNavigationProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (crumb: BreadcrumbItem) => void;
  onNavigateToProjects: () => void;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  breadcrumbs,
  onNavigate,
  onNavigateToProjects,
}) => {
  // 如果没有面包屑，不渲染
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      {/* 首页/项目 */}
      <button
        onClick={onNavigateToProjects}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-slate-600 
                   hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
      >
        <HomeIcon size={16} />
        <span className="hidden sm:inline">项目</span>
      </button>

      {/* 面包屑项 */}
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={crumb.id}>
            {/* 分隔符 */}
            <ChevronRightIcon size={14} className="text-slate-400 flex-shrink-0" />

            {/* 面包屑项 */}
            <button
              onClick={() => !isLast && onNavigate(crumb)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-200
                ${isLast
                  ? 'text-slate-900 font-medium cursor-default'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                }
              `}
              disabled={isLast}
            >
              {/* 如果是根节点，显示文件夹图标 */}
              {crumb.isRoot && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="flex-shrink-0"
                >
                  <path
                    d="M4 16C4 12.6863 6.68629 10 10 10H26L30 14H54C57.3137 14 60 16.6863 60 20V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V16Z"
                    fill="#FCD34D"
                    stroke="#F59E0B"
                    strokeWidth="2"
                  />
                  <path
                    d="M4 22C4 18.6863 6.68629 16 10 16H26L30 20H54C57.3137 20 60 22.6863 60 26V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V22Z"
                    fill="#FEF3C7"
                    stroke="#F59E0B"
                    strokeWidth="2"
                  />
                </svg>
              )}
              <span className="truncate max-w-[120px] sm:max-w-[200px]">
                {crumb.name}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
