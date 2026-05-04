import type { Readable } from 'node:stream';
/**
 * 存储提供者接口
 *
 * 统一文件存储操作的抽象层，基于 flydrive 的 Disk API。
 * 当前使用 FSDriver（本地文件系统），可替换为 S3/GCS 等远程存储。
 */
export declare const IStorageProvider = "IStorageProvider";
export interface IStorageProvider {
    /** 文件是否存在 */
    exists(key: string): Promise<boolean>;
    /** 同步检查文件是否存在 */
    existsSync(key: string): boolean;
    /** 获取文件内容（UTF-8 字符串） */
    get(key: string): Promise<string>;
    /** 获取文件内容（字节数组） */
    getBytes(key: string): Promise<Uint8Array>;
    /** 获取文件读流 */
    getStream(key: string): Promise<Readable>;
    /** 获取文件元数据 */
    getMetaData(key: string): Promise<{
        contentLength: number;
        contentType: string;
        lastModified: Date;
        etag: string;
    }>;
    /** 写入文件（字符串或字节） */
    put(key: string, contents: string | Uint8Array): Promise<void>;
    /** 写入文件（流） */
    putStream(key: string, contents: Readable): Promise<void>;
    /** 复制文件 */
    copy(source: string, destination: string): Promise<void>;
    /** 移动文件 */
    move(source: string, destination: string): Promise<void>;
    /** 删除文件 */
    delete(key: string): Promise<void>;
    /** 删除目录及内容 */
    deleteAll(prefix: string): Promise<void>;
    /** 获取文件公开 URL */
    getUrl(key: string): Promise<string>;
    /** 列出文件 */
    listAll(prefix: string, options?: {
        recursive?: boolean;
    }): Promise<{
        objects: Array<{
            name: string;
            isFile: boolean;
        }>;
    }>;
    /** 从外部文件系统路径复制文件到存储 */
    copyFromFs(sourcePath: string, destinationKey: string): Promise<void>;
}
//# sourceMappingURL=storage-provider.interface.d.ts.map