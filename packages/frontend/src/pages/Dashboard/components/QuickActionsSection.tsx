import { Plus } from 'lucide-react';
import { Upload } from 'lucide-react';
import { FilePlus } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { t } from '@/languages';
import { QuickAction } from './QuickAction';

interface QuickActionsSectionProps {
  onNewProject: () => void;
  onUpload: () => void;
  onNewDrawing: () => void;
}

export const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({
  onNewProject,
  onUpload,
  onNewDrawing,
}) => (
  <Section title={t('快捷操作')} variant="outlined" className="rounded-2xl">
    <div className="space-y-1">
      <QuickAction
        icon={Plus}
        label={t('新建项目')}
        color="var(--primary-500)"
        onClick={onNewProject}
      />
      <QuickAction
        icon={Upload}
        label={t('上传图纸')}
        color="var(--accent-500)"
        onClick={onUpload}
      />
      <QuickAction
        icon={FilePlus}
        label={t('新建图纸')}
        color="var(--primary-500)"
        onClick={onNewDrawing}
      />
    </div>
  </Section>
);
