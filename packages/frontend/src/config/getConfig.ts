///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

const configMap = new Map();
export const getConfig = async <T = object>(
  url: string
): Promise<T | undefined> => {
  if (configMap.has(url)) {
    return configMap.get(url) as T;
  } else {
    try {
      // eslint-disable-next-line no-restricted-globals -- 豁免：通用配置加载器（加载任意配置 URL，非后端 API，ADR-0034 豁免清单）
      const config = await (await fetch(url)).json();
      configMap.set(url, config);
      return config as T;
    } catch {
      // 静默处理配置获取错误
      return undefined;
    }
  }
};
