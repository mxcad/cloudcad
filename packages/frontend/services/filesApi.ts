import { apiClient } from './apiClient';

export const filesApi = {
  list: () => apiClient.get('/files'),

  upload: async (file: File, projectId: string) => {
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return apiClient.post('/file-system/files/upload', {
      fileName: file.name,
      fileContent,
      projectId,
    });
  },

  get: (id: string) => apiClient.get(`/files/${id}`),

  download: (id: string) =>
    apiClient.get(`/file-system/nodes/${id}/download`, {
      responseType: 'blob',
    }),

  update: (id: string, data: any) => apiClient.patch(`/files/${id}`, data),

  delete: (id: string) => apiClient.delete(`/files/${id}`),

  share: (id: string, data: { userId: string; role: string }) =>
    apiClient.post(`/files/${id}/share`, data),

  getAccess: (id: string) => apiClient.get(`/files/${id}/access`),

  updateAccess: (id: string, userId: string, role: string) =>
    apiClient.patch(`/files/${id}/access/${userId}`, { role }),

  removeAccess: (id: string, userId: string) =>
    apiClient.delete(`/files/${id}/access/${userId}`),
};