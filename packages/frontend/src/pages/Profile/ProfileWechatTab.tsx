import React from 'react';
import { MessageCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from './Profile.module.css';

interface ProfileWechatTabProps {
  wechatId?: string | null | undefined;
  loading: boolean;
  onBind: () => void;
  onUnbind: () => Promise<void>;
}

export const ProfileWechatTab: React.FC<ProfileWechatTabProps> = ({
  wechatId,
  loading,
  onBind,
  onUnbind,
}) => {
  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      <div className={styles.wechatBindContent}>
        {wechatId ? (
          <div className={styles.wechatBound}>
            <div className={styles.successIcon}>
              <CheckCircle size={48} />
            </div>
            <h3>{t('微信已绑定')}</h3>
            <p className={styles.boundInfo}>{t('您可以使用微信快捷登录')}</p>
            <div className={styles.benefits}>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('微信扫码快捷登录')}</span>
              </div>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('无需记忆密码')}</span>
              </div>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('账户安全提升')}</span>
              </div>
            </div>
            <Button variant="danger" onClick={onUnbind}>
              {t('解绑微信')}
            </Button>
          </div>
        ) : (
          <div className={styles.wechatUnbound}>
            <div className={styles.unboundIcon}>
              <MessageCircle size={64} />
            </div>
            <h3>{t('绑定微信')}</h3>
            <p className={styles.unboundDesc}>
              {t('绑定后可使用微信快捷登录，无需记忆密码')}
            </p>
            <div className={styles.benefits}>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('扫码快捷登录')}</span>
              </div>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('安全便捷')}</span>
              </div>
              <div className={styles.benefitItem}>
                <CheckCircle size={14} />
                <span>{t('实时消息通知')}</span>
              </div>
            </div>
            <Button
              variant="primary"
              icon={MessageCircle}
              disabled={loading}
              onClick={onBind}
            >
              {t('绑定微信')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
