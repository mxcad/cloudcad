import { useEffect, useRef } from 'react';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import type { PublicFileUploadedDetail } from '@/services/drawingSession';
import type { UseExternalReferenceUploadReturn } from '@/types/filesystem';

export function useExternalRefCompletion(
  externalReferenceUpload: UseExternalReferenceUploadReturn,
  onCallbackRefChange: (cb: (() => Promise<void>) | null) => void,
  onFileHashChange?: (hash: string) => void
) {
  const uploadRef = useRef(externalReferenceUpload);
  uploadRef.current = externalReferenceUpload;
  const callbackRef = useRef(onCallbackRefChange);
  callbackRef.current = onCallbackRefChange;

  useEffect(() => {
    const handlePublicFileUploaded = async (
      detail: PublicFileUploadedDetail
    ) => {
      const { fileHash, noCache, callback } = detail;

      if (fileHash) onFileHashChange?.(fileHash);
      if (callback) callbackRef.current(callback);

      if (!noCache) {
        if (callback) await callback();
        return;
      }

      try {
        const hasMissing = await uploadRef.current.checkMissingReferences(
          fileHash,
          true,
          false
        );
        if (!hasMissing && callback) await callback();
      } catch {
        if (callback) await callback();
      }
    };

    return subscribe(CAD_EVENTS.PUBLIC_FILE_UPLOADED, handlePublicFileUploaded);
  }, []);

  useEffect(() => {
    const handleUploadCompleted = (
      event: CustomEvent<{ nodeId: string; callback?: () => Promise<void> }>
    ) => {
      const { nodeId, callback } = event.detail;

      if (callback) callbackRef.current(callback);

      uploadRef.current
        .checkMissingReferences(nodeId, true, false)
        .then((hasMissing) => {
          if (!hasMissing && callback) callback();
        })
        .catch(() => {
          if (callback) callback();
        });
    };

    window.addEventListener(
      CAD_EVENTS.UPLOAD_COMPLETED,
      handleUploadCompleted as EventListener
    );
    return () =>
      window.removeEventListener(
        CAD_EVENTS.UPLOAD_COMPLETED,
        handleUploadCompleted as EventListener
      );
  }, []);
}
