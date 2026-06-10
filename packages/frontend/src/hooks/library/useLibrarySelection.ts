import { FileSystemNode } from '../../types/filesystem';
import { useMultiSelectSelection } from '../common/useMultiSelectSelection';

interface UseLibrarySelectionProps {
  nodes: FileSystemNode[];
}

export const useLibrarySelection = ({ nodes }: UseLibrarySelectionProps) => {
  const { selectedNodes, handleNodeSelect, handleSelectAll, clearSelection } =
    useMultiSelectSelection({ nodes });

  return { selectedNodes, handleNodeSelect, handleSelectAll, clearSelection };
};
