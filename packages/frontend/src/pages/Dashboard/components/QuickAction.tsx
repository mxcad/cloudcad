import { ArrowRight } from 'lucide-react';

interface QuickActionProps {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    color?: string;
  }>;
  label: string;
  color: string;
  onClick?: () => void;
}

export const QuickAction: React.FC<QuickActionProps> = ({
  icon: Icon,
  label,
  color,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left w-full hover:bg-[var(--bg-tertiary)] active:bg-[var(--bg-tertiary)] group"
  >
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
      style={{ background: `${color}15` }}
    >
      <Icon size={18} color={color} />
    </div>
    <span
      className="font-medium text-sm flex-1"
      style={{ color: 'var(--text-secondary)' }}
    >
      {label}
    </span>
    <ArrowRight
      size={14}
      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
      color="var(--text-muted)"
    />
  </button>
);
