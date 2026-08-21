import { useCallback, useRef, useState, Dispatch, SetStateAction } from 'react';
import { t } from '@/languages';
import {
  FileTreeNode,
  ImportMode,
  ImportProgress,
  SelectedDirectory,
} from './types';
import { buildTreeFromFiles, adjustTreePaths } from './fileTree';

/**
 * 目录扫描/解析子 hook
 * 职责：文件树构建（scanDirectory）、多目录累积（addDirectory）与已选目录记录
 */
export function useDirectoryScan(
  setProgress: Dispatch<SetStateAction<ImportProgress>>
) {
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const selectedDirsRef = useRef<SelectedDirectory[]>([]);
  const currentRootNameRef = useRef<string>('');

  /**
   * 扫描目录，构建文件树
   * @param files - FileList
   * @param mode - 导入模式：'content'=导入目录内容，'folder'=将目录作为子目录
   */
  const scanDirectory = useCallback(
    async (
      files: FileList,
      mode: ImportMode = 'content'
    ): Promise<FileTreeNode> => {
      setProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: '',
        percentage: 0,
        status: 'scanning',
        message: t('正在扫描目录...'),
      });

      const { tree, fileCount, folderCount } = buildTreeFromFiles(
        files,
        mode,
        'root'
      );

      setFileTree(tree);
      setProgress({
        currentFile: 0,
        totalFiles: fileCount,
        currentFileName: '',
        percentage: 0,
        status: 'preparing',
        message: `${t('扫描完成：')}${fileCount}${t(' 个文件，')}${folderCount}${t(' 个文件夹')}`,
      });

      return tree;
    },
    [setProgress]
  );

  /**
   * 添加目录（支持多选）
   * @param files - FileList
   * @param mode - 'content' = 导入目录内容，'folder' = 将目录作为子目录
   */
  const addDirectory = useCallback(
    async (
      files: FileList,
      mode: ImportMode = 'content'
    ): Promise<SelectedDirectory[]> => {
      setProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: '',
        percentage: 0,
        status: 'scanning',
        message: t('正在扫描目录...'),
      });

      // 获取根目录名称（从第一个文件的路径提取）
      const firstFile = files[0];
      if (!firstFile) {
        setProgress({
          currentFile: 0,
          totalFiles: 0,
          currentFileName: '',
          percentage: 0,
          status: 'failed',
          message: t('目录为空'),
        });
        return [];
      }
      const firstPath = firstFile.webkitRelativePath || firstFile.name;
      let rootName: string = 'root';

      if (firstPath && firstPath.includes('/')) {
        const splitResult = firstPath.split('/');
        const firstSegment = splitResult[0];
        rootName = firstSegment || 'root';
      }

      currentRootNameRef.current = rootName;

      const {
        tree: newTree,
        fileCount,
        folderCount,
      } = buildTreeFromFiles(files, mode, rootName);

      // 记录已选择的目录
      const newDir: SelectedDirectory = {
        name: rootName,
        rootPath: '',
        fileCount,
        folderCount,
        mode,
      };
      selectedDirsRef.current = [...selectedDirsRef.current, newDir];

      // 合并到现有文件树
      if (fileTree && fileTree.children && fileTree.children.length > 0) {
        // 将新目录的文件添加到现有根节点
        for (const child of newTree.children || []) {
          // 为防止冲突，为每个节点生成唯一的相对路径
          const adjustedChild = adjustTreePaths(child, rootName);
          fileTree.children.push(adjustedChild);
        }
        setFileTree({ ...fileTree });
      } else {
        // 首次添加
        setFileTree(newTree);
      }

      const totalFiles = selectedDirsRef.current.reduce(
        (sum, d) => sum + d.fileCount,
        0
      );
      const totalFolders = selectedDirsRef.current.reduce(
        (sum, d) => sum + d.folderCount,
        0
      );

      setProgress({
        currentFile: 0,
        totalFiles,
        currentFileName: '',
        percentage: 0,
        status: 'preparing',
        message: `${t('已选择 ')}${selectedDirsRef.current.length}${t(' 个目录，共 ')}${totalFiles}${t(' 个文件，')}${totalFolders}${t(' 个文件夹')}`,
      });

      return selectedDirsRef.current;
    },
    [fileTree, setProgress]
  );

  const resetScan = useCallback(() => {
    setFileTree(null);
    selectedDirsRef.current = [];
    currentRootNameRef.current = '';
  }, []);

  return { fileTree, scanDirectory, addDirectory, resetScan };
}
