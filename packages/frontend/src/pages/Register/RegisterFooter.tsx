import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, Boxes, ShieldCheck } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import styles from './register.module.css';

export const RegisterFooter: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <div className={styles.formFooter}>
        <p className={styles.loginText}>
          {t('已有账户？')}
          <Button variant="secondary" onClick={() => navigate('/login')}>
            {t('立即登录')}
          </Button>
        </p>
      </div>

      <div className={styles.featuresBar}>
        <div
          className={styles.featureDot}
          data-tooltip={t('高性能 CAD 在线预览')}
        >
          <Cpu size={14} />
        </div>
        <div
          className={styles.featureDot}
          data-tooltip={t('多用户实时协同编辑')}
        >
          <Boxes size={14} />
        </div>
        <div
          className={styles.featureDot}
          data-tooltip={t('企业级数据安全保障')}
        >
          <ShieldCheck size={14} />
        </div>
      </div>
    </>
  );
};
