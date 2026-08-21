/**
 * 图纸会话（Drawing Session）— React 薄读 hook
 *
 * 只读 store（ADR-0030 细粒度 selector），会话状态的变化由 openSession/
 * closeSession/setModified 驱动后自动反映。
 * useShallow 保证状态未变化时返回稳定引用，避免破坏 memo/useEffect 依赖比较。
 */
import { useShallow } from 'zustand/react/shallow';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import type { OpenFileInfo } from './session';

export interface SessionState {
  fileId: string | null;
  fileName: string | null;
  isModified: boolean;
  fileInfo: OpenFileInfo | null;
}

export function useDrawingSession(): SessionState {
  return useCADEditorStore(
    useShallow((s) => ({
      fileId: s.currentFileId,
      fileName: s.currentFileName,
      isModified: s.isDirty,
      fileInfo: s.currentFileInfo,
    }))
  );
}
