import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import { UserEventsSseService } from './user-events-sse.service';
import { ACCOUNT_EVENTS_CHANNEL } from './account-events-sse.constants';
import { NoticeSseService } from '../notice-center/notice-sse.service';
import { NoticeCenterService } from '../notice-center/notice-center.service';

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
  return { on: jest.fn() };
}

/** 取 req.on('close') 注册的清理回调（结束流 + 清定时器，防测试进程挂起） */
function closeHandler(req: MockReq): () => void {
  const entry = req.on.mock.calls.find((c) => c[0] === 'close');
  return (entry ? entry[1] : (() => undefined)) as () => void;
}

describe('UserEventsSseService', () => {
  let service: UserEventsSseService;
  let eventEmitter: { on: jest.Mock; off: jest.Mock };
  let attachRaw: jest.Mock;
  let detach: jest.Mock;
  let noticeWrite: (frame: unknown) => void;
  let getEffective: jest.Mock;

  beforeEach(async () => {
    eventEmitter = { on: jest.fn(), off: jest.fn() };
    detach = jest.fn();
    noticeWrite = () => undefined;
    attachRaw = jest.fn().mockImplementation((_userId: string, write: (frame: unknown) => void) => {
      noticeWrite = write;
      return detach;
    });
    getEffective = jest.fn().mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        UserEventsSseService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: NoticeSseService, useValue: { attachRaw } },
        { provide: NoticeCenterService, useValue: { getEffective } },
      ],
    }).compile();
    service = module.get(UserEventsSseService);
  });

  it('写 SSE 头 + 挂接通知 fan-out + 订阅账户通道；快照查询完成后推 event: notice 快照帧', async () => {
    getEffective.mockResolvedValue([{ id: 'n1' }]);
    const res = mockRes();
    const req = mockReq();

    await service.openUserEventStream(
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
    expect(attachRaw).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(eventEmitter.on).toHaveBeenCalledWith(
      ACCOUNT_EVENTS_CHANNEL('user-1'),
      expect.any(Function)
    );
    // 建连快照帧（event: notice 命名帧，载荷与 notices/stream 一致）
    expect(res.write).toHaveBeenCalledWith(
      'event: notice\ndata: {"type":"snapshot","notices":[{"id":"n1"}]}\n\n'
    );
    closeHandler(req)(); // 清定时器，防测试进程挂起
  });

  it('账户通道事件 → event: account 命名帧（载荷与旧端点逐字节一致）', async () => {
    const res = mockRes();
    const req = mockReq();
    await service.openUserEventStream(
      'user-1',
      res as unknown as Response,
      req as unknown as Request
    );

    const handler = eventEmitter.on.mock.calls[0][1] as (e: unknown) => void;
    handler({ type: 'membership-changed' });
    expect(res.write).toHaveBeenCalledWith(
      'event: account\ndata: {"type":"membership-changed"}\n\n'
    );
    closeHandler(req)();
  });

  it('通知帧经 attachRaw 的 write 回调写，带 event: notice 前缀', async () => {
    const res = mockRes();
    const req = mockReq();
    await service.openUserEventStream(
      'user-1',
      res as unknown as Response,
      req as unknown as Request
    );

    noticeWrite({ type: 'publish', notice: { id: 'n1' } });
    expect(res.write).toHaveBeenCalledWith(
      'event: notice\ndata: {"type":"publish","notice":{"id":"n1"}}\n\n'
    );
    closeHandler(req)();
  });

  it('连接关闭：清账户订阅 + detach 通知连接 + 之后两类帧都不再写', async () => {
    const res = mockRes();
    const req = mockReq();
    await service.openUserEventStream(
      'user-1',
      res as unknown as Response,
      req as unknown as Request
    );

    const handler = eventEmitter.on.mock.calls[0][1] as (e: unknown) => void;
    closeHandler(req)();

    expect(eventEmitter.off).toHaveBeenCalledWith(
      ACCOUNT_EVENTS_CHANNEL('user-1'),
      handler
    );
    expect(detach).toHaveBeenCalled();

    const writesBefore = res.write.mock.calls.length;
    handler({ type: 'membership-changed' });
    noticeWrite({ type: 'publish', notice: { id: 'n1' } });
    expect(res.write.mock.calls.length).toBe(writesBefore);
  });
});
