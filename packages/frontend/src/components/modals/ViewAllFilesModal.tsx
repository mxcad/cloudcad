import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { FileItem } from '@/components/FileItem';
import { toFileSystemNode } from '@/types/filesystem';
import { fileSystemControllerGetChildren } from '@/api-sdk';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { FileText } from 'lucide-react';
import { t } from '@/languages';

interface ViewAllFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ViewAllFilesModal: React.FC<ViewAllFilesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const personalSpaceQuery = usePersonalSpaceQuery({ enabled: isOpen });
  const personalSpaceId = personalSpaceQuery.data?.id;

  const filesQuery = useQuery({
    queryKey: ['viewAllFiles', personalSpaceId],
    queryFn: async () => {
      const result = await fileSystemControllerGetChildren({
        path: { nodeId: personalSpaceId! },
        query: { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' },
      });
      if (result.error) throw result.error;
      return result.data?.nodes ?? [];
    },
    enabled: isOpen && !!personalSpaceId,
  });

  const files = filesQuery.data ?? [];
  const loading = filesQuery.isLoading;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('最近文件')} size="lg">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl skeleton-theme" />
          ))}
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-1">
          {files.map((file) => (
            <FileItem
              key={file.id}
              node={toFileSystemNode(file)}
              compact
              onEnter={(node) => {
                onClose();
                if (node.isFolder) {
                  navigate(`/personal-space/${node.id}`);
                } else {
                  window.open(
                    `/cad-editor/${node.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`,
                    '_blank'
                  );
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="text-center py-8 rounded-xl"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          <FileText
            size={32}
            style={{ color: 'var(--text-muted)' }}
            className="mx-auto mb-2"
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('暂无文件')}
          </p>
        </div>
      )}
    </Modal>
  );
};
