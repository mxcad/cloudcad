import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ExpirationOption, getExpirationLabels } from '@/constants/share';
import { t } from '@/languages';

interface ExpirationPickerProps {
  expiration: ExpirationOption;
  onExpirationChange: (value: ExpirationOption) => void;
  customDays: number;
  onCustomDaysChange: (days: number) => void;
}

/**
 * 有效期选择器（快捷档位 + 自定义天数输入，唯一出口）。
 * ShareDialog 批量/单个视图与 EditExpiryModal 共用；标签文案由调用方自行渲染。
 */
export function ExpirationPicker({
  expiration,
  onExpirationChange,
  customDays,
  onCustomDaysChange,
}: ExpirationPickerProps) {
  const labels = getExpirationLabels();
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          width: '100%',
        }}
      >
        {(Object.keys(labels) as ExpirationOption[]).map((key) => (
          <Button
            key={key}
            variant={expiration === key ? 'primary' : 'outline'}
            size="xs"
            onClick={() => onExpirationChange(key)}
          >
            {labels[key]}
          </Button>
        ))}
      </div>
      {expiration === 'custom' && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div style={{ width: '60px' }}>
            <Input
              type="number"
              min={1}
              max={365}
              size="sm"
              value={customDays}
              onChange={(e) =>
                onCustomDaysChange(
                  Math.max(1, Math.min(365, parseInt(e.target.value) || 1))
                )
              }
            />
          </div>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}
          >
            {t('天后过期')}
          </span>
        </div>
      )}
    </>
  );
}
