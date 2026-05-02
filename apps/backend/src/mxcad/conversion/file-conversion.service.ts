///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IFileConversionService,
  ConversionResult,
  ConversionOptions,
} from '../interfaces/file-conversion.interface';
import { FileTypeDetector } from '../../utils/file-type-detector';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { RateLimiter } from '../../../common/concurrency/rate-limiter';

const execAsync = promisify(exec);

@Injectable()
export class FileConversionService implements IFileConversionService {
  private readonly logger = new Logger(FileConversionService.name);
  private readonly mxCadAssemblyPath: string;
  private readonly mxCadBinPath: string;
  private readonly mxCadFileExt: string;
  private readonly compression: boolean;
  private readonly conversionRateLimiter: RateLimiter;

  constructor(private readonly configService: ConfigService) {
    // 获取 MxCAD 配置
    const mxcadConfig = this.configService.get('mxcad', { infer: true });

    // 获取上传并发配置
    const uploadConfig = this.configService.get('upload', { infer: true });
    // 文件转换是 CPU 密集型任务，并发数关联 CPU 核心数
    // 默认使用 CPU 核心数，但最多配置的并发数（避免过度争抢 CPU）
    const cpuCount = os.cpus().length;
    const configMaxConcurrent = uploadConfig?.maxConcurrent;
    const maxConversionConcurrent = uploadConfig?.conversionMaxConcurrent || 4;
    const maxConcurrent = configMaxConcurrent
      ? Math.min(configMaxConcurrent, cpuCount, maxConversionConcurrent)
      : Math.min(cpuCount, maxConversionConcurrent);

    // 初始化文件转换限流器
    this.conversionRateLimiter = new RateLimiter(maxConcurrent);
    this.logger.log(
      `文件转换限流器初始化: CPU核心数=${cpuCount}, 最大并发数=${maxConcurrent}`
    );
    
    // 检测操作系统
    const isLinux = os.platform() === 'linux';

    // 根据平台配置转换程序路径
    // 后端从 apps/backend 启动，cwd 即为 apps/backend
    // mxcad 转换程序在 runtime/{platform}/mxcad/
    const projectRoot = path.join(process.cwd(), '..', '..');

    this.mxCadAssemblyPath =
      mxcadConfig.assemblyPath ||
      (isLinux
        ? path.join(projectRoot, 'runtime', 'linux', 'mxcad', 'mxcadassembly')
        : path.join(projectRoot, 'runtime', 'windows', 'mxcad', 'mxcadassembly.exe'));

    // Linux 下需要的工作目录（runtime/linux/mxcad）
    this.mxCadBinPath = isLinux
      ? path.join(projectRoot, 'runtime', 'linux', 'mxcad')
      : '';

    this.mxCadFileExt = mxcadConfig.fileExt || '.mxweb';
    this.compression = mxcadConfig.compression !== false;
  }

  /**
   * 将路径解析为绝对路径
   * 确保传递给 mxcadassembly.exe 的路径都是绝对路径
   * @param inputPath 输入路径（可能是相对路径或绝对路径）
   * @returns 绝对路径
   */
  private resolveToAbsolutePath(inputPath: string): string {
    if (!inputPath) {
      return inputPath;
    }

    // 已经是绝对路径，直接返回
    if (path.isAbsolute(inputPath)) {
      return path.normalize(inputPath);
    }

    // 相对路径：基于项目根目录解析
    // 后端 cwd 通常是 apps/backend，项目根目录是其上两级
    const projectRoot = path.join(process.cwd(), '..', '..');
    const absolutePath = path.resolve(projectRoot, inputPath);

    this.logger.debug(
      `[resolveToAbsolutePath] ${inputPath} -> ${absolutePath}`
    );

    return absolutePath;
  }

  /**
   * 检测是否为 Linux 平台
   */
  private isLinux(): boolean {
    return os.platform() === 'linux';
  }

  /**
   * 执行文件转换（带并发限制）
   */
  async convertFile(options: ConversionOptions): Promise<ConversionResult> {
    return this.conversionRateLimiter.execute(async () => {
      return this.executeConversion(options);
    });
  }

  /**
   * 实际执行文件转换（内部方法）
   */
  private async executeConversion(options: ConversionOptions): Promise<ConversionResult> {
    let stdout = '';
    let stderr = '';
    const originalDir = process.cwd();
    let changedDir = false;

    try {
      const {
        srcPath,
        fileHash,
        createPreloadingData = true,
        compression = this.compression,
        outname,
        cmd,
        width,
        height,
        colorPolicy,
        outjpg,
      } = options;

      // 确保源文件路径是绝对路径
      const absoluteSrcPath = this.resolveToAbsolutePath(srcPath);

      // 构建完整的 param 对象
      const param: Record<string, unknown> = {
        srcpath: absoluteSrcPath.replace(/\\/g, '/'),
        src_file_md5: fileHash,
        create_preloading_data: createPreloadingData,
      };

      // 添加可选参数
      if (!compression) {
        param.compression = 0;
      }

      if (outname) {
        param.outname = outname;
      }

      if (cmd) {
        param.cmd = cmd;
      }

      if (width) {
        param.width = width;
      }

      if (height) {
        param.height = height;
      }

      if (colorPolicy) {
        param.colorPolicy = colorPolicy;
      }

      if (outjpg) {
        param.outjpg = outjpg;
      }

      // Linux 平台特殊处理
      if (this.isLinux()) {

        if (this.mxCadBinPath) {
          process.chdir(this.mxCadBinPath);
          changedDir = true;
          this.logger.log(`[Linux] 切换工作目录: ${this.mxCadBinPath}`);
        }

        // 将参数中的双引号替换为单引号
        const paramStr = JSON.stringify(param).replace(/"/g, "'");
        const cmd = `"${this.mxCadAssemblyPath}" "${paramStr}"`;
        this.logger.log(`执行 MxCAD 转换命令 (Linux): ${cmd}`);

        const execResult = await execAsync(cmd, {
          encoding: 'utf8',
          timeout: options.timeout || 60000,
          maxBuffer: 50 * 1024 * 1024,
        });

        stdout = execResult.stdout;
        stderr = execResult.stderr;
      } else {
        // Windows 平台
        const cmd = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
        this.logger.log(`执行 MxCAD 转换命令: ${cmd}`);

        const execResult = await execAsync(cmd, {
          encoding: 'utf8',
          timeout: options.timeout || 60000,
          maxBuffer: 50 * 1024 * 1024,
        });

        stdout = execResult.stdout;
        stderr = execResult.stderr;
      }

      // 尝试从 stdout 或 stderr 解析结果
      const output = Buffer.isBuffer(stdout)
        ? stdout.toString()
        : stdout ||
          (Buffer.isBuffer(stderr) ? stderr.toString() : stderr) ||
          '';

      try {
        let strOutput = output.toString();
        const iPos = strOutput.lastIndexOf('{"code"');
        if (iPos !== -1) {
          strOutput = strOutput.substring(iPos);
        }
        const ret = JSON.parse(strOutput);

        if (ret.code === 0) {
          this.logger.log(`文件转换成功: ${srcPath}`);
          return { isOk: true, ret };
        } else {
          this.logger.error(`文件转换失败: ${ret.message}`);
          return { isOk: false, ret, error: ret.message };
        }
      } catch (e) {
        this.logger.error(`解析 MxCAD 输出失败: ${e.message}`);
        this.logger.error(`原始输出: ${output}`);
        return {
          isOk: false,
          ret: { code: -1, message: '解析输出失败' },
          error: e.message,
        };
      }
    } catch (error: unknown) {
      // 确保 stdout 和 stderr 是字符串
      const errorStdout = (error as { stdout?: Buffer | string }).stdout
        ? Buffer.isBuffer((error as { stdout?: Buffer | string }).stdout)
          ? ((error as { stdout?: Buffer | string }).stdout as Buffer).toString()
          : (error as { stdout?: Buffer | string }).stdout
        : stdout || '';
      const errorStderr = (error as { stderr?: Buffer | string }).stderr
        ? Buffer.isBuffer((error as { stderr?: Buffer | string }).stderr)
          ? ((error as { stderr?: Buffer | string }).stderr as Buffer).toString()
          : (error as { stderr?: Buffer | string }).stderr
        : stderr || '';

      // 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
      const outputToCheck = errorStdout || errorStderr;

      if (outputToCheck) {
        try {
          // 确保 outputToCheck 是字符串
          const outputStr = typeof outputToCheck === 'string' ? outputToCheck : outputToCheck.toString();
          
          // 查找 JSON 位置
          const iPos = outputStr.lastIndexOf('{"code"');

          if (iPos !== -1) {
            const strOutput = outputStr.substring(iPos);
            const ret = JSON.parse(strOutput);

            // 如果输出包含成功的结果，视为转换成功
            if (ret.code === 0) {
              this.logger.log(`文件转换成功: ${options.srcPath}`);
              return { isOk: true, ret };
            }
          }
        } catch (parseError) {
          // JSON 解析失败，继续错误处理
        }
      }

      // 只有在真正失败时才输出错误日志
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string | number }).code;
      
      this.logger.error(`文件转换异常: ${errorMessage}`);
      this.logger.error(`退出码: ${errorCode}`);
      this.logger.error(`stdout: [${errorStdout}]`);
      this.logger.error(`stderr: [${errorStderr}]`);

      return {
        isOk: false,
        ret: { code: -1, message: errorMessage },
        error: errorMessage,
      };
    } finally {
      // 恢复原始工作目录
      if (changedDir) {
        process.chdir(originalDir);
        this.logger.log(`[Linux] 恢复工作目录: ${originalDir}`);
      }
    }
  }

  async convertFileAsync(
    options: ConversionOptions,
    callbackUrl?: string
  ): Promise<string> {
    // TODO: 实现异步转换逻辑
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.warn(`异步转换功能尚未实现，返回任务ID: ${taskId}`);
    return taskId;
  }

  async checkConversionStatus(
    taskId: string
  ): Promise<{ code: number; status?: string }> {
    // TODO: 实现转换状态检查逻辑
    this.logger.warn(`转换状态检查功能尚未实现，任务ID: ${taskId}`);
    return { code: 0, status: 'completed' };
  }

  getConvertedExtension(originalFilename: string): string {
    const extension = path.extname(originalFilename).toLowerCase();

    switch (extension) {
      case '.dwg':
      case '.dxf':
        return this.mxCadFileExt;
      case '.pdf':
        return '.pdf';
      case '.png':
      case '.jpg':
      case '.jpeg':
        return extension;
      default:
        return this.mxCadFileExt;
    }
  }

  needsConversion(filename: string): boolean {
    return FileTypeDetector.needsConversion(filename);
  }

  /**
   * 将 .bin 文件转换成 .mxweb 文件
   * 用于历史版本访问时从 SVN 中的 bin 文件恢复 mxweb 文件
   * @param binPath bin 文件的完整路径
   * @param outputPath 输出目录
   * @param outName 输出文件名（如 test2.mxweb）
   * @returns 转换结果，包含输出文件路径
   */
  async convertBinToMxweb(
    binPath: string,
    outputPath: string,
    outName: string
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    let stdout = '';
    let stderr = '';
    const originalDir = process.cwd();
    let changedDir = false;

    try {
      this.logger.log(`[convertBinToMxweb] 开始转换: ${binPath} -> ${outName}`);

      // 确保路径是绝对路径
      const absoluteBinPath = this.resolveToAbsolutePath(binPath);
      const absoluteOutputPath = this.resolveToAbsolutePath(outputPath);

      // 构建参数：bin 转 mxweb 需要 srcpath, outpath, outname
      const param: Record<string, string> = {
        srcpath: absoluteBinPath.replace(/\\/g, '/'),
        outpath: absoluteOutputPath.replace(/\\/g, '/'),
        outname: outName,
      };

      // Linux 平台特殊处理
      if (this.isLinux()) {
        // 切换工作目录到 mxcadassembly/bin
        if (this.mxCadBinPath) {
          process.chdir(this.mxCadBinPath);
          changedDir = true;
          this.logger.log(`[Linux] 切换工作目录: ${this.mxCadBinPath}`);
        }

        // 将参数中的双引号替换为单引号
        const paramStr = JSON.stringify(param).replace(/"/g, "'");
        const cmd = `"${this.mxCadAssemblyPath}" "${paramStr}"`;
        this.logger.log(`执行 bin→mxweb 转换命令 (Linux): ${cmd}`);

        const execResult = await execAsync(cmd, {
          encoding: 'utf8',
          timeout: 60000,
          maxBuffer: 50 * 1024 * 1024,
        });

        stdout = execResult.stdout;
        stderr = execResult.stderr;
      } else {
        // Windows 平台
        const cmd = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
        this.logger.log(`执行 bin→mxweb 转换命令: ${cmd}`);

        const execResult = await execAsync(cmd, {
          encoding: 'utf8',
          timeout: 60000,
          maxBuffer: 50 * 1024 * 1024,
        });

        stdout = execResult.stdout;
        stderr = execResult.stderr;
      }

      // 尝试从输出解析结果
      const output = Buffer.isBuffer(stdout)
        ? stdout.toString()
        : stdout ||
          (Buffer.isBuffer(stderr) ? stderr.toString() : stderr) ||
          '';

      try {
        let strOutput = output.toString();
        const iPos = strOutput.lastIndexOf('{"code"');
        if (iPos !== -1) {
          strOutput = strOutput.substring(iPos);
        }
        const ret = JSON.parse(strOutput);

        if (ret.code === 0) {
          const resultPath = path.join(outputPath, outName);
          this.logger.log(`[convertBinToMxweb] 转换成功: ${resultPath}`);
          return { success: true, outputPath: resultPath };
        } else {
          this.logger.error(`[convertBinToMxweb] 转换失败: ${ret.message}`);
          return { success: false, error: ret.message };
        }
      } catch (e) {
        this.logger.error(`[convertBinToMxweb] 解析输出失败: ${e.message}`);
        this.logger.error(`原始输出: ${output}`);
        return { success: false, error: `解析输出失败: ${e.message}` };
      }
    } catch (error: unknown) {
      const err = error as Error & {
        code?: number;
        stdout?: string | Buffer;
        stderr?: string | Buffer;
      };

      // 确保 stdout 和 stderr 是字符串
      const errorStdout = err.stdout
        ? Buffer.isBuffer(err.stdout)
          ? err.stdout.toString()
          : err.stdout
        : stdout || '';
      const errorStderr = err.stderr
        ? Buffer.isBuffer(err.stderr)
          ? err.stderr.toString()
          : err.stderr
        : stderr || '';

      // 检查输出是否包含成功的结果
      const outputToCheck = errorStdout || errorStderr;

      if (outputToCheck) {
        try {
          const iPos = outputToCheck.lastIndexOf('{"code"');

          if (iPos !== -1) {
            const strOutput = outputToCheck.substring(iPos);
            const ret = JSON.parse(strOutput);

            if (ret.code === 0) {
              const resultPath = path.join(outputPath, outName);
              this.logger.log(`[convertBinToMxweb] 转换成功: ${resultPath}`);
              return { success: true, outputPath: resultPath };
            }
          }
        } catch {
          // JSON 解析失败，继续错误处理
        }
      }

      this.logger.error(`[convertBinToMxweb] 转换异常: ${err.message}`);
      this.logger.error(`退出码: ${err.code}`);
      this.logger.error(`stdout: [${errorStdout}]`);
      this.logger.error(`stderr: [${errorStderr}]`);

      return { success: false, error: err.message };
    } finally {
      // 恢复原始工作目录
      if (changedDir) {
        process.chdir(originalDir);
        this.logger.log(`[Linux] 恢复工作目录: ${originalDir}`);
      }
    }
  }
}
