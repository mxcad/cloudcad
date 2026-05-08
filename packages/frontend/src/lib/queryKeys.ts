/**
 * 参数化 queryKey 工厂
 *
 * 集中管理所有 @tanstack/react-query 的 queryKey，
 * 消除分散定义带来的命名冲突风险，并提供类型安全的缓存失效能力。
 *
 * 使用示例：
 * ```ts
 * // 查询
 * useQuery({ queryKey: queryKeys.dashboard.projects, queryFn: ... })
 * useQuery({ queryKey: queryKeys.roles.byProject(projectId), queryFn: ... })
 *
 * // 按前缀批量失效
 * queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all })
 * queryClient.invalidateQueries({ queryKey: queryKeys.roles.all })
 * ```
 */
export const queryKeys = {
  // ─── Dashboard ────────────────────────────────────────────────────
  dashboard: {
    all: ['dashboard'] as const,
    projects: ['dashboard', 'projects'] as const,
    personalSpaceChildren: (personalSpaceId: string) =>
      ['dashboard', 'personal-space', 'children', personalSpaceId] as const,
  },

  // ─── File System ──────────────────────────────────────────────────
  fileSystem: {
    all: ['fileSystem'] as const,
    personalSpace: ['personalSpace'] as const,
    node: (nodeId: string) => ['fileSystem', 'node', nodeId] as const,
    children: (nodeId: string) => ['fileSystem', 'children', nodeId] as const,
    trash: ['fileSystem', 'trash'] as const,
    search: (params: Record<string, unknown>) =>
      ['fileSystem', 'search', params] as const,
    storageQuota: ['fileSystem', 'storageQuota'] as const,
  },

  // ─── Projects (selection lists) ───────────────────────────────────
  // 注意：与 dashboard.projects 不同，这里用于 SaveAs 等选择列表场景
  projects: {
    all: ['projects', 'all'] as const,
  },

  // ─── Users ────────────────────────────────────────────────────────
  users: {
    all: ['users'] as const,
  },

  // ─── Roles ────────────────────────────────────────────────────────
  roles: {
    all: ['roles'] as const,
    byProject: (projectId: string) =>
      ['projectRolesByProject', projectId] as const,
  },

  // ─── Audit Log ────────────────────────────────────────────────────
  auditLog: {
    all: ['auditLog'] as const,
    list: (params: Record<string, unknown>) =>
      ['auditLogList', params] as const,
    stats: ['auditLogStats'] as const,
  },

  // ─── Current User ─────────────────────────────────────────────────
  currentUser: ['currentUser'] as const,

  // ─── Library ──────────────────────────────────────────────────────
  library: {
    all: ['library'] as const,
    drawing: {
      all: ['library', 'drawing'] as const,
      library: ['library', 'drawing', 'library'] as const,
      children: (nodeId: string) =>
        ['library', 'drawing', 'children', nodeId] as const,
      allFiles: (nodeId: string) =>
        ['library', 'drawing', 'allFiles', nodeId] as const,
      node: (nodeId: string) =>
        ['library', 'drawing', 'node', nodeId] as const,
    },
    block: {
      all: ['library', 'block'] as const,
      library: ['library', 'block', 'library'] as const,
      children: (nodeId: string) =>
        ['library', 'block', 'children', nodeId] as const,
      allFiles: (nodeId: string) =>
        ['library', 'block', 'allFiles', nodeId] as const,
      node: (nodeId: string) =>
        ['library', 'block', 'node', nodeId] as const,
    },
  },
} as const;
