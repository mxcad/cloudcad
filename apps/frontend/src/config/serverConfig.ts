///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getConfig } from './getConfig';

// 服务器配置类型定义
interface UploadFileConfigType {
  baseUrl?: string;
  create?: {
    swf?: string;
    server?: string;
    accept?: {
      extensions?: string;
      mimeTypes?: string;
    };
  };
  fileisExist?: string;
  chunkisExist?: string;
  chunked?: boolean;
  mxfilepath?: string;
  saveUrl?: string;
  saveDwgUrl?: string;
  printPdfUrl?: string;
  cutDwgUrl?: string;
}

interface WasmConfigType {
  url?: string;
  type?: '2d' | '2d-st';
}

interface AiConfigType {
  aiUrl?: string;
}

interface ServerConfigType {
  uploadFileConfig?: UploadFileConfigType;
  wasmConfig?: WasmConfigType;
  aiConfig?: AiConfigType;
  supportTruetypeFont?: boolean;
  webgl1?: boolean;
  defaultFont?: string;
  defaultBigFont?: string;
  defaultTrueTypeFont?: string;
  font?: string[];
  bigFont?: string[];
  trueTypeFont?: string[][];
  isAutomaticJumpToMobilePage?: boolean;
  mobilePageUrl?: string;
  file_ext_name?: string;
  useUtf8?: boolean;
  speechRecognitionModel?: string;
}

export let serverConfig: Partial<ServerConfigType> = {};

export type UploadFileConfig = Partial<UploadFileConfigType>;

export const fetchServerConfig = async () => {
  if (!serverConfig || Object.keys(serverConfig).length === 0) {
    const url = new URL('/public/mxServerConfig.json', import.meta.url).href;
    serverConfig = (await getConfig(url)) ?? {};
  }
  return serverConfig;
};

export const getUploadFileConfig = () => {
  return serverConfig?.uploadFileConfig;
};

export const getWasmConfig = () => {
  return serverConfig?.wasmConfig;
};

export const getAiConfig = () => {
  return serverConfig?.aiConfig;
};

export const getMxCADFileExtName = (ret_dot: boolean = false) => {
  if (serverConfig && serverConfig['file_ext_name']) {
    return ret_dot
      ? '.' + serverConfig['file_ext_name']
      : serverConfig['file_ext_name'];
  } else {
    return ret_dot ? '.mxweb' : 'mxweb';
  }
};
