import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import { ConversionFileSseService } from './conversion-file.sse.service';
import { DrawingIngestService } from './drawing-ingest.service';
import {
  CONVERSION_FILE_CHANNEL,
  type ConversionFileSseEvent,
} from '../conversion/conversion-task-sse.constants';

/** Express Response mock 形状（保留 jest.Mock 类型以便断言 .mock.calls） */
interface MockRes {
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  status: jest.Mock;
  on: jest.Mock;
}

/** Express Request mock 形状 */
interface MockReq {
  query: Record<string, unknown>;
  on: jest.Mock;
}

function mockRes(): MockRes {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    status: jest.fn().mockReturnThis(),
    on: jest.fn(),
  };
}

function mockReq(): MockReq {
  return { query: {}, on: jest.fn() };
}

/** 取 req.on('close') 注册的清理回调（结束流 + 清定时器，防测试进程挂起） */
function closeHandler(req: MockReq): () => void {
  const entry = req.on.mock.calls.find((c) => c[0] === 'close');
  return (entry ? entry[1] : (() => undefined)) as () => void;
}

describe('ConversionFileSseService', () => {
  let service: ConversionFileSseService;
  let eventEmitter: EventEmitter2;
  let drawingIngestService: { getNoNodeFileState: jest.Mock };

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();
    drawingIngestService = {
      getNoNodeFileState: jest.fn().mockResolvedValue('PROCESSING'),
    };
    const module = await Test.createTestingModule({
      providers: [
        ConversionFileSseService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: DrawingIngestService, useValue: drawingIngestService },
      ],
    }).compile();
    service = module.get(ConversionFileSseService);
  });

  describe('streamFile', () => {
    it('当前状态 PROCESSING：写 SSE 头 + 推当前状态 + 订阅本文件通道', async () => {
      const res = mockRes();
      const req = mockReq();
      await service.streamFile(
        'hash-1',
        res as unknown as Response,
        req as unknown as Request
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
      // 建连先推当前状态（处理「订阅前已转完」竞态）
      expect(res.write).toHaveBeenCalledWith(
        'data: {"hash":"hash-1","status":"PROCESSING"}\n\n'
      );
      expect(res.end).not.toHaveBeenCalled();

      // 完成事件到达 → 写 data 帧并断流（per-task 终态即断）
      eventEmitter.emit(CONVERSION_FILE_CHANNEL('hash-1'), {
        hash: 'hash-1',
        status: 'COMPLETED',
      } satisfies ConversionFileSseEvent);
      expect(res.write).toHaveBeenCalledWith(
        'data: {"hash":"hash-1","status":"COMPLETED"}\n\n'
      );
      expect(res.end).toHaveBeenCalled();

      closeHandler(req)(); // 清定时器，防测试进程挂起
    });

    it('当前状态 COMPLETED：推一次终态即断流，不再订阅通道', async () => {
      drawingIngestService.getNoNodeFileState.mockResolvedValue('COMPLETED');
      const res = mockRes();
      const req = mockReq();
      await service.streamFile(
        'hash-2',
        res as unknown as Response,
        req as unknown as Request
      );

      expect(res.write).toHaveBeenCalledWith(
        'data: {"hash":"hash-2","status":"COMPLETED"}\n\n'
      );
      expect(res.end).toHaveBeenCalled();

      // 未订阅通道：完成事件不产生额外帧
      eventEmitter.emit(CONVERSION_FILE_CHANNEL('hash-2'), {
        hash: 'hash-2',
        status: 'COMPLETED',
      } satisfies ConversionFileSseEvent);
      expect(res.write).toHaveBeenCalledTimes(1);
    });

    it('当前状态 FAILED：推一次终态即断流', async () => {
      drawingIngestService.getNoNodeFileState.mockResolvedValue('FAILED');
      const res = mockRes();
      const req = mockReq();
      await service.streamFile(
        'hash-3',
        res as unknown as Response,
        req as unknown as Request
      );

      expect(res.write).toHaveBeenCalledWith(
        'data: {"hash":"hash-3","status":"FAILED"}\n\n'
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('hash 隔离：其他文件的完成事件不触发本连接推送', async () => {
      const resA = mockRes();
      const reqA = mockReq();
      const resB = mockRes();
      const reqB = mockReq();
      await service.streamFile(
        'hash-a',
        resA as unknown as Response,
        reqA as unknown as Request
      );
      await service.streamFile(
        'hash-b',
        resB as unknown as Response,
        reqB as unknown as Request
      );

      // hash-b 先完成：只有 B 连接收到帧并断流，A 连接不受影响
      eventEmitter.emit(CONVERSION_FILE_CHANNEL('hash-b'), {
        hash: 'hash-b',
        status: 'COMPLETED',
      } satisfies ConversionFileSseEvent);
      expect(resB.write).toHaveBeenCalledWith(
        'data: {"hash":"hash-b","status":"COMPLETED"}\n\n'
      );
      expect(resB.end).toHaveBeenCalled();
      expect(resA.end).not.toHaveBeenCalled();
      const writesBefore = resA.write.mock.calls.length;

      eventEmitter.emit(CONVERSION_FILE_CHANNEL('hash-a'), {
        hash: 'hash-a',
        status: 'FAILED',
      } satisfies ConversionFileSseEvent);
      expect(resA.write).toHaveBeenCalledTimes(writesBefore + 1);

      closeHandler(reqA)();
      closeHandler(reqB)();
    });

    it('连接关闭后完成事件不再写入且清订阅', async () => {
      const res = mockRes();
      const req = mockReq();
      await service.streamFile(
        'hash-4',
        res as unknown as Response,
        req as unknown as Request
      );

      const writesBeforeClose = res.write.mock.calls.length;
      closeHandler(req)();
      eventEmitter.emit(CONVERSION_FILE_CHANNEL('hash-4'), {
        hash: 'hash-4',
        status: 'COMPLETED',
      } satisfies ConversionFileSseEvent);
      expect(res.write.mock.calls.length).toBe(writesBeforeClose);
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
