import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockRequest = {
      url: '/test',
      method: 'GET',
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('catch', () => {
    it('should handle HttpException with string message', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR', // 字符串消息时使用默认代码
        message: 'Test error',
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
      });
    });

    it('should handle HttpException with object response', () => {
      const exception = new HttpException(
        { message: 'Validation error', code: 'VALIDATION_ERROR' },
        HttpStatus.UNPROCESSABLE_ENTITY
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 'VALIDATION_ERROR',
        message: 'Validation error',
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
      });
    });

    it('should handle standard Error', () => {
      const exception = new Error('Standard error');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Standard error',
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
      });
    });

    it('should handle unknown exception', () => {
      const exception = 'Unknown error';

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
      });
    });

    it('should map common HTTP status codes correctly', () => {
      const testCases = [
        { status: 400, code: 'BAD_REQUEST' },
        { status: 401, code: 'UNAUTHORIZED' },
        { status: 403, code: 'FORBIDDEN' },
        { status: 404, code: 'NOT_FOUND' },
        { status: 409, code: 'CONFLICT' },
        { status: 422, code: 'UNPROCESSABLE_ENTITY' },
        { status: 500, code: 'INTERNAL_SERVER_ERROR' },
        { status: 503, code: 'SERVICE_UNAVAILABLE' },
      ];

      testCases.forEach(({ status, code }) => {
        jest.clearAllMocks();
        const exception = new HttpException({ message: 'Test' }, status);
        filter.catch(exception, mockHost);

        expect(mockResponse.json).toHaveBeenLastCalledWith(
          expect.objectContaining({ code })
        );
      });
    });

    it('should use UNKNOWN_ERROR for unmapped status codes', () => {
      jest.clearAllMocks();
      const exception = new HttpException({ message: 'Test' }, 418); // I'm a teapot

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'UNKNOWN_ERROR' })
      );
    });

    it('should include request path and method in error response', () => {
      mockRequest.url = '/api/users';
      mockRequest.method = 'POST';
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/users',
          method: 'POST',
        })
      );
    });

    it('should include timestamp in error response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });
  });
});
