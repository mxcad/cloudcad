///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 项目列表获取的单一出口（PC 前端）
 *
 * 收敛此前分散在 dashboard / 文件系统 / 侧边栏 / 弹窗等消费点里的重复逻辑：
 * SDK 调用、失败抛出、响应形态归一化（新分页 DTO vs 历史裸数组）、
 * fileStatus 过滤、分页字段兜底。
 *
 * 单一出口 {@link fetchProjects}：调用方只描述「要什么」（分页 / 过滤 / 排序），
 * 拿回统一的 {@link ProjectListPage}。本模块之外不要直接调用
 * `projectControllerGetProjects`。
 *
 * 契约：
 * - **失败时抛出**（SDK `throwOnError: true`）。SDK 默认把错误放在返回值
 *   `{ error }` 里而不抛，不抛则失败会被 UI 当成「暂无项目」空态（历史 bug），
 *   调用方通过 react-query 的 error 态或 try/catch 感知失败。
 * - 不包装 `{ message, data }`：全局 ResponseInterceptor 已完成响应包装。
 * - 类型只从 `@/api-sdk`（@cloudcad/api-sdk 生成物）导入。
 */
import {
  projectControllerGetProjects,
  type FileSystemNodeDto,
  type ProjectFilterType,
  type ProjectListResponseDto,
  type ProjectStatus,
} from '@/api-sdk';
import { isDeletedStatus } from './fileStatus';

/** 项目列表查询参数（对齐 GET /api/v1/file-system/projects 查询参数） */
export interface ProjectListParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段，如 'updatedAt' */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 项目过滤类型：all-全部，owned-我创建的，joined-我加入的 */
  filter?: ProjectFilterType;
  /** 项目状态 */
  projectStatus?: ProjectStatus;
  /** 搜索关键词（匹配名称或描述） */
  search?: string;
  /**
   * 是否剔除 `fileStatus === 'DELETED'` 的节点。
   * 默认 false（原样返回后端结果，保持既有消费点的显示行为不变）。
   */
  excludeDeleted?: boolean;
}

/** 归一化后的项目分页结果（屏蔽后端返回形态差异） */
export interface ProjectListPage {
  nodes: FileSystemNodeDto[];
  /** 以下四个字段为服务端返回值；`excludeDeleted` 不影响计数 */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 项目列表获取的唯一出口 */
export async function fetchProjects(
  params: ProjectListParams = {}
): Promise<ProjectListPage> {
  const { excludeDeleted, ...query } = params;

  const { data } = await projectControllerGetProjects({
    throwOnError: true,
    query: {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      filter: query.filter,
      projectStatus: query.projectStatus,
      search: query.search,
    },
  });

  return normalizeProjectList(data, {
    excludeDeleted,
    requestedPage: query.page,
    requestedLimit: query.limit,
  });
}

/**
 * 响应归一化：兼容
 * 1) 新形态 `{ nodes, total, page, limit, totalPages }`
 * 2) 历史形态：裸 ProjectDto 数组
 * 3) 异常形态（undefined / 其他）→ 空页
 */
function normalizeProjectList(
  data: unknown,
  {
    excludeDeleted,
    requestedPage,
    requestedLimit,
  }: {
    excludeDeleted?: boolean;
    requestedPage?: number;
    requestedLimit?: number;
  }
): ProjectListPage {
  const requestedPageValue = requestedPage ?? 1;
  // 未传 limit 时服务端自定页大小；历史裸数组分支用它兜底算总页数
  const fallbackLimit = requestedLimit ?? (Array.isArray(data) ? data.length : 0);

  let nodes: FileSystemNodeDto[];
  let total: number;
  let page: number;
  let limit: number;
  let totalPages: number;

  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as ProjectListResponseDto).nodes)
  ) {
    const dto = data as ProjectListResponseDto;
    nodes = dto.nodes;
    total = dto.total ?? nodes.length;
    page = dto.page ?? requestedPageValue;
    limit = dto.limit ?? fallbackLimit;
    totalPages =
      dto.totalPages ?? (limit > 0 ? Math.ceil(total / limit) : 0);
  } else {
    nodes = Array.isArray(data)
      ? (data as unknown as FileSystemNodeDto[])
      : [];
    total = nodes.length;
    page = requestedPageValue;
    limit = fallbackLimit > 0 ? fallbackLimit : 1;
    totalPages = Math.ceil(total / limit);
  }

  if (excludeDeleted) {
    nodes = nodes.filter((node) => !isDeletedStatus(node.fileStatus));
  }

  return { nodes, total, page, limit, totalPages };
}
