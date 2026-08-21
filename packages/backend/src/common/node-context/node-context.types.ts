export interface NodeContext {
  nodeId: string | null;
  projectId: string | null;
  nodeType: string | null;
  ownerId: string | null;
  isLibraryNode: boolean;
  isPersonalSpace: boolean;
  /**
   * 库内子节点（FILE/FOLDER）上溯到的公共资源库根节点类型（LIBRARY_DRAWING / LIBRARY_BLOCK）。
   * 库根节点自身为 nodeType；非库上下文为 null。
   */
  libraryRootType: string | null;
}

export interface RequestLike {
  params?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}
