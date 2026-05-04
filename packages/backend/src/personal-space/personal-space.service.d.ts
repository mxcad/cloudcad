import { DatabaseService } from '../database/database.service';
import { FileSystemNode } from '@prisma/client';
export declare class PersonalSpaceService {
    private database;
    private readonly logger;
    constructor(database: DatabaseService);
    /**
     * 创建私人空间
     */
    createPersonalSpace(userId: string): Promise<FileSystemNode>;
    /**
     * 获取用户私人空间（不存在则自动创建）
     */
    getPersonalSpace(userId: string): Promise<FileSystemNode>;
    /**
     * 判断节点是否为私人空间
     */
    isPersonalSpace(personalSpaceKey: string | null): boolean;
}
//# sourceMappingURL=personal-space.service.d.ts.map