import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  useMxCadUploadNative,
  LoadFileParam,
} from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';

interface MxCadUploaderProps {
  /** 节点ID（项目根目录或文件夹的 FileSystemNode ID） */
  nodeId?: string | (() => string);
  /** 上传成功回调 */
  onSuccess?: (param: LoadFileParam) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 是否显示进度条 */
  showProgress?: boolean;
  /** 按钮文本 */
  buttonText?: string;
  /** 按钮样式类名 */
  buttonClassName?: string;
  /** 外部参照上传成功回调 */
  onExternalReferenceSuccess?: () => void;
  /** 外部参照跳过上传回调 */
  onExternalReferenceSkip?: () => void;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（增强版本）
 *
 * 新增功能：
 * - 自动检测外部参照
 * - 支持外部参照上传
 * - 支持跳过外部参照上传（可选）
 */
export const MxCadUploader = forwardRef<MxCadUploaderRef, MxCadUploaderProps>(
  (
    {
      nodeId,
      onSuccess,
      onError,
      showProgress = true,
      buttonText = '上传 CAD 文件',
      buttonClassName = '',
      onExternalReferenceSuccess,
      onExternalReferenceSkip,
    },
    ref
  ) => {
    const { isAuthenticated } = useAuth();
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [currentFileHash, setCurrentFileHash] = useState('');

    const { selectFiles } = useMxCadUploadNative();

    // 外部参照上传 Hook
    const externalReferenceUpload = useExternalReferenceUpload({
      fileHash: currentFileHash,
      onSuccess: () => {
        onExternalReferenceSuccess?.();
      },
      onError: (error) => {
        setMessage(`外部参照上传失败: ${error}`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
      },
      onSkip: () => {
        onExternalReferenceSkip?.();
      },
    });

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: () => handleSelectFiles(),
      }),
      []
    );

    const handleSelectFiles = () => {
      // 每次上传前都获取最新的 nodeId
      const currentNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;

      // 检查用户是否已登录
      if (!isAuthenticated) {
        setMessage('请先登录后再上传文件');
        setShowToast(true);
        onError?.('用户未登录');

        // 5秒后隐藏提示
        setTimeout(() => setShowToast(false), 5000);
        return;
      }

      selectFiles({
        nodeId: currentNodeId || undefined,
        onSuccess: async (param: LoadFileParam) => {
          setUploading(false);
          setProgress(0);
          setMessage('文件上传成功！');
          setShowToast(true);
          onSuccess?.(param);

          // 保存文件哈希值
          setCurrentFileHash(param.hash);

          // 检查外部参照（传入 fileHash 确保不为空）
          await externalReferenceUpload.checkMissingReferences(param.hash);

          // 3秒后隐藏提示
          setTimeout(() => setShowToast(false), 3000);
        },
        onError: (error: string) => {
          setUploading(false);
          setProgress(0);
          setMessage(`上传失败: ${error}`);
          setShowToast(true);
          onError?.(error);

          // 5秒后隐藏提示
          setTimeout(() => setShowToast(false), 5000);
        },
        onProgress: (percentage: number) => {
          setProgress(percentage);
        },
        onFileQueued: (file: any) => {
          setUploading(true);
          setMessage(`文件 ${file.name} 已加入队列`);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        },
        onBeginUpload: () => {
          setMessage('开始上传...');
          setShowToast(true);
        },
      });
    };

    return (
      <div className="mxcad-uploader">
        <button
          onClick={handleSelectFiles}
          disabled={uploading || !isAuthenticated}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 ${buttonClassName}`}
          title={!isAuthenticated ? '请先登录后再上传文件' : ''}
        >
          {uploading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
        </button>

        {showProgress && uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              上传进度: {progress.toFixed(1)}%
            </p>
          </div>
        )}

        {showToast && (
          <div className="fixed top-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
            {message}
          </div>
        )}

        {/* 外部参照上传模态框 */}
        <ExternalReferenceModal
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onComplete={externalReferenceUpload.complete}
          onSkip={externalReferenceUpload.skip}
          onClose={externalReferenceUpload.close}
        />
      </div>
    );
  }
);

MxCadUploader.displayName = 'MxCadUploader';

export default MxCadUploader;
