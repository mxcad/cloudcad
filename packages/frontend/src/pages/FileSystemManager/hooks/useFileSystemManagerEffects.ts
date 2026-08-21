import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFileDropUpload } from '@/hooks/useFileDropUpload';
import type { MxCadUploaderRef } from '@/components/MxCadUploader';
import type { FileSystemNode } from '@/types/filesystem';

interface UseFileSystemManagerEffectsOptions {
  isAtRoot: boolean;
  loading: boolean;
  currentNode: FileSystemNode | null;
  urlNodeId: string | undefined;
  urlProjectId: string | undefined;
  uploaderRef: React.RefObject<MxCadUploaderRef | null>;
  handleRefresh: () => void;
  setShowCreateDrawingModal: (v: boolean) => void;
  setEditingProject: (v: FileSystemNode | null) => void;
}

export function useFileSystemManagerEffects({
  isAtRoot,
  loading,
  currentNode,
  urlNodeId,
  urlProjectId,
  uploaderRef,
  handleRefresh,
  setShowCreateDrawingModal,
  setEditingProject,
}: UseFileSystemManagerEffectsOptions) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [shareFileName, setShareFileName] = useState('');

  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);
  const [isOperationHistoryModalOpen, setIsOperationHistoryModalOpen] =
    useState(false);

  const handleShare = useCallback((node: FileSystemNode) => {
    setShareFileId(node.id);
    setShareFileName(node.name);
    setShareDialogOpen(true);
  }, []);

  const handleShowMembers = useCallback(
    (project: FileSystemNode) => {
      setEditingProject(project);
      setIsMembersModalOpen(true);
    },
    [setEditingProject]
  );

  const handleShowRoles = useCallback(
    (project: FileSystemNode) => {
      setEditingProject(project);
      setIsProjectRolesModalOpen(true);
    },
    [setEditingProject]
  );

  const handleShowOperationHistory = useCallback(
    (project: FileSystemNode) => {
      setEditingProject(project);
      setIsOperationHistoryModalOpen(true);
    },
    [setEditingProject]
  );

  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    if (currentNodeIdRef.current) return currentNodeIdRef.current;
    if (urlNodeId) return urlNodeId;
    if (urlProjectId) return urlProjectId;
    return '';
  }, [urlNodeId, urlProjectId]);

  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
    }
  }, [currentNode]);

  const { isDragOver: isFileDragOver, dropHandlers: fileDropHandlers } =
    useFileDropUpload({
      nodeId: getCurrentParentId,
      openAfterUpload: false,
      onSuccess: () => {
        handleRefresh();
      },
    });

  useEffect(() => {
    const action = searchParams.get('action');
    if (isAtRoot || loading) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (action === 'upload') {
      timer = setTimeout(() => {
        if (uploaderRef.current) {
          uploaderRef.current.triggerUpload();
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.delete('action');
          navigate({ search: newSearchParams.toString() }, { replace: true });
        }
      }, 300);
    }

    if (action === 'new-drawing') {
      timer = setTimeout(() => {
        setShowCreateDrawingModal(true);
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('action');
        navigate({ search: newSearchParams.toString() }, { replace: true });
      }, 300);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    searchParams,
    isAtRoot,
    loading,
    navigate,
    setShowCreateDrawingModal,
    uploaderRef,
  ]);

  return {
    handleShare,
    shareDialogOpen,
    setShareDialogOpen,
    shareFileId,
    setShareFileId,
    shareFileName,
    setShareFileName,
    isMembersModalOpen,
    setIsMembersModalOpen,
    isProjectRolesModalOpen,
    setIsProjectRolesModalOpen,
    isOperationHistoryModalOpen,
    setIsOperationHistoryModalOpen,
    handleShowMembers,
    handleShowRoles,
    handleShowOperationHistory,
    isFileDragOver,
    fileDropHandlers,
  };
}
