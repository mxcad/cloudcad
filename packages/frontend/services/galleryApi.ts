import { getApiClient } from './apiClient';
import { API_BASE_URL } from '../config/apiConfig';
import type { GalleryFileListDto, AddToGalleryDto } from '../types/api-client';

export const galleryApi = {
  getDrawingsTypes: () =>
    getApiClient().GalleryController_getDrawingsTypes(),

  getDrawingsFileList: (params: GalleryFileListDto) =>
    getApiClient().GalleryController_getDrawingsFileList(undefined, params),

  getBlocksTypes: () =>
    getApiClient().GalleryController_getBlocksTypes(),

  getBlocksFileList: (params: GalleryFileListDto) =>
    getApiClient().GalleryController_getBlocksFileList(undefined, params),

  createType: (galleryType: string, name: string, pid: number) =>
    getApiClient().GalleryController_createType(
      { galleryType },
      { name, pid }
    ),

  updateType: (galleryType: string, typeId: number, name: string) =>
    getApiClient().GalleryController_updateType(
      { galleryType, typeId },
      { name }
    ),

  deleteType: (galleryType: string, typeId: number) =>
    getApiClient().GalleryController_deleteType({ galleryType, typeId }),

  getPreviewImageUrl: (
    galleryType: string,
    secondType: number,
    firstType: number,
    nodeId: string
  ) => {
    return `${API_BASE_URL}/api/gallery/${galleryType}/${secondType}/${firstType}/${nodeId}.jpg`;
  },

  addToGallery: (galleryType: string, params: AddToGalleryDto) =>
    getApiClient().GalleryController_addToGallery({ galleryType }, params),

  removeFromGallery: (galleryType: string, nodeId: string) =>
    getApiClient().GalleryController_removeFromGallery({ galleryType, nodeId }),

  updateGalleryItem: (
    galleryType: string,
    nodeId: string,
    params: {
      firstType: number;
      secondType: number;
      thirdType?: number;
    }
  ) =>
    getApiClient().GalleryController_updateGalleryItem(
      { galleryType, nodeId },
      params
    ),

  /**
   * 获取 mxweb 文件 URL（通过 nodeId）
   * @param nodeId 节点 ID
   * @returns Promise<mxweb 文件的完整 URL>
   */
  getMxwebFileUrlByNodeId: async (nodeId: string): Promise<string> => {
    const { UrlHelper } = await import('../utils/mxcadUtils');
    const response = await getApiClient().FileSystemController_getNode({ nodeId });
    const fileInfo = response.data;
    return UrlHelper.buildMxCadFileUrl(fileInfo.path);
  },
};
