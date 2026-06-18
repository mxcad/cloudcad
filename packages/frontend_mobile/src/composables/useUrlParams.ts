export interface UrlParams {
  fileId: string | null;
  fileHash: string | null;
  libraryKey: 'drawing' | 'block' | undefined;
  shareToken: string | undefined;
  collabWorkId: string | null;
  collabDrawingId: string | null;
  collabProjectId: string | null;
}

export function useUrlParams(
  getFileIdFromUrl: () => string | null,
  getHashFromUrl: () => string | null,
): UrlParams {
  const searchParams = new URLSearchParams(window.location.search);

  return {
    fileId: getFileIdFromUrl(),
    fileHash: getHashFromUrl(),
    libraryKey: (searchParams.get('library') as 'drawing' | 'block' | null) || undefined,
    shareToken: searchParams.get('shareToken') || undefined,
    collabWorkId: searchParams.get('collabWorkId'),
    collabDrawingId: searchParams.get('drawingId'),
    collabProjectId: searchParams.get('projectId'),
  };
}
