import { Plus } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { t } from '@/languages';
import { QuickAction } from './QuickAction';

interface QuickActionsSectionProps {
  onNewProject: () => void;
}

export const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({
  onNewProject,
}) => (
  <Section title={t('快捷操作')} variant="outlined" className="rounded-2xl">
    <div className="space-y-1">
      <QuickAction
        icon={Plus}
        label={t('新建项目')}
        color="var(--primary-500)"
        onClick={onNewProject}
      />
    </div>
  </Section>
);
