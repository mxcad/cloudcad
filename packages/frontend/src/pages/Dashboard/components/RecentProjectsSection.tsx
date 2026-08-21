import { ArrowRight } from 'lucide-react';
import { FolderOpen } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { FileItem } from '@/components/FileItem';
import type { FileSystemNodeDto } from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { t } from '@/languages';

interface RecentProjectsSectionProps {
  loading: boolean;
  projects: FileSystemNodeDto[];
  onViewAll: () => void;
  onEnter: (project: FileSystemNodeDto) => void;
}

export const RecentProjectsSection: React.FC<RecentProjectsSectionProps> = ({
  loading,
  projects,
  onViewAll,
  onEnter,
}) => (
  <Section
    title={t('最近项目')}
    actions={
      <button
        onClick={onViewAll}
        className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
        style={{ color: 'var(--accent-500)' }}
      >
        {t('查看全部')}
        <ArrowRight size={14} />
      </button>
    }
    variant="outlined"
    className="rounded-2xl"
  >
    {loading ? (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl skeleton-theme" />
        ))}
      </div>
    ) : projects.length > 0 ? (
      <div className="space-y-1">
        {projects.map((project) => (
          <FileItem
            key={project.id}
            node={
              {
                id: project.id,
                name: project.name,
                isFolder: true,
                isRoot: project.isRoot,
                updatedAt: project.updatedAt,
                parentId: undefined,
                createdAt: project.createdAt || '',
                path: '',
                ownerId: project.ownerId || '',
              } as FileSystemNode
            }
            compact
            onEnter={() => onEnter(project)}
          />
        ))}
      </div>
    ) : (
      <div
        className="text-center py-8 rounded-xl"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <FolderOpen
          size={32}
          color="var(--text-muted)"
          className="mx-auto mb-2"
        />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('暂无项目，创建您的第一个项目')}
        </p>
      </div>
    )}
  </Section>
);
