import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../Login.module.css';

interface WechatLoginButtonProps {
  onWechatLogin: () => void;
}

export const WechatLoginButton: React.FC<WechatLoginButtonProps> = ({
  onWechatLogin,
}) => {
  return (
    <>
      <div className={styles.divider}>
        <span>{t('其他登录方式')}</span>
      </div>
      <Button
        variant="secondary"
        size="lg"
        icon={MessageCircle}
        onClick={onWechatLogin}
        className="w-full justify-center"
      >
        {t('微信登录')}
      </Button>
    </>
  );
};
