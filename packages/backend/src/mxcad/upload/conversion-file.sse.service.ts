import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import { setSseHeaders, startSseKeepalive } from '../../common/sse/sse.helpers';
import { DrawingIngestService } from './drawing-ingest.service';
import {
  CONVERSION_FILE_CHANNEL,
  type ConversionFileSseEvent,
} from '../conversion/conversion-task-sse.constants';

/**
 * 无节点（游客 / 公开图纸）转换完成 SSE（per 文件 hash，公开端点）。
 *
 * 游客无 token，订阅不了 per-user 通道（ConversionTaskSseService）；前端打开图纸
 * 后（上传/合并请求立即返回）经 `GET /mxcad/conversion/file-stream?hash=<hash>`
 * 用 EventSource 订阅。建连先推一次当前状态（在途转换表 + mxweb 就位兜底，处理
 * 「订阅前已转完」竞态），再等 `CONVERSION_FILE_CHANNEL(hash)` 完成事件；终态
 * （COMPLETED/FAILED）推送后立即断流——前端打开文件（或报错）后关闭 EventSource，
 * 服务端主动 end 避免长连接滞留（per-task 终态即断，与 batch-download 一致）。
 */
@Injectable()
export class ConversionFileSseService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly drawingIngestService: DrawingIngestService
  ) {}

  /**
   * 打开 per-file SSE 流：写 SSE 头 → 推当前状态 → 订阅本文件通道（完成即推送并断流），
   * 15s 保活（防代理断连），连接关闭时清理订阅与定时器。
   */
  async streamFile(
    hash: string,
    res: Response,
    req: Request
  ): Promise<void> {
    setSseHeaders(res);

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    // 建连推当前状态：在途表（PROCESSING/COMPLETED/FAILED）→ 无记录时 mxweb 就位兜底
    const state = await this.drawingIngestService.getNoNodeFileState(hash);
    if (closed) return;
    res.write(`data: ${JSON.stringify({ hash, status: state })}\n\n`);

    // 终态：推一次即断流（前端据此打开文件或报错，随后关闭 EventSource）
    if (state !== 'PROCESSING') {
      res.end();
      return;
    }

    const channel = CONVERSION_FILE_CHANNEL(hash);
    const stopKeepalive = startSseKeepalive(res, () => closed);
    const onEvent = (event: ConversionFileSseEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      stopKeepalive();
      res.end();
    };
    this.eventEmitter.on(channel, onEvent);

    req.on('close', () => {
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      stopKeepalive();
    });
  }
}
