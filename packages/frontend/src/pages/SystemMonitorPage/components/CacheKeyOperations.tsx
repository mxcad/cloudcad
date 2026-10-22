import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  cacheMonitorControllerGetKeyCatalog,
  cacheMonitorControllerGetValue,
  cacheMonitorControllerRefresh,
  cacheMonitorControllerSetValue,
} from '@/api-sdk';
import type { CacheKeyCatalogEntryDto, CacheOperationDto } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { Autocomplete, Button, Input, Tag } from '@/components/ui';
import type { AutocompleteItem } from '@/components/ui';
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
 * 查询为读操作（SYSTEM_MONITOR 可见）；设置/删除/按模式删除/刷新/重置仅 SYSTEM_ADMIN 可见，
 * 写操作带确认 + toast
 *
 * Key 与匹配模式均为后端目录（GET /cache-monitor/key-catalog）驱动的自动筛选：
 * 管理员不再需要知道实际存在的键前缀，也不会再对着一个不存在的 `user:*` 示例猜。
 * 目录里 scope=infra 的条目（会话、限流、IP 黑名单、缓存版本）只展示、不填充——
 * 它们与业务缓存同库，删掉就是全体登出/限流失效，页面不给这个入口。
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
  const [catalog, setCatalog] = useState<CacheKeyCatalogEntryDto[]>([]);
  const [openMenu, setOpenMenu] = useState<'key' | 'pattern' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    cacheMonitorControllerGetKeyCatalog()
      .then((res) => {
        if (!cancelled && res.data) setCatalog(res.data.entries);
      })
      .catch(() => {
        // 目录是增强项：拉取失败时输入框退回纯手输，不阻塞查询/删除
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  // 同一时间只允许一个下拉：聚焦哪个输入框就打开哪个，另一个随 state 收敛关闭
  const openNow = (menu: 'key' | 'pattern') => () => setOpenMenu(menu);
  // blur 延迟收起，避免点候选项时先 blur 把下拉关掉。延迟收起按「发起 blur 的
  // 菜单」判定——原先共用一把计时器且无条件关闭，后聚焦的 openNow 会把先前那次
  // 收起定时 clearTimeout 掉，两个下拉从此同时展开、先聚焦的永不收起
  const closeLater = (menu: 'key' | 'pattern') => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpenMenu((current) => (current === menu ? null : current));
    }, 150);
  };

  const filterEntries = (query: string): CacheKeyCatalogEntryDto[] => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((entry) =>
      [entry.pattern, entry.name, entry.example, entry.description]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  };

  const keyItems: AutocompleteItem[] = filterEntries(keyInput).map((entry) => ({
    key: entry.id,
    label: entry.pattern,
    entry,
  }));
  const patternItems: AutocompleteItem[] = filterEntries(patternInput).map(
    (entry) => ({
      key: entry.id,
      label: entry.pattern,
      entry,
      restricted: entry.scope === 'infra',
    })
  );

  const renderCatalogItem = (item: AutocompleteItem) => {
    const entry = item.entry as CacheKeyCatalogEntryDto;
    return (
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code
              className="truncate font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              {entry.pattern}
            </code>
            {item.restricted ? (
              <Tag variant="warning" size="sm">
                {t('不可删除')}
              </Tag>
            ) : (
              <Tag variant="neutral" size="sm">
                {t('可删除')}
              </Tag>
            )}
          </div>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {entry.name}：{entry.description}
          </p>
        </div>
      </div>
    );
  };

  const handleQuery = useCallback(async () => {
    const key = keyInput.trim();
    if (!key) {
      showToast(t('请输入缓存 Key'), 'warning');
      return;
    }
    setQuerying(true);
    try {
      const result = await cacheMonitorControllerGetValue({
        throwOnError: true,
        query: { key },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 提示真实原因
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
        throwOnError: true,
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
        throwOnError: true,
        query: { key },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
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
        throwOnError: true,
        query: { pattern },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
      // truncated=true 表示命中单次删除条数上限、还有键没删干净，不能报「成功」
      const data = result.data as { truncated?: boolean } | undefined;
      if (data?.truncated) {
        showToast(
          t('已删除部分缓存，但已达单次删除条数上限，可能仍有匹配键未删除'),
          'warning'
        );
      } else {
        showToast(t('按模式删除成功'), 'success');
      }
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
        throwOnError: true,
        body: { key },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出
      // （此前失败时 data 为 undefined 被误判为"缓存不存在"）
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
      title: t('重置监控统计'),
      message: t(
        '只重置后端进程内的 L1 内存缓存与命中统计。不会删除 Redis 中的数据，会话、限流计数、IP 黑名单与缓存版本一律不动，不影响任何用户的登录状态。需要清 Redis 请用「按模式删除」。'
      ),
      confirmText: t('确认重置'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;

    setMutating(true);
    try {
      const result = await cacheMonitorControllerCleanup({
        throwOnError: true,
        body: { level: 'ALL' },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则清空失败仍弹"缓存已清空"（破坏性操作，历史 bug）
      showToast(t('已重置 L1 内存缓存与监控统计'), 'success');
      setResult(null);
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error) || t('重置监控统计失败'), 'error');
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

      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        {t('L1 在后端进程内存，L2 在 Redis；按模式删除只作用于 Redis')}
      </p>

      <div className={styles.keyOpsRow}>
        <Autocomplete
          value={keyInput}
          onChange={(value) => setKeyInput(value)}
          items={keyItems}
          open={openMenu === 'key' && keyItems.length > 0}
          renderItem={renderCatalogItem}
          onSelectItem={(item) => {
            const entry = item.entry as CacheKeyCatalogEntryDto;
            setKeyInput(entry.example);
            setOpenMenu(null);
          }}
          placeholder={t('缓存 Key（点击选择或输入筛选）')}
          onFocus={openNow('key')}
          onBlur={closeLater('key')}
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
            <Autocomplete
              value={patternInput}
              onChange={(value) => setPatternInput(value)}
              items={patternItems}
              open={openMenu === 'pattern' && patternItems.length > 0}
              renderItem={renderCatalogItem}
              onSelectItem={(item) => {
                const entry = item.entry as CacheKeyCatalogEntryDto;
                if (entry.scope === 'infra') {
                  showToast(
                    `${t('该键属于基础设施，不允许删除')}：${entry.removalEffect}`,
                    'warning'
                  );
                  return;
                }
                setPatternInput(entry.pattern);
                setOpenMenu(null);
              }}
              placeholder={t('匹配模式（点击选择或输入筛选）')}
              onFocus={openNow('pattern')}
              onBlur={closeLater('pattern')}
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
              {t('重置监控统计')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
