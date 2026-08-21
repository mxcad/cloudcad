import { Card } from '@/components/ui/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    color?: string;
  }>;
  color: string;
  onClick?: () => void;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  onClick,
  loading,
}) => {
  return (
    <Card
      variant="outlined"
      padding="md"
      radius="2xl"
      onClick={onClick}
      className={`
        relative transition-all duration-300
        ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div
            className="text-sm font-medium mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {title}
          </div>
          {loading ? (
            <div className="h-8 w-20 rounded-lg skeleton-theme" />
          ) : (
            <div
              className="text-2xl font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {value}
            </div>
          )}
          {subtitle && !loading && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </div>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15` }}
        >
          <Icon size={20} color={color} />
        </div>
      </div>
    </Card>
  );
};
