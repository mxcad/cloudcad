import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileNameText } from '../ui/TruncateText';
import { ExternalReferenceFile } from '../../types/filesystem';
import { CheckCircle } from 'lucide-react';
import { XCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Upload } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';

interface ExternalReferenceModalProps {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 外部参照文件列表 */
  files: ExternalReferenceFile[];
  /** 是否正在上传 */
  loading: boolean;
  /** 选择文件并自动上传回调 */
  onSelectAndUpload: () => void;
  /** 完成上传回调 */
  onComplete: () => void;
  /** 跳过上传回调 */
  onSkip: () => void;
  /** 关闭模态框回调 */
  onClose: () => void;
}

/**
 * 外部参照上传模态框组件
 *
 * 功能：
 * - 显示缺失的外部参照列表
 * - 显示上传进度和状态
 * - 提供文件选择和上传操作
 * - 支持跳过上传（可选功能）
 */
export const ExternalReferenceModal: React.FC<ExternalReferenceModalProps> = ({
  isOpen,
  files,
  loading,
  onSelectAndUpload,
  onComplete,
  onSkip,
  onClose,
}) => {
  const allSuccess =
    files.length > 0 && files.every((f) => f.uploadState === 'success');
  const hasUploading = files.some((f) => f.uploadState === 'uploading');
  const hasFailures = files.some((f) => f.uploadState === 'fail');
  const missingCount = files.filter(
    (f) => !f.exists && f.uploadState === 'notSelected'
  ).length;

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const getStatusIcon = (file: ExternalReferenceFile) => {
    // 优先显示上传状态
    if (file.uploadState === 'success') {
      return <CheckCircle size={16} style={{ color: 'var(--success)' }} />;
    }
    if (file.uploadState === 'fail') {
      return <XCircle size={16} style={{ color: 'var(--error)' }} />;
    }
    if (file.uploadState === 'uploading') {
      return <Loader2 size={16} style={{ color: 'var(--info)' }} className="animate-spin" />;
    }

    // 如果文件已存在，显示绿色对勾
    if (file.exists) {
      return <CheckCircle size={16} style={{ color: 'var(--success)' }} />;
    }

    // 默认状态
    return null;
  };

  const getStatusColor = (file: ExternalReferenceFile) => {
    // 优先显示上传状态
    if (file.uploadState === 'success') {
      return 'text-green-500';
    }
    if (file.uploadState === 'fail') {
      return 'text-red-500';
    }
    if (file.uploadState === 'uploading') {
      return 'text-blue-500';
    }

    // 如果文件已存在，显示绿色
    if (file.exists) {
      return 'text-green-500';
    }

    // 默认状态
    return 'text-slate-400';
  };

  const getStatusText = (file: ExternalReferenceFile) => {
    // 优先显示上传状态
    if (file.uploadState === 'success') {
      return '上传成功';
    }
    if (file.uploadState === 'fail') {
      return '上传失败';
    }
    if (file.uploadState === 'uploading') {
      return '上传中';
    }

    // 如果文件已存在，显示"已上传"
    if (file.exists) {
      return '已上传';
    }

    // 默认状态
    return '待上传';
  };

  const modalContent = (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理外部参照文件"
      footer={
        <div data-tour="xref-actions">
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
            }}
            disabled={loading}
          >
            取消
          </Button>
          {files.length > 0 && (
            <Button
              onClick={() => {
                onSelectAndUpload();
              }}
              disabled={hasUploading}
              variant="primary"
            >
              {hasUploading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload size={16} className="mr-2" />
                  选择并上传
                </>
              )}
            </Button>
          )}
          <Button
            onClick={() => {
              onComplete();
            }}
            disabled={loading}
          >
            {allSuccess ? '完成' : '关闭'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 提示信息 */}
        {files.length === 0 ? (
          <div className="rounded-lg p-3" style={{
            backgroundColor: 'var(--info-light)',
            border: '1px solid var(--info-dim)',
          }}>
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--info)' }}
              />
              <div className="text-sm" style={{ color: 'var(--info)' }}>
                <p className="font-medium mb-1">
                  该文件没有外部参照
                </p>
                <p>
                  此 CAD 文件不包含任何外部参照文件。如果您需要添加外部参照，可以在 CAD 软件中插入外部参照后重新保存文件。
                </p>
              </div>
            </div>
          </div>
        ) : missingCount > 0 ? (
          <div className="rounded-lg p-3" style={{
            backgroundColor: 'var(--warning-light)',
            border: '1px solid var(--warning-dim)',
          }}>
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--warning)' }}
              />
              <div className="text-sm" style={{ color: 'var(--warning)' }}>
                <p className="font-medium mb-1">
                  检测到 {missingCount} 个缺失的外部参照文件（共 {files.length}{' '}
                  个）
                </p>
                <p>
                  这些文件是图纸正常显示所必需的。您可以选择立即上传缺失的文件，也可以选择覆盖已存在的文件。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg p-3" style={{
            backgroundColor: 'var(--info-light)',
            border: '1px solid var(--info-dim)',
          }}>
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--info)' }}
              />
              <div className="text-sm" style={{ color: 'var(--info)' }}>
                <p className="font-medium mb-1">
                  所有外部参照文件已存在（共 {files.length} 个）
                </p>
                <p>
                  图纸可以正常显示。如果您需要更新外部参照文件，可以选择覆盖已存在的文件。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 文件列表 */}
        {files.length > 0 && (
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-default)' }}
            data-tour="xref-list"
          >
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="px-4 py-2 text-left text-sm font-medium w-20" style={{ color: 'var(--text-secondary)' }}>
                    状态
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    文件名
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-medium w-24" style={{ color: 'var(--text-secondary)' }}>
                    类型
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-medium w-28" style={{ color: 'var(--text-secondary)' }}>
                    进度
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => (
                  <tr
                    key={index}
                    className="hover:bg-[var(--bg-tertiary)]"
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: file.exists && file.uploadState === 'notSelected' ? 'var(--success-light)' : 'transparent',
                    }}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center">
                        {getStatusIcon(file)}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <span
                          className="text-sm"
                          style={{
                            color: file.exists && file.uploadState === 'notSelected' ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        >
                          <FileNameText>{file.name}</FileNameText>
                        </span>
                        <span className={`text-xs ${getStatusColor(file)}`}>
                          {getStatusText(file)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-xs px-2 py-1 rounded" style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                      }}>
                        {file.type === 'img' ? '图片' : 'DWG'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {file.uploadState === 'uploading' ? (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {Math.round(file.progress)}%
                        </span>
                      ) : file.uploadState === 'success' ? (
                        <span className="text-xs" style={{ color: 'var(--success)' }}>100%</span>
                      ) : file.uploadState === 'fail' ? (
                        <span className="text-xs" style={{ color: 'var(--error)' }}>失败</span>
                      ) : file.exists ? (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>可覆盖</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>正在上传...</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {files.filter((f) => f.uploadState === 'success').length} /{' '}
                {files.length}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-default)' }}>
              <div className="h-full animate-pulse" style={{ backgroundColor: 'var(--primary)' }} />
            </div>
          </div>
        )}

        {hasFailures && (
          <div className="rounded-lg p-3" style={{
            backgroundColor: 'var(--error-light)',
            border: '1px solid var(--error-dim)',
          }}>
            <div className="flex items-start gap-2">
              <XCircle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--error)' }}
              />
              <div className="text-sm" style={{ color: 'var(--error)' }}>
                <p className="font-medium mb-1">
                  部分文件上传失败
                </p>
                <p>
                  请检查文件是否正确，然后重新选择文件上传。
                </p>
              </div>
            </div>
          </div>
        )}

        {allSuccess && (
          <div className="rounded-lg p-3" style={{
            backgroundColor: 'var(--success-light)',
            border: '1px solid var(--success-dim)',
          }}>
            <div className="flex items-start gap-2">
              <CheckCircle
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--success)' }}
              />
              <div className="text-sm" style={{ color: 'var(--success)' }}>
                <p className="font-medium">所有外部参照文件上传成功</p>
                <p>图纸现在可以正常显示了。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );

  // 使用 Portal 将模态框渲染到 body
  if (!isOpen) return null;
  return createPortal(modalContent, document.body);
};

export default ExternalReferenceModal;
