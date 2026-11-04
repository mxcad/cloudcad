import * as fs from 'fs';
import type { Response } from 'express';
import {
  setContentDisposition,
  type ContentDispositionType,
} from './content-disposition';

/**
 * streamFileToResponse 的传输策略选项（缓存策略 / 跨域 / 处置 / 错误文案）。
 *
 * 这些策略此前散落在各文件服务的私有 stream 块里逐处重述（4 种 Cache-Control、
 * 有的带 Pragma/Expires、有的带 code 字段），现作为参数沉进本 seam，调用方只声明
 * 业务策略，不再各自 setHeader + createReadStream + pipe + error 分支。
 */
export interface StreamFileOptions {
  /** Cache-Control 头（不传则不设） */
  cacheControl?: string;
  /** Access-Control-Allow-Origin（不传则不设） */
  allowOrigin?: string;
  /** Content-Disposition 处置类型，默认 attachment */
  disposition?: ContentDispositionType;
  /** 额外设置 Pragma: no-cache */
  pragmaNoCache?: boolean;
  /** 额外设置 Expires: 0 */
  expiresZero?: boolean;
  /** 读错误响应体是否携带 code 字段（如 -1），不传则只返回 message */
  errorCode?: number;
  /** 读错误响应文案（headers 未发送时以 500 返回），默认 'File read failed' */
  errorMessage?: string;
}

/**
 * 将本地文件流式写入 Express 响应（「stat + 响应头 + pipe + 读错误处理 + 完成回调」
 * 传输编排的唯一出口）。
 *
 * 调用方只决策业务策略（传哪个文件、什么文件名、缓存/跨域/处置策略、完成后是否
 * 清理临时产物），不再各自写 statSync/setHeader/createReadStream/pipe/error 分支。
 * Content-Disposition 走 setContentDisposition（中文名编码唯一实现）。
 *
 * @param contentType MIME 类型，默认 application/octet-stream
 * @param onDone 流结束（close）后的回调，用于清理临时产物；异常由调用方自行吞掉
 * @param extra 传输策略选项（缓存/跨域/处置/错误文案），见 StreamFileOptions
 * @returns 流关闭时 resolve 的 Promise（客户端中断亦会触发 close）
 */
export function streamFileToResponse(
  res: Response,
  filePath: string,
  filename: string,
  contentType = 'application/octet-stream',
  onDone?: () => void,
  extra?: StreamFileOptions
): Promise<void> {
  const {
    cacheControl,
    allowOrigin,
    disposition = 'attachment',
    pragmaNoCache,
    expiresZero,
    errorCode,
    errorMessage = 'File read failed',
  } = extra ?? {};

  return new Promise((resolve) => {
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', contentType);
    setContentDisposition(res, filename, disposition);
    res.setHeader('Content-Length', stat.size.toString());
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }
    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    }
    if (pragmaNoCache) {
      res.setHeader('Pragma', 'no-cache');
    }
    if (expiresZero) {
      res.setHeader('Expires', '0');
    }
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    // 客户端中断/连接关闭 → 主动销毁底层读流句柄。
    // 否则 pipe 停止后 fs.ReadStream 句柄持有到 GC，Windows 上文件被一直占用
    // （实例 2026-11-03：公开 mxweb 访问流客户端中断后句柄未释放，旧产物
    // 4b298d….dwg.mxweb 被锁，引擎后续覆盖写报 write file error）。
    const onAbort = () => {
      if (!stream.destroyed) stream.destroy();
    };
    res.once('close', onAbort);
    res.once('aborted', onAbort);

    // 单次 settle：正常读完 / 客户端中断 / 读错误三条路径都经此收尾，
    // 保证 Promise 必 resolve（此前 error 路径不 resolve、onDone 抛错也挂起）。
    let settled = false;
    const finish = (runOnDone: boolean) => {
      if (settled) return;
      settled = true;
      if (runOnDone) {
        try {
          onDone?.();
        } catch {
          /* onDone 异常不阻塞 resolve（调用方自行吞） */
        }
      }
      resolve();
    };

    stream.on('error', () => {
      if (!res.headersSent) {
        res
          .status(500)
          .json(
            errorCode === undefined
              ? { message: errorMessage }
              : { code: errorCode, message: errorMessage }
          );
      }
      // 错误后销毁流释放句柄；错误场景不触发 onDone（调用方可能保留产物重试）
      if (!stream.destroyed) stream.destroy();
      finish(false);
    });
    stream.on('close', () => finish(true));
  });
}
