/**
 * 外部参照信息类型定义
 */

/**
 * 外部参照信息
 */
export interface ExternalReferenceInfo {
  /** 外部参照文件名 */
  name: string;
  /** 文件类型 */
  type: 'dwg' | 'image';
  /** 是否已上传 */
  exists: boolean;
  /** 是否为必需 */
  required: boolean;
}

/**
 * 外部参照统计数据
 */
export interface ExternalReferenceStats {
  /** 是否有缺失的外部参照 */
  hasMissing: boolean;
  /** 缺失的外部参照数量 */
  missingCount: number;
  /** 总外部参照数量 */
  totalCount: number;
  /** 外部参照列表 */
  references: ExternalReferenceInfo[];
}

/**
 * 预加载数据结构
 */
export interface PreloadingData {
  /** 图纸状态 */
  tz: boolean;
  /** 源文件 MD5 */
  src_file_md5: string;
  /** 缺失的图片列表 */
  images: string[];
  /** 缺失的外部参照列表 */
  externalReference: string[];
}
