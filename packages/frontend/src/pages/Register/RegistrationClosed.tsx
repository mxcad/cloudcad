/** Registration status early-return UI. Shown when allowRegister is false. */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { useTheme } from '@/contexts/ThemeContext';
import './Register.css';

export const RegistrationClosed: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  return (
    <div className="register-page" data-theme={isDark ? 'dark' : 'light'}>
      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>
      <InteractiveBackground />
      <div className="register-container">
        <div className="closed-card">
          <div className="closed-icon">
            <ShieldCheck size={32} />
          </div>
          <h2 className="closed-title">注册已关闭</h2>
          <p className="closed-message">
            系统管理员已关闭新用户注册功能。
            <br />
            如有疑问，请联系管理员。
          </p>
          <button onClick={() => navigate('/login')} className="back-button">
            <ArrowLeft size={18} />
            <span>返回登录</span>
          </button>
        </div>
      </div>
    </div>
  );
};
