import React from 'react';
import { Home, ChevronRight } from 'lucide-react';
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
  return (
    <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-600 overflow-x-auto pb-1">
      <button
        onClick={onNavigateToProjects}
        className="flex items-center gap-1 hover:text-slate-900 transition-colors whitespace-nowrap"
      >
        <Home size={16} />
        <span>项目</span>
      </button>
      
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id}>
          <ChevronRight size={16} className="flex-shrink-0" />
          <button
            onClick={() => onNavigate(crumb)}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              index === breadcrumbs.length - 1 ? 'text-slate-900 font-medium' : ''
            }`}
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};