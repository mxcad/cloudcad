import { useEffect } from 'react';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { patchSessionFlags } from '@/services/drawingSession';

export interface UseCollabShareOptions {
  collabWorkId: string | null;
  collabDrawingId: string | null;
  collabProjectId: string | null;
  libraryKey: 'drawing' | 'block' | null;
}

export function useCollabShare({
  collabWorkId,
  collabDrawingId,
  collabProjectId,
  libraryKey,
}: UseCollabShareOptions) {
  const setCollabShareState = useCADEditorStore((s) => s.setCollabShareState);

  useEffect(() => {
    if (collabWorkId) {
      const workId = parseInt(collabWorkId, 10);
      if (!isNaN(workId) && workId > 0) {
        setCollabShareState({
          fromCollabShare: true,
          targetWorkId: workId,
          libraryKey,
        });
        patchSessionFlags({
          fromShare: true,
          fileId: collabDrawingId ?? undefined,
          projectId: collabProjectId ?? undefined,
        });
      }
    }
    return () => {
      if (collabWorkId) {
        setCollabShareState({ fromCollabShare: false, targetWorkId: null });
        patchSessionFlags({
          fromShare: false,
          fileId: null,
          fileName: null,
          projectId: null,
        });
      }
    };
  }, [collabWorkId, collabDrawingId, collabProjectId, libraryKey]);
}
