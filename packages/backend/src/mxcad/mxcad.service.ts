import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MxCadPermissionService } from './mxcad-permission.service';
import { MinioSyncService } from './minio-sync.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';
import { FileStatus } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream, readdirSync, statSync } from 'fs';

const execAsync = promisify(exec);

@Injectable()
export class MxCadService {
  private readonly logger = new Logger(MxCadService.name);
  private readonly uploadPath: string;
  private readonly tempPath: string;
  private readonly mxCadAssemblyPath: string;
  private readonly mxCadFileExt: string;
  private readonly compression: boolean;
  
  // 当前正在合并转换的文件，防止同一个文件同时多次进行转换合并调用
  private readonly mapCurrentFilesBeingMerged: Record<string, boolean> = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: DatabaseService,
    private readonly permissionService: MxCadPermissionService,
    private readonly minioSyncService: MinioSyncService,
  ) {
    this.uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
    this.tempPath = this.configService.get('MXCAD_TEMP_PATH') || path.join(process.cwd(), 'temp');
    this.mxCadAssemblyPath = this.configService.get('MXCAD_ASSEMBLY_PATH') || 
      path.join(process.cwd(), 'mxcadassembly', 'windows', 'release', 'mxcadassembly.exe');
    this.mxCadFileExt = this.configService.get('MXCAD_FILE_EXT') || '.mxweb';
    this.compression = this.configService.get('MXCAD_COMPRESSION') !== 'false';
    
    // 确保目录存在
    this.ensureDirectoryExists(this.uploadPath);
    this.ensureDirectoryExists(this.tempPath);
  }

  /**
   * 公共日志方法，供其他模块使用
   */
  public logError(message: string, error?: any): void {
    this.logger.error(message, error);
  }

  public logInfo(message: string): void {
    this.logger.log(message);
  }

  public logWarn(message: string): void {
    this.logger.warn(message);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 调用 MxCAD 转换工具
   */
  private async callMxCadAssembly(param: any): Promise<any> {
    return new Promise((resolve) => {
      const cmd = `"${this.mxCadAssemblyPath}" "${JSON.stringify(param)}"`;
      this.logger.log(`执行 MxCAD 转换命令: ${cmd}`);
      
      const options = {
        encoding: 'utf8',
        timeout: 30000, // 30秒超时
      };
      
      exec(cmd, options, (error, stdout, stderr) => {
        if (error) {
          this.logger.error(`MxCAD 转换失败: ${error.message}`);
          this.logger.error(`错误代码: ${error.code}`);
          this.logger.error(`错误信号: ${error.signal}`);
          this.logger.error(`标准错误: ${stderr}`);
          resolve({ code: -1, message: error.message });
          return;
        }

        this.logger.log(`MxCAD 输出: ${stdout}`);
        
        if (stderr) {
          this.logger.warn(`MxCAD 警告: ${stderr}`);
        }

        try {
          let strStdout = stdout.toString();
          const iPos = strStdout.lastIndexOf('{"code"');
          if (iPos !== -1) {
            strStdout = strStdout.substring(iPos);
          }
          const ret = JSON.parse(strStdout);
          resolve(ret);
        } catch (e) {
          this.logger.error(`解析 MxCAD 输出失败: ${e.message}`);
          this.logger.error(`原始输出: ${stdout}`);
          resolve({ code: -1, message: '解析输出失败' });
        }
      });
    });
  }

  /**
   * 获取分片临时目录路径
   */
  private getChunkTempDirPath(fileMd5: string): string {
    return path.join(this.tempPath, `chunk_${fileMd5}`);
  }

  /**
   * 获取文件存储路径
   */
  private getMd5Path(fileMd5: string): string {
    return path.join(this.uploadPath, fileMd5);
  }

  /**
   * 递归删除临时文件夹以及文件夹内文件分片
   */
  private delFileDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (statSync(curPath).isDirectory()) {
          this.delFileDir(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  }

  /**
   * 多个文件通过 Stream 合并为一个文件
   */
  private streamMergeRecursive(
    fileList: any[],
    fileWriteStream: any,
    resultCall: (code: number) => void
  ): void {
    if (!fileList.length) {
      fileWriteStream.end('done');
      resultCall(0);
      return;
    }

    const data = fileList.shift();
    const { filePath: chunkFilePath } = data;
    const currentReadStream = createReadStream(chunkFilePath);
    
    currentReadStream.pipe(fileWriteStream, { end: false });
    
    currentReadStream.on('end', () => {
      this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
    });

    currentReadStream.on('error', (error) => {
      this.logger.error('WriteStream 合并失败', error);
      fileWriteStream.close();
      resultCall(1);
    });
  }

  /**
   * 合并文件入口
   */
  private streamMergeMain(
    sourceFiles: string,
    targetFile: string,
    resultCall: (code: number) => void
  ): void {
    const chunkFilesDir = sourceFiles;
    const list = readdirSync(chunkFilesDir);

    const aryList: any[] = [];
    list.forEach((val: string) => {
      const strNum = val.substring(0, val.indexOf('_'));
      aryList.push({ num: parseInt(strNum, 10), file: val });
    });
    
    aryList.sort((a, b) => a.num - b.num);

    const fileList = aryList.map((val) => ({
      name: val.file,
      filePath: path.resolve(chunkFilesDir, val.file),
    }));

    const fileWriteStream = createWriteStream(targetFile);
    this.streamMergeRecursive(fileList, fileWriteStream, resultCall);
  }

  /**
   * 保存上传状态文件
   */
  private writeStatusFile(name: string, size: number, hash: string): void {
    const status = {
      name,
      size,
      hash,
    };
    const jsonPath = path.join(this.uploadPath, `${hash}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(status));
  }

  /**
   * 转换 DWG/DXF 文件为 MXWEB 格式
   */
  private async convertFile(filePath: string, fileMd5: string): Promise<{ isOk: boolean; ret: any }> {
    return new Promise((resolve) => {
      const param: any = {
        srcpath: filePath.replace(/\\/g, '/'),
        src_file_md5: fileMd5,
        create_preloading_data: true,
      };

      // 如果不压缩，添加 compression 参数
      if (!this.compression) {
        param.compression = 0;
      }

      const cmd = `"${this.mxCadAssemblyPath}" "${JSON.stringify(param)}"`;
      this.logger.log(`执行 MxCAD 转换命令: ${cmd}`);
      
      const exec = require('child_process').exec;
      exec(cmd, (error: any, stdout: any, stderr: any) => {
        // 生成新的文件路径
        const randomNum = Math.floor(Math.random() * (94552 - 11291) + 11291);
        const newPath = `${filePath}_${randomNum}.dwg`;
        
        // 重命名原始文件
        if (fs.existsSync(filePath)) {
          fs.renameSync(filePath, newPath);
          this.logger.log(`原始文件已重命名为: ${newPath}`);
        }

        try {
          let strStdout = stdout.toString();
          const iPos = strStdout.lastIndexOf('{"code"');
          if (iPos !== -1) {
            strStdout = strStdout.substring(iPos);
          }
          const ret = JSON.parse(strStdout);
          ret.newpath = newPath;
          
          if (ret.code === 0) {
            this.logger.log(`文件转换成功: ${filePath}`);
            resolve({ isOk: true, ret });
          } else {
            this.logger.error(`文件转换失败: ${ret.message}`);
            resolve({ isOk: false, ret });
          }
        } catch (e) {
          this.logger.error(`解析 MxCAD 输出失败: ${e.message}`);
          this.logger.error(`原始输出: ${stdout}`);
          resolve({ isOk: false, ret: { code: -1, message: '解析输出失败' } });
        }
      });
    });
  }

  /**
   * 合并转换文件
   */
  public async mergeConvertFile(
    hashFile: string,
    chunks: number,
    fileName: string,
    fileSize: number
  ): Promise<{ ret: string; tz?: boolean }> {
    const fileMd5 = hashFile;
    const tmpDir = this.getChunkTempDirPath(fileMd5);
    
    try {
      // 检查临时目录是否存在
      if (!fs.existsSync(tmpDir)) {
        this.logger.warn(`临时目录不存在: ${tmpDir}`);
        return { ret: MxUploadReturn.kChunkNoExist };
      }

      const stack = fs.readdirSync(tmpDir);
      
      // 判断当前上传的切片等于切片总数
      if (chunks === stack.length) {
        if (this.mapCurrentFilesBeingMerged[fileMd5]) {
          // 文件已经在合并中了，就直接返回
          return { ret: MxUploadReturn.kOk };
        }

        const name = fileName;
        const fileExtName = name.substring(name.lastIndexOf('.') + 1);
        const filename = `${fileMd5}.${fileExtName}`;
        const filepath = path.join(this.uploadPath, filename);

        // 标记文件正在合并
        this.mapCurrentFilesBeingMerged[fileMd5] = true;

        return new Promise((resolve) => {
          this.streamMergeMain(tmpDir, filepath, async (ret) => {
            try {
              this.writeStatusFile(fileName, fileSize, hashFile);
            } catch (e) {
              this.logger.error('写入状态文件失败', e);
            }

            if (ret === 0) {
              // 对合并的文件进行格式转换
              const { isOk, ret: convertRet } = await this.convertFile(filepath, fileMd5);
              this.mapCurrentFilesBeingMerged[fileMd5] = false;
              
              if (isOk) {
                this.delFileDir(tmpDir);
                if (convertRet.tz) {
                  resolve({ ret: MxUploadReturn.kOk, tz: true });
                } else {
                  resolve({ ret: MxUploadReturn.kOk });
                }
              } else {
                resolve({ ret: MxUploadReturn.kConvertFileError });
              }
            } else {
              this.mapCurrentFilesBeingMerged[fileMd5] = false;
              this.logger.error('streamMergeMain error');
              resolve({ ret: MxUploadReturn.kConvertFileError });
            }
          });
        });
      } else {
        return { ret: MxUploadReturn.kOk };
      }
    } catch (error) {
      this.logger.error(`合并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  /**
   * 检查分片是否存在
   */
  public async checkChunkExist(
    chunk: number,
    fileHash: string,
    size: number,
    chunks: number,
    fileName: string,
    context?: any
  ): Promise<{ ret: string }> {
    try {
      const cbfilename = `${chunk}_${fileHash}`;
      const tmpDir = this.getChunkTempDirPath(fileHash);
      const chunkPath = path.join(tmpDir, cbfilename);

      // 检查分片文件是否存在
      if (fs.existsSync(chunkPath)) {
        // 检查文件大小是否匹配
        const stats = statSync(chunkPath);
        if (stats.size === size) {
          // 如果切片已经都齐全了，也需要进行合并操作
          const mergeResult = await this.mergeConvertFile(fileHash, chunks, fileName, size);
          if (mergeResult.ret === MxUploadReturn.kOk) {
            return { ret: MxUploadReturn.kChunkAlreadyExist };
          } else {
            return { ret: MxUploadReturn.kChunkNoExist };
          }
        } else {
          return { ret: MxUploadReturn.kChunkNoExist };
        }
      } else {
        return { ret: MxUploadReturn.kChunkNoExist };
      }
    } catch (error) {
      this.logger.error(`检查分片存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kChunkNoExist };
    }
  }

  /**
   * 检查文件是否存在
   */
  public async checkFileExist(filename: string, fileHash: string, context?: any): Promise<{ ret: string }> {
    try {
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const mxwebFile = `${fileHash}.${suffix}${this.mxCadFileExt}`;
      const mxwebPath = path.join(this.uploadPath, mxwebFile);

      if (fs.existsSync(mxwebPath)) {
        // 文件已存在，创建文件系统节点记录（如果提供了上下文）
        if (context && context.projectId && context.userId) {
          try {
            await this.createFileSystemNode(filename, fileHash, 0, context);
            this.logger.log(`为已存在文件创建系统节点: ${filename}`);
          } catch (error) {
            this.logger.warn(`创建文件系统节点失败: ${error.message}`);
          }
        }
        return { ret: MxUploadReturn.kFileAlreadyExist };
      } else {
        return { ret: MxUploadReturn.kFileNoExist };
      }
    } catch (error) {
      this.logger.error(`检查文件存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kFileNoExist };
    }
  }

  /**
   * 上传分片文件
   */
  public async uploadChunk(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number
  ): Promise<{ ret: string; tz?: boolean }> {
    return this.mergeConvertFile(hash, chunks, name, size);
  }

  /**
   * 上传完整文件并转换
   */
  public async uploadAndConvertFile(
    filePath: string,
    hash: string,
    name: string,
    size: number
  ): Promise<{ ret: string; tz?: boolean }> {
    try {
      this.writeStatusFile(name, size, hash);
      const { isOk, ret } = await this.convertFile(filePath, hash);
      
      if (isOk) {
        if (ret.tz) {
          return { ret: MxUploadReturn.kOk, tz: true };
        } else {
          return { ret: MxUploadReturn.kOk };
        }
      } else {
        return { ret: MxUploadReturn.kConvertFileError };
      }
    } catch (error) {
      this.logger.error(`上传并转换文件失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }

  /**
   * 转换服务器文件
   */
  public async convertServerFile(param: any): Promise<any> {
    try {
      if (param.async === 'true' && param.resultposturl) {
        // 异步转换
        this.callMxCadAssembly(param).then((ret) => {
          // 这里应该发送回调，暂时省略
          this.logger.log(`异步转换完成: ${param.srcpath}`);
        });
        return { code: 0, message: 'aysnc calling' };
      } else {
        // 同步转换
        const ret = await this.callMxCadAssembly(param);
        return ret;
      }
    } catch (error) {
      this.logger.error(`转换服务器文件失败: ${error.message}`, error.stack);
      return { code: 12, message: 'param error' };
    }
  }

  /**
   * 检查图纸状态
   */
  public async checkTzStatus(fileHash: string): Promise<{ code: number }> {
    // 这里应该实现 tz 状态检查逻辑，暂时返回成功
    return { code: 0 };
  }

  /**
   * 创建文件系统节点记录
   */
  private async createFileSystemNode(
    originalName: string,
    fileHash: string,
    fileSize: number,
    context: any
  ): Promise<void> {
    try {
      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.getMimeType(extension);
      
      this.logger.log(`开始创建文件系统节点: ${originalName}, 大小: ${fileSize}字节, 项目: ${context.projectId}, 父目录: ${context.parentId}`);
      
      // 构建正确的 MinIO 路径：projects/{projectId}/files/{fileHash}
      const minioPath = context.projectId 
        ? `projects/${context.projectId}/files/${fileHash}`
        : `mxcad/${fileHash}`; // 兼容旧数据

      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: originalName,
          isFolder: false,
          isRoot: false,
          parentId: context.parentId || null,
          originalName: originalName,
          path: minioPath, // MinIO 路径
          size: fileSize,
          mimeType: mimeType,
          extension: extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash: fileHash, // MD5 哈希
          ownerId: context.userId,
        },
      });
      
      this.logger.log(`文件系统节点创建成功: ${originalName} (${fileHash}), 节点ID: ${fileNode.id}`);
      
      // 异步同步文件到 MinIO
      this.syncFilesToMinioAsync(fileHash, context);
    } catch (error) {
      this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      // 不抛出错误，避免影响 mxcad 上传流程
    }
  }

  /**
   * 异步同步文件到 MinIO
   */
  private async syncFilesToMinioAsync(fileHash: string, context: any): Promise<void> {
    // 使用 setTimeout 让同步操作不阻塞主流程
    setTimeout(async () => {
      try {
        await this.minioSyncService.syncMxCadFiles(fileHash, context);
      } catch (error) {
        this.logger.error(`异步同步文件到 MinIO 失败: ${fileHash}: ${error.message}`, error.stack);
      }
    }, 1000); // 延迟 1 秒执行，确保文件转换完成
  }

  /**
   * 根据文件扩展名获取 MIME 类型
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.mxweb': 'application/octet-stream',
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * 修改后的上传分片文件方法，添加权限验证和文件节点创建
   */
  public async uploadChunkWithPermission(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number,
    context: any
  ): Promise<{ ret: string; tz?: boolean }> {
    console.log('[MxCadService] uploadChunkWithPermission - hash:', hash, 'name:', name, 'chunk:', chunk, 'chunks:', chunks);
    
    // 验证权限
    await this.permissionService.validateUploadPermission(context);
    
    const result = await this.mergeConvertFile(hash, chunks, name, size);
    
    console.log('[MxCadService] mergeConvertFile 返回结果:', result);
    
    // 如果上传成功，创建文件系统节点
    if (result.ret === MxUploadReturn.kOk) {
      await this.createFileSystemNode(name, hash, size, context);
    }
    
    console.log('[MxCadService] uploadChunkWithPermission 最终返回:', result);
    return result;
  }

  /**
   * 合并分片文件方法（用于完成请求）
   */
  public async mergeChunksWithPermission(
    hash: string,
    name: string,
    size: number,
    chunks: number,
    context: any
  ): Promise<{ ret: string; tz?: boolean }> {
    console.log('[MxCadService] mergeChunksWithPermission 开始 - hash:', hash, 'name:', name, 'chunks:', chunks);
    
    // 验证权限
    await this.permissionService.validateUploadPermission(context);
    
    const result = await this.mergeConvertFile(hash, chunks, name, size);
    
    console.log('[MxCadService] mergeConvertFile 结果:', result);
    
    // 如果上传成功，创建文件系统节点
    if (result.ret === MxUploadReturn.kOk) {
      await this.createFileSystemNode(name, hash, size, context);
    }
    
    console.log('[MxCadService] mergeChunksWithPermission 最终返回:', result);
    return result;
  }

  /**
   * 修改后的上传完整文件方法，添加权限验证和文件节点创建
   */
  public async uploadAndConvertFileWithPermission(
    filePath: string,
    hash: string,
    name: string,
    size: number,
    context: any
  ): Promise<{ ret: string; tz?: boolean }> {
    // 验证权限
    await this.permissionService.validateUploadPermission(context);
    
    this.writeStatusFile(name, size, hash);
    const { isOk, ret } = await this.convertFile(filePath, hash);
    
    if (isOk) {
      // 创建文件系统节点
      await this.createFileSystemNode(name, hash, size, context);
      
      if (ret.tz) {
        return { ret: MxUploadReturn.kOk, tz: true };
      } else {
        return { ret: MxUploadReturn.kOk };
      }
    } else {
      return { ret: MxUploadReturn.kConvertFileError };
    }
  }
}