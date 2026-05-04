export interface UploadChunkOptions {
    hash: string;
    name: string;
    size: number;
    chunk: number;
    chunks: number;
    context: import('../node/filesystem-node.service').FileSystemNodeContext;
}
export interface MergeOptions {
    hash: string;
    name: string;
    size: number;
    chunks: number;
    context: import('../node/filesystem-node.service').FileSystemNodeContext;
    srcDwgNodeId?: string;
}
export interface MergeResult {
    ret: string;
    tz?: boolean;
    nodeId?: string;
}
export interface UploadFileOptions {
    filePath: string;
    hash: string;
    name: string;
    size: number;
    context: import('../node/filesystem-node.service').FileSystemNodeContext;
}
//# sourceMappingURL=file-upload-manager.types.d.ts.map