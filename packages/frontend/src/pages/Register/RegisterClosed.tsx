import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import styles from './register.module.css';

export const RegisterClosed: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.closedCard}>
      <div className={styles.closedIcon}>
        <ShieldCheck size={32} />
      </div>
      <h2 className={styles.closedTitle}>{t('注册已关闭')}</h2>
      <p className={styles.closedMessage}>
        {t('系统管理员已关闭新用户注册功能。')}
        <br />
        {t('如有疑问，请联系管理员。')}
      </p>
      <Button
        variant="secondary"
        size="lg"
        icon={ArrowLeft}
        onClick={() => navigate('/login')}
      >
        {t('返回登录')}
      </Button>
    </div>
  );
};
