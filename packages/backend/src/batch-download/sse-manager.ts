import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BatchJobStatus } from '@cloudcad/db';
import { Response, Request } from 'express';
import { verify } from 'jsonwebtoken';
import { BatchDownloadJob } from './batch-download-job';

@Injectable()
export class SseManager {
  private readonly logger = new Logger(SseManager.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService
  ) {
    const jwtConfig = this.configService.get('jwt', { infer: true });
    this.jwtSecret = jwtConfig?.secret || '';
  }

  async streamProgress<T extends { status: string }>(
    taskId: string,
    res: Response,
    req: Request,
    getProgress: (userId: string) => Promise<T>
  ): Promise<void> {
    const userId = this.resolveUserId(req, res);
    if (!userId) return;

    this.setSseHeaders(res);
    res.flushHeaders();

    let closed = false;
    const markClosed = () => {
      closed = true;
    };
    res.on('close', markClosed);

    try {
      const initial = await getProgress(userId);
      if (!closed) {
        res.write(`data: ${JSON.stringify(initial)}\n\n`);
      }
      if (!this.isActive(initial.status)) {
        if (!closed) res.end();
        return;
      }

      const channel = `batch-download.progress.${taskId}`;
      const onEvent = (event: T) => {
        if (closed) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (!this.isActive(event.status)) {
          res.end();
        }
      };
      this.eventEmitter.on(channel, onEvent);

      const pollTimer = setInterval(async () => {
        if (closed) {
          clearInterval(pollTimer);
          return;
        }
        try {
          const event = await getProgress(userId);
          if (!this.isActive(event.status)) {
            if (!closed) {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
              res.end();
            }
            clearInterval(pollTimer);
          }
        } catch {
          // 轮询失败静默处理，等待下一个 tick
        }
      }, 5000);

      req.on('close', () => {
        closed = true;
        this.eventEmitter.off(channel, onEvent);
        clearInterval(pollTimer);
      });
    } catch (err) {
      if (!closed) {
        res.write(
          `data: ${JSON.stringify({ status: 'FAILED', error: (err as Error).message })}\n\n`
        );
        res.end();
      }
    }
  }

  private resolveUserId(req: Request, res: Response): string | null {
    const user = (req as any).user as { id?: string } | undefined;
    if (user?.id) return user.id;

    const token = (req.query as any)?.token;
    if (token) {
      try {
        const decoded = verify(token, this.jwtSecret) as { id: string };
        return decoded.id;
      } catch {
        res.status(401).end();
        return null;
      }
    }

    res.status(401).end();
    return null;
  }

  private setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  private isActive(status: string): boolean {
    return BatchDownloadJob.isActive(status as BatchJobStatus);
  }
}
