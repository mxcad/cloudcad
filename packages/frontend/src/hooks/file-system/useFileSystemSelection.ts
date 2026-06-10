import { FileSystemNode } from '../../types/filesystem';
import { useMultiSelectSelection } from '../common/useMultiSelectSelection';

interface UseFileSystemSelectionProps {
  nodes: FileSystemNode[];
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const useFileSystemSelection = ({
  nodes,
  showToast: _showToast,
}: UseFileSystemSelectionProps) => {
  return useMultiSelectSelection({ nodes });
};
