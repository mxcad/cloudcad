import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

interface SupportModalProps {
  onClose: () => void;
  /** 场景：disabled=账号被禁用（默认），deactivated=账号已注销且已过冷静期（联系客服恢复） */
  variant?: 'disabled' | 'deactivated';
  /** 注销场景：数据彻底删除延迟天数 */
  cleanupDays?: number;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  onClose,
  variant = 'disabled',
  cleanupDays = 30,
}) => {
  // 客服联系方式读取运行时配置（缺省回退硬编码兜底值）
  const { config } = useRuntimeConfig();
  const supportEmail = config.supportEmail || 'support@cloudcad.com';
  const supportPhone = config.supportPhone || '400-123-4567';

  const isDeactivated = variant === 'deactivated';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isDeactivated ? t('账号已注销') : t('账号已被禁用')}
    >
      <div className="space-y-4">
        <p style={{ color: 'var(--text-secondary)' }}>
          {isDeactivated ? (
            <>
              {t('您的账号已注销且已过冷静期，请联系客服恢复账户。')}
              <br />
              {t('数据将在 {days} 天后彻底删除，逾期无法恢复。', {
                days: String(cleanupDays),
              })}
            </>
          ) : (
            <>
              {t('您的账号已被禁用，无法登录系统。')}
              <br />
              {t('如有疑问，请联系客服人员获取帮助。')}
            </>
          )}
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>
              {t('客服邮箱：')}
            </span>
            <a
              href={`mailto:${supportEmail}`}
              className="hover:underline"
              style={{ color: 'var(--primary-500)' }}
            >
              {supportEmail}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>
              {t('客服电话：')}
            </span>
            <a
              href={`tel:${supportPhone}`}
              className="hover:underline"
              style={{ color: 'var(--primary-500)' }}
            >
              {supportPhone}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>
              {t('工作时间：')}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {t('周一至周五 9:00-18:00')}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
