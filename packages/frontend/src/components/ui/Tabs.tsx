import React, { createContext, useContext, useRef, useState, useEffect } from 'react';

interface TabsContextValue {
  compact: boolean;
}

const TabsContext = createContext<TabsContextValue>({ compact: false });

export const useTabsContext = () => useContext(TabsContext);

interface TabsProps {
  className?: string;
  children: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ className = '', children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const fullWidthRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkTextWrap = (): boolean => {
      const buttons = el.querySelectorAll('button');
      return Array.from(buttons).some(btn => btn.scrollHeight > btn.clientHeight + 2);
    };

    let skipNextUncompact = false;

    const observer = new ResizeObserver(() => {
      if (compactRef.current) {
        if (el.parentElement && el.parentElement.clientWidth > fullWidthRef.current + 40) {
          compactRef.current = false;
          setCompact(false);
          skipNextUncompact = true;
        }
      } else if (skipNextUncompact) {
        skipNextUncompact = false;
      } else if (checkTextWrap()) {
        fullWidthRef.current = el.scrollWidth;
        compactRef.current = true;
        setCompact(true);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <TabsContext.Provider value={{ compact }}>
      <div
        ref={containerRef}
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
    </TabsContext.Provider>
  );
};

export default Tabs;
