import React, { useState, useCallback } from 'react';
import { Upload, X, File, AlertCircle } from 'lucide-react';
import {
  FileUploadService,
  FileUploadOptions,
} from '../services/fileUploadService';

interface FileUploadItem {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  result?: any;
}

interface FileUploaderProps {
  parentId?: string;
  onUploadComplete?: (file: File, result: any) => void;
  onUploadError?: (file: File, error: Error) => void;
  maxFiles?: number;
  accept?: string;
  disabled?: boolean;
  className?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  parentId,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  accept = '.dwg,.dxf,.pdf,.png,.jpg,.jpeg',
  disabled = false,
  className = '',
}) => {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [disabled]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || !e.target.files) return;

      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);

      // 清空input值，允许重复选择同一文件
      e.target.value = '';
    },
    [disabled]
  );

  const addFiles = (newFiles: File[]) => {
    // 检查文件数量限制
    if (files.length + newFiles.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    // 检查文件类型
    const allowedTypes = accept.split(',').map((type) => type.trim());
    const validFiles = newFiles.filter((file) => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      return allowedTypes.some((type) => {
        if (type.startsWith('.')) {
          return fileExtension === type;
        }
        return file.type.includes(type.replace('*', ''));
      });
    });

    if (validFiles.length !== newFiles.length) {
      alert(`只支持 ${accept} 格式的文件`);
    }

    // 添加到文件列表
    const newFileItems: FileUploadItem[] = validFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: 'pending',
    }));

    setFiles((prev) => [...prev, ...newFileItems]);

    // 开始上传
    newFileItems.forEach((item) => uploadFile(item));
  };

  const uploadFile = async (item: FileUploadItem) => {
    // 更新状态为上传中
    setFiles((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f))
    );

    const options: FileUploadOptions = {
      parentId,
      onProgress: (progress) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, progress } : f))
        );
      },
      onStatusChange: (status) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status } : f))
        );
      },
      onError: (error) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'error', error: error.message }
              : f
          )
        );
        onUploadError?.(item.file, error);
      },
    };

    try {
      const uploadService = new FileUploadService(options);
      const result = await uploadService.uploadFile(item.file);

      // 上传成功
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'completed', result } : f
        )
      );

      onUploadComplete?.(item.file, result);

      // 3秒后移除已完成的文件
      setTimeout(() => {
        setFiles((prev) => prev.filter((f) => f.id !== item.id));
      }, 3000);
    } catch (error) {
      // 错误处理已在options.onError中完成
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const retryUpload = (item: FileUploadItem) => {
    uploadFile(item);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: FileUploadItem['status']) => {
    switch (status) {
      case 'pending':
        return (
          <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
        );
      case 'uploading':
        return (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      case 'processing':
        return (
          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        );
      case 'completed':
        return <div className="w-4 h-4 bg-green-500 rounded-full" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (status: FileUploadItem['status']) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'uploading':
        return '上传中';
      case 'processing':
        return '处理中';
      case 'completed':
        return '完成';
      case 'error':
        return '错误';
    }
  };

  return (
    <div className={`file-uploader ${className}`}>
      {/* 拖拽上传区域 */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() =>
          !disabled && document.getElementById('file-input')?.click()
        }
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          {dragActive ? '释放文件到此处' : '点击或拖拽文件到此处'}
        </p>
        <p className="text-sm text-gray-500">
          支持格式: {accept} | 最大文件数: {maxFiles}
        </p>
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-900">上传列表</h4>
          {files.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
            >
              {/* 文件图标 */}
              <div className="flex-shrink-0">{getStatusIcon(item.status)}</div>

              {/* 文件信息 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(item.file.size)} ·{' '}
                  {getStatusText(item.status)}
                </p>

                {/* 进度条 */}
                {(item.status === 'uploading' ||
                  item.status === 'processing') && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.progress}%
                    </p>
                  </div>
                )}

                {/* 错误信息 */}
                {item.status === 'error' && item.error && (
                  <p className="text-xs text-red-600 mt-1">{item.error}</p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2">
                {item.status === 'error' && (
                  <button
                    onClick={() => retryUpload(item)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    重试
                  </button>
                )}
                <button
                  onClick={() => removeFile(item.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
