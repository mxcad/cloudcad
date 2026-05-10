import { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  useMxCadUploadNative,
  LoadFileParam,
} from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { useUIStore } from '../stores/uiStore';
import { openUploadedFile } from '../services/mxcadManager';

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
  /** 是否启用外部参照检查，默认true。批量导入时应设置为false */
  enableExternalReferenceCheck?: boolean;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * 消息转义函数，防止 XSS 攻击
 */
const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

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
      enableExternalReferenceCheck = true,
    },
    ref
  ) => {
    const { isAuthenticated } = useAuth();
    const { setGlobalLoading, setLoadingMessage, setLoadingProgress } = useUIStore();
    const [showToast, setShowToast] = useState(false);
    const [message, setMessage] = useState('');
    const [currentNodeId, setCurrentNodeId] = useState('');

    const { selectFiles } = useMxCadUploadNative();

    // 外部参照上传 Hook
    const externalReferenceUpload = useExternalReferenceUpload({
      nodeId: currentNodeId,
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

    const handleSelectFiles = useCallback(() => {
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
          // 保存节点ID
          param.nodeId && setCurrentNodeId(param.nodeId);

          try {
            // 调用 openUploadedFile 完成文件转换和打开流程
            // 这里会显示"文件转换中"和"正在打开文件..."的 loading 状态
            await openUploadedFile(param.nodeId!, currentNodeId || '');
            
            setMessage('文件上传成功！');
            setShowToast(true);
            onSuccess?.(param);

            // 根据开关决定是否检查外部参照
            if (enableExternalReferenceCheck) {
              // 检查外部参照（传入 nodeId 确保不为空）
              // shouldRetry = true，因为上传后需要等待后端生成 preloading.json
              // forceOpen = false，上传后如果没有外部参照不弹框
              await externalReferenceUpload.checkMissingReferences(param.nodeId!, true, false);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '文件打开失败';
            setMessage(`文件打开失败: ${errorMessage}`);
            setShowToast(true);
            onError?.(errorMessage);
          } finally {
            // 在整个流程（上传+转换+打开）完成后才隐藏 loading
            setGlobalLoading(false);
            // 3秒后隐藏提示
            setTimeout(() => setShowToast(false), 3000);
          }
        },
        onError: (error: string) => {
          setGlobalLoading(false);
          setMessage(`上传失败: ${error}`);
          setShowToast(true);
          onError?.(error);

          // 5秒后隐藏提示
          setTimeout(() => setShowToast(false), 5000);
        },
        onProgress: (percentage: number) => {
          setLoadingProgress(percentage);
        },
        onFileQueued: (file: File) => {
          setGlobalLoading(true, `正在上传: ${file.name}`);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        },
        onBeginUpload: () => {
          setLoadingMessage('正在上传...');
        },
      });
    }, [
      isAuthenticated,
      nodeId,
      onSuccess,
      onError,
      selectFiles,
      externalReferenceUpload,
      enableExternalReferenceCheck,
      setGlobalLoading,
      setLoadingMessage,
      setLoadingProgress,
    ]);

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: handleSelectFiles,
      }),
      [handleSelectFiles]
    );

    const { globalLoading } = useUIStore();

    return (
      <div className="mxcad-uploader">
        <button
          onClick={handleSelectFiles}
          disabled={globalLoading || !isAuthenticated}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 ${buttonClassName}`}
          title={!isAuthenticated ? '请先登录后再上传文件' : ''}
        >
          {globalLoading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
        </button>

        {showToast && (
          <div className="fixed top-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
            {escapeHtml(message)}
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
