import { CheckCircle } from 'lucide-react';
import { t } from '@/languages';

interface SuccessBannerProps {
  projectName: string;
}

export const SuccessBanner: React.FC<SuccessBannerProps> = ({
  projectName,
}) => (
  <div
    className="flex items-center gap-3 p-4 rounded-xl mb-6"
    style={{
      background: 'var(--success-light, rgba(34, 197, 94, 0.1))',
      border: '1px solid var(--success-dim, rgba(34, 197, 94, 0.3))',
    }}
  >
    <CheckCircle size={20} style={{ color: 'var(--success)' }} />
    <span className="text-sm" style={{ color: 'var(--success)' }}>
      {t('项目')}「{projectName}」{t('创建成功！')}
    </span>
  </div>
);
