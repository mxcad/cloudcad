/**
 * DebugLogger 使用示例
 *
 * 启用调试模式方法：
 * 1. 在 .env 文件中添加配置：
 *    DEBUG_ENABLED=true
 *    DEBUG_FILESYSTEM=debug
 *    DEBUG_MXCAD=log
 *    DEBUG_UPLOAD=debug
 *
 * 2. 或设置环境变量：
 *    $env:DEBUG_ENABLED="true"; $env:DEBUG_FILESYSTEM="debug"
 *
 * 日志级别：debug < log < warn < error
 * 例如设置为 'log' 时，只输出 log/warn/error，屏蔽 debug
 */

import { Injectable } from '@nestjs/common';
import { DebugLogger } from '../common/utils/debug-logger';

@Injectable()
export class ExampleService {
  constructor(private debugLogger: DebugLogger) {}

  async exampleMethod(id: string, data: any): Promise<void> {
    // 基础日志
    this.debugLogger.log('upload', '开始处理上传请求', { id, filename: data.name });
    this.debugLogger.debug('upload', '请求参数详情', data);
    this.debugLogger.warn('upload', '文件较大，可能需要更长时间处理');
    this.debugLogger.error('upload', '处理失败', new Error('示例错误'));

    // 性能计时
    this.debugLogger.time('upload', '文件处理');
    await this.processFile(data);
    this.debugLogger.timeEnd('upload', '文件处理');

    // 请求/响应日志
    this.debugLogger.request('upload', 'POST', '/api/upload', { id }, data);
    // ... 处理请求
    this.debugLogger.response('upload', 'POST', '/api/upload', 150, { success: true });
  }

  private async processFile(data: any): Promise<void> {
    // 模拟处理
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * 简化用法 - 为每个模块创建专属日志实例
 */
import { ConfigService } from '@nestjs/config';

// 在模块构造函数中简化使用
function createModuleLogger(moduleName: string, configService: ConfigService) {
  return {
    debug: (msg: string, data?: any) => {
      if (process.env.DEBUG_ENABLED === 'true') {
        const level = process.env[`DEBUG_${moduleName.toUpperCase()}`] || 'off';
        if (level !== 'off') {
          console.log(`[${moduleName.toUpperCase()}] ${msg}`, data || '');
        }
      }
    },
    log: (msg: string, data?: any) => console.log(`[${moduleName.toUpperCase()}] ${msg}`, data || ''),
  };
}

// 使用示例
/*
@Injectable()
export class FileSystemService {
  private logger = createModuleLogger('fileSystem', this.configService);

  async getChildren(nodeId: string) {
    this.logger.debug('获取子节点', { nodeId });
    // ...
    this.logger.log('查询完成', { count: result.length });
  }
}
*/

/**
 * .env 配置示例
 */
export const DEBUG_ENV_EXAMPLE = `
# 调试模式配置
DEBUG_ENABLED=true

# 各模块日志级别: debug | log | warn | error | off
DEBUG_FILESYSTEM=debug
DEBUG_MXCAD=log
DEBUG_UPLOAD=debug
DEBUG_AUTH=warn
DEBUG_DATABASE=off
DEBUG_CACHE=off

# 日志文件路径（可选，留空则只输出到控制台）
DEBUG_FILE_PATH=./logs/debug.log
`;
