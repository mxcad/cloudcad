import { useState, useCallback } from 'react';

interface SourceNode {
  id: string;
  name: string;
}

export interface UseLibraryModalsReturn {
  isCreateFolderModalOpen: boolean;
  openCreateFolderModal: () => void;
  closeCreateFolderModal: () => void;

  isRenameModalOpen: boolean;
  renamingNode: SourceNode | null;
  renameName: string;
  openRenameModal: (node: SourceNode & { isFolder?: boolean }) => void;
  closeRenameModal: () => void;
  setRenameName: (name: string) => void;

  showSelectFolderModal: boolean;
  moveSourceNode: SourceNode | null;
  copySourceNode: SourceNode | null;
  openMoveModal: (node: SourceNode) => void;
  openCopyModal: (node: SourceNode) => void;
  openBatchMoveModal: (count: number) => void;
  openBatchCopyModal: (count: number) => void;
  closeSelectFolderModal: () => void;

  showDownloadFormatModal: boolean;
  downloadingNodeId: string | null;
  downloadingFileName: string | null;
  openDownloadFormatModal: (nodeId: string, fileName: string) => void;
  closeDownloadFormatModal: () => void;
}

export function useLibraryModals(): UseLibraryModalsReturn {
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const openCreateFolderModal = useCallback(() => setIsCreateFolderModalOpen(true), []);
  const closeCreateFolderModal = useCallback(() => setIsCreateFolderModalOpen(false), []);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingNode, setRenamingNode] = useState<SourceNode | null>(null);
  const [renameName, setRenameName] = useState('');

  const openRenameModal = useCallback(
    (node: SourceNode & { isFolder?: boolean }) => {
      setRenamingNode({ id: node.id, name: node.name });
      if (!node.isFolder && node.name) {
        const lastDotIndex = node.name.lastIndexOf('.');
        const nameWithoutExtension =
          lastDotIndex !== -1
            ? node.name.substring(0, lastDotIndex)
            : node.name;
        setRenameName(nameWithoutExtension);
      } else {
        setRenameName(node.name);
      }
      setIsRenameModalOpen(true);
    },
    []
  );

  const closeRenameModal = useCallback(() => {
    setIsRenameModalOpen(false);
    setRenamingNode(null);
    setRenameName('');
  }, []);

  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<SourceNode | null>(null);
  const [copySourceNode, setCopySourceNode] = useState<SourceNode | null>(null);

  const openMoveModal = useCallback((node: SourceNode) => {
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openCopyModal = useCallback((node: SourceNode) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openBatchMoveModal = useCallback((count: number) => {
    setMoveSourceNode({ id: 'batch', name: `${count} 个项目` });
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openBatchCopyModal = useCallback((count: number) => {
    setCopySourceNode({ id: 'batch', name: `${count} 个项目` });
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const closeSelectFolderModal = useCallback(() => {
    setShowSelectFolderModal(false);
    setMoveSourceNode(null);
    setCopySourceNode(null);
  }, []);

  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string | null>(null);
  const [downloadingFileName, setDownloadingFileName] = useState<string | null>(null);

  const openDownloadFormatModal = useCallback(
    (nodeId: string, fileName: string) => {
      setDownloadingNodeId(nodeId);
      setDownloadingFileName(fileName);
      setShowDownloadFormatModal(true);
    },
    []
  );

  const closeDownloadFormatModal = useCallback(() => {
    setShowDownloadFormatModal(false);
    setDownloadingNodeId(null);
    setDownloadingFileName(null);
  }, []);

  return {
    isCreateFolderModalOpen,
    openCreateFolderModal,
    closeCreateFolderModal,

    isRenameModalOpen,
    renamingNode,
    renameName,
    openRenameModal,
    closeRenameModal,
    setRenameName,

    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    openMoveModal,
    openCopyModal,
    openBatchMoveModal,
    openBatchCopyModal,
    closeSelectFolderModal,

    showDownloadFormatModal,
    downloadingNodeId,
    downloadingFileName,
    openDownloadFormatModal,
    closeDownloadFormatModal,
  };
}
