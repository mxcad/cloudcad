import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';
import { CreateNodeOptions } from '../../common/utils/node-utils';
import { FileTreeService } from '../../file-system/services/file-tree.service';
export { CreateNodeOptions } from '../../common/utils/node-utils';
/**
 * 节点创建上下文
 */
export interface NodeCreationContext {
    /** 节点 ID（项目根目录或文件夹） */
    nodeId: string;
    /** 用户 ID */
    userId: string;
    /** 用户角色 */
    userRole?: string;
    /** 外部参照上传时的源图纸节点 ID */
    srcDwgNodeId?: string;
    /** 是否为图片外部参照 */
    isImage?: boolean;
}
/**
 * 节点引用上下文
 */
export interface NodeReferenceContext {
    /** 文件哈希值 */
    hash: string;
    /** 节点创建上下文 */
    context: NodeCreationContext;
}
/**
 * 节点创建结果
 */
export interface NodeCreationResult {
    /** 是否成功 */
    success: boolean;
    /** 节点 ID（成功时） */
    nodeId?: string;
    /** 错误消息（失败时） */
    errorMessage?: string;
}
/**
 * 节点创建服务
 *
 * 职责：
 * 1. 创建新的文件系统节点
 * 2. 引用已存在的文件系统节点
 * 3. 使用事务确保数据一致性
 * 4. 使用锁防止并发冲突
 */
export declare class NodeCreationService {
    private readonly databaseService;
    private readonly storageManager;
    private readonly concurrencyManager;
    private readonly fileTreeService;
    private readonly logger;
    constructor(databaseService: DatabaseService, storageManager: StorageManager, concurrencyManager: ConcurrencyManager, fileTreeService: FileTreeService);
    /**
     * 创建文件系统节点
     *
     * @param options 创建选项
     * @returns 创建结果
     */
    createNode(options: CreateNodeOptions): Promise<NodeCreationResult>;
    /**
     * 引用已存在的文件系统节点
     *
     * @param hash 文件哈希值
     * @param context 节点引用上下文
     * @returns 创建结果
     */
    referenceNode(hash: string, context: NodeReferenceContext): Promise<NodeCreationResult>;
    /**
     * 执行实际的节点创建操作
     *
     * @param options 创建选项
     * @returns 创建结果
     */
    private performCreateNode;
    /**
     * 执行实际的节点引用操作
     *
     * @param hash 文件哈希值
     * @param context 节点引用上下文
     * @returns 创建结果
     */
    private performReferenceNode;
    /**
     * 获取父节点下的所有现有节点名称
     *
     * @param tx 数据库事务
     * @param parentId 父节点 ID
     * @returns 节点名称列表
     */
    private getExistingNodeNames;
}
//# sourceMappingURL=node-creation.service.d.ts.map