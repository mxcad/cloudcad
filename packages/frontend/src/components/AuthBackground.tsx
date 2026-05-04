import React from 'react';

/**
 * 认证页面背景组件 - CloudCAD
 *
 * 设计特色：
 * - 渐变光球动画背景
 * - 网格纹理覆盖层
 * - 适用于登录、注册、找回密码等页面
 */
export const AuthBackground: React.FC = () => {
  return (
    <>
      <div className="auth-background">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
        <div className="grid-overlay" />
      </div>
      <style>{`
        .auth-background {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
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

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(var(--border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
          background-size: 50px 50px;
          opacity: 0.3;
        }
      `}</style>
    </>
  );
};

export default AuthBackground;
