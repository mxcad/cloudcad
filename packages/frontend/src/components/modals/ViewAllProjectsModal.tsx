import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { FileItem } from '@/components/FileItem';
import { FileSystemNode } from '@/types/filesystem';
import { fileSystemControllerGetProjects } from '@/api-sdk';
import { FolderOpen } from 'lucide-react';
import { t } from '@/languages';

interface ViewAllProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ViewAllProjectsModal: React.FC<ViewAllProjectsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  const projectsQuery = useQuery({
    queryKey: ['viewAllProjects'],
    queryFn: async () => {
      const result = await fileSystemControllerGetProjects({
        query: { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' },
      });
      if (result.error) throw result.error;
      const nodes = result.data?.nodes || [];
      return nodes.filter((p) => p.fileStatus !== 'DELETED');
    },
    enabled: isOpen,
  });

  const projects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('最近项目')} size="lg">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
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
              onEnter={() => {
                onClose();
                navigate(`/projects/${project.id}/files`);
              }}
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
            style={{ color: 'var(--text-muted)' }}
            className="mx-auto mb-2"
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('暂无项目')}
          </p>
        </div>
      )}
    </Modal>
  );
};
