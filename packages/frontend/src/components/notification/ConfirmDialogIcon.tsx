import type { DialogType } from './types';

export const renderConfirmIcon = (dialogType: DialogType) => {
  const iconColor =
    dialogType === 'danger'
      ? 'var(--error)'
      : dialogType === 'warning'
        ? 'var(--warning)'
        : 'var(--info)';
  const bgColor =
    dialogType === 'danger'
      ? 'var(--error-dim)'
      : dialogType === 'warning'
        ? 'var(--warning-dim)'
        : 'var(--info-dim)';

  return (
    <div
      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
      style={{ background: bgColor }}
    >
      <svg
        className="w-6 h-6"
        style={{ color: iconColor }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={
            dialogType === 'info'
              ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
              : 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
          }
        />
      </svg>
    </div>
  );
};
