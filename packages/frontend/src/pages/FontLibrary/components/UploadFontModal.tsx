import { useState } from 'react';
import { Upload, X, Palette } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { useNotification } from '../../../contexts/NotificationContext';
import { getErrorMessage } from '../../../utils/errorHandler';
import { formatFileSize } from '../../../components/ui/FileSize';
import { fontsControllerUploadFont } from '@/api-sdk';
import { t } from '@/languages';
import { Z_LAYERS } from '@/constants/layers';

interface UploadFontModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultTarget?: 'backend' | 'frontend' | 'both';
}

const validExtensions = [
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.ttc',
  '.shx',
];

export function UploadFontModal({
  onClose,
  onSuccess,
  defaultTarget = 'both',
}: UploadFontModalProps) {
  const { showToast } = useNotification();
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState<'backend' | 'frontend' | 'both'>(
    defaultTarget
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const validateFile = (selectedFile: File) => {
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    return validExtensions.includes(ext);
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (!validateFile(f)) {
        showToast(t('不支持的文件类型: {name}', { name: f.name }), 'warning');
        continue;
      }
      if (
        files.some(
          (existing) => existing.name === f.name && existing.size === f.size
        )
      ) {
        continue;
      }
      valid.push(f);
    }
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    addFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      showToast(t('请选择文件'), 'warning');
      return;
    }

    setUploading(true);
    try {
      const result = await fontsControllerUploadFont({
        body: { files: files, target: target } as any,
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则上传失败仍弹"成功上传"并刷新列表（历史 bug）
      if (result.error) throw result.error;
      showToast(
        t('成功上传 {count} 个字体文件', { count: String(files.length) }),
        'success'
      );
      onSuccess();
    } catch (error) {
      console.error('上传失败:', error);
      showToast(getErrorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 modal-overlay-theme animate-fade-in"
      style={{ zIndex: Z_LAYERS.MODAL }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-lg modal-theme animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-100)] flex items-center justify-center">
              <Upload size={20} className="text-[var(--primary-600)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('上传字体')}
              </h2>
              <p className="text-sm text-text-tertiary">
                {t('支持 TTF、OTF、WOFF 等格式，可一次选择多个文件')}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            icon={X}
            onClick={onClose}
            tooltip={t('关闭')}
          />
        </div>

        <div className="p-6 space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragOver
                ? 'border-[var(--primary-500)] bg-[var(--primary-50)]'
                : files.length > 0
                  ? 'border-[var(--success)] bg-[var(--success-light)]'
                  : 'border-border-default hover:border-border-strong bg-bg-tertiary/50'
            }`}
          >
            <input
              type="file"
              multiple
              onChange={(e) => handleFileChange(e.target.files)}
              accept=".ttf,.otf,.woff,.woff2,.eot,.ttc,.shx"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {files.length > 0 ? (
              <div className="animate-scale-in text-left">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--success)]/20 flex items-center justify-center">
                  <Palette size={32} className="text-[var(--success)]" />
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${f.size}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-tertiary/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {f.name}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {formatFileSize(f.size)}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="shrink-0 text-[var(--error)]"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bg-tertiary flex items-center justify-center">
                  <div className="relative">
                    <Upload size={32} className="text-text-muted" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--primary-500)] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">
                        T
                      </span>
                    </div>
                  </div>
                </div>
                <h3 className="font-medium text-text-primary mb-1">
                  {t('点击或拖拽文件到此处')}
                </h3>
                <p className="text-sm text-text-tertiary">
                  {t(
                    '支持 TTF、OTF、WOFF、WOFF2、EOT、TTC、SHX，可一次选择多个文件'
                  )}
                </p>
              </div>
            )}
          </div>

          {files.length > 1 && (
            <p className="text-sm text-text-tertiary text-center">
              {t('已选择 {count} 个文件', { count: String(files.length) })}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              {t('上传位置')}
            </label>
            <Select
              value={target}
              onChange={(val) =>
                setTarget(val as 'backend' | 'frontend' | 'both')
              }
              options={[
                { value: 'both', label: t('同时上传（后端和前端）') },
                { value: 'backend', label: t('仅后端（转换程序）') },
                { value: 'frontend', label: t('仅前端（Web 显示）') },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            {t('取消')}
          </Button>
          <Button
            icon={Upload}
            loading={uploading}
            disabled={files.length === 0}
            onClick={handleUpload}
          >
            {uploading
              ? t('上传中...')
              : files.length > 0
                ? t('上传 ({count})', { count: String(files.length) })
                : t('上传')}
          </Button>
        </div>
      </div>
    </div>
  );
}
