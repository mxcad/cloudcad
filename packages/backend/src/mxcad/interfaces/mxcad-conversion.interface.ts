import type {
  ConversionOptions,
  ConversionResult,
  MxCadConversionResult,
} from './file-conversion.interface';
import type { ConvertServerFileParam } from '../types/mxcad-context.types';

/** bin→mxweb 转换结果（引擎直出路径无 isOk/ret 包装，只回成功标志与落盘路径） */
export interface ConvertBinToMxwebResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * MxCAD 文件转换服务接口（转换执行唯一出口）。
 *
 * 只声明有跨模块消费者的能力（每加一个方法须有真实调用方，否则是孤儿）。
 * 跨模块消费者（batch-download / file-download-export / mxcad-file-access /
 * function-executor / mxcad-save）只依赖本接口：不私自定义扩展类型、
 * 不把返回值收窄成 unknown 再手工断言。
 */
export interface IMxcadConversionService {
  /** 引擎调用唯一入口；成功/失败均落在 ConversionResult.isOk/ret，不做二次包装 */
  convertFile(options: ConversionOptions): Promise<ConversionResult>;

  /** HTTP 入口（同步/异步两种调用形态）；失败统一折叠为 code 12 */
  convertServerFile(
    param: ConvertServerFileParam
  ): Promise<MxCadConversionResult>;

  convertBinToMxweb(
    binPath: string,
    outputPath: string,
    outName: string
  ): Promise<ConvertBinToMxwebResult>;

  generateBinFiles(mxwebPath: string, nodeName: string): Promise<void>;
}
