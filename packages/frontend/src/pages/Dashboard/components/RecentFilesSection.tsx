import { ArrowRight } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { FileItem } from '@/components/FileItem';
import { toFileSystemNode, FileSystemNode } from '@/types/filesystem';
import type { FileSystemNodeDto } from '@/api-sdk';
import { t } from '@/languages';

interface RecentFilesSectionProps {
  loading: boolean;
  files: FileSystemNodeDto[];
  onViewAll: () => void;
  onEnter: (node: FileSystemNode) => void;
}

export const RecentFilesSection: React.FC<RecentFilesSectionProps> = ({
  loading,
  files,
  onViewAll,
  onEnter,
}) => (
  <Section
    title={t('最近文件')}
    actions={
      <button
        onClick={onViewAll}
        className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
        style={{ color: 'var(--primary-500)' }}
      >
        {t('查看全部')}
        <ArrowRight size={14} />
      </button>
    }
    variant="outlined"
    className="rounded-2xl"
  >
    {!loading && files.length > 0 ? (
      <div className="space-y-1">
        {files.map((file) => (
          <FileItem
            key={file.id}
            node={toFileSystemNode(file)}
            compact
            onEnter={onEnter}
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
          {t('暂无文件，上传您的第一个图纸')}
        </p>
      </div>
    )}
  </Section>
);
