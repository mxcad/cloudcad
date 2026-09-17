import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Copy,
  Check,
  Trash2,
  Loader2,
  Plus,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useNotification } from '../../contexts/NotificationContext';
import { useCopy } from '../../hooks/useCopy';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { getErrorMessage } from '../../utils/errorHandler';
import {
  shareControllerCreateShare,
  shareControllerRevokeShare,
  shareControllerListShares,
  shareControllerGetFileShares,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { ConfirmRevokeModal } from './ConfirmRevokeModal';
import { ShareLinkBar } from '@/components/common/ShareLinkBar';
import {
  ExpirationOption,
  getExpirationLabels,
  EXPIRATION_VALUES,
  formatExpiryDate,
} from '@/constants/share';
import { t } from '@/languages';
import './ShareManageDialog.css';

interface ShareListItem {
  token: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string;
  fileName?: string;
  files?: Array<{ fileId: string; fileName: string }>;
  readOnly?: boolean;
}

interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
}

interface BatchShareResult {
  fileName: string;
  token: string;
  url: string;
  expiresAt: string | null;
  success: boolean;
  error?: string;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  fileId: propFileId,
  fileName,
  files: propFiles,
  readOnly = false,
}) => {
  const { currentFileId } = useCADEditorStore();
  const { showToast } = useNotification();

  // 分享管理页通过 files 传入单个文件时没有 fileId/fileName prop，
  // 此时不能回退到编辑器的 currentFileId（管理页未打开图纸时为 null）
  const resolvedFileId =
    propFileId ||
    (propFiles && propFiles.length === 1 ? propFiles[0]?.fileId : undefined) ||
    currentFileId;
  const effectiveFileName =
    fileName ||
    (propFiles && propFiles.length === 1 ? propFiles[0]?.fileName : '') ||
    '';
  const effectiveFiles = useMemo(
    () =>
      propFiles && propFiles.length > 0
        ? propFiles
        : resolvedFileId
          ? [{ fileId: resolvedFileId, fileName: effectiveFileName }]
          : [],
    [propFiles, resolvedFileId, effectiveFileName]
  );
  const isBatch = effectiveFiles.length > 1;

  const [expiration, setExpiration] = useState<ExpirationOption>('7d');
  const [customDays, setCustomDays] = useState(1);

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [batchResults, setBatchResults] = useState<BatchShareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const prevFileIdRef = useRef<string | null>(null);

  const [items, setItems] = useState<ShareListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 列表行的复制反馈（toast + 行内标记）；主链接与批量结果由 ShareLinkBar 自管
  const {
    copiedMarker: copiedToken,
    copy: copyShareItem,
    reset: resetShareItemCopy,
  } = useCopy({
    successMessage: t('链接已复制'),
    failMessage: t('复制失败'),
  });

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  type ViewMode = 'list' | 'create' | 'created';
  const [view, setView] = useState<ViewMode>('list');

  const fetchShares = useCallback(async () => {
    if (!resolvedFileId) return;
    setListLoading(true);
    setListError(null);
    try {
      if (readOnly) {
        const response = await shareControllerGetFileShares({
          path: { fileId: resolvedFileId },
        });
        if (response.error) {
          setListError(
            getErrorMessage(response.error) || t('获取分享链接失败')
          );
          return;
        }
        const fetched = (response.data as ShareListItem[]) ?? [];
        setItems(fetched);
      } else {
        const result = await shareControllerListShares({
          query: { fileId: resolvedFileId, page: 1, pageSize: 50 },
        });
        if (result.error) {
          setListError(getErrorMessage(result.error) || t('获取分享列表失败'));
          return;
        }
        const data = result.data as { items: ShareListItemDto[] } | undefined;
        const raw = data?.items ?? [];
        const mapped: ShareListItem[] = raw.map((item) => ({
          token: item.token,
          url: item.url,
          expiresAt: (item as Record<string, unknown>).expiresAt as
            string | null,
          createdAt: (item as Record<string, unknown>).createdAt as string,
          createdBy: '',
        }));
        setItems(mapped);
        if (mapped.length === 0 && view === 'list') {
          setView('create');
        }
      }
    } catch (err) {
      setListError(getErrorMessage(err) || t('获取分享列表失败'));
    } finally {
      setListLoading(false);
    }
  }, [resolvedFileId, readOnly, view]);

  useEffect(() => {
    if (!isOpen) {
      setShareInfo(null);
      setBatchResults([]);
      prevFileIdRef.current = null;
      setExpiration('7d');
      setCustomDays(1);
      setItems([]);
      setListError(null);
      resetShareItemCopy();
      setView('list');
      return;
    }

    if (!effectiveFiles.length) return;

    if (isBatch) {
      // 批量模式直接进入创建视图（列表视图在批量模式下无内容，缺此切换会白屏）
      if (view !== 'create') {
        setView('create');
      }
      return;
    }

    if (resolvedFileId && prevFileIdRef.current !== resolvedFileId) {
      prevFileIdRef.current = resolvedFileId;
      setShareInfo(null);
      setView('list');
    }
    fetchShares();
  }, [
    isOpen,
    effectiveFiles,
    isBatch,
    resolvedFileId,
    fetchShares,
    view,
    resetShareItemCopy,
  ]);

  const createShare = useCallback(async () => {
    if (!resolvedFileId) {
      showToast(t('请先打开图纸'), 'error');
      return;
    }

    let expiresIn: number | undefined;
    if (expiration === 'never' || expiration === 'immediate') {
      expiresIn = undefined;
    } else if (expiration === 'custom') {
      expiresIn = customDays * 86400;
    } else {
      expiresIn = EXPIRATION_VALUES[expiration];
    }

    setLoading(true);
    try {
      const result = await shareControllerCreateShare({
        body: {
          fileId: resolvedFileId,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
        },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      const raw = result.data as Record<string, unknown> | undefined;
      if (!raw || typeof raw.token !== 'string') {
        showToast(t('创建分享链接失败'), 'error');
        return;
      }
      const data: ShareInfo = {
        token: raw.token,
        url: raw.url as string,
        expiresAt: raw.expiresAt
          ? typeof raw.expiresAt === 'string'
            ? raw.expiresAt
            : new Date(raw.expiresAt as number | string).toISOString()
          : null,
      };
      setShareInfo(data);
      setView('created');
      fetchShares();
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [resolvedFileId, expiration, customDays, showToast, fetchShares]);

  const createBatchShares = useCallback(async () => {
    let expiresIn: number | undefined;
    if (expiration === 'never' || expiration === 'immediate') {
      expiresIn = undefined;
    } else if (expiration === 'custom') {
      expiresIn = customDays * 86400;
    } else {
      expiresIn = EXPIRATION_VALUES[expiration];
    }

    setLoading(true);
    const results: BatchShareResult[] = [];

    for (const file of effectiveFiles) {
      try {
        const result = await shareControllerCreateShare({
          body: {
            fileId: file.fileId,
            ...(expiresIn !== undefined ? { expiresIn } : {}),
          },
        });
        if (result.error) {
          results.push({
            fileName: file.fileName,
            token: '',
            url: '',
            expiresAt: null,
            success: false,
            error: getErrorMessage(result.error),
          });
        } else {
          const raw = result.data as Record<string, unknown> | undefined;
          if (raw && typeof raw.token === 'string') {
            results.push({
              fileName: file.fileName,
              token: raw.token,
              url: raw.url as string,
              expiresAt: raw.expiresAt
                ? typeof raw.expiresAt === 'string'
                  ? raw.expiresAt
                  : new Date(raw.expiresAt as number | string).toISOString()
                : null,
              success: true,
            });
          } else {
            results.push({
              fileName: file.fileName,
              token: '',
              url: '',
              expiresAt: null,
              success: false,
              error: t('创建分享链接失败'),
            });
          }
        }
      } catch (error) {
        results.push({
          fileName: file.fileName,
          token: '',
          url: '',
          expiresAt: null,
          success: false,
          error: getErrorMessage(error),
        });
      }
      // 实时进度：每完成一个文件更新一次，loading 视图显示 (done/total)
      setBatchResults([...results]);
    }

    setView('created');
    setLoading(false);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    showToast(
      `${t('已生成 {count} 个分享链接', { count: String(successCount) })}${failCount > 0 ? `，${failCount} ${t('个失败')}` : ''}`,
      failCount > 0 ? 'warning' : 'success'
    );

    // 全部成功则自动关闭弹框（结果可在分享管理列表查看/复制）；
    // 部分失败时停留结果视图，供用户排查失败项
    if (failCount === 0) {
      onClose();
    }
  }, [effectiveFiles, expiration, customDays, showToast, onClose]);

  const confirmRevokeCurrent = () => {
    if (!shareInfo) return;
    setRevokeTarget(shareInfo.token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeCurrent = async () => {
    if (!shareInfo) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: shareInfo.token },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setShareInfo(null);
      setView('list');
      fetchShares();
      showToast(t('分享已撤销'), 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  };

  const confirmRevokeItem = (token: string) => {
    setRevokeTarget(token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeItem = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: revokeTarget },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== revokeTarget));
      showToast(t('分享已撤销'), 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyItem = async (linkUrl: string, token?: string) => {
    await copyShareItem(
      `${window.location.origin}${linkUrl}`,
      token ?? linkUrl
    );
  };

  const fullUrl = shareInfo ? `${window.location.origin}${shareInfo.url}` : '';

  const renderListView = () => (
    <div className="share-dialog-body">
      {!readOnly && !isBatch && (
        <div className="share-dialog-toolbar">
          {effectiveFileName && (
            <span className="share-dialog-toolbar-filename">
              <FileText size={14} />
              {effectiveFileName}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setExpiration('7d');
              setCustomDays(1);
              setView('create');
            }}
          >
            <Plus size={14} />
            {t('添加分享')}
          </Button>
        </div>
      )}

      {items.length > 0 && !isBatch && (
        <p className="share-dialog-hint">
          {t('以下列表为该图纸已创建的分享链接')}
        </p>
      )}

      {listLoading ? (
        <div className="share-dialog-loading">
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: 'var(--primary-500)' }}
          />
        </div>
      ) : listError ? (
        <div className="share-dialog-error">
          <p>{listError}</p>
          <Button variant="secondary" size="sm" onClick={fetchShares}>
            {t('重试')}
          </Button>
        </div>
      ) : items.length === 0 && !isBatch ? (
        <div className="share-dialog-empty">
          <p className="share-dialog-empty-title">
            {readOnly
              ? t('当前没有可复制的分享链接')
              : t('还没有分享过这个文件')}
          </p>
          {!readOnly && (
            <Button
              variant="primary"
              size="sm"
              style={{ marginTop: '12px' }}
              onClick={() => {
                setExpiration('7d');
                setCustomDays(1);
                setView('create');
              }}
            >
              {t('添加分享')}
            </Button>
          )}
        </div>
      ) : items.length > 0 ? (
        <div className="share-dialog-table-container">
          <table className="share-dialog-table">
            <thead>
              <tr>
                <th>{t('链接')}</th>
                <th>{t('有效期')}</th>
                <th>{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.token}>
                  <td>
                    <div className="share-dialog-link-cell">
                      <span
                        className="share-dialog-link-text"
                        title={`${window.location.origin}${item.url}`}
                      >
                        {item.url}
                      </span>
                      <button
                        onClick={() => handleCopyItem(item.url, item.token)}
                        className="share-dialog-copy-btn"
                        title={t('复制链接')}
                      >
                        {copiedToken === item.token ? (
                          <Check size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="share-dialog-td-meta">
                    {formatExpiryDate(item.expiresAt)}
                  </td>
                  <td>
                    <div className="share-dialog-action-cell">
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={Trash2}
                          onClick={() => confirmRevokeItem(item.token)}
                          tooltip={t('撤销分享')}
                          style={{ color: 'var(--error)' }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );

  const renderCreateView = () => {
    if (isBatch) {
      return (
        <div className="share-dialog-create-body">
          <div
            style={{
              maxHeight: '180px',
              overflowY: 'auto',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                marginBottom: '6px',
              }}
            >
              {t('已选择 {count} 个图纸文件', {
                count: String(effectiveFiles.length),
              })}
            </div>
            {effectiveFiles.map((f, i) => (
              <div
                key={f.fileId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 0',
                }}
              >
                <FileText
                  size={13}
                  style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i + 1}. {f.fileName}
                </span>
              </div>
            ))}
          </div>

          <div className="share-dialog-create-section">
            <span className="share-dialog-create-label">{t('有效期')}</span>
            <div className="share-dialog-expiration-group">
              {(Object.keys(getExpirationLabels()) as ExpirationOption[]).map(
                (key) => (
                  <Button
                    key={key}
                    variant={expiration === key ? 'primary' : 'outline'}
                    size="xs"
                    onClick={() => setExpiration(key)}
                  >
                    {getExpirationLabels()[key]}
                  </Button>
                )
              )}
            </div>
            {expiration === 'custom' && (
              <div className="share-dialog-custom-days">
                <div style={{ width: '60px' }}>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    size="sm"
                    value={customDays}
                    onChange={(e) =>
                      setCustomDays(
                        Math.max(
                          1,
                          Math.min(365, parseInt(e.target.value) || 1)
                        )
                      )
                    }
                  />
                </div>
                <span className="share-dialog-custom-label">
                  {t('天后过期')}
                </span>
              </div>
            )}
          </div>

          <Button
            variant="primary"
            onClick={createBatchShares}
            className="share-dialog-action-btn"
          >
            <Plus size={14} />
            {t('批量生成分享链接')}
          </Button>
        </div>
      );
    }

    return (
      <div className="share-dialog-create-body">
        <div className="share-dialog-create-section">
          <span className="share-dialog-create-label">{t('有效期')}</span>
          <div className="share-dialog-expiration-group">
            {(Object.keys(getExpirationLabels()) as ExpirationOption[]).map(
              (key) => (
                <Button
                  key={key}
                  variant={expiration === key ? 'primary' : 'outline'}
                  size="xs"
                  onClick={() => setExpiration(key)}
                >
                  {getExpirationLabels()[key]}
                </Button>
              )
            )}
          </div>
          {expiration === 'custom' && (
            <div className="share-dialog-custom-days">
              <div style={{ width: '60px' }}>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  size="sm"
                  value={customDays}
                  onChange={(e) =>
                    setCustomDays(
                      Math.max(1, Math.min(365, parseInt(e.target.value) || 1))
                    )
                  }
                />
              </div>
              <span className="share-dialog-custom-label">{t('天后过期')}</span>
            </div>
          )}
        </div>

        <Button
          variant="primary"
          onClick={createShare}
          className="share-dialog-action-btn"
        >
          {t('生成分享链接')}
        </Button>

        {items.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setView('list')}
            className="share-dialog-action-btn"
          >
            <ArrowLeft size={14} />
            {t('返回分享列表')}
          </Button>
        )}
      </div>
    );
  };

  const renderCreatedView = () => {
    if (isBatch) {
      return (
        <div className="share-dialog-created-body">
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              marginBottom: '12px',
              color: 'var(--text-primary)',
            }}
          >
            {t('已生成 {count} 个分享链接', {
              count: String(batchResults.filter((r) => r.success).length),
            })}
          </div>

          <div
            style={{
              maxHeight: '360px',
              overflowY: 'auto',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {batchResults.map((result, index) => (
              <div
                key={index}
                style={{
                  borderBottom:
                    index < batchResults.length - 1
                      ? '1px solid var(--border-default)'
                      : 'none',
                }}
              >
                {result.success ? (
                  <div style={{ padding: '10px 12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      <FileText
                        size={13}
                        style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {result.fileName}
                      </span>
                    </div>
                    <ShareLinkBar
                      url={`${window.location.origin}${result.url}`}
                      label={t('复制分享链接')}
                      showHint={false}
                      copyOptions={{
                        successMessage: t('链接已复制'),
                        failMessage: t('复制失败'),
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', color: 'var(--error)' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText size={13} style={{ flexShrink: 0 }} />
                      <span
                        style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}
                      >
                        {result.fileName}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        marginTop: '4px',
                        paddingLeft: '19px',
                      }}
                    >
                      {result.error || t('创建失败')}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            className="share-dialog-created-actions"
            style={{ marginTop: '12px' }}
          >
            <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
              {t('完成')}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="share-dialog-created-body">
        <div className="share-dialog-qr-container">
          <div className="share-dialog-qr-box">
            <QRCodeSVG
              value={fullUrl}
              size={160}
              level="M"
              bgColor="transparent"
              fgColor="var(--text-primary)"
            />
          </div>
        </div>

        <ShareLinkBar url={fullUrl} label={t('复制分享链接')} />

        {shareInfo!.expiresAt && (
          <span className="share-dialog-expiry-hint">
            {t('有效期至: {date}').replace(
              '{date}',
              new Date(shareInfo!.expiresAt).toLocaleString()
            )}
          </span>
        )}

        <div className="share-dialog-created-actions">
          <Button
            variant="secondary"
            onClick={confirmRevokeCurrent}
            disabled={revoking}
            style={{ flex: 1 }}
          >
            {revoking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {t('撤销分享')}
          </Button>
          <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
            {t('完成')}
          </Button>
        </div>
      </div>
    );
  };

  const renderLoadingView = () => {
    if (isBatch) {
      const doneCount = batchResults.length;
      const totalCount = effectiveFiles.length;
      return (
        <div className="share-dialog-loading-view">
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: 'var(--primary-500)' }}
          />
          <span className="share-dialog-loading-text">
            {t('正在生成分享链接... ({current}/{total})', {
              current: String(doneCount),
              total: String(totalCount),
            })}
          </span>
        </div>
      );
    }
    return (
      <div className="share-dialog-loading-view">
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: 'var(--primary-500)' }}
        />
        <span className="share-dialog-loading-text">
          {t('正在生成分享链接...')}
        </span>
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          readOnly
            ? t('复制分享链接')
            : isBatch
              ? t('批量分享图纸')
              : t('分享图纸')
        }
        size={isBatch ? 'md' : readOnly ? 'md' : view === 'list' ? 'md' : 'sm'}
      >
        {readOnly ? (
          renderListView()
        ) : isBatch ? (
          <>
            {view === 'create' && !loading && renderCreateView()}
            {view === 'create' && loading && renderLoadingView()}
            {view === 'created' && renderCreatedView()}
          </>
        ) : (
          <>
            {view === 'list' && renderListView()}
            {view === 'create' && !loading && renderCreateView()}
            {view === 'create' && loading && renderLoadingView()}
            {view === 'created' && renderCreatedView()}
          </>
        )}
      </Modal>

      <ConfirmRevokeModal
        isOpen={showRevokeConfirm}
        onClose={() => {
          setShowRevokeConfirm(false);
          setRevokeTarget(null);
        }}
        onConfirm={handleRevokeItem}
        loading={revoking}
      />
    </>
  );
};

export default ShareDialog;
