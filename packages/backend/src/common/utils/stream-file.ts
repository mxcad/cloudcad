import * as fs from 'fs';
import type { Response } from 'express';
import { setContentDisposition } from './content-disposition';

/**
 * 将本地文件流式写入 Express 响应（「stat + 响应头 + pipe + 读错误处理 + 完成回调」
 * 传输编排的唯一出口）。
 *
 * 调用方只决策业务策略（传哪个文件、什么文件名、完成后是否清理临时产物），
 * 不再各自写 statSync/setHeader/createReadStream/pipe/error 分支。
 * Content-Disposition 走 setContentDisposition（中文名编码唯一实现）。
 *
 * @param onDone 流结束（close）后的回调，用于清理临时产物；异常由调用方自行吞掉
 * @returns 流关闭时 resolve 的 Promise（客户端中断亦会触发 close）
 */
export function streamFileToResponse(
  res: Response,
  filePath: string,
  filename: string,
  contentType = 'application/octet-stream',
  onDone?: () => void
): Promise<void> {
  return new Promise((resolve) => {
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', contentType);
    setContentDisposition(res, filename);
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ message: 'File read failed' });
      }
    });
    stream.on('close', () => {
      onDone?.();
      resolve();
    });
  });
}
