import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tag } from '../ui/Tag';
import { File, Folder, Download, Package, Settings2 } from 'lucide-react';
import {
  useBatchDownloadStore,
  BatchFileItem,
} from '@/stores/useBatchDownloadStore';
import { useBatchDownload } from '@/hooks/file-system';
import {
  canExportDownload,
  handleVipFeatureRequiredError,
} from '@/utils/vipFeatureGuide';
import { useMembership } from '@/hooks/useMembership';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';
import { DOWNLOAD_FORMATS, FORMAT_LABELS } from './downloadFormats';
type Format = (typeof DOWNLOAD_FORMATS)[number];

interface FileEntry {
  nodeId: string;
  fileName: string;
  isFolder: boolean;
}

const DWG_VERSIONS = [
  { value: 23, label: 'CAD 2000 (R15)' },
  { value: 25, label: 'CAD 2004 (R16)' },
  { value: 27, label: 'CAD 2007 (R17)' },
  { value: 29, label: 'CAD 2010 (R18)' },
  { value: 33, label: 'CAD 2018 (R22)' },
];

interface BatchDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  libraryType?: 'drawing' | 'block';
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const BatchDownloadDialog: React.FC<BatchDownloadDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  libraryType,
  showToast,
}) => {
  const { dialogMode, dialogFileList, folderDialogNodeId, folderDialogName } =
    useBatchDownloadStore();
  const [selectedFormats, setSelectedFormats] = useState<
    Record<string, Format[]>
  >({});
  const [dwgVersion, setDwgVersion] = useState(23);
  const [pdfWidth, setPdfWidth] = useState('2000');
  const [pdfHeight, setPdfHeight] = useState('2000');
  const [pdfColorPolicy, setPdfColorPolicy] = useState<'mono' | 'color'>(
    'mono'
  );
  const [loading, setLoading] = useState(false);
  const {
    createZipTask,
    createIndividualTask,
    downloadAllItems,
    pollTaskUntilDone,
    syncIndividualTerminal,
  } = useBatchDownload(showToast);
  const isFolder = dialogMode === 'folder';
  const membership = useMembership();
  const { config } = useRuntimeConfig();

  /** 所选格式是否含导出下载方向（dwg/dxf/pdf）——纯 mxweb 下载不受会员门控影响 */
  const hasExportFormat = useMemo(
    () =>
      Object.values(selectedFormats).some((formats) =>
        formats.some((f) => f !== 'mxweb')
      ),
    [selectedFormats]
  );

  const fileEntries: FileEntry[] = useMemo(() => {
    if (isFolder && folderDialogNodeId) {
      return [
        {
          nodeId: folderDialogNodeId,
          fileName: folderDialogName || '',
          isFolder: true,
        },
      ];
    }
    return dialogFileList.map((f) => ({
      nodeId: f.nodeId,
      fileName: f.fileName,
      isFolder: f.isFolder || false,
    }));
  }, [isFolder, folderDialogNodeId, folderDialogName, dialogFileList]);

  useEffect(() => {
    if (isOpen) {
      const defaults: Record<string, Format[]> = {};
      fileEntries.forEach((f) => {
        defaults[f.nodeId] = ['mxweb'];
      });
      setSelectedFormats(defaults);
    }
  }, [isOpen]);

  const globalFormats = useMemo(() => {
    const formatSet = new Set<Format>();
    Object.values(selectedFormats).forEach((formats) => {
      formats.forEach((f) => formatSet.add(f));
    });
    if (formatSet.size === 0) return [] as Format[];
    return DOWNLOAD_FORMATS.filter((f) => formatSet.has(f));
  }, [selectedFormats]);

  const hasDwgOrDxf =
    globalFormats.includes('dwg') || globalFormats.includes('dxf');
  const hasPdf = globalFormats.includes('pdf');

  const toggleGlobalFormat = (format: Format) => {
    const isSelected = globalFormats.includes(format);
    const next: Record<string, Format[]> = {};
    fileEntries.forEach((f) => {
      const current = selectedFormats[f.nodeId] || [];
      next[f.nodeId] = isSelected
        ? current.filter((x) => x !== format)
        : [...current, format];
    });
    setSelectedFormats(next);
  };

  const toggleFileFormat = (nodeId: string, format: Format) => {
    setSelectedFormats((prev) => {
      const current = prev[nodeId] || [];
      return {
        ...prev,
        [nodeId]: current.includes(format)
          ? current.filter((f) => f !== format)
          : [...current, format],
      };
    });
  };

  const hasSelection = Object.values(selectedFormats).some((f) => f.length > 0);

  const resolveAndSubmit = async () => {
    if (!hasSelection) {
      showToast?.(t('请至少选择一个文件格式'), 'warning');
      return;
    }
    // 导出下载方向（dwg/dxf/pdf）会员预检：非 VIP 且开关未开放时弹购买引导，不发请求
    if (
      hasExportFormat &&
      !canExportDownload(!!membership?.isVip, config.freeExportDownloadEnabled)
    ) {
      await handleVipFeatureRequiredError();
      return;
    }
    setLoading(true);
    try {
      const batchItems: BatchFileItem[] = fileEntries
        .filter((f) => (selectedFormats[f.nodeId] || []).length > 0)
        .map((f) => {
          const formats = selectedFormats[f.nodeId] || [];
          return {
            nodeId: f.nodeId,
            fileName: f.fileName,
            formats,
            dwgVersion,
            width: pdfWidth,
            height: pdfHeight,
            colorPolicy: pdfColorPolicy,
          };
        });

      await createZipTask(batchItems, projectId, libraryType);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  /** individual 任务轮询取消标志：用户关闭 dialog 时置位（任务后台继续，可从下载管理重下） */
  const pollCancelRef = useRef(false);
  /** 当前正在轮询的 individual 任务 id（关闭 dialog 时做终态兜底回写，防"等待中"残留） */
  const individualTaskIdRef = useRef<string | null>(null);
  const [individualProgress, setIndividualProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  const handleClose = () => {
    pollCancelRef.current = true;
    // 中途关闭：individual 任务无 SSE，轮询已停，store 停中间态。
    // 查一次进度，若后端已终态则回写并移除，避免"等待中"残留（症状 2/3 复发）
    if (individualTaskIdRef.current) {
      void syncIndividualTerminal(individualTaskIdRef.current);
      individualTaskIdRef.current = null;
    }
    onClose();
  };

  const handleSubmitIndividual = async () => {
    if (!hasSelection || individualProgress) return;
    // 导出下载方向（dwg/dxf/pdf）会员预检：非 VIP 且开关未开放时弹购买引导，不发请求
    if (
      hasExportFormat &&
      !canExportDownload(!!membership?.isVip, config.freeExportDownloadEnabled)
    ) {
      await handleVipFeatureRequiredError();
      return;
    }

    const fileItems: FileEntry[] = [];
    const folderItems: FileEntry[] = [];

    for (const entry of fileEntries) {
      const formats = selectedFormats[entry.nodeId] || [];
      if (formats.length === 0) continue;
      if (entry.isFolder) {
        folderItems.push(entry);
      } else {
        fileItems.push(entry);
      }
    }

    // 文件夹仍走异步 ZIP 打包（立即返回，进度见下载管理）
    if (folderItems.length > 0) {
      const folderBatchItems: BatchFileItem[] = folderItems.map((f) => ({
        nodeId: f.nodeId,
        fileName: f.fileName,
        formats: selectedFormats[f.nodeId] || [],
        dwgVersion,
        width: pdfWidth,
        height: pdfHeight,
        colorPolicy: pdfColorPolicy,
      }));
      await createZipTask(folderBatchItems, projectId, libraryType);
    }

    // 文件走 individual 任务：服务端并行转换（不再阻塞单个 HTTP 请求，规避反向代理 524 超时），
    // 完成后按 index 顺序逐个触发浏览器下载，保持"一个一个下载"的体验
    if (fileItems.length > 0) {
      const batchItems: BatchFileItem[] = [];
      for (const entry of fileItems) {
        const formats = selectedFormats[entry.nodeId] || [];
        for (const format of formats) {
          batchItems.push({
            nodeId: entry.nodeId,
            fileName: entry.fileName,
            formats: [format],
            dwgVersion,
            width: pdfWidth,
            height: pdfHeight,
            colorPolicy: pdfColorPolicy,
          });
        }
      }

      const created = await createIndividualTask(
        batchItems,
        projectId,
        libraryType
      );
      if (created) {
        pollCancelRef.current = false;
        individualTaskIdRef.current = created.taskId;
        setIndividualProgress({ completed: 0, total: batchItems.length });
        const done = await pollTaskUntilDone(
          created.taskId,
          (completed, total) => setIndividualProgress({ completed, total }),
          () => pollCancelRef.current,
          false // 保留任务记录在 Download Tab 中，用户可看到下载历史
        );
        setIndividualProgress(null);
        if (!done) return; // 用户中途关闭：handleClose 已做终态兜底回写
        individualTaskIdRef.current = null; // 正常完成：任务已移除，无需再兜底
        if (done.status === 'COMPLETED') {
          await downloadAllItems({
            taskId: created.taskId,
            status: 'COMPLETED',
            mode: 'individual',
            itemNames: created.itemNames,
            totalCount: batchItems.length,
            completedCount: batchItems.length,
            errorCount: 0,
            createdAt: new Date().toISOString(),
          });
        } else {
          showToast?.(t('逐个下载失败，请稍后重试'), 'error');
        }
      }
    }

    handleClose();
  };

  const title = isFolder ? (
    <span className="flex items-center gap-2">
      <Folder size={16} style={{ color: 'var(--primary-500)' }} />
      {t('下载')} {folderDialogName} {t('文件夹')}
    </span>
  ) : (
    t('批量下载')
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="lg"
      zIndex={Z_LAYERS.MODAL}
      footer={
        <div className="flex flex-col sm:flex-row gap-2 w-full justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            {t('取消')}
          </Button>
          {!isFolder && (
            <Button
              size="sm"
              onClick={handleSubmitIndividual}
              disabled={!hasSelection || loading || !!individualProgress}
              loading={!!individualProgress}
              variant="secondary"
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-1" />
              {individualProgress
                ? `${t('转换中')} ${individualProgress.completed}/${individualProgress.total}`
                : t('逐个下载')}
            </Button>
          )}
          <Button
            size="sm"
            onClick={resolveAndSubmit}
            disabled={!hasSelection}
            loading={loading}
            className="w-full sm:w-auto"
          >
            <Package className="w-4 h-4 mr-1" />
            {t('打包 ZIP')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('选择格式')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DOWNLOAD_FORMATS.map((format) => (
              <Tag
                key={format}
                size="xs"
                onClick={() => toggleGlobalFormat(format)}
                variant={globalFormats.includes(format) ? 'primary' : 'neutral'}
              >
                {FORMAT_LABELS[format]}
              </Tag>
            ))}
          </div>
        </div>

        {(hasDwgOrDxf || hasPdf) && (
          <div
            className="rounded-lg p-3"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Settings2 size={14} style={{ color: 'var(--text-tertiary)' }} />
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('格式参数')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {hasDwgOrDxf && (
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {t('图纸版本')}
                  </label>
                  <select
                    value={dwgVersion}
                    onChange={(e) => setDwgVersion(Number(e.target.value))}
                    className="text-xs rounded-md px-2 py-1.5 w-full"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {DWG_VERSIONS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {hasPdf && (
                <>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('PDF 宽度')}
                    </label>
                    <Input
                      type="number"
                      value={pdfWidth}
                      onChange={(e) => setPdfWidth(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('PDF 高度')}
                    </label>
                    <Input
                      type="number"
                      value={pdfHeight}
                      onChange={(e) => setPdfHeight(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('颜色策略')}
                    </label>
                    <select
                      value={pdfColorPolicy}
                      onChange={(e) =>
                        setPdfColorPolicy(e.target.value as 'mono' | 'color')
                      }
                      className="text-xs rounded-md px-2 py-1.5 w-full"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="mono">{t('黑白')}</option>
                      <option value="color">{t('彩色')}</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div
          className="border-t"
          style={{ borderColor: 'var(--border-default)' }}
        />

        <div className="max-h-60 sm:max-h-80 overflow-y-auto space-y-2 touch-pan-y">
          {fileEntries.map((item) => {
            const fileFormats = selectedFormats[item.nodeId] || [];
            return (
              <div
                key={item.nodeId}
                className="rounded-lg p-2 sm:p-2.5"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded"
                    style={{
                      background: item.isFolder
                        ? 'var(--primary-100)'
                        : 'var(--bg-elevated)',
                    }}
                  >
                    {item.isFolder ? (
                      <Folder
                        size={14}
                        style={{ color: 'var(--primary-500)' }}
                      />
                    ) : (
                      <File
                        size={12}
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                    )}
                  </span>
                  <span
                    className="text-xs sm:text-sm truncate flex-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.fileName}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 ml-7">
                  {DOWNLOAD_FORMATS.map((format) => (
                    <Tag
                      key={format}
                      size="xs"
                      onClick={() => toggleFileFormat(item.nodeId, format)}
                      variant={
                        fileFormats.includes(format) ? 'primary' : 'neutral'
                      }
                    >
                      {FORMAT_LABELS[format]}
                    </Tag>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {!hasSelection && fileEntries.length > 0 && (
          <p
            className="text-xs sm:text-sm text-center"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {t('请至少选择一个文件格式')}
          </p>
        )}
      </div>
    </Modal>
  );
};
