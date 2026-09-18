///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { NoticeResponseDto } from '@/api-sdk';
import { t } from '@/languages';
import { formatDateTime } from '@/utils/dateUtils';
import {
  NOTICE_BODY_MAX,
  NOTICE_KINDS,
  NOTICE_KIND_LABELS,
  NOTICE_LEVELS,
  NOTICE_LEVEL_LABELS,
  NOTICE_TITLE_MAX,
} from '../constants';
import type { NoticeFormErrors, NoticeFormValues } from '../types';

interface NoticeFormModalProps {
  isOpen: boolean;
  saving: boolean;
  /** 非 null = 编辑该条公告 */
  notice: NoticeResponseDto | null;
  onClose: () => void;
  onSubmit: (values: NoticeFormValues) => void;
}

const EMPTY_VALUES: NoticeFormValues = {
  kind: 'system',
  level: 'info',
  title: '',
  body: '',
  startAt: '',
  endAt: '',
  autoExpire: false,
};

const EMPTY_ERRORS: NoticeFormErrors = {};

/** 字段标签，右侧可挂字数统计等辅助信息 */
function FieldLabel({
  text,
  required,
  aside,
}: {
  text: string;
  required?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <label
        className="text-sm font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        {text}
        {required && <span style={{ color: 'var(--error)' }}> *</span>}
      </label>
      {aside}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>
      {message}
    </p>
  );
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
      {message}
    </p>
  );
}

function Counter({ count, max }: { count: number; max: number }) {
  return (
    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
      {count}/{max}
    </span>
  );
}

/**
 * 发布/编辑公告弹窗。
 *
 * - 发布：类型、级别、标题、正文、生效时间窗、自动过期均可填
 * - 编辑：只改级别/标题/正文。后端 PATCH 配 forbidNonWhitelisted，多传时间窗
 *   会直接 400，所以时间窗只读展示并提示「下线后重新发布」
 * - 打开即重置（关闭/提交成功不卸载，靠 isOpen 复位，避免留下上次输入）
 */
export function NoticeFormModal({
  isOpen,
  saving,
  notice,
  onClose,
  onSubmit,
}: NoticeFormModalProps) {
  const [values, setValues] = useState<NoticeFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<NoticeFormErrors>(EMPTY_ERRORS);

  const isEdit = notice !== null;

  const seed = () => {
    if (notice) {
      setValues({
        kind: notice.kind === 'download' ? 'download' : 'system',
        level:
          notice.level === 'warning' || notice.level === 'danger'
            ? notice.level
            : 'info',
        title: notice.title,
        body: notice.body,
        startAt: '',
        endAt: '',
        autoExpire: false,
      });
    } else {
      setValues(EMPTY_VALUES);
    }
    setErrors(EMPTY_ERRORS);
  };

  // 弹窗打开时同步重置/回填（useLayoutEffect：重开首帧即为目标值）
  useLayoutEffect(() => {
    if (isOpen) seed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, notice]);

  const setValue = <K extends keyof NoticeFormValues>(
    key: K,
    value: NoticeFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // 改动后立即清掉该字段的旧报错
    if (key === 'title') setErrors((prev) => ({ ...prev, title: undefined }));
    if (key === 'body') setErrors((prev) => ({ ...prev, body: undefined }));
    if (key === 'endAt') setErrors((prev) => ({ ...prev, endAt: undefined }));
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const validate = (): boolean => {
    const next: NoticeFormErrors = {};
    const title = values.title.trim();
    const body = values.body.trim();

    if (!title) {
      next.title = t('请输入标题');
    } else if (title.length > NOTICE_TITLE_MAX) {
      next.title = t('标题不能超过 {count} 字', {
        count: String(NOTICE_TITLE_MAX),
      });
    }

    if (!body) {
      next.body = t('请输入正文');
    } else if (body.length > NOTICE_BODY_MAX) {
      next.body = t('正文不能超过 {count} 字', {
        count: String(NOTICE_BODY_MAX),
      });
    }

    if (!isEdit) {
      if (values.autoExpire && !values.endAt) {
        next.endAt = t('启用自动过期必须填写失效时间');
      } else if (values.endAt && new Date(values.endAt).getTime() <= Date.now()) {
        next.endAt = t('失效时间必须晚于当前时间');
      } else if (
        values.startAt &&
        values.endAt &&
        new Date(values.endAt).getTime() <= new Date(values.startAt).getTime()
      ) {
        next.endAt = t('失效时间必须晚于生效开始时间');
      }
    }

    setErrors(next);
    return Object.values(next).every((message) => !message);
  };

  const handleSubmit = () => {
    if (saving) return;
    if (validate()) onSubmit(values);
  };

  const isScheduled =
    !isEdit &&
    !!values.startAt &&
    new Date(values.startAt).getTime() > Date.now();

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? t('编辑公告') : t('发布公告')}
      size="lg"
      closeOnOverlayClick={!saving}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel text={t('类型')} />
            <Select
              value={values.kind}
              onChange={(value) =>
                setValue('kind', value as NoticeFormValues['kind'])
              }
              disabled={saving || isEdit}
              options={NOTICE_KINDS.map((kind) => ({
                value: kind,
                label: t(NOTICE_KIND_LABELS[kind] || kind),
              }))}
              size="lg"
            />
            {isEdit && <FieldHint message={t('类型发布后不可修改')} />}
          </div>
          <div>
            <FieldLabel text={t('级别')} />
            <Select
              value={values.level}
              onChange={(value) =>
                setValue('level', value as NoticeFormValues['level'])
              }
              disabled={saving}
              options={NOTICE_LEVELS.map((level) => ({
                value: level,
                label: t(NOTICE_LEVEL_LABELS[level] || level),
              }))}
              size="lg"
            />
          </div>
        </div>

        <div>
          <FieldLabel
            text={t('标题')}
            required
            aside={
              <Counter count={values.title.length} max={NOTICE_TITLE_MAX} />
            }
          />
          <Input
            value={values.title}
            onChange={(event) => setValue('title', event.target.value)}
            placeholder={t('如：系统将于 30 分钟后停机维护')}
            variant={errors.title ? 'error' : 'default'}
            size="lg"
            maxLength={NOTICE_TITLE_MAX}
            disabled={saving}
          />
          <FieldError message={errors.title} />
        </div>

        <div>
          <FieldLabel
            text={t('正文')}
            required
            aside={<Counter count={values.body.length} max={NOTICE_BODY_MAX} />}
          />
          <Textarea
            value={values.body}
            onChange={(event) => setValue('body', event.target.value)}
            placeholder={t('公告正文，支持换行')}
            variant={errors.body ? 'error' : 'default'}
            size="lg"
            maxLength={NOTICE_BODY_MAX}
            resize="vertical"
            disabled={saving}
            rows={5}
          />
          <FieldError message={errors.body} />
        </div>

        {isEdit ? (
          <div
            className="rounded-md p-3 text-xs space-y-1.5"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              {t('生效开始')}：
              {notice?.startAt
                ? formatDateTime(notice.startAt)
                : t('发布即生效')}
            </div>
            <div>
              {t('失效时间')}：
              {notice?.endAt ? formatDateTime(notice.endAt) : t('不自动失效')}
            </div>
            <div>
              {t('自动过期')}：{notice?.autoExpire ? t('开启') : t('关闭')}
            </div>
            <p style={{ color: 'var(--text-tertiary)' }}>
              {t('需要调整时间窗，请下线后重新发布。')}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel text={t('生效开始')} />
                <DatePicker
                  value={values.startAt || undefined}
                  onChange={(value) => setValue('startAt', value ?? '')}
                  withTime
                  placeholder={t('发布即生效')}
                  size="lg"
                  minDate={new Date().toISOString()}
                />
              </div>
              <div>
                <FieldLabel text={t('失效时间')} />
                <DatePicker
                  value={values.endAt || undefined}
                  onChange={(value) => setValue('endAt', value ?? '')}
                  withTime
                  placeholder={t('不自动失效')}
                  size="lg"
                  minDate={new Date().toISOString()}
                />
                <FieldError message={errors.endAt} />
              </div>
            </div>

            <div className="space-y-2">
              <Checkbox
                checked={values.autoExpire}
                onChange={(event) =>
                  setValue('autoExpire', event.target.checked)
                }
                label={t('到期自动下线（需填写失效时间）')}
                disabled={saving}
              />
              <FieldHint
                message={
                  isScheduled
                    ? t(
                        '已设置为未来时间：到点后由定时任务推送，不会立即弹出。'
                      )
                    : t('不填写生效开始时间则发布后立刻推送给所有用户。')
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={handleClose} disabled={saving}>
          {t('取消')}
        </Button>
        <Button onClick={handleSubmit} loading={saving}>
          {isEdit ? t('保存修改') : t('立即发布')}
        </Button>
      </div>
    </Modal>
  );
}
