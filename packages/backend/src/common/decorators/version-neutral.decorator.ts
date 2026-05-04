import { VERSION_NEUTRAL } from '@nestjs/common';

const VERSION_METADATA = '__version__';

/**
 * 标记控制器为版本中立（不影响 defaultVersion）
 * NestJS 从类元数据读取版本配置，默认使用 defaultVersion
 */
export function VersionNeutral(): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(VERSION_METADATA, VERSION_NEUTRAL, target);
  };
}
