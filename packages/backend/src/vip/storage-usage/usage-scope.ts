/**
 * 用量聚合作用域判别联合（对齐 IngestSource 先例，见 #224 决议 3）
 *
 * - kind:'personal'：个人空间全部文件（内部解析个人空间根，个人空间缺失返回 0）
 * - kind:'project'：项目全部成员的文件（项目口径 = 全项目成员，ADR-0017，无 ownerId 过滤）
 * - kind:'subtree'：子树内文件；status:'completed' 只统计未删除且 COMPLETED 的，
 *   status:'all' 不过滤（trash 恢复场景，被删除子树文件也会恢复）
 * - kind:'owned'：用户本人拥有的全部文件（仪表盘统计，不过滤 COMPLETED）
 */
export type UsageScope =
  | { kind: 'personal'; userId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'subtree'; nodeId: string; status: 'completed' | 'all' }
  | { kind: 'owned'; userId: string };

export type SubtreeUsageScope = Extract<UsageScope, { kind: 'subtree' }>;
