import { MxCpp } from 'mxcad';
import { MxFun } from 'mxdraw';

/**
 * 向当前图纸插入图块（引擎命令 Mx_Insert 的唯一出口）。
 *
 * 引擎命令的前置条件（实例就绪、参数形状）收在本层；调用方只负责
 * 构造文件访问 URL（UrlHelper.buildMxwebFileUrl）与结果提示。
 * 返回 false 表示引擎未就绪（当前没有打开的图纸），调用方负责提示用户。
 */
export function insertBlockFromLibrary(filePath: string, name: string): boolean {
  const mxcad = MxCpp.getCurrentMxCAD();
  if (!mxcad) return false;
  MxFun.sendStringToExecute('Mx_Insert', {
    filePath,
    name,
    isBlockLibrary: true,
  });
  return true;
}
