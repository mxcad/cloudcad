///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as path from 'path';
import * as fsPromises from 'fs/promises';

/**
 * 复制文件或目录。
 *
 * 目录使用递归复制；文件复制时可将源文件名中的 fileHash 替换为 newNodeId
 * （用于把 uploads 目录下以 hash 前缀命名的转换产物落盘到节点目录）。
 */
export async function copyFileOrDir(
  sourcePath: string,
  targetPath: string,
  options?: { fileHash?: string; newNodeId?: string }
): Promise<void> {
  const stat = await fsPromises.stat(sourcePath);
  if (stat.isDirectory()) {
    await fsPromises.cp(sourcePath, targetPath, { recursive: true });
  } else {
    let finalTargetPath = targetPath;
    if (options?.fileHash && options?.newNodeId) {
      const fileName = path.basename(sourcePath);
      const replacedFileName = fileName.replace(
        options.fileHash,
        options.newNodeId
      );
      finalTargetPath = path.join(path.dirname(targetPath), replacedFileName);
    }
    await fsPromises.copyFile(sourcePath, finalTargetPath);
  }
}
