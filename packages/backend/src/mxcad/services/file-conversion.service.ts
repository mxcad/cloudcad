import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IFileConversionService,
  ConversionResult,
  ConversionOptions,
} from '../interfaces/file-conversion.interface';
import { FileTypeDetector } from '../utils/file-type-detector';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class FileConversionService implements IFileConversionService {
  private readonly logger = new Logger(FileConversionService.name);
  private readonly mxCadAssemblyPath: string;
  private readonly mxCadFileExt: string;
  private readonly compression: boolean;

  constructor(private readonly configService: ConfigService) {
    this.mxCadAssemblyPath =
      this.configService.get('MXCAD_ASSEMBLY_PATH') ||
      path.join(
        process.cwd(),
        'mxcadassembly',
        'windows',
        'release',
        'mxcadassembly.exe'
      );
    this.mxCadFileExt = this.configService.get('MXCAD_FILE_EXT') || '.mxweb';
    this.compression = this.configService.get('MXCAD_COMPRESSION') !== 'false';
  }

  async convertFile(options: ConversionOptions): Promise<ConversionResult> {
    let stdout = '';
    let stderr = '';

    try {
      const {
        srcPath,
        fileHash,
        createPreloadingData = true,
        compression = this.compression,
      } = options;

      const param: any = {
        srcpath: srcPath.replace(/\\/g, '/'),
        src_file_md5: fileHash,
        create_preloading_data: createPreloadingData,
      };

      if (!compression) {
        param.compression = 0;
      }

      const cmd = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
      this.logger.log(`执行 MxCAD 转换命令: ${cmd}`);

      const execResult = await execAsync(cmd, {
        encoding: 'utf8',
        timeout: options.timeout || 60000, // 增加超时到60秒
        maxBuffer: 50 * 1024 * 1024, // 增加缓冲区到50MB
      });

      stdout = execResult.stdout;
      stderr = execResult.stderr;

      // 重命名原始文件
      const randomNum = Math.floor(Math.random() * (94552 - 11291) + 11291);
      const newPath = `${srcPath}_${randomNum}.dwg`;

      if (fs.existsSync(srcPath)) {
        fs.renameSync(srcPath, newPath);
        this.logger.log(`原始文件已重命名为: ${newPath}`);
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
        ret.newpath = newPath;

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
    } catch (error: any) {
      // 输出详细错误信息
      this.logger.error(`文件转换异常: ${error.message}`);
      this.logger.error(`命令: ${error.cmd}`);
      this.logger.error(`退出码: ${error.code}`);

      // 确保 stdout 和 stderr 是字符串
      const errorStdout = error.stdout
        ? Buffer.isBuffer(error.stdout)
          ? error.stdout.toString()
          : error.stdout
        : stdout || '';
      const errorStderr = error.stderr
        ? Buffer.isBuffer(error.stderr)
          ? error.stderr.toString()
          : error.stderr
        : stderr || '';

      this.logger.error(`stdout: [${errorStdout}]`);
      this.logger.error(`stdout length: ${errorStdout.length}`);
      this.logger.error(
        `stdout bytes: ${Buffer.from(errorStdout).toString('hex')}`
      );
      this.logger.error(`stderr: [${errorStderr}]`);

      // 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
      const outputToCheck = errorStdout || errorStderr;

      if (outputToCheck) {
        try {
          // 查找 JSON 位置
          const iPos = outputToCheck.lastIndexOf('{"code"');
          this.logger.log(`JSON start position: ${iPos}`);

          if (iPos !== -1) {
            const strOutput = outputToCheck.substring(iPos);
            this.logger.log(`Extracted JSON string: [${strOutput}]`);

            const ret = JSON.parse(strOutput);
            this.logger.log(`Parsed JSON: ${JSON.stringify(ret)}`);

            // 如果输出包含成功的结果，视为转换成功
            if (ret.code === 0) {
              this.logger.log(`检测到转换成功，返回成功状态`);
              const randomNum = Math.floor(
                Math.random() * (94552 - 11291) + 11291
              );
              const newPath = `${options.srcPath}_${randomNum}.dwg`;

              // 重命名原始文件
              if (fs.existsSync(options.srcPath)) {
                fs.renameSync(options.srcPath, newPath);
                this.logger.log(`原始文件已重命名为: ${newPath}`);
              }

              ret.newpath = newPath;
              this.logger.log(`文件转换成功 (从输出解析): ${options.srcPath}`);
              return { isOk: true, ret };
            }
          } else {
            this.logger.log(`未找到 JSON 格式的输出`);
          }
        } catch (parseError) {
          this.logger.log(`解析输出失败: ${parseError.message}`);
        }
      }

      return {
        isOk: false,
        ret: { code: -1, message: error.message },
        error: error.message,
      };
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
}
