import { useUIStore } from '../../stores/uiStore';
import { createPortal } from 'react-dom';

export const LoadingOverlay = () => {
  const { globalLoading, loadingMessage, loadingProgress } = useUIStore();

  if (!globalLoading) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999]">
      {/* 底部横条容器 - 高度 20px */}
      <div className="fixed bottom-0 left-0 right-0 h-[20px] bg-gray-900/80 flex items-center justify-center px-4">
        {/* 顶部细线进度条 - 高度 3px */}
        <div className="absolute top-0 left-0 right-0 h-[3px]">
          <div
            className="h-full transition-all duration-300"
            style={{ 
              width: loadingProgress > 0 ? `${loadingProgress}%` : '100%',
              background: loadingProgress > 0 
                ? 'linear-gradient(to right, #3b82f6, #22d3ee)' 
                : 'linear-gradient(90deg, transparent, #3b82f6, #22d3ee, #3b82f6, transparent)',
              backgroundSize: loadingProgress > 0 ? '100% 100%' : '200% 100%',
              animation: loadingProgress > 0 ? 'none' : 'shimmer 2s linear infinite'
            }}
          />
        </div>
        
        {/* 居中显示的信息 */}
        <div className="flex items-center gap-4">
          {/* Loading 消息 */}
          <span className="text-white text-xs">
            {loadingMessage || '加载中...'}
          </span>
          
          {/* 进度百分比 */}
          {loadingProgress > 0 && (
            <span className="text-white text-xs">
              {loadingProgress.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default LoadingOverlay;
