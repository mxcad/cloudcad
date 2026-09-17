import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import { Response, Request } from 'express';
import { ConversionTaskSseService } from './conversion-task.sse.service';
import { CONVERSION_TASK_CHANNEL } from './conversion-task-sse.constants';

const JWT_SECRET = 'test-jwt-secret';

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
  user?: { id: string };
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

function mockReq(
  query: Record<string, unknown> = {},
  user?: { id: string }
): MockReq {
  return { query, user, on: jest.fn() };
}

/** 取 req.on('close') 注册的清理回调（结束流 + 清定时器，防测试进程挂起） */
function closeHandler(req: MockReq): () => void {
  const entry = req.on.mock.calls.find((c) => c[0] === 'close');
  return (entry ? entry[1] : (() => undefined)) as () => void;
}

describe('ConversionTaskSseService', () => {
  let service: ConversionTaskSseService;
  let eventEmitter: { on: jest.Mock; off: jest.Mock };

  beforeEach(async () => {
    eventEmitter = { on: jest.fn(), off: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ConversionTaskSseService,
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({ secret: JWT_SECRET }),
          },
        },
      ],
    }).compile();
    service = module.get(ConversionTaskSseService);
  });

  describe('resolveUserId', () => {
    it('req.user 存在时返回其 id（优先于 query token）', () => {
      const res = mockRes();
      const req = mockReq({ token: 'ignored' }, { id: 'user-1' });
      expect(
        service.resolveUserId(req as unknown as Request, res as unknown as Response)
      ).toBe('user-1');
    });

    it('req.user 缺失 + 合法 query token → 解析 id', () => {
      const res = mockRes();
      const token = sign({ id: 'user-2' }, JWT_SECRET);
      const req = mockReq({ token });
      expect(
        service.resolveUserId(req as unknown as Request, res as unknown as Response)
      ).toBe('user-2');
    });

    it('req.user 缺失 + 非法 token → 401 + null', () => {
      const res = mockRes();
      const req = mockReq({ token: 'garbage' });
      expect(
        service.resolveUserId(req as unknown as Request, res as unknown as Response)
      ).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.end).toHaveBeenCalled();
    });

    it('req.user 缺失 + 无 token → 401 + null', () => {
      const res = mockRes();
      const req = mockReq({});
      expect(
        service.resolveUserId(req as unknown as Request, res as unknown as Response)
      ).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('streamTasks', () => {
    it('写 SSE 头 + 初始刷新信号 + 订阅 per-user 通道', () => {
      const res = mockRes();
      const req = mockReq();
      service.streamTasks(
        'user-1',
        res as unknown as Response,
        req as unknown as Request
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
      // 初始刷新信号（前端据此立即 refreshCloud + 确认流已建立）
      expect(res.write).toHaveBeenCalledWith('data: {"type":"refresh"}\n\n');
      // 订阅 per-user 通道
      expect(eventEmitter.on).toHaveBeenCalledWith(
        CONVERSION_TASK_CHANNEL('user-1'),
        expect.any(Function)
      );
      closeHandler(req)(); // 清定时器，防测试进程挂起
    });

    it('通道事件触发时写 data 帧；连接关闭后不再写且清订阅', () => {
      const res = mockRes();
      const req = mockReq();
      service.streamTasks(
        'user-1',
        res as unknown as Response,
        req as unknown as Request
      );

      const handler = eventEmitter.on.mock.calls[0][1] as (e: unknown) => void;
      // 任务终态变更事件 → 写 data 帧（含 status）
      handler({ nodeId: 'node-1', status: 'COMPLETED' });
      expect(res.write).toHaveBeenCalledWith(
        'data: {"nodeId":"node-1","status":"COMPLETED","type":"status"}\n\n'
      );

      // 连接关闭 → 清订阅 + 停止写
      const writesBeforeClose = res.write.mock.calls.length;
      closeHandler(req)();
      expect(eventEmitter.off).toHaveBeenCalledWith(
        CONVERSION_TASK_CHANNEL('user-1'),
        handler
      );
      handler({ nodeId: 'node-2', status: 'FAILED' });
      expect(res.write.mock.calls.length).toBe(writesBeforeClose);
    });
  });
});
