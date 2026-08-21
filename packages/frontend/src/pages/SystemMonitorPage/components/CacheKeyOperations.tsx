import React, { useCallback, useState } from 'react';
import {
  KeyRound,
  Search,
  Trash2,
  RefreshCw,
  Ban,
  PlusCircle,
} from 'lucide-react';
import {
  cacheMonitorControllerCleanup,
  cacheMonitorControllerDeleteByPattern,
  cacheMonitorControllerDeleteValue,
  cacheMonitorControllerGetValue,
  cacheMonitorControllerRefresh,
  cacheMonitorControllerSetValue,
} from '@/api-sdk';
import type { CacheOperationDto } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { Button, Input, Tag } from '@/components/ui';
import { useNotification } from '@/contexts/NotificationContext';
import styles from '../SystemMonitorPage.module.css';

export interface CacheKeyOperationsProps {
  isAdmin: boolean;
  onChanged: () => void;
}

function formatResult(value: unknown): string {
  if (value === undefined || value === null) return t('（空）');
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * 缓存 Key 操作区（#217）
 * 查询为读操作（SYSTEM_MONITOR 可见）；设置/删除/按模式删除/刷新/清空仅 SYSTEM_ADMIN 可见，
 * 写操作带确认 + toast
 */
export const CacheKeyOperations: React.FC<CacheKeyOperationsProps> = ({
  isAdmin,
  onChanged,
}) => {
  const { showToast, showConfirm } = useNotification();
  const [keyInput, setKeyInput] = useState('');
  const [valueInput, setValueInput] = useState('');
  const [ttlInput, setTtlInput] = useState('');
  const [patternInput, setPatternInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [mutating, setMutating] = useState(false);

  const handleQuery = useCallback(async () => {
    const key = keyInput.trim();
    if (!key) {
      showToast(t('请输入缓存 Key'), 'warning');
      return;
    }
    setQuerying(true);
    try {
      const result = await cacheMonitorControllerGetValue({ query: { key } });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 提示真实原因
      if (result.error) throw result.error;
      setResult(formatResult(result.data));
    } catch (error) {
      setResult(null);
      showToast(getErrorMessage(error) || t('查询缓存失败'), 'error');
    } finally {
      setQuerying(false);
    }
  }, [keyInput, showToast]);

  const handleSet = useCallback(async () => {
    const key = keyInput.trim();
    if (!key) {
      showToast(t('请输入缓存 Key'), 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: t('设置缓存'),
      message: t('确定要设置缓存 {key} 吗？', { key }),
      confirmText: t('确认设置'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;

    setMutating(true);
    try {
      const result = await cacheMonitorControllerSetValue({
        body: {
          key,
          // SDK 将后端 `value?: unknown` 生成为 object 类型（openapi-ts 限制），
          // 实际传输值为任意 JSON，此处做最小类型适配
          value: valueInput as unknown as CacheOperationDto['value'],
          ttl: ttlInput.trim() ? Number(ttlInput.trim()) : undefined,
        },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则设置失败仍弹"缓存设置成功"（历史 bug）
      if (result.error) throw result.error;
      showToast(t('缓存设置成功'), 'success');
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error) || t('设置缓存失败'), 'error');
    } finally {
      setMutating(false);
    }
  }, [keyInput, valueInput, ttlInput, showConfirm, showToast, onChanged]);

  const handleDelete = useCallback(async () => {
    const key = keyInput.trim();
    if (!key) {
      showToast(t('请输入缓存 Key'), 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: t('删除缓存'),
      message: t('确定要删除缓存 {key} 吗？', { key }),
      confirmText: t('确认删除'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;

    setMutating(true);
    try {
      const result = await cacheMonitorControllerDeleteValue({
        query: { key },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
      if (result.error) throw result.error;
      showToast(t('缓存删除成功'), 'success');
      setResult(null);
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error) || t('删除缓存失败'), 'error');
    } finally {
      setMutating(false);
    }
  }, [keyInput, showConfirm, showToast, onChanged]);

  const handleDeleteByPattern = useCallback(async () => {
    const pattern = patternInput.trim();
    if (!pattern) {
      showToast(t('请输入匹配模式'), 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: t('按模式删除'),
      message: t('确定要删除匹配 {pattern} 的所有缓存吗？', { pattern }),
      confirmText: t('确认删除'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;

    setMutating(true);
    try {
      const result = await cacheMonitorControllerDeleteByPattern({
        query: { pattern },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
      if (result.error) throw result.error;
      showToast(t('按模式删除成功'), 'success');
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error) || t('按模式删除失败'), 'error');
    } finally {
      setMutating(false);
    }
  }, [patternInput, showConfirm, showToast, onChanged]);

  const handleRefresh = useCallback(async () => {
    const key = keyInput.trim();
    if (!key) {
      showToast(t('请输入缓存 Key'), 'warning');
      return;
    }
    setMutating(true);
    try {
      const result = await cacheMonitorControllerRefresh({
        body: { key },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出
      // （此前失败时 data 为 undefined 被误判为"缓存不存在"）
      if (result.error) throw result.error;
      const data = result.data;
      const success =
        data &&
        typeof data === 'object' &&
        'success' in data &&
        data.success === true;
      showToast(
        success ? t('缓存刷新成功') : t('缓存不存在，无法刷新'),
        success ? 'success' : 'warning'
      );
    } catch (error) {
      showToast(getErrorMessage(error) || t('刷新缓存失败'), 'error');
    } finally {
      setMutating(false);
    }
  }, [keyInput, showToast]);

  const handleClearAll = useCallback(async () => {
    const confirmed = await showConfirm({
      title: t('清空所有缓存'),
      message: t('确定要清空所有缓存吗？此操作不可恢复。'),
      confirmText: t('确认清空'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;

    setMutating(true);
    try {
      const result = await cacheMonitorControllerCleanup({
        body: { level: 'ALL' },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则清空失败仍弹"缓存已清空"（破坏性操作，历史 bug）
      if (result.error) throw result.error;
      showToast(t('缓存已清空'), 'success');
      setResult(null);
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error) || t('清空缓存失败'), 'error');
    } finally {
      setMutating(false);
    }
  }, [showConfirm, showToast, onChanged]);

  return (
    <div className={styles.keyOpsCard}>
      <div className={styles.serviceHeader}>
        <div className={`${styles.serviceIcon} ${styles.serviceIconHealthy}`}>
          <KeyRound size={22} />
        </div>
        <div className={styles.serviceTitleArea}>
          <h3>{t('缓存 Key 操作')}</h3>
          <p>{t('查询、设置与删除缓存条目')}</p>
        </div>
        {isAdmin ? (
          <Tag variant="warning" size="sm">
            {t('管理员模式')}
          </Tag>
        ) : (
          <Tag variant="neutral" size="sm">
            {t('只读')}
          </Tag>
        )}
      </div>

      <div className={styles.keyOpsRow}>
        <Input
          placeholder={t('缓存 Key')}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          className={styles.keyOpsKeyInput}
          wrapperClassName={styles.keyOpsKeyWrapper}
        />
        <Button
          variant="secondary"
          onClick={handleQuery}
          loading={querying}
          icon={Search}
        >
          {t('查询')}
        </Button>
        {isAdmin && (
          <>
            <Button
              variant="secondary"
              onClick={handleDelete}
              loading={mutating}
              icon={Trash2}
            >
              {t('删除')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRefresh}
              loading={mutating}
              icon={RefreshCw}
            >
              {t('刷新')}
            </Button>
          </>
        )}
      </div>

      {result !== null && <pre className={styles.keyOpsResult}>{result}</pre>}

      {isAdmin && (
        <>
          <div className={styles.keyOpsRow}>
            <Input
              placeholder={t('缓存值')}
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              className={styles.keyOpsKeyInput}
              wrapperClassName={styles.keyOpsKeyWrapper}
            />
            <Input
              placeholder={t('TTL（秒）')}
              value={ttlInput}
              onChange={(e) => setTtlInput(e.target.value)}
              className={styles.keyOpsTtlInput}
              wrapperClassName={styles.keyOpsTtlWrapper}
            />
            <Button
              variant="primary"
              onClick={handleSet}
              loading={mutating}
              icon={PlusCircle}
            >
              {t('设置')}
            </Button>
          </div>

          <div className={styles.keyOpsRow}>
            <Input
              placeholder={t('匹配模式（如 user:*）')}
              value={patternInput}
              onChange={(e) => setPatternInput(e.target.value)}
              className={styles.keyOpsKeyInput}
              wrapperClassName={styles.keyOpsKeyWrapper}
            />
            <Button
              variant="secondary"
              onClick={handleDeleteByPattern}
              loading={mutating}
              icon={Ban}
            >
              {t('按模式删除')}
            </Button>
            <Button
              variant="danger"
              onClick={handleClearAll}
              loading={mutating}
              icon={Trash2}
            >
              {t('清空所有缓存')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
