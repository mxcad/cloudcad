export declare class FileHashService {
    private readonly logger;
    /**
     * 计算文件的 MD5 哈希值
     * 与 mxcad 系统保持一致
     */
    calculateHash(buffer: Buffer): Promise<string>;
    /**
     * 计算流的哈希值（用于大文件）
     */
    calculateHashFromStream(stream: NodeJS.ReadableStream): Promise<string>;
}
//# sourceMappingURL=file-hash.service.d.ts.map