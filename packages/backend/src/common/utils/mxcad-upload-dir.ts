/**
 * 配置键 mxcadUploadPath 的统一读取出口（唯一 resolver）
 *
 * 此前各消费方散落 `configService.get('mxcadUploadPath') || <默认值>`，
 * 且默认值两派并存（'../../uploads' 与 ''），此处收敛为一份实现。
 */

import type { ConfigService } from '@nestjs/config';

/**
 * 配置键缺省时的相对目录，与 UploadUtilityService / FileConversionService /
 * DrawingIngestService 的历史默认值一致。正常运行时 env 配置层（configuration.ts）
 * 已将该键 resolvePath 为绝对路径（默认 data/uploads），此默认值仅在配置键缺失
 * （如测试 mock）时生效。相对路径由 fs 相对进程工作目录解析，与各消费方现状一致。
 */
export const DEFAULT_MXCAD_UPLOAD_DIR = '../../uploads';

/**
 * 读取 mxcadUploadPath：返回配置键的原始字符串值，缺省/空串时回退
 * DEFAULT_MXCAD_UPLOAD_DIR。不做 path.resolve——相对路径的解析语义与
 * 各消费方现状一致（调用方按需 join/replace）。
 */
export function resolveMxcadUploadDir(configService: ConfigService): string {
  return configService.get<string>('mxcadUploadPath') || DEFAULT_MXCAD_UPLOAD_DIR;
}
