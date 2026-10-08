/** 公共资源库根类型（图纸库 / 图块库），与 NodeType 枚举值同形 */
export type LibraryRootType = 'LIBRARY_DRAWING' | 'LIBRARY_BLOCK';

/**
 * 请求节点上下文（判别联合，由 NodeContextResolver 解析）：
 * - library：节点（或其上溯归属根）属公共资源库 → 按 LIBRARY_*_MANAGE 系统权限
 * - personalSpace：节点是个人空间根 → 按 owner 判定
 * - project：可解析出归属根（项目根 / 个人空间子节点等）→ 按项目权限
 * - nodeOwner：节点存在但上溯不到任何根（孤立节点）→ 按节点 owner 兜底
 * - none：无节点信息或节点缺失 → OptionalAuth 放行 / 报缺少 projectId
 */
export type NodeContext =
  | {
      kind: 'library';
      rootType: LibraryRootType;
      nodeId: string | null;
      ownerId: string | null;
    }
  | {
      kind: 'personalSpace';
      nodeId: string | null;
      ownerId: string | null;
    }
  | {
      kind: 'project';
      projectId: string;
      nodeId: string | null;
      ownerId: string | null;
    }
  | {
      kind: 'nodeOwner';
      nodeId: string;
      nodeType: string;
      ownerId: string | null;
    }
  | {
      kind: 'none';
      nodeId: string | null;
      ownerId: string | null;
    };

export interface RequestLike {
  params?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}
