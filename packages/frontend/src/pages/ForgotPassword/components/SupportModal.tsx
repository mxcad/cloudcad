import { useSupportContact } from '@/hooks/useSupportContact';
import { t } from '@/languages';
import styles from '../ForgotPassword.module.css';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  open,
  onClose,
}) => {
  const support = useSupportContact();

  if (!open) return null;

  return (
    <div className={styles.supportModalOverlay}>
      <div className={styles.supportModal}>
        <div className={styles.supportModalHeader}>
          <h3>{t('联系客服')}</h3>
          <button className={styles.supportModalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.supportModalContent}>
          <p className={styles.supportModalMessage}>
            {t('如需帮助，请联系客服人员获取支持。')}
          </p>
          <div className={styles.supportContactInfo}>
            <div className={styles.supportContactItem}>
              <span className={styles.supportContactLabel}>
                {t('客服邮箱：')}
              </span>
              <a
                href={`mailto:${support.email}`}
                className={styles.supportContactLink}
              >
                {support.email}
              </a>
            </div>
            <div className={styles.supportContactItem}>
              <span className={styles.supportContactLabel}>
                {t('客服电话：')}
              </span>
              <a
                href={`tel:${support.phone}`}
                className={styles.supportContactLink}
              >
                {support.phone}
              </a>
            </div>
            <div className={styles.supportContactItem}>
              <span className={styles.supportContactLabel}>
                {t('工作时间：')}
              </span>
              <span className={styles.supportContactValue}>
                {support.hours}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.supportModalFooter}>
          <button className={styles.supportModalButton} onClick={onClose}>
            {t('关闭')}
          </button>
        </div>
      </div>
    </div>
  );
};
