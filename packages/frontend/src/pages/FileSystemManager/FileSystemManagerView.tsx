import React from 'react';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { t } from '@/languages';

import { FileSystemHeader } from './FileSystemHeader';
import { FileSystemContent } from './FileSystemContent';
import { FileSystemStates } from './FileSystemStates';
import { FileSystemModals } from './FileSystemModals';
import type { FileSystemManagerViewProps } from './types';

export const FileSystemManagerView: React.FC<FileSystemManagerViewProps> = ({
  containerRef,
  canUpload,
  fileDropHandlers,
  headerProps,
  statesProps,
  contentProps,
  batchBarProps,
  modalsProps,
}) => {
  return (
    <>
      <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full space-y-6 relative">
          <FileSystemHeader {...headerProps} />
        </div>

        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full mt-6 flex flex-col gap-3">
          <div
            className="flex-1 min-h-0 rounded-2xl shadow-sm overflow-hidden"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
            }}
          >
            <div
              className="h-full rounded-2xl flex flex-col overflow-hidden"
              {...(!headerProps.isAtRoot && canUpload ? fileDropHandlers : {})}
            >
              {contentProps.isFileDragOver && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none m-0"
                  style={{
                    background:
                      'color-mix(in srgb, var(--primary-500) 8%, transparent)',
                    border: '2px dashed var(--primary-400)',
                  }}
                >
                  <div
                    className="flex items-center gap-3 px-6 py-3 rounded-xl"
                    style={{
                      background: 'var(--bg-elevated)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ background: 'var(--primary-500)' }}
                    />
                    <span
                      className="font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {t('释放文件以上传到当前目录')}
                    </span>
                  </div>
                </div>
              )}

              {statesProps.loading ||
              statesProps.error ||
              statesProps.isEmpty ? (
                <div className="flex-1 flex items-center justify-center">
                  <FileSystemStates {...statesProps} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* 底部悬浮操作栏：列表滚动容器内 sticky 吸底（列表撑满一屏，不遮分页栏） */}
                  <FileSystemContent
                    {...contentProps}
                    bottomBar={
                      batchBarProps ? (
                        <BatchActionBar {...batchBarProps} />
                      ) : undefined
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FileSystemModals {...modalsProps} />
    </>
  );
};

export default FileSystemManagerView;
