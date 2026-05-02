import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 动态渐变背景组件
 * 
 * 特性：
 * - 浮动渐变光晕动画
 * - 网格纹理叠加
 * - 完美适配深色/亮色主题
 * - 可用于登录、注册、个人资料等页面
 */
export const DynamicBackground: React.FC = () => {
  const { isDark } = useTheme();

  return (
    <div className="dynamic-background" data-theme={isDark ? 'dark' : 'light'}>
      <div className="gradient-orb orb-1" />
      <div className="gradient-orb orb-2" />
      <div className="gradient-orb orb-3" />
      <div className="grid-overlay" />

      <style>{`
        .dynamic-background {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }

        .gradient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.4;
          animation: float-orb 20s ease-in-out infinite;
        }

        .orb-1 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          animation-delay: 0s;
        }

        .orb-2 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, var(--accent-400), var(--primary-400));
          bottom: -100px;
          left: 20%;
          animation-delay: -7s;
        }

        .orb-3 {
          width: 350px;
          height: 350px;
          background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
          bottom: -50px;
          right: 15%;
          animation-delay: -14s;
        }

        @keyframes float-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 30px) scale(1.02); }
        }

        /* 针对左侧布局的特殊调整 */
        [data-theme="dark"] .dynamic-background.left-aligned .orb-1 {
          left: 30%;
        }

        [data-theme="dark"] .dynamic-background.left-aligned .orb-2 {
          left: 10%;
        }

        [data-theme="dark"] .dynamic-background.left-aligned .orb-3 {
          right: 60%;
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(var(--border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
          background-size: 50px 50px;
          opacity: 0.3;
        }

        /* 响应式调整 */
        @media (max-width: 768px) {
          .gradient-orb {
            opacity: 0.3;
          }

          .orb-1 {
            width: 400px;
            height: 400px;
          }

          .orb-2 {
            width: 300px;
            height: 300px;
          }

          .orb-3 {
            width: 250px;
            height: 250px;
          }
        }
      `}</style>
    </div>
  );
};

export default DynamicBackground;
