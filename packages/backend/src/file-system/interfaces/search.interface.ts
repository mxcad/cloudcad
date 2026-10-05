///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { SearchDto } from '../dto/search.dto';
import type { NodeListResponseDto } from '../dto/file-system-response.dto';

// 此处曾有 DI token ISEARCH_SERVICE：唯一消费者 node.controller.ts 注入的是具体类
// SearchService，token 从未 @Inject。按 ADR-0020 删除死 token IFileSystemPermissionService
// 的同一口径处理；接口类型 ISearchService 仍被 SearchService implements，保留。

export interface ISearchService {
  search(
    userId: string,
    dto: SearchDto,
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto>;
}
