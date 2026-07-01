/** Registration status early-return UI. Shown when allowRegister is false. */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { t } from '@/languages';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/contexts/ThemeContext';
import './Register.css';

export const RegistrationClosed: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  return (
    <div className="register-page" data-theme={isDark ? 'dark' : 'light'}>
      <div className="theme-toggle-wrapper" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <InteractiveBackground />
      <div className="register-container">
        <div className="closed-card">
          <div className="closed-icon">
            <ShieldCheck size={32} />
          </div>
          <h2 className="closed-title">{t("注册已关闭")}</h2>
          <p className="closed-message">
            {t("系统管理员已关闭新用户注册功能。")}
            <br />
            {t("如有疑问，请联系管理员。")}
          </p>
          <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => navigate('/login')}>
            {t("返回登录")}
          </Button>
        </div>
      </div>
    </div>
  );
};
