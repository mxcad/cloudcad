import { FileTypeDetector } from '@cloudcad/contracts';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { PreloadingFileInfoDto } from '../dto/preloading-data.dto';

/**
 * 把预加载 JSON 里的文件名列表富化为 { name, size, type } 对象列表。
 *
 * 历史上 external-reference-update 与 public-file 各写了一份逐字节相同的实现
 * （仅路径段与 fs 别名不同），且各自内联一份已漂移的扩展名列表。本函数是
 * 「预加载文件信息富化」的唯一出口：
 * - 类型判定走 FileTypeDetector（唯一事实源，.svg/.jfif 归属一致）；
 * - DWG/DXF 在磁盘上以 {name}.mxweb 存储，其余用原名；
 * - size 取 baseDir 下目标文件的 stat，缺失记 0。
 *
 * @param fileNames 原始文件名列表
 * @param baseDir 目标文件所在目录（外部参照为 storageRoot/{src_file_md5}，公开文件为 uploads/{hash}）
 * @param defaultType 无法按扩展名判定时的兜底类型
 */
export async function enrichPreloadingFileInfoList(
  fileNames: string[],
  baseDir: string,
  defaultType: 'dwg' | 'image'
): Promise<PreloadingFileInfoDto[]> {
  if (!fileNames || fileNames.length === 0) return [];

  const results: PreloadingFileInfoDto[] = [];
  for (const name of fileNames) {
    let size = 0;
    let type = defaultType;

    const isDwgFile = FileTypeDetector.isCadFile(name);
    const isImageFile = FileTypeDetector.isImageFile(name);
    if (isDwgFile) type = 'dwg';
    else if (isImageFile) type = 'image';

    const targetFileName = isDwgFile ? `${name}.mxweb` : name;
    const targetPath = path.join(baseDir, targetFileName);

    try {
      const stat = await fsPromises.stat(targetPath);
      size = stat.size;
    } catch {
      // 文件不存在时 size 保持 0
    }

    results.push({ name, size, type });
  }
  return results;
}
