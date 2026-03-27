import React from 'react';
import { useBrandConfig } from '../contexts/BrandContext';
import './Logo.css';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  animated?: boolean;
  iconOnly?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showSubtitle = true,
  animated = true,
  iconOnly = false,
}) => {
  const { config } = useBrandConfig();
  const logoSrc = config?.logo || '/logo.png';

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

  if (iconOnly) {
    return (
      <div
        className={`logo logo--icon-only ${sizeClasses[size]} ${animated ? 'logo--animated' : ''}`}
      >
        {iconContent}
      </div>
    );
  }

  return (
    <div
      className={`logo ${sizeClasses[size]} ${animated ? 'logo--animated' : ''}`}
    >
      {iconContent}

      {/* Logo 文字 */}
      <div className="logo__text">
        <h1 className="logo__title">
          <span className="logo__title--brand">梦想</span>
          <span className="logo__title--product">网页</span>
        </h1>
        {showSubtitle && <p className="logo__subtitle">CAD 协同平台</p>}
      </div>
    </div>
  );
};

export default Logo;
