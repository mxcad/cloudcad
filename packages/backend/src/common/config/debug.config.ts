import { registerAs } from '@nestjs/config';

export default registerAs('debug', () => ({
  /** 是否启用调试模式 */
  enabled: process.env.DEBUG_ENABLED === 'true',

  /** 各模块日志级别: 'debug' | 'log' | 'warn' | 'error' | 'off' */
  modules: {
    /** 文件系统模块 */
    fileSystem: process.env.DEBUG_FILESYSTEM || 'off',
    /** MxCAD 模块 */
    mxcad: process.env.DEBUG_MXCAD || 'off',
    /** 文件上传模块 */
    upload: process.env.DEBUG_UPLOAD || 'off',
    /** 认证模块 */
    auth: process.env.DEBUG_AUTH || 'off',
    /** 数据库模块 */
    database: process.env.DEBUG_DATABASE || 'off',
    /** 缓存模块 */
    cache: process.env.DEBUG_CACHE || 'off',
  },

  /** 是否输出到控制台 */
  console: true,

  /** 日志文件路径（留空则不写入文件） */
  filePath: process.env.DEBUG_FILE_PATH || '',
}));
