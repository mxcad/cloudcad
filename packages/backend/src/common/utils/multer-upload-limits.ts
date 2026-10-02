/**
 * multer 上传限额的共享公式（唯一出口）
 *
 * library / mxcad-core / public-file 三处 MulterModule.registerAsync 的 useFactory
 * 原各自逐字手抄同一段「防护网公式」与注释，此处收敛为一份实现。
 */

import type { IRuntimeConfigService } from '@cloudcad/contracts';

/**
 * 计算 multer HTTP 层的 fileSize 上限（字节）。
 *
 * multer 的 fileSize 是 HTTP 层粗粒度防护网，业务层精确限制由运行时配置 maxFileSize
 * 实时校验（LibraryService / checkChunkExist / public-file.controller 等）。
 * 此处上限 = max(运行时 maxFileSize, 固定安全下限)，确保上限始终不低于配置，
 * 调大 maxFileSize 即可放行，multer 永不收紧到配置之下。
 *
 * 仅返回三处 limits 的公共面 fileSize；fields / fieldSize 因各上传场景不同，由调用方自持。
 */
export async function buildMulterUploadLimits(
  runtimeConfigService: IRuntimeConfigService
): Promise<{ fileSize: number }> {
  const runtimeMaxFileSizeMB = await runtimeConfigService.getValue<number>('maxFileSize', 500);
  const runtimeMaxBytes = runtimeMaxFileSizeMB * 1024 * 1024;
  const safetyCeilingBytes = 512 * 1024 * 1024; // 固定兜底，防错误配置导致 multer 成为更紧的限制
  return { fileSize: Math.max(runtimeMaxBytes, safetyCeilingBytes) };
}
