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

// @deprecated Use @/api-sdk instead.
import { getApiClient } from './apiClient';
import type { UploadFontDto } from '../types/api-client';

// 从后端生成的 DTO 中提取类型
type FontTarget = UploadFontDto['target'];
type FontLocation = Exclude<FontTarget, 'both'>;

export const fontsApi = {
  getFonts: (location?: FontLocation) =>
    getApiClient().FontsController_getFonts(
      location ? { location } : undefined
    ),

  uploadFont: (file: File, target: FontTarget = 'both') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', target);
    return getApiClient().FontsController_uploadFont(
      undefined,
      formData as unknown as UploadFontDto
    );
  },

  deleteFont: (fileName: string, target: FontTarget = 'both') =>
    getApiClient().FontsController_deleteFont({ fileName, target }),

  downloadFont: (fileName: string, location: FontLocation) =>
    getApiClient().FontsController_downloadFont({ fileName, location }, null, {
      responseType: 'blob',
    }),
};
