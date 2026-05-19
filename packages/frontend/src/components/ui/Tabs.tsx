import React from 'react';

interface TabsProps {
  className?: string;
  children: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ className = '', children }) => (
  <div
    className={`
      inline-flex items-center gap-[3px] p-[3px]
      bg-[var(--bg-tertiary)]
      rounded-[var(--radius-xl)]
      border border-[var(--border-subtle)]
      ${className}
    `}
  >
    {children}
  </div>
);

export default Tabs;
