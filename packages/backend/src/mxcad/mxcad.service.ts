import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MxCadPermissionService } from './mxcad-permission.service';
import { MinioSyncService } from './minio-sync.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';
import { FileStatus } from '@prisma/client';
import { FileTypeDetector } from './utils/file-type-detector';
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
   * 检查用户是否有项目访问权限
   */
  async checkProjectPermission(projectId: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // 管理员有所有权限
      if (userRole === 'ADMIN') {
        return true;
      }
      
      // 检查项目成员权限
      const membership = await this.prisma.projectMember.findFirst({
        where: {
          userId: userId,
          nodeId: projectId,
        },
      });
      
      return !!membership;
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error);
      return false;
    }
  }

  /**
   * 为 MxCAD-App 推断上下文信息
   */
  public async inferContextForMxCadApp(fileHash: string, request: any): Promise<any> {
    try {
      this.logger.log(`为文件哈希 ${fileHash} 推断 MxCAD-App 上下文`);
      
      // 1. 尝试从 Session 获取用户信息
      let user = request.session?.user;
      
      // 2. 如果没有 Session 用户，查找最近活动用户
      if (!user) {
        const recentToken = await this.prisma.refreshToken.findFirst({
          orderBy: { createdAt: 'desc' }
        });
        
        if (recentToken) {
          user = await this.prisma.user.findUnique({
            where: { id: recentToken.userId },
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              role: true,
              status: true,
            },
          });
          
          if (user && user.status === 'ACTIVE') {
            this.logger.log(`使用最近活动用户: ${user.username}`);
          } else {
            user = null;
          }
        }
      }
      
      // 3. 尝试从文件哈希查找项目信息
      let projectId: string | null = null;
      let parentId: string | null = null;
      
      const existingFile = await this.prisma.fileSystemNode.findFirst({
        where: {
          fileHash: fileHash,
          isFolder: false,
        },
        select: {
          parentId: true,
          owner: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
      
      if (existingFile) {
        // 如果文件已存在，使用其父节点信息
        parentId = existingFile.parentId || null;
        
        // 向上查找项目根节点
        let currentNodeId = existingFile.parentId;
        while (currentNodeId) {
          const parentNode = await this.prisma.fileSystemNode.findUnique({
            where: { id: currentNodeId },
            select: { id: true, isRoot: true, parentId: true }
          });
          
          if (parentNode?.isRoot) {
            projectId = parentNode.id;
            break;
          }
          
          currentNodeId = parentNode?.parentId || null;
        }
        
        this.logger.log(`从现有文件推断项目: projectId=${projectId}, parentId=${parentId}`);
      } else {
        // 如果是新文件，尝试从用户的项目中查找默认项目
        if (user) {
          const userProject = await this.prisma.projectMember.findFirst({
            where: {
              userId: user.id,
              user: {
                status: 'ACTIVE'
              }
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true,
                  status: true,
                },
              },
            },
            orderBy: {
              id: 'asc'
            }
          });
          
          if (userProject) {
            projectId = userProject.nodeId;
            parentId = projectId; // 上传到项目根目录
            this.logger.log(`使用用户默认项目: projectId=${projectId}`);
          }
        }
      }
      
      // 4. 如果还是没有项目，创建一个默认项目
      if (!projectId && user) {
        this.logger.log(`为用户 ${user.username} 创建默认项目`);
        const defaultProject = await this.prisma.fileSystemNode.create({
          data: {
            name: `${user.username}的默认项目`,
            isFolder: true,
            isRoot: true,
            parentId: null,
            description: 'MxCAD-App 自动创建的默认项目',
            projectStatus: 'ACTIVE',
            ownerId: user.id,
          },
        });
        
        // 添加用户为项目所有者
        await this.prisma.projectMember.create({
          data: {
            userId: user.id,
            nodeId: defaultProject.id,
            role: 'OWNER',
          },
        });
        
        projectId = defaultProject.id;
        parentId = projectId;
        this.logger.log(`创建默认项目成功: projectId=${projectId}`);
      }
      
      if (!projectId || !user) {
        this.logger.error(`无法推断有效的上下文: projectId=${projectId}, user=${!!user}`);
        return null;
      }
      
      return {
        projectId,
        parentId,
        userId: user.id,
        userRole: user.role,
      };
      
    } catch (error) {
      this.logger.error(`推断 MxCAD-App 上下文失败: ${error.message}`, error);
      return null;
    }
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
    fileSize: number,
    context?: any
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
                
                // 只有在提供了上下文且转换成功时才创建文件系统节点
                if (context && context.userId) {
                  if (!context.projectId) {
                    this.logger.warn('⚠️ 缺少项目ID，无法创建文件系统节点。文件将只保存到MxCAD存储，不会出现在文件系统中。');
                    this.logger.warn('⚠️ 请确保通过文件管理页面访问CAD编辑器，而不是直接访问URL。');
                  }
                  
                  // 只有在有项目ID时才创建文件系统节点
                  if (context.projectId) {
                    try {
                    // 检查是否已存在相同文件哈希的节点（全局去重）
                    const existingNode = await this.prisma.fileSystemNode.findFirst({
                      where: {
                        fileHash: fileMd5,
                      },
                    });
                    
                    // 如果文件已存在，但不在当前项目/文件夹，则创建引用
                    if (existingNode) {
                      if (existingNode.parentId !== context.parentId) {
                        // 创建引用节点（软链接概念）
                        await this.prisma.fileSystemNode.create({
                          data: {
                            name: existingNode.name,
                            isFolder: false,
                            isRoot: false,
                            parentId: context.parentId, // 新的父节点
                            originalName: existingNode.originalName,
                            path: existingNode.path, // 指向同一个文件
                            size: existingNode.size,
                            mimeType: existingNode.mimeType,
                            extension: existingNode.extension,
                            fileStatus: FileStatus.COMPLETED,
                            fileHash: existingNode.fileHash,
                            ownerId: context.userId,
                          },
                        });
                        this.logger.log(`文件已存在，创建引用节点: ${fileName} -> 父节点: ${context.parentId}`);
                      } else {
                        this.logger.log(`文件已存在于当前文件夹，跳过创建: ${fileName}`);
                      }
                    } else {
                      // 文件完全不存在，创建新节点
                      await this.createFileSystemNode(fileName, fileMd5, fileSize, context);
                      this.logger.log(`文件合并完成，创建文件系统节点: ${fileName}`);
                    }
                  } catch (error) {
                      this.logger.error(`创建文件系统节点失败: ${error.message}`, error);
                    }
                  } else {
                    // 没有项目ID，跳过文件系统节点创建
                    this.logger.log(`ℹ️ 跳过文件系统节点创建（缺少项目ID）: ${fileName}`);
                  }
                }
                
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
          // 分片已存在，直接返回，不进行合并操作
          // 合并操作应该在所有分片上传完成后由 uploadChunkWithPermission 触发
          return { ret: MxUploadReturn.kChunkAlreadyExist };
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
    console.log('[MxCadService] checkFileExist - 开始处理');
    console.log('[MxCadService] checkFileExist - 参数:', { filename, fileHash, context });
    
    try {
      const suffix = filename.substring(filename.lastIndexOf('.') + 1);
      const mxwebFile = `${fileHash}.${suffix}${this.mxCadFileExt}`;
      const mxwebPath = path.join(this.uploadPath, mxwebFile);

      console.log('[MxCadService] checkFileExist - 检查文件路径:', mxwebPath);
      console.log('[MxCadService] checkFileExist - 文件是否存在:', fs.existsSync(mxwebPath));

      if (fs.existsSync(mxwebPath)) {
        console.log('[MxCadService] checkFileExist - ✅ 文件已存在，检查上下文条件');
        console.log('[MxCadService] checkFileExist - 上下文检查:', {
          hasContext: !!context,
          hasProjectId: !!context?.projectId,
          hasUserId: !!context?.userId,
          projectId: context?.projectId,
          userId: context?.userId,
        });
        
        // 文件已存在，创建文件系统节点记录（如果提供了上下文）
        if (context && context.projectId && context.userId) {
          console.log('[MxCadService] checkFileExist - ✅ 上下文条件满足，开始创建文件系统节点');
          console.log('[MxCadService] checkFileExist - 上下文详情:', {
            projectId: context.projectId,
            parentId: context.parentId,
            userId: context.userId,
            userRole: context.userRole,
          });
          
          try {
            // 使用事务确保数据一致性
            await this.prisma.$transaction(async (tx) => {
              // 检查是否已存在相同文件哈希的节点（全局去重）
              console.log('[MxCadService] checkFileExist - 查找现有文件节点，哈希:', fileHash);
              const existingNode = await tx.fileSystemNode.findFirst({
                where: {
                  fileHash: fileHash,
                },
              });
              
              console.log('[MxCadService] checkFileExist - 现有节点查找结果:', existingNode ? `存在(${existingNode.id})` : '不存在');
              
              if (!existingNode) {
                console.log('[MxCadService] checkFileExist - 创建新的文件系统节点');
                
                // 获取实际文件大小
                const suffix = filename.substring(filename.lastIndexOf('.') + 1);
                const mxwebFile = `${fileHash}.${suffix}${this.mxCadFileExt}`;
                const mxwebPath = path.join(this.uploadPath, mxwebFile);
                
                let actualFileSize = 0;
                let actualFileName = `${fileHash}.${suffix}${this.mxCadFileExt}`;
                
                try {
                  if (fs.existsSync(mxwebPath)) {
                    const stats = statSync(mxwebPath);
                    actualFileSize = stats.size;
                    console.log('[MxCadService] checkFileExist - 获取到实际文件大小:', actualFileSize);
                  } else {
                    console.log('[MxCadService] checkFileExist - ⚠️ 转换文件不存在，尝试查找其他格式');
                    // 尝试查找其他可能的文件格式
                    const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
                    const allFiles = fs.readdirSync(uploadPath).filter(file => file.startsWith(fileHash));
                    console.log('[MxCadService] checkFileExist - 找到相关文件:', allFiles);
                    
                    if (allFiles.length > 0) {
                      actualFileName = allFiles[0];
                      const firstFile = path.join(uploadPath, allFiles[0]);
                      const firstFileStats = statSync(firstFile);
                      actualFileSize = firstFileStats.size;
                      console.log('[MxCadService] checkFileExist - 使用第一个文件的大小:', actualFileSize);
                    }
                  }
                } catch (error) {
                  this.logger.warn(`获取文件大小失败: ${error.message}`);
                }
                
                // 在事务中创建文件系统节点
                const extension = path.extname(filename).toLowerCase();
                const mimeType = this.getMimeType(extension);
                const accessPath = `/mxcad/file/${actualFileName}`;
                
                const fileNode = await tx.fileSystemNode.create({
                  data: {
                    name: filename,
                    isFolder: false,
                    isRoot: false,
                    parentId: context.parentId || null,
                    originalName: filename,
                    path: accessPath,
                    size: actualFileSize,
                    mimeType: mimeType,
                    extension: extension,
                    fileStatus: FileStatus.COMPLETED,
                    fileHash: fileHash,
                    ownerId: context.userId,
                  },
                });
                
                console.log('[MxCadService] checkFileExist - ✅ 新节点创建成功，ID:', fileNode.id);
                this.logger.log(`为已存在文件创建系统节点: ${filename} (大小: ${actualFileSize}字节)`);
              } else {
                console.log('[MxCadService] checkFileExist - 检查当前项目/文件夹下的引用');
                console.log('[MxCadService] checkFileExist - 查找条件:', {
                  fileHash,
                  parentId: context.parentId,
                  ownerId: context.userId,
                });
                
                // 检查是否在当前项目/文件夹下已有引用
                const existingRef = await tx.fileSystemNode.findFirst({
                  where: {
                    fileHash: fileHash,
                    parentId: context.parentId,
                    ownerId: context.userId,
                  },
                });
                
                console.log('[MxCadService] checkFileExist - 现有引用查找结果:', existingRef ? `存在(${existingRef.id})` : '不存在');
                
                if (!existingRef) {
                  console.log('[MxCadService] checkFileExist - 创建引用节点');
                  // 在事务中创建引用节点
                  const newRef = await tx.fileSystemNode.create({
                    data: {
                      name: existingNode.name,
                      isFolder: false,
                      isRoot: false,
                      parentId: context.parentId,
                      originalName: existingNode.originalName,
                      path: existingNode.path,
                      size: existingNode.size,
                      mimeType: existingNode.mimeType,
                      extension: existingNode.extension,
                      fileStatus: FileStatus.COMPLETED,
                      fileHash: existingNode.fileHash,
                      ownerId: context.userId,
                    },
                  });
                  console.log('[MxCadService] checkFileExist - ✅ 引用节点创建成功，ID:', newRef.id);
                  this.logger.log(`为已存在文件创建引用节点: ${filename} -> 父节点: ${context.parentId}`);
                } else {
                  console.log('[MxCadService] checkFileExist - ⚠️ 文件引用节点已存在，跳过创建');
                  this.logger.log(`文件引用节点已存在，跳过创建: ${filename}`);
                }
              }
            });
            
            console.log('[MxCadService] checkFileExist - ✅ 事务提交成功');
          } catch (error) {
            console.log('[MxCadService] checkFileExist - ❌ 创建文件系统节点失败:', error.message);
            console.log('[MxCadService] checkFileExist - 错误堆栈:', error.stack);
            this.logger.warn(`创建文件系统节点失败: ${error.message}`);
          }
        } else {
          console.log('[MxCadService] checkFileExist - ❌ 上下文条件不满足，跳过文件系统节点创建');
          console.log('[MxCadService] checkFileExist - 条件详情:', {
            hasContext: !!context,
            hasProjectId: !!context?.projectId,
            hasUserId: !!context?.userId,
            context: context,
          });
          this.logger.warn('⚠️ 缺少项目ID或用户ID，无法创建文件系统节点');
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
    chunks: number,
    context?: any
  ): Promise<{ ret: string; tz?: boolean }> {
    return this.mergeConvertFile(hash, chunks, name, size, context);
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
      
      this.logger.log(`🔍 开始创建文件系统节点: ${originalName}, 大小: ${fileSize}字节, 项目: ${context.projectId}, 父目录: ${context.parentId}, 用户: ${context.userId}`);
      
      // 验证上下文参数
      if (!context.projectId || !context.userId) {
        this.logger.error(`❌ 缺少必要的上下文参数: projectId=${context.projectId}, userId=${context.userId}`);
        throw new Error('缺少项目ID或用户ID');
      }
      
      // 首先检查是否已存在相同哈希的文件
      const existingNode = await this.prisma.fileSystemNode.findFirst({
        where: { fileHash: fileHash },
      });
      
      if (existingNode) {
        this.logger.log(`⚠️ 文件哈希已存在: ${fileHash}, 现有节点ID: ${existingNode.id}, 现有父目录: ${existingNode.parentId}`);
        
        // 检查是否在当前项目/文件夹下
        if (existingNode.parentId === context.parentId) {
          this.logger.log(`✅ 文件已存在于当前文件夹，无需重复创建: ${originalName}`);
          return;
        } else {
          // 创建引用节点
          const refNode = await this.prisma.fileSystemNode.create({
            data: {
              name: existingNode.name,
              isFolder: false,
              isRoot: false,
              parentId: context.parentId,
              originalName: existingNode.originalName,
              path: existingNode.path,
              size: existingNode.size,
              mimeType: existingNode.mimeType,
              extension: existingNode.extension,
              fileStatus: FileStatus.COMPLETED,
              fileHash: existingNode.fileHash,
              ownerId: context.userId,
            },
          });
          this.logger.log(`✅ 创建引用节点成功: ${originalName}, 新节点ID: ${refNode.id}`);
          return;
        }
      }
      
      // 扫描MxCAD实际生成的mxweb文件
      const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
      const actualFiles = fs.readdirSync(uploadPath).filter(file => 
        file.startsWith(fileHash) && file.endsWith('.mxweb')
      );
      
      this.logger.log(`🔍 扫描MxCAD文件: 哈希=${fileHash}, 找到文件数=${actualFiles.length}`);
      
      if (actualFiles.length === 0) {
        this.logger.error(`❌ 未找到MxCAD转换后的文件: ${fileHash}`);
        return;
      }
      
      // 使用实际生成的文件名（包含原始扩展名）
      const actualFileName = actualFiles[0];
      const accessPath = `/mxcad/file/${actualFileName}`;

      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: originalName,
          isFolder: false,
          isRoot: false,
          parentId: context.parentId || null,
          originalName: originalName,
          path: accessPath, // 存储MxCAD实际生成的文件访问路径
          size: fileSize,
          mimeType: mimeType,
          extension: extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash: fileHash, // MD5 哈希
          ownerId: context.userId,
        },
      });
      
      this.logger.log(`使用MxCAD实际生成的文件名: ${actualFileName} -> ${accessPath}`);
      
      this.logger.log(`文件系统节点创建成功: ${originalName} (${fileHash}), 节点ID: ${fileNode.id}`);
      
      // 同步MxCAD转换后的文件到MinIO
      try {
        const syncSuccess = await this.minioSyncService.syncMxCadFiles(fileHash, context);
        if (syncSuccess) {
          this.logger.log(`MxCAD文件同步到MinIO成功: ${fileHash}`);
        } else {
          this.logger.warn(`MxCAD文件同步到MinIO失败: ${fileHash}`);
        }
      } catch (syncError) {
        this.logger.error(`MxCAD文件同步异常: ${fileHash}: ${syncError.message}`, syncError);
        // 同步失败不影响文件创建流程
      }
    } catch (error) {
      this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      // 不抛出错误，避免影响 mxcad 上传流程
    }
  }

  /**
   * 为非CAD文件创建文件系统节点
   */
  private async createFileSystemNodeForNonCad(
    originalName: string,
    fileHash: string,
    fileSize: number,
    storageKey: string,
    context: any
  ): Promise<void> {
    try {
      const extension = path.extname(originalName).toLowerCase();
      const mimeType = this.getMimeType(extension);
      
      this.logger.log(`开始创建非CAD文件系统节点: ${originalName}, 大小: ${fileSize}字节, 存储路径: ${storageKey}`);
      
      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: originalName,
          isFolder: false,
          isRoot: false,
          parentId: context.parentId || null,
          originalName: originalName,
          path: storageKey, // MinIO 存储路径
          size: fileSize,
          mimeType: mimeType,
          extension: extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash: fileHash, // 文件哈希
          ownerId: context.userId,
        },
      });
      
      this.logger.log(`非CAD文件系统节点创建成功: ${originalName} (${fileHash}), 节点ID: ${fileNode.id}`);
    } catch (error) {
      this.logger.error(`创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      throw error; // 非CAD文件上传失败应该抛出错误
    }
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
   * 合并分片文件到单个文件
   */
  private async mergeChunksToFile(hash: string, chunks: number, fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunkDir = path.join(this.tempPath, `chunk_${hash}`);
      const mergedFilePath = path.join(this.tempPath, `${hash}_merged_${fileName}`);
      
      this.logger.log(`开始合并分片文件: ${chunkDir} -> ${mergedFilePath}`);
      
      // 确保分片目录存在
      if (!fs.existsSync(chunkDir)) {
        reject(new Error(`分片目录不存在: ${chunkDir}`));
        return;
      }
      
      // 获取所有分片文件
      const chunkFiles: string[] = [];
      for (let i = 0; i < chunks; i++) {
        const chunkFile = path.join(chunkDir, `${i}_${hash}`);
        if (fs.existsSync(chunkFile)) {
          chunkFiles.push(chunkFile);
        } else {
          reject(new Error(`分片文件不存在: ${chunkFile}`));
          return;
        }
      }
      
      // 按顺序合并文件
      const writeStream = fs.createWriteStream(mergedFilePath);
      let currentFileIndex = 0;
      
      const processNextFile = () => {
        if (currentFileIndex >= chunkFiles.length) {
          writeStream.end();
          return;
        }
        
        const readStream = fs.createReadStream(chunkFiles[currentFileIndex]);
        readStream.pipe(writeStream, { end: false });
        
        readStream.on('end', () => {
          currentFileIndex++;
          processNextFile();
        });
        
        readStream.on('error', (error) => {
          writeStream.destroy();
          reject(error);
        });
      };
      
      writeStream.on('finish', () => {
        this.logger.log(`分片文件合并完成: ${mergedFilePath}`);
        resolve(mergedFilePath);
      });
      
      writeStream.on('error', (error) => {
        reject(error);
      });
      
      processNextFile();
    });
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFiles(hash: string, mergedFilePath: string): void {
    try {
      // 删除合并后的文件
      if (fs.existsSync(mergedFilePath)) {
        fs.unlinkSync(mergedFilePath);
      }
      
      // 删除分片目录
      const chunkDir = path.join(this.tempPath, `chunk_${hash}`);
      if (fs.existsSync(chunkDir)) {
        const chunkFiles = fs.readdirSync(chunkDir);
        chunkFiles.forEach(file => {
          const filePath = path.join(chunkDir, file);
          fs.unlinkSync(filePath);
        });
        fs.rmdirSync(chunkDir);
      }
      
      this.logger.log(`临时文件清理完成: ${hash}`);
    } catch (error) {
      this.logger.warn(`清理临时文件失败: ${error.message}`);
    }
  }

  /**
   * 修改后的上传分片文件方法，添加权限验证
   * 注意：这里不创建文件节点，只在文件完全合并后才创建
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
    
    const result = await this.mergeConvertFile(hash, chunks, name, size, context);
    
    console.log('[MxCadService] mergeConvertFile 返回结果:', result);
    
    // 注意：分片上传过程中不创建文件节点，避免重复记录
    // 文件节点创建移至 mergeConvertFile 方法中的文件合并完成后
    
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
    
    // 检查文件类型
    if (FileTypeDetector.needsConversion(name)) {
      // CAD文件：执行转换流程
      console.log('[MxCadService] 检测到CAD文件，执行转换流程');
      const mergeResult = await this.mergeConvertFile(hash, chunks, name, size, context);
      console.log('[MxCadService] mergeChunksWithPermission 最终返回:', mergeResult);
      return mergeResult;
    } else {
      // 非CAD文件：合并分片并直接上传到MinIO
      console.log('[MxCadService] 检测到非CAD文件，合并分片并上传到MinIO');
      try {
        // 合并分片文件
        const mergedFilePath = await this.mergeChunksToFile(hash, chunks, name);
        
        // 上传到MinIO
        const fileBuffer = fs.readFileSync(mergedFilePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;
        
        await this.minioSyncService.uploadFile(storageKey, fileBuffer);
        this.logger.log(`非CAD文件合并并上传到MinIO成功: ${storageKey}`);
        
        // 创建文件系统节点
        await this.createFileSystemNodeForNonCad(name, hash, size, storageKey, context);
        
        // 清理临时文件
        this.cleanupTempFiles(hash, mergedFilePath);
        
        console.log('[MxCadService] mergeChunksWithPermission 非CAD文件处理完成');
        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(`非CAD文件合并上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
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
    
    // 检查文件类型
    if (FileTypeDetector.needsConversion(name)) {
      // CAD文件：执行转换流程
      this.logger.log(`检测到CAD文件，执行转换流程: ${name}`);
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
    } else {
      // 非CAD文件：直接上传到MinIO
      this.logger.log(`检测到非CAD文件，直接上传到MinIO: ${name}`);
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const storageKey = `files/${context.userId}/${Date.now()}-${name}`;
        
        // 上传到MinIO
        await this.minioSyncService.uploadFile(storageKey, fileBuffer);
        this.logger.log(`非CAD文件上传到MinIO成功: ${storageKey}`);
        
        // 创建文件系统节点
        await this.createFileSystemNodeForNonCad(name, hash, size, storageKey, context);
        
        return { ret: MxUploadReturn.kOk };
      } catch (error) {
        this.logger.error(`非CAD文件上传失败: ${error.message}`, error.stack);
        return { ret: MxUploadReturn.kConvertFileError };
      }
    }
  }
}