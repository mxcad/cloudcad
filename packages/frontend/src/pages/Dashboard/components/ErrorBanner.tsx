import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  error: string | null;
  createError: string | null;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  createError,
}) => {
  if (!error && !createError) return null;

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl mb-6"
      style={{
        background: 'var(--error-light)',
        border: '1px solid var(--error-dim)',
      }}
    >
      <AlertCircle
        size={20}
        style={{ color: 'var(--error)' }}
        className="flex-shrink-0 mt-0.5"
      />
      <div className="text-sm" style={{ color: 'var(--error)' }}>
        {error && <div>{error}</div>}
        {createError && <div>{createError}</div>}
      </div>
    </div>
  );
};
