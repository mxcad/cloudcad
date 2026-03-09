import { getApiClient } from './apiClient';
import type {
  UpdateNodeDto,
  MoveNodeDto,
  CopyNodeDto,
  CreateFolderDto,
  UploadFileDto,
  OperationMethods,
} from '../types/api-client';
import type { PdfOptions } from '../components/modals/DownloadFormatModal';

export const filesApi = {
  list: () => getApiClient().FileSystemController_getProjects(),

  upload: async (file: File, parentId: string) => {
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        base64 && resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const data: UploadFileDto = {
      fileName: file.name,
      fileContent,
      parentId,
    };
    return getApiClient().FileSystemController_uploadFile(null, data);
  },

  get: (id: string) =>
    getApiClient().FileSystemController_getNode({ nodeId: id }),

  /** 获取节点的根节点（项目根） */
  getRoot: (id: string) =>
    getApiClient().FileSystemController_getRootNode({ nodeId: id }),

  download: (id: string) =>
    getApiClient().FileSystemController_downloadNode({ nodeId: id }, null, {
      responseType: 'blob',
    }),

  downloadWithFormat: (
    id: string,
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: PdfOptions
  ) => {
    type DownloadParams = Parameters<
      OperationMethods['FileSystemController_downloadNodeWithFormat']
    >[0];
    const params: DownloadParams = {
      nodeId: id,
      format,
      ...(pdfOptions?.width && { width: pdfOptions.width }),
      ...(pdfOptions?.height && { height: pdfOptions.height }),
      ...(pdfOptions?.colorPolicy && { colorPolicy: pdfOptions.colorPolicy }),
    };
    return getApiClient().FileSystemController_downloadNodeWithFormat(
      params,
      null,
      { responseType: 'blob' }
    );
  },

  update: (id: string, data: UpdateNodeDto) =>
    getApiClient().FileSystemController_updateNode({ nodeId: id }, data),

  delete: (id: string, permanent?: boolean) =>
    getApiClient().FileSystemController_deleteNode(
      permanent !== undefined
        ? { nodeId: id, permanently: permanent }
        : { nodeId: id, permanently: false }
    ),

  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().FileSystemController_createFolder({ parentId }, data),

  moveNode: (id: string, data: MoveNodeDto) =>
    getApiClient().FileSystemController_moveNode({ nodeId: id }, data),

  copyNode: (id: string, data: CopyNodeDto) =>
    getApiClient().FileSystemController_copyNode({ nodeId: id }, data),
};
