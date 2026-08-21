import React from 'react';
import { CheckCircle } from 'lucide-react';
import { t } from '@/languages';
import styles from './register.module.css';

interface RegisterStepsProps {
  currentStep: number;
  formTitle: string;
  formSubtitle: string;
}

export const RegisterSteps: React.FC<RegisterStepsProps> = ({
  currentStep,
  formTitle,
  formSubtitle,
}) => {
  return (
    <>
      <div className={styles.stepIndicator}>
        <div
          className={`${styles.step} ${
            currentStep >= 1 ? styles.stepActive : ''
          } ${currentStep > 1 ? styles.stepCompleted : ''}`}
        >
          <div className={styles.stepNumber}>
            {currentStep > 1 ? <CheckCircle size={16} /> : 1}
          </div>
          <span className={styles.stepLabel}>{t('基本信息')}</span>
        </div>
        <div className={styles.stepLine} />
        <div
          className={`${styles.step} ${
            currentStep >= 2 ? styles.stepActive : ''
          }`}
        >
          <div className={styles.stepNumber}>2</div>
          <span className={styles.stepLabel}>{t('安全设置')}</span>
        </div>
      </div>

      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>{formTitle}</h2>
        <p className={styles.formSubtitle}>{formSubtitle}</p>
      </div>
    </>
  );
};
