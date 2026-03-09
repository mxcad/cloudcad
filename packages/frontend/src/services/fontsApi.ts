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
