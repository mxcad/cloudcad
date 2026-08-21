export type CloudFaaSProvider = 'huawei' | 'aliyun' | 'aws';

export interface CloudFaaSConfig {
  /** 函数 URL 端点 */
  endpoint: string;
  /** 函数名称 */
  functionName?: string;
  /** 版本/别名 */
  qualifier?: string;
  /** AK/SK for auth */
  accessKeyId: string;
  accessKeySecret: string;
  /** 区域 */
  region?: string;
}
