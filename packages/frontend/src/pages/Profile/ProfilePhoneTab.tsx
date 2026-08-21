import React from 'react';
import { Phone, CheckCircle, AlertCircle } from 'lucide-react';
import { UserDto } from '@/api-sdk';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from './Profile.module.css';

interface ProfilePhoneTabProps {
  user?: UserDto | null;
  phoneForm: { phone: string; code: string };
  phoneStep: 'verifyOld' | 'inputNew' | 'verifyNew';
  isEditingPhone: boolean;
  countdown: number;
  sendingCode: boolean;
  loading: boolean;
  focusedField: string | null;
  /** 解绑模式：原手机号验证通过后直接解绑（而非换绑） */
  unbindMode?: boolean;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendPhoneCode: () => void;
  onSendUnbindCode: () => void;
  onVerifyOldPhone: (e: React.FormEvent) => void;
  onSendNewPhoneCode: () => void;
  onRebindPhone: (e: React.FormEvent) => void;
  onBindPhone: (e: React.FormEvent) => void;
  onUnbindPhone: () => void;
  onFocusField: (field: string | null) => void;
  onSetEditingPhone: (editing: boolean) => void;
}

export const ProfilePhoneTab: React.FC<ProfilePhoneTabProps> = ({
  user,
  phoneForm,
  phoneStep,
  isEditingPhone,
  countdown,
  sendingCode,
  loading,
  focusedField,
  unbindMode = false,
  onPhoneChange,
  onSendPhoneCode,
  onSendUnbindCode,
  onVerifyOldPhone,
  onSendNewPhoneCode,
  onRebindPhone,
  onBindPhone,
  onUnbindPhone,
  onFocusField,
  onSetEditingPhone,
}) => {
  const phone = user?.phone as unknown as string | null | undefined;

  if (phone && !isEditingPhone) {
    return (
      <div className={`${styles.tabContent} animate-fade-in`}>
        <div className={styles.phoneBound}>
          <div className={styles.successIcon}>
            <CheckCircle size={48} />
          </div>
          <h3>{t('手机已绑定')}</h3>
          <p className={styles.boundPhone}>{phone}</p>
          <div className={styles.benefits}>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('快捷登录')}</span>
            </div>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('安全验证')}</span>
            </div>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('找回密码')}</span>
            </div>
          </div>
          <div className={styles.buttonGroup}>
            <Button
              variant="primary"
              icon={Phone}
              onClick={() => onSetEditingPhone(true)}
            >
              {t('换绑手机号')}
            </Button>
            <Button variant="danger" onClick={onUnbindPhone}>
              {t('解绑手机号')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isRebind = !!phone;

  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      {isRebind && phoneStep === 'verifyOld' ? (
        <form onSubmit={onVerifyOldPhone} className={styles.phoneForm}>
          <div className={styles.verifyNotice}>
            <AlertCircle size={16} />
            <span>
              {unbindMode ? t('需要先验证原手机号才能解绑') : t('请先验证原手机号')}
            </span>
          </div>
          <div
            className={`${styles.inputGroup} ${focusedField === 'code' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <CheckCircle size={14} />
              {t('验证码')}
            </label>
            <div
              className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
            >
              <Input
                type="text"
                name="code"
                value={phoneForm.code}
                onChange={onPhoneChange}
                onFocus={() => onFocusField('code')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入 6 位验证码')}
                maxLength={6}
                required
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={countdown > 0}
                loading={sendingCode}
                onClick={onSendUnbindCode}
              >
                {countdown > 0 ? `${countdown}s` : t('获取验证码')}
              </Button>
              <div className={styles.inputGlow} />
            </div>
          </div>
          <div className={styles.buttonGroup}>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onSetEditingPhone(false)}
            >
              {t('取消')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={CheckCircle}
            >
              {loading ? t('验证中...') : t('确认验证')}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phoneStep === 'verifyNew') {
              isRebind ? onRebindPhone(e) : onBindPhone(e);
            } else {
              isRebind ? onSendNewPhoneCode() : onSendPhoneCode();
            }
          }}
          className={styles.phoneForm}
        >
          {!isRebind && (
            <div className={styles.infoText}>
              {t('绑定手机号后，可以使用手机号快捷登录')}
            </div>
          )}
          {isRebind && phoneStep === 'inputNew' && (
            <div className={styles.verifySuccess}>
              <CheckCircle size={16} />
              <span>{t('原手机号验证成功，请输入新手机号')}</span>
            </div>
          )}
          <div
            className={`${styles.inputGroup} ${focusedField === 'phone' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <Phone size={14} />
              {isRebind && phoneStep === 'verifyNew'
                ? t('新手机号')
                : t('手机号')}
            </label>
            <div
              className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
            >
              <Input
                type="text"
                name="phone"
                value={phoneForm.phone}
                onChange={onPhoneChange}
                onFocus={() => onFocusField('phone')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入手机号')}
                maxLength={11}
                pattern="^1[3-9]\\d{9}$"
                title={t('请输入正确的手机号')}
                readOnly={phoneStep === 'verifyNew'}
                required
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={countdown > 0}
                loading={sendingCode}
                onClick={isRebind ? onSendNewPhoneCode : onSendPhoneCode}
              >
                {countdown > 0 ? `${countdown}s` : t('获取验证码')}
              </Button>
              <div className={styles.inputGlow} />
            </div>
          </div>
          {phoneStep === 'verifyNew' && (
            <div
              className={`${styles.inputGroup} ${focusedField === 'code' ? styles.inputGroupFocused : ''}`}
            >
              <label className={styles.inputLabel}>
                <CheckCircle size={14} />
                {t('验证码')}
              </label>
              <div
                className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
              >
                <Input
                  type="text"
                  name="code"
                  value={phoneForm.code}
                  onChange={onPhoneChange}
                  onFocus={() => onFocusField('code')}
                  onBlur={() => onFocusField(null)}
                  placeholder={t('请输入 6 位验证码')}
                  maxLength={6}
                  required
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}
          <div className={styles.buttonGroup}>
            {isRebind ? (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => onSetEditingPhone(false)}
              >
                {t('取消')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  onPhoneChange({
                    target: { name: 'phone', value: '' },
                  } as React.ChangeEvent<HTMLInputElement>);
                }}
              >
                {t('返回')}
              </Button>
            )}
            {phoneStep === 'verifyNew' && (
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={CheckCircle}
              >
                {loading
                  ? isRebind
                    ? t('换绑中...')
                    : t('绑定中...')
                  : isRebind
                    ? t('确认换绑')
                    : t('确认绑定')}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
