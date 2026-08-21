///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useLayoutEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { t } from '@/languages';
import { isValidIpOrCidr } from '@/utils/ipCidrValidation';
import type { IpBlacklistEntryForm } from '../types';

interface AddEntryModalProps {
  isOpen: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: IpBlacklistEntryForm) => void;
}

/**
 * 添加 IP 黑名单条目弹窗
 *
 * - IP/CIDR 必填，前端校验合法性（非法输入被拒）
 * - 原因必填
 * - 限期可选（不填 = 永久封禁），且不能早于今天
 * - 每次打开时重置表单（关闭/成功提交后不卸载，靠 isOpen 重置）
 */
export function AddEntryModal({
  isOpen,
  saving,
  onClose,
  onSubmit,
}: AddEntryModalProps) {
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [ipError, setIpError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [expiresAtError, setExpiresAtError] = useState('');

  // 今天（本地日期粒度），用于限制限期可选范围
  const todayIso = new Date().toISOString();

  const reset = useCallback(() => {
    setIp('');
    setReason('');
    setExpiresAt('');
    setIpError('');
    setReasonError('');
    setExpiresAtError('');
  }, []);

  // 弹窗打开时同步重置表单（useLayoutEffect：重开首帧即为空，成功提交后不留旧值）
  useLayoutEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (saving) return;
    const trimmedIp = ip.trim();
    const trimmedReason = reason.trim();
    let valid = true;

    if (!trimmedIp) {
      setIpError(t('请输入 IP 或 CIDR'));
      valid = false;
    } else if (!isValidIpOrCidr(trimmedIp)) {
      setIpError(t('IP/CIDR 格式非法'));
      valid = false;
    } else {
      setIpError('');
    }

    if (!trimmedReason) {
      setReasonError(t('请输入封禁原因'));
      valid = false;
    } else {
      setReasonError('');
    }

    if (expiresAt) {
      // expiresAt 为选中当天 23:59:59.999；早于今天 00:00:00 即过去日期
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (new Date(expiresAt).getTime() < todayStart.getTime()) {
        setExpiresAtError(t('限期不能早于今天'));
        valid = false;
      } else {
        setExpiresAtError('');
      }
    } else {
      setExpiresAtError('');
    }

    if (!valid) return;

    const form: IpBlacklistEntryForm = { ip: trimmedIp, reason: trimmedReason };
    if (expiresAt) form.expiresAt = expiresAt;
    onSubmit(form);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('添加 IP 黑名单')}
      size="md"
      closeOnOverlayClick={!saving}
    >
      <div className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('IP/CIDR')} <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <Input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder={t('如 203.0.113.7 或 203.0.113.0/24')}
            variant={ipError ? 'error' : 'default'}
            size="lg"
          />
          {ipError && (
            <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>
              {ipError}
            </p>
          )}
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('封禁原因')} <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('如：撞库扫描攻击')}
            variant={reasonError ? 'error' : 'default'}
            size="lg"
            maxLength={500}
          />
          {reasonError && (
            <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>
              {reasonError}
            </p>
          )}
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('限期')}
          </label>
          <DatePicker
            value={expiresAt}
            onChange={(v) => {
              setExpiresAt(v ?? '');
              // 改选日期后立即清除上次提交的错误提示
              setExpiresAtError('');
            }}
            placeholder={t('选择日期')}
            size="lg"
            minDate={todayIso}
          />
          {expiresAtError ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>
              {expiresAtError}
            </p>
          ) : (
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('不填写则为永久封禁')}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={handleClose} disabled={saving}>
          {t('取消')}
        </Button>
        <Button onClick={handleSubmit} loading={saving}>
          {t('确认添加')}
        </Button>
      </div>
    </Modal>
  );
}
