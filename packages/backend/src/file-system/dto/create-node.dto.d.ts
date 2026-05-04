/**
 * 创建节点 DTO（统一项目和文件夹创建）
 *
 * 规则：
 * - parentId 为空时，创建项目（isRoot=true）
 * - parentId 有值时，创建文件夹（isRoot=false）
 */
export declare class CreateNodeDto {
    name: string;
    description?: string;
    parentId?: string;
}
//# sourceMappingURL=create-node.dto.d.ts.map