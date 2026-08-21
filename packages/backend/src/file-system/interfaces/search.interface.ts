///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { SearchDto } from '../dto/search.dto';
import type { NodeListResponseDto } from '../dto/file-system-response.dto';

export const ISEARCH_SERVICE = 'ISEARCH_SERVICE';

export interface ISearchService {
  search(
    userId: string,
    dto: SearchDto,
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto>;
}
