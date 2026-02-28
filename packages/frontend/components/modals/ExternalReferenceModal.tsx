import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileNameText } from '../ui/TruncateText';
import { ExternalReferenceFile } from '../../types/filesystem';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Upload,
  AlertTriangle,
} from 'lucide-react';

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
      return <CheckCircle size={16} className="text-green-500" />;
    }
    if (file.uploadState === 'fail') {
      return <XCircle size={16} className="text-red-500" />;
    }
    if (file.uploadState === 'uploading') {
      return <Loader2 size={16} className="text-blue-500 animate-spin" />;
    }

    // 如果文件已存在，显示绿色对勾
    if (file.exists) {
      return <CheckCircle size={16} className="text-green-500" />;
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
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          <span>管理外部参照文件</span>
        </div>
      }
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
            }}
            disabled={loading}
          >
            取消
          </Button>
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
          <Button
            onClick={() => {
              onComplete();
            }}
            disabled={loading}
          >
            {allSuccess ? '完成' : '关闭'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 提示信息 */}
        {missingCount > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="text-amber-600 mt-0.5 flex-shrink-0"
              />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">
                  检测到 {missingCount} 个缺失的外部参照文件（共 {files.length}{' '}
                  个）
                </p>
                <p className="text-amber-700">
                  这些文件是图纸正常显示所必需的。您可以选择立即上传缺失的文件，也可以选择覆盖已存在的文件。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="text-blue-600 mt-0.5 flex-shrink-0"
              />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">
                  所有外部参照文件已存在（共 {files.length} 个）
                </p>
                <p className="text-blue-700">
                  图纸可以正常显示。如果您需要更新外部参照文件，可以选择覆盖已存在的文件。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 文件列表 */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700 w-20">
                  状态
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                  文件名
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700 w-24">
                  类型
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700 w-28">
                  进度
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((file, index) => (
                <tr
                  key={index}
                  className={`hover:bg-slate-50 ${file.exists && file.uploadState === 'notSelected' ? 'bg-green-50/50' : ''}`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center">
                      {getStatusIcon(file)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`text-sm ${file.exists && file.uploadState === 'notSelected' ? 'text-slate-500' : 'text-slate-900'}`}
                      >
                        <FileNameText>{file.name}</FileNameText>
                      </span>
                      <span className={`text-xs ${getStatusColor(file)}`}>
                        {getStatusText(file)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                      {file.type === 'img' ? '图片' : 'DWG'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {file.uploadState === 'uploading' ? (
                      <span className="text-xs text-slate-600">
                        {Math.round(file.progress)}%
                      </span>
                    ) : file.uploadState === 'success' ? (
                      <span className="text-xs text-green-600">100%</span>
                    ) : file.uploadState === 'fail' ? (
                      <span className="text-xs text-red-600">失败</span>
                    ) : file.exists ? (
                      <span className="text-xs text-slate-500">可覆盖</span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">正在上传...</span>
              <span className="text-slate-600">
                {files.filter((f) => f.uploadState === 'success').length} /{' '}
                {files.length}
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 animate-pulse" />
            </div>
          </div>
        )}

        {hasFailures && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <XCircle
                size={16}
                className="text-red-600 mt-0.5 flex-shrink-0"
              />
              <div className="text-sm text-red-800">
                <p className="font-medium mb-1">部分文件上传失败</p>
                <p className="text-red-700">
                  请检查文件是否正确，然后重新选择文件上传。
                </p>
              </div>
            </div>
          </div>
        )}

        {allSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle
                size={16}
                className="text-green-600 mt-0.5 flex-shrink-0"
              />
              <div className="text-sm text-green-800">
                <p className="font-medium">所有外部参照文件上传成功</p>
                <p className="text-green-700">图纸现在可以正常显示了。</p>
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
