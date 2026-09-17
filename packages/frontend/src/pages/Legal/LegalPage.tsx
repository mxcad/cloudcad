import React from 'react';
import { getBrandProfile, getCopyrightLine } from '@/constants/appConfig';
import { t } from '@/languages';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import styles from './legal.module.css';

interface LegalPageProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export const LegalPage: React.FC<LegalPageProps> = ({
  title,
  updatedAt,
  children,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/login');
    }
  };

  return (
    <div className={styles.legalPage}>
      <article className={styles.legalCard}>
        <header className={styles.legalHeader}>
          <div className={styles.legalTopBar}>
            <button
              type="button"
              className={styles.legalBack}
              onClick={handleBack}
            >
              <ArrowLeft size={16} />
              {t('返回登录')}
            </button>
            <LanguageSwitcher />
          </div>

          <h1 className={styles.legalTitle}>{title}</h1>
          <div className={styles.legalMeta}>
            <span className={styles.legalUpdated}>
              <CalendarDays size={14} />
              {t('更新日期：{date}', { date: updatedAt })}
            </span>
          </div>
        </header>

        <div className={styles.legalContent}>{children}</div>

        <footer className={styles.legalFooter}>
          {getCopyrightLine(getBrandProfile().copyrightHolder)} · {title}
        </footer>
      </article>
    </div>
  );
};
