/**
 * ThemeToggle - 主题切换按钮组件
 * 精美的太阳/月亮图标切换动画
 */
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Sun } from 'lucide-react';
import { Moon } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 rounded-xl transition-all duration-300 ease-out
                 hover:scale-110 active:scale-95
                 hover:bg-[var(--bg-tertiary)]
                 group"
      title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
      aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
    >
      <div className="relative w-5 h-5">
        {/* 太阳图标 - 亮色模式显示 */}
        <Sun
          size={20}
          className={`absolute inset-0 transition-all duration-500 ease-out
                     ${isDark 
                       ? 'rotate-90 opacity-0 scale-50' 
                       : 'rotate-0 opacity-100 scale-100'}
                     text-[var(--text-tertiary)]
                     group-hover:text-[var(--accent-500)]`}
        />
        
        {/* 月亮图标 - 暗色模式显示 */}
        <Moon
          size={20}
          className={`absolute inset-0 transition-all duration-500 ease-out
                     ${isDark 
                       ? 'rotate-0 opacity-100 scale-100' 
                       : '-rotate-90 opacity-0 scale-50'}
                     text-[var(--text-tertiary)]
                     group-hover:text-[var(--accent-400)]`}
        />
      </div>
      
      {/* 悬停发光效果 */}
      <div 
        className={`absolute inset-0 rounded-xl transition-opacity duration-300
                   ${isDark ? 'group-hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'group-hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]'}
                   opacity-0 group-hover:opacity-100 pointer-events-none`}
      />
    </button>
  );
};

export default ThemeToggle;
