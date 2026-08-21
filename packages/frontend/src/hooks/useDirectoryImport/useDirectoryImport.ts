import { useCallback, useState } from 'react';
import { ImportProgress } from './types';
import { useDirectoryScan } from './useDirectoryScan';
import { useConflictDetection } from './useConflictDetection';
import { useImportExecutor } from './useImportExecutor';

/**
 * 批量目录导入 Hook
 * 组合式组装：扫描/解析（useDirectoryScan）+ 冲突检测（useConflictDetection）+ 上传执行（useImportExecutor）
 */
export function useDirectoryImport() {
  const [progress, setProgress] = useState<ImportProgress>({
    currentFile: 0,
    totalFiles: 0,
    currentFileName: '',
    percentage: 0,
    status: 'idle',
    message: '',
  });

  const { fileTree, scanDirectory, addDirectory, resetScan } =
    useDirectoryScan(setProgress);
  const { conflicts, detectConflicts, resetConflicts } = useConflictDetection();
  const { executeImport, cancelImport, resetExecutor } =
    useImportExecutor(setProgress);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    resetScan();
    resetConflicts();
    resetExecutor();
    setProgress({
      currentFile: 0,
      totalFiles: 0,
      currentFileName: '',
      percentage: 0,
      status: 'idle',
      message: '',
    });
  }, [resetScan, resetConflicts, resetExecutor]);

  return {
    fileTree,
    conflicts,
    progress,
    scanDirectory,
    addDirectory,
    detectConflicts,
    executeImport,
    cancelImport,
    reset,
  };
}
