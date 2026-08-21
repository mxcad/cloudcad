import { useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { parseCADEditorRoute, isHomeRoute } from '../utils/cadEditorRoute';

export interface FileRouteParams {
  fileId: string | null;
  isHomeMode: boolean;
  libraryKey: 'drawing' | 'block' | null;
  shareToken: string | null;
  collabWorkId: string | null;
  collabDrawingId: string | null;
  collabProjectId: string | null;
  shareFileName: string | null;
  versionParam: string | null;
  nodeIdParam: string | null;
  urlProjectId: string;
}

export function useFileRouteParser(): FileRouteParams {
  const location = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const fileId = useMemo(
    () => parseCADEditorRoute(location.pathname),
    [location.pathname]
  );
  const isHomeMode = useMemo(
    () => isHomeRoute(location.pathname),
    [location.pathname]
  );

  const libraryKey = useMemo(() => {
    const key = searchParams.get('library');
    if (key === 'drawing' || key === 'block') return key;
    return null;
  }, [searchParams]);

  const shareToken = useMemo(
    () => searchParams.get('shareToken'),
    [searchParams]
  );
  const collabWorkId = useMemo(
    () => searchParams.get('collabWorkId'),
    [searchParams]
  );
  const collabDrawingId = useMemo(
    () => searchParams.get('drawingId'),
    [searchParams]
  );
  const collabProjectId = useMemo(
    () => searchParams.get('projectId'),
    [searchParams]
  );
  const shareFileName = useMemo(
    () => searchParams.get('fileName'),
    [searchParams]
  );
  const versionParam = useMemo(() => searchParams.get('v'), [searchParams]);
  const nodeIdParam = useMemo(() => searchParams.get('nodeId'), [searchParams]);
  const urlProjectId = useMemo(
    () => searchParams.get('nodeId') || '',
    [searchParams]
  );

  return {
    fileId,
    isHomeMode,
    libraryKey,
    shareToken,
    collabWorkId,
    collabDrawingId,
    collabProjectId,
    shareFileName,
    versionParam,
    nodeIdParam,
    urlProjectId,
  };
}

/**
 * 在新标签页中打开文件时注入历史栈，修复返回按钮行为
 */
export function useHistoryBackFix(fileId: string | null): void {
  const location = useLocation();

  useEffect(() => {
    if (!fileId) return;
    if (window.history.length > 1) return;

    const backUrl = new URLSearchParams(location.search).get('back');
    if (!backUrl) return;

    import('../services/mxcadManager').then(({ setOpenedBackInfo }) => {
      setOpenedBackInfo(backUrl, fileId);
    });

    const cadEditorPath = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', backUrl);
    window.history.pushState(null, '', cadEditorPath);
  }, [fileId, location.search]);
}
