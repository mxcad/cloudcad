import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { SseManager } from './sse-manager';

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({ id: 'token-user' }),
}));

function mockResponse() {
  const res: any = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.write = jest.fn().mockReturnValue(true);
  res.flushHeaders = jest.fn();
  res.on = jest.fn();
  res.off = jest.fn();
  return res;
}

function mockRequest(overrides: any = {}) {
  const defaults: any = {
    user: { id: 'user-1' },
    headers: { accept: 'text/event-stream' },
    query: {},
    on: jest.fn(),
  };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] === undefined) {
      delete defaults[key];
    } else {
      defaults[key] = overrides[key];
    }
  }
  return defaults as any;
}

describe('SseManager', () => {
  let sseManager: SseManager;
  let mockEventEmitter: any;
  let mockConfigService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const jwt = require('jsonwebtoken');
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'token-user' });

    mockEventEmitter = {
      on: jest.fn(),
      off: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt') return { secret: 'test-secret' };
        return {};
      }),
    };

    sseManager = new SseManager(
      mockEventEmitter as unknown as EventEmitter2,
      mockConfigService as unknown as ConfigService,
    );
  });

  describe('streamProgress', () => {
    const mockGetProgress = jest.fn();

    beforeEach(() => {
      mockGetProgress.mockResolvedValue({
        status: 'PROCESSING',
        totalCount: 10,
        completedCount: 0,
        errorCount: 0,
      });
    });

    it('should set SSE headers and flush', async () => {
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('should write initial progress and subscribe to events', async () => {
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(mockGetProgress).toHaveBeenCalledWith('user-1');
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('PROCESSING'));
      expect(mockEventEmitter.on).toHaveBeenCalledWith(
        'batch-download.progress.task-1',
        expect.any(Function),
      );
    });

    it('should end stream and skip event subscription when task already completed', async () => {
      mockGetProgress.mockResolvedValue({ status: 'COMPLETED', totalCount: 1, completedCount: 1, errorCount: 0 });
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('COMPLETED'));
      expect(res.end).toHaveBeenCalled();
      expect(mockEventEmitter.on).not.toHaveBeenCalled();
    });

    it('should end stream and skip event subscription when task already failed', async () => {
      mockGetProgress.mockResolvedValue({ status: 'FAILED', totalCount: 1, completedCount: 0, errorCount: 1 });
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('FAILED'));
      expect(res.end).toHaveBeenCalled();
      expect(mockEventEmitter.on).not.toHaveBeenCalled();
    });

    it('should write progress event data when event fires', async () => {
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      const listener = mockEventEmitter.on.mock.calls[0][1];
      listener({ status: 'PROCESSING', totalCount: 10, completedCount: 5, errorCount: 0 });

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"completedCount":5'));
    });

    it('should end stream when event has final status', async () => {
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      const listener = mockEventEmitter.on.mock.calls[0][1];
      listener({ status: 'COMPLETED', totalCount: 10, completedCount: 10, errorCount: 0 });

      expect(res.end).toHaveBeenCalled();
    });

    it('should skip write if client already disconnected before initial', async () => {
      let closeHandler: () => void;
      const res = mockResponse();
      res.on = jest.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'close') closeHandler = cb;
      });
      const req = mockRequest();

      const promise = sseManager.streamProgress('task-1', res, req, mockGetProgress);

      closeHandler!();

      await promise;

      expect(res.write).not.toHaveBeenCalled();
    });

    it('should extract userId from JWT token when not in request user', async () => {
      const jwt = require('jsonwebtoken');
      const res = mockResponse();
      const req = mockRequest({ user: undefined, query: { token: 'my-token' } });

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(jwt.verify).toHaveBeenCalledWith('my-token', 'test-secret');
      expect(mockGetProgress).toHaveBeenCalledWith('token-user');
    });

    it('should return 401 when token auth fails', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => { throw new Error('bad token'); });
      const res = mockResponse();
      const req = mockRequest({ user: undefined, query: { token: 'bad-token' } });

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.end).toHaveBeenCalled();
      expect(mockGetProgress).not.toHaveBeenCalled();
    });

    it('should poll via getProgress every 5s as fallback', async () => {
      jest.useFakeTimers();
      const res = mockResponse();
      const req = mockRequest();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      mockGetProgress.mockClear();
      jest.advanceTimersByTime(5000);
      expect(mockGetProgress).toHaveBeenCalledWith('user-1');

      jest.advanceTimersByTime(5000);
      expect(mockGetProgress).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should clean up event listener and polling on request close', async () => {
      let reqCloseHandler: () => void;
      const req = mockRequest();
      req.on = jest.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'close') reqCloseHandler = cb;
      });
      const res = mockResponse();

      await sseManager.streamProgress('task-1', res, req, mockGetProgress);

      expect(reqCloseHandler).toBeDefined();
      reqCloseHandler!();
      expect(mockEventEmitter.off).toHaveBeenCalledWith(
        'batch-download.progress.task-1',
        expect.any(Function),
      );
    });
  });
});
