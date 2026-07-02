import React from 'react';

interface TabsProps {
  className?: string;
  children: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ className = '', children }) => (
  <div
    className={`
      flex items-center gap-[3px] p-[3px]
      bg-[var(--bg-tertiary)]
      rounded-[var(--radius-xl)]
      border border-[var(--border-subtle)]
      overflow-x-auto no-scrollbar
      ${className}
    `}
  >
    {children}
  </div>
);

export default Tabs;
