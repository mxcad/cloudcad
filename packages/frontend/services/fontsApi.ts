import { apiClient } from './apiClient';

export const fontsApi = {
  getFonts: (location?: 'backend' | 'frontend') =>
    apiClient.get('/font-management', {
      params: location ? { location } : undefined,
    }),

  uploadFont: (
    file: File,
    target: 'backend' | 'frontend' | 'both' = 'both'
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', target);
    return apiClient.post('/font-management/upload', formData);
  },

  deleteFont: (
    fileName: string,
    target: 'backend' | 'frontend' | 'both' = 'both'
  ) => apiClient.delete(`/font-management/${fileName}`, { params: { target } }),

  downloadFont: (fileName: string, location: 'backend' | 'frontend') => {
    return apiClient.get(`/font-management/download/${fileName}`, {
      params: { location },
      responseType: 'blob',
    });
  },
};
