import React from 'react';
import { useAppBrand } from '../hooks/useAppBrand';
import './Logo.css';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', animated = true }) => {
  // 走响应式唯一出口：`config.logo` 只含 /brand/config.json 一层，
  // 缺运行时层会让管理端改 `brandLogo` 时侧边栏 Logo 不更新。
  const logoSrc = useAppBrand().logo;

  const sizeClasses = {
    sm: 'logo--sm',
    md: 'logo--md',
    lg: 'logo--lg',
  };

  const iconContent = (
    <div className="logo__icon-wrapper">
      <div className="logo__icon-bg">
        {/* 动态渐变背景 */}
        <div className="logo__gradient" />

        {/* Logo 图片 */}
        <img src={logoSrc} alt="Logo" className="logo__image" />

        {/* 光泽效果 */}
        <div className="logo__shine" />
      </div>

      {/* 发光效果 - 仅在深色主题显示 */}
      <div className="logo__glow" />
    </div>
  );

  return (
    <div
      className={`logo logo--icon-only ${sizeClasses[size]} ${animated ? 'logo--animated' : ''}`}
    >
      {iconContent}
    </div>
  );
};

export default Logo;
