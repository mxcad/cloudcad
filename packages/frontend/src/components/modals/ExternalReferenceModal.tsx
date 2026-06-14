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
import { AlertCircle } from 'lucide-react';

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
      return <CheckCircle size={16} style={{ color: 'var(--success)' }} data-testid="icon-check-circle" />;
    }
    if (file.uploadState === 'fail') {
      return <XCircle size={16} style={{ color: 'var(--error)' }} data-testid="icon-x-circle" />;
    }
    if (file.uploadState === 'uploading') {
      return <Loader2 size={16} style={{ color: 'var(--info)' }} className="animate-spin" data-testid="icon-loader" />;
    }

    // 如果文件已存在，显示绿色对勾
    if (file.exists) {
      return <CheckCircle size={16} style={{ color: 'var(--success)' }} data-testid="icon-check-circle" />;
    }

    // 默认状态（待上传），显示灰色提示图标
    return <AlertCircle size={16} style={{ color: 'var(--text-muted)' }} data-testid="icon-alert-circle" />;
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
      return '已完成';
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
      onClose={onSkip}
      title="管理外部参照文件"
      size="lg"
      contentClassName="p-0"
      footer={
        <div data-tour="xref-actions" className="flex items-center justify-end gap-2">
          <Button
            onClick={() => {
              if (allSuccess) {
                onComplete();
              } else {
                onSkip();
              }
            }}
            disabled={loading}
            data-tour="xref-complete-btn"
            className="min-w-[72px] h-8"
          >
            继续打开
          </Button>
          {files.length > 0 && (
            <Button
              onClick={() => {
                onSelectAndUpload();
              }}
              disabled={hasUploading}
              className="min-w-[100px] h-8"
              variant="primary"
            >
              {hasUploading ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" data-testid="icon-loader" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload size={14} className="mr-1.5" />
                  选择并上传
                </>
              )}
            </Button>
          )}
        </div>
      }
    >
      <div>
        {/* 文件列表 */}
        {files.length > 0 ? (
          <div
            className="overflow-hidden"
            style={{  maxHeight: '300px', overflowY: 'auto' }}
            data-tour="xref-list"
          >
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <th className="px-3 py-2 text-left font-medium w-12" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    状态
                  </th>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    文件名
                  </th>
                  <th className="px-3 py-2 text-center font-medium w-20" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    类型
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-24" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    进度
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => (
                  <tr
                    key={index}
                    className="transition-colors duration-150"
                    style={{
                      borderBottom: index < files.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      backgroundColor: file.exists && file.uploadState === 'notSelected' ? 'var(--success-light)' : 'var(--bg-primary)',
                    }}
                  >
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{
                          backgroundColor: file.uploadState === 'success' || (file.exists && file.uploadState === 'notSelected') ? 'var(--success-dim)' :
                            file.uploadState === 'fail' ? 'var(--error-dim)' :
                            file.uploadState === 'uploading' ? 'var(--info-dim)' :
                            'var(--bg-tertiary)'
                        }}>
                          {getStatusIcon(file)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle max-w-0">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="font-medium block truncate"
                          style={{
                            color: file.exists && file.uploadState === 'notSelected' ? 'var(--text-muted)' : 'var(--text-primary)',
                            fontSize: '0.875rem'
                          }}
                        >
                          <FileNameText>{file.name}</FileNameText>
                        </span>
                        <span style={{ fontSize: '0.75rem' }}>
                          {getStatusText(file)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        {file.type === 'img' ? '图片' : 'DWG'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      {file.uploadState === 'uploading' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-default)' }}>
                            <div 
                              className="h-full rounded-full transition-all duration-300" 
                              style={{ 
                                width: `${file.progress}%`,
                                backgroundColor: 'var(--primary-500)'
                              }} 
                            />
                          </div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {Math.round(file.progress)}%
                          </span>
                        </div>
                      ) : file.uploadState === 'success' ? (
                        <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>100%</span>
                      ) : file.uploadState === 'fail' ? (
                        <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>失败</span>
                      ) : file.exists ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>可覆盖</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg p-6 text-center" style={{ color: 'var(--text-muted)' }}>
            暂无外部参照文件
          </div>
        )}

        {hasUploading && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between" style={{ fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>正在上传...</span>
              <span style={{ color: 'var(--primary-500)' }}>
                {files.filter((f) => f.uploadState === 'success').length} /{' '}
                {files.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-default)' }}>
              <div 
                className="h-full transition-all duration-300" 
                style={{ 
                  width: `${(files.filter((f) => f.uploadState === 'success').length / files.length) * 100}%`,
                  backgroundColor: 'var(--primary-500)'
                }} 
              />
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