import { apiClient } from './apiClient';

export const galleryApi = {
  getDrawingsTypes: () =>
    apiClient.post<{
      code: string;
      result: {
        allblocks: Array<{
          id: number;
          pid: number;
          name: string;
          pname: string;
          status: number;
        }>;
      };
    }>('/gallery/drawings/types'),

  getDrawingsFileList: (params: {
    keywords?: string;
    firstType?: number;
    secondType?: number;
    pageIndex: number;
    pageSize: number;
  }) =>
    apiClient.post<{
      sharedwgs: Array<{
        uuid: string;
        filename: string;
        firstType: number;
        secondType: number;
        nodeId: string;
        type: string;
        lookNum: number;
        likeNum: number;
        collect: boolean;
      }>;
      page: {
        index: number;
        size: number;
        count: number;
        max: number;
        up: boolean;
        down: boolean;
      };
    }>('/gallery/drawings/filelist', params),

  getBlocksTypes: () =>
    apiClient.post<{
      code: string;
      result: {
        allblocks: Array<{
          id: number;
          pid: number;
          name: string;
          pname: string;
          status: number;
        }>;
      };
    }>('/gallery/blocks/types'),

  getBlocksFileList: (params: {
    keywords?: string;
    firstType?: number;
    secondType?: number;
    pageIndex: number;
    pageSize: number;
  }) =>
    apiClient.post<{
      sharedwgs: Array<{
        uuid: string;
        filename: string;
        firstType: number;
        secondType: number;
        nodeId: string;
        type: string;
        lookNum: number;
        likeNum: number;
        collect: boolean;
      }>;
      page: {
        index: number;
        size: number;
        count: number;
        max: number;
        up: boolean;
        down: boolean;
      };
    }>('/gallery/blocks/filelist', params),

  createType: (galleryType: 'drawings' | 'blocks', name: string, pid: number) =>
    apiClient.post<{
      code: string;
      data: {
        id: number;
        pid: number;
        name: string;
        pname: string;
        status: number;
      };
    }>(`/gallery/${galleryType}/types/create`, { name, pid }),

  updateType: (
    galleryType: 'drawings' | 'blocks',
    typeId: number,
    name: string
  ) =>
    apiClient.put<{
      code: string;
      data: {
        id: number;
        pid: number;
        name: string;
        pname: string;
        status: number;
      };
    }>(`/gallery/${galleryType}/types/${typeId}`, { name }),

  deleteType: (galleryType: 'drawings' | 'blocks', typeId: number) =>
    apiClient.delete<{
      code: string;
      message: string;
    }>(`/gallery/${galleryType}/types/${typeId}`),

  getPreviewImageUrl: (
    galleryType: 'drawings' | 'blocks',
    secondType: number,
    firstType: number,
    nodeId: string
  ) => {
    const baseUrl =
      (globalThis as any).__VITE_API_BASE_URL__ || 'http://localhost:3001/api';
    return `${baseUrl}/gallery/${galleryType}/${secondType}/${firstType}/${nodeId}.jpg`;
  },

  addToGallery: (
    galleryType: 'drawings' | 'blocks',
    params: {
      nodeId: string;
      firstType: number;
      secondType: number;
      thirdType?: number;
    }
  ) =>
    apiClient.post<{
      code: string;
      data: {
        id: string;
        nodeId: string;
        firstType: number;
        secondType: number;
        thirdType?: number;
        galleryType: string;
      };
    }>(`/gallery/${galleryType}/items`, params),

  removeFromGallery: (galleryType: 'drawings' | 'blocks', nodeId: string) =>
    apiClient.delete<{
      code: string;
      message: string;
    }>(`/gallery/${galleryType}/items/${nodeId}`),

  updateGalleryItem: (
    galleryType: 'drawings' | 'blocks',
    nodeId: string,
    params: {
      firstType: number;
      secondType: number;
      thirdType?: number;
    }
  ) =>
    apiClient.put<{
      code: string;
      data: {
        id: string;
        nodeId: string;
        firstType: number;
        secondType: number;
        thirdType?: number;
        galleryType: string;
      };
    }>(`/gallery/${galleryType}/items/${nodeId}`, params),
};
