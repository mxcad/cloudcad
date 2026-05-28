import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { InteractiveBackground } from './InteractiveBackground';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useBrandConfig } from '../contexts/BrandContext';
import { Link } from 'react-router-dom';

// 导入 lucide 图标
import { Cpu, ArrowLeft } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface AuthLayoutProps {
  children: React.ReactNode;
  showFeatures?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  backText?: string;
}

/**
 * 认证页面统一布局组件
 *
 * 适用于：登录、注册、忘记密码、重置密码、个人资料等页面
 *
 * 特性：
 * - 统一的动态渐变背景
 * - 主题切换按钮
 * - 可选的返回按钮
 * - 可选的底部特性展示
 * - 玻璃态卡片容器
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  showFeatures = true,
  showBackButton = false,
  onBack,
  backText = '返回',
}) => {
  const { isDark } = useTheme();
  const { config: brandConfig } = useBrandConfig();

  const appName = brandConfig?.title || 'CloudCAD';

  return (
    <div className="auth-layout" data-theme={isDark ? 'dark' : 'light'}>
      {/* 交互式动态背景 - 带鼠标视差效果 */}
      <InteractiveBackground />

      {/* 右上角工具栏 */}
      <div className="theme-toggle-wrapper" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {/* <LanguageSwitcher /> */}
        <ThemeToggle />
      </div>

      {/* 返回按钮 */}
      {showBackButton && onBack && (
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack} className="fixed top-6 left-6">
          <span>{backText}</span>
        </Button>
      )}

      {/* 主内容区 */}
      <div className="auth-container">
        <Card variant="outlined" padding="none" className="auth-card">
          {children}

          {/* 特性图标栏 */}
          {showFeatures && (
            <div className="features-bar">
              <div className="feature-dot" data-tooltip="高性能 CAD 在线预览">
                <Cpu size={14} />
              </div>
              <div className="feature-dot" data-tooltip="多用户实时协同编辑">
                <Boxes size={14} />
              </div>
              <div className="feature-dot" data-tooltip="企业级数据安全保障">
                <ShieldCheck size={14} />
              </div>
            </div>
          )}
        </Card>

        {/* 版权信息 */}
        <p className="copyright">© 2026 {appName}. All rights reserved.</p>
      </div>

      <style>{`
        /* ===== 基础布局 ===== */
        .auth-layout {
          min-height: 100vh;
          display: flex;
          position: relative;
          overflow: hidden;
          font-family: var(--font-family-base);
          background: var(--bg-primary);
        }

        /* ===== 主题切换按钮 ===== */
        .theme-toggle-wrapper {
          position: fixed;
          top: 1.5rem;
          right: 1.5rem;
          z-index: 100; /* theme-toggle: local stacking */
        }

        /* ===== 主容器 - 居中布局 ===== */
        .auth-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        /* ===== 认证卡片 ===== */
        .auth-card {
          width: 100%;
          max-width: 440px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          animation: card-appear 0.6s ease-out;
        }

        @keyframes card-appear {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ===== 特性图标栏 ===== */
        .features-bar {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-subtle);
        }

        .feature-dot {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          transition: all 0.2s;
          cursor: pointer;
        }

        .feature-dot:hover {
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          border-color: transparent;
          color: white;
          transform: translateY(-2px);
        }

        /* Tooltip 样式 */
        .feature-dot::before {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          padding: 0.375rem 0.625rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          font-size: var(--text-xs);
          font-weight: 500;
          color: var(--text-secondary);
          white-space: nowrap;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-md);
          z-index: 10;
        }

        /* Tooltip 箭头 */
        .feature-dot::after {
          content: '';
          position: absolute;
          bottom: calc(100% + 3px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          border: 4px solid transparent;
          border-top-color: var(--border-default);
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          z-index: 10;
        }

        .feature-dot:hover::before,
        .feature-dot:hover::after {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) scale(1);
        }

        /* ===== 版权信息 ===== */
        .copyright {
          margin-top: 2rem;
          font-size: var(--text-sm);
          color: var(--text-muted);
        }

        /* ===== 深色主题特殊处理 ===== */
        [data-theme="dark"] .auth-card {
          background: rgba(26, 29, 33, 0.9);
          backdrop-filter: blur(20px);
          box-shadow: 
            0 25px 60px -15px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        /* ===== 响应式设计 ===== */
        @media (max-width: 480px) {
          .auth-container { 
            padding: 1rem; 
          }
          
          .auth-card { 
            padding: 1.75rem; 
            border-radius: 20px; 
          }
          
          .theme-toggle-wrapper { 
            top: 1rem; 
            right: 1rem; 
          }
        }
      `}</style>
    </div>
  );
};

export default AuthLayout;
