import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import { DrawingIngestService } from './drawing-ingest.service';
import {
  CONVERSION_FILE_CHANNEL,
  type ConversionFileSseEvent,
} from '../conversion/conversion-task-sse.constants';

/**
 * SSE 保活间隔：空闲连接（转换进行中无事件）时防止代理按超时断开。
 * 用 SSE 注释行（`: keep-alive`）——EventSource 视为注释不触发 onmessage，仅保活。
 */
const SSE_KEEPALIVE_INTERVAL_MS = 15000;

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
  private readonly logger = new Logger(ConversionFileSseService.name);

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
    this.setSseHeaders(res);
    res.flushHeaders();

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
    const onEvent = (event: ConversionFileSseEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      clearInterval(keepAliveTimer);
      res.end();
    };
    this.eventEmitter.on(channel, onEvent);

    // 保活：转换进行中期防代理超时断连（注释行不触发前端 onmessage）
    const keepAliveTimer = setInterval(() => {
      if (closed) {
        clearInterval(keepAliveTimer);
        return;
      }
      res.write(': keep-alive\n\n');
    }, SSE_KEEPALIVE_INTERVAL_MS);

    req.on('close', () => {
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      clearInterval(keepAliveTimer);
    });
  }

  private setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }
}
