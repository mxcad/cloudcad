///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getConfig } from './getConfig';
import type ServerConfigType from '../public/ini/myServerConfig.json';

export let serverConfig: Partial<typeof ServerConfigType>;

export type UploadFileConfig = Partial<
  (typeof ServerConfigType)['uploadFileConfig']
>;

export const fetchServerConfig = async () => {
  if (!serverConfig) {
    const url = new URL('/public/mxServerConfig.json', import.meta.url).href;
    serverConfig = await getConfig(url);
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
