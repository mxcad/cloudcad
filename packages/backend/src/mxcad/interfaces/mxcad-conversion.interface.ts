import type { ConvertServerFileParam } from '../types/mxcad-context.types';

/**
 * MxCAD 文件转换服务接口
 * 负责 CAD 文件格式转换（dwg→mxweb、mxweb→bin、PDF 输出等）
 */
export interface IMxcadConversionService {
  convertServerFile(param: ConvertServerFileParam): Promise<unknown>;
  checkTzStatus(fileHash: string): Promise<{ code: number }>;
  generateBinFiles(mxwebPath: string, nodeName: string): Promise<void>;
}
