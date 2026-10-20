import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail, Phone } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { useSupportContact } from '@/hooks/useSupportContact';
import styles from './register.module.css';

export const RegisterClosed: React.FC = () => {
  const navigate = useNavigate();
  const support = useSupportContact();
  const hasSupportContact = !!(support.email || support.phone);

  return (
    <div className={styles.closedCard}>
      <div className={styles.closedIcon}>
        <ShieldCheck size={32} />
      </div>
      <h2 className={styles.closedTitle}>{t('注册已关闭')}</h2>
      <p className={styles.closedMessage}>
        {t('系统管理员已关闭新用户注册功能。')}
        <br />
        {hasSupportContact ? t('如需开通账号，请联系客服。') : t('如需开通账号，请联系系统管理员。')}
      </p>
      {(support.email || support.phone) && (
        <div className={styles.supportContact}>
          {support.email && (
            <a href={`mailto:${support.email}`} className={styles.supportItem}>
              <Mail size={16} />
              <span>{support.email}</span>
            </a>
          )}
          {support.phone && (
            <a href={`tel:${support.phone}`} className={styles.supportItem}>
              <Phone size={16} />
              <span>{support.phone}</span>
            </a>
          )}
        </div>
      )}
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
