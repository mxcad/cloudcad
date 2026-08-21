import { FileTreeNode, ImportMode } from './types';

/**
 * 调整文件树路径（添加前缀以防止多目录冲突）
 */
export function adjustTreePaths(
  node: FileTreeNode,
  prefix: string
): FileTreeNode {
  if (node.isFolder) {
    return {
      ...node,
      relativePath: prefix
        ? `${prefix}/${node.relativePath}`
        : node.relativePath,
      children: node.children?.map((child) => adjustTreePaths(child, prefix)),
    };
  } else {
    return {
      ...node,
      relativePath: prefix
        ? `${prefix}/${node.relativePath}`
        : node.relativePath,
    };
  }
}

/**
 * 由 FileList 构建文件树
 * @param fileList - FileList
 * @param importMode - 导入模式：'content'=导入目录内容，'folder'=将目录作为子目录
 * @param rootName - 根目录名称
 */
export function buildTreeFromFiles(
  fileList: FileList,
  importMode: ImportMode,
  rootName: string
): { tree: FileTreeNode; fileCount: number; folderCount: number } {
  const root: FileTreeNode = {
    name: rootName,
    relativePath: '',
    isFolder: true,
    children: [],
  };

  const folderMap = new Map<string, FileTreeNode>();
  folderMap.set('', root);

  let fileCount = 0;
  let folderCount = 0;

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;

    const rawPath = file.webkitRelativePath || file.name;

    // 'content' 模式：跳过第一层目录前缀，只导入内容
    // 'folder' 模式：保留整个目录结构作为子目录
    let pathParts: string[];
    const normalizedPath = rawPath.replace(/\\/g, '/');
    if (importMode === 'content' && normalizedPath.includes('/')) {
      pathParts = normalizedPath.split('/').slice(1);
    } else {
      pathParts = normalizedPath.split('/');
    }

    // 跳过根目录文件（没有路径）
    if (pathParts.length === 0 || !pathParts[0]) {
      fileCount++;
      if (!root.children) {
        root.children = [];
      }
      root.children.push({
        name: file.name,
        relativePath: file.name,
        isFolder: false,
        file,
      });
      continue;
    }

    let currentPath = '';

    // 创建文件夹节点
    for (let j = 0; j < pathParts.length - 1; j++) {
      const partName = pathParts[j];
      if (!partName) continue;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${partName}` : partName;

      if (!folderMap.has(currentPath)) {
        folderCount++;
        const folderNode: FileTreeNode = {
          name: partName,
          relativePath: currentPath,
          isFolder: true,
          children: [],
        };

        folderMap.set(currentPath, folderNode);

        // 添加到父节点
        const parentNode = folderMap.get(parentPath);
        if (parentNode && parentNode.children) {
          parentNode.children.push(folderNode);
        }
      }
    }

    // 添加文件节点
    fileCount++;
    const lastPart = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1).join('/');
    const parentNode = folderMap.get(parentPath);

    if (parentNode && parentNode.children && file && lastPart) {
      parentNode.children.push({
        name: lastPart,
        relativePath: pathParts.join('/'),
        isFolder: false,
        file,
      });
    }
  }

  return { tree: root, fileCount, folderCount };
}

/**
 * 在 fileTree 中递归搜索文件（跨所有目录层级）
 */
export function findFileInTree(
  node: FileTreeNode,
  fileName: string
): File | null {
  if (!node.children) return null;
  const target = fileName.toLowerCase();
  for (const child of node.children) {
    if (
      !child.isFolder &&
      child.file &&
      child.name.toLowerCase() === target
    ) {
      return child.file;
    }
    if (child.isFolder) {
      const found = findFileInTree(child, fileName);
      if (found) return found;
    }
  }
  return null;
}
