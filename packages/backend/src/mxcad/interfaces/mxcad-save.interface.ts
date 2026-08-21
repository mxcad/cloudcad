/**
 * MxCAD 文件保存服务接口
 * 负责 mxweb 文件的保存、版本控制提交和乐观锁检查
 */
export interface IMxcadSaveService {
  saveMxwebFile(
    nodeId: string,
    file: Express.Multer.File,
    userId?: string,
    userName?: string,
    commitMessage?: string,
    skipBinGeneration?: boolean,
    expectedTimestamp?: string,
    keepSourceFile?: boolean,
  ): Promise<{ success: boolean; message: string; path?: string }>;

  saveMxwebFileByHash(
    nodeId: string,
    fileHash: string,
    userId?: string,
    userName?: string,
    commitMessage?: string,
    skipBinGeneration?: boolean,
    expectedTimestamp?: string,
  ): Promise<{ success: boolean; message: string; path?: string }>;
}
