import React, { useState } from 'react';
import { useMxCadUploadNative, LoadFileParam } from '../hooks/useMxCadUploadNative';

interface MxCadUploaderProps {
  /** 项目ID */
  projectId?: string;
  /** 父文件夹ID */
  parentId?: string;
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
}

/**
 * MxCAD 文件上传组件
 * 
 * 使用示例：
 * ```tsx
 * <MxCadUploader
 *   projectId="project-123"
 *   parentId="folder-456"
 *   onSuccess={(param) => {
 *     console.log('上传成功:', param);
 *   }}
 *   onError={(error) => {
 *     console.error('上传失败:', error);
 *   }}
 * />
 * ```
 */
export const MxCadUploader: React.FC<MxCadUploaderProps> = ({
  projectId,
  parentId,
  onSuccess,
  onError,
  showProgress = true,
  buttonText = '上传 CAD 文件',
  buttonClassName = '',
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const { selectFiles } = useMxCadUploadNative();

  const handleSelectFiles = () => {
    selectFiles({
      projectId,
      parentId,
      onSuccess: (param: LoadFileParam) => {
        setUploading(false);
        setProgress(0);
        setMessage('文件上传成功！');
        setShowToast(true);
        onSuccess?.(param);

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
        disabled={uploading}
        className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 ${buttonClassName}`}
      >
        {uploading ? '上传中...' : buttonText}
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
    </div>
  );
};

export default MxCadUploader;