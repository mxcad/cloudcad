///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import { API_BASE_URL } from '../config/apiConfig';
import type { GalleryFileListDto, AddToGalleryDto } from '../types/api-client';

export const galleryApi = {
  getDrawingsTypes: () => getApiClient().GalleryController_getDrawingsTypes(),

  getDrawingsFileList: (params: GalleryFileListDto) =>
    getApiClient().GalleryController_getDrawingsFileList(undefined, params),

  getBlocksTypes: () => getApiClient().GalleryController_getBlocksTypes(),

  getBlocksFileList: (params: GalleryFileListDto) =>
    getApiClient().GalleryController_getBlocksFileList(undefined, params),

  createType: (galleryType: string, name: string, pid: number) =>
    getApiClient().GalleryController_createType({ galleryType }, { name, pid }),

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
    return `${API_BASE_URL}/gallery/${galleryType}/${secondType}/${firstType}/${nodeId}.jpg`;
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
    const response = await getApiClient().FileSystemController_getNode({
      nodeId,
    });
    const fileInfo = response.data;
    if (!fileInfo) return '';
    if (!fileInfo.path) return '';
    return UrlHelper.buildMxCadFileUrl(fileInfo.path);
  },
};
