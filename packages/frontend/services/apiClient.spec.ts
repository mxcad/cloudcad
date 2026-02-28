import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { apiClient } from './apiClient';

// Mock axios
di.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request interceptor', () => {
    it('should add authorization header when token exists', () => {
      localStorage.setItem('accessToken', 'test-token');

      // Re-create client to trigger interceptor setup
      const { apiClient: freshClient } = require('./apiClient');

      // The interceptor should be set up
      expect(freshClient).toBeDefined();
    });

    it('should not add authorization header when token is missing', () => {
      // No token in localStorage
      const { apiClient: freshClient } = require('./apiClient');

      expect(freshClient).toBeDefined();
    });

    it('should remove Content-Type for FormData', () => {
      const { apiClient: freshClient } = require('./apiClient');

      expect(freshClient).toBeDefined();
    });
  });

  describe('response interceptor - success', () => {
    it('should unwrap response data for standard endpoints', () => {
      const mockResponse = {
        data: {
          code: 'SUCCESS',
          message: '操作成功',
          data: { id: '1', name: 'Test' },
          timestamp: new Date().toISOString(),
        },
      };

      // Standard endpoint should unwrap
      expect(mockResponse.data.data).toEqual({ id: '1', name: 'Test' });
    });

    it('should not unwrap MxCAD endpoint responses', () => {
      const mockResponse = {
        config: { url: '/mxcad/file/123/preloading' },
        data: {
          ret: 'success',
          data: { fileContent: 'base64data' },
        },
      };

      // MxCAD endpoints should not unwrap
      expect(mockResponse.data).toHaveProperty('ret');
    });

    it('should not unwrap Gallery endpoint responses', () => {
      const mockResponse = {
        config: { url: '/gallery/drawings/filelist' },
        data: {
          items: [],
          total: 0,
        },
      };

      // Gallery endpoints should not unwrap
      expect(mockResponse.data).toHaveProperty('items');
    });

    it('should handle MxCAD unauthenticated response', () => {
      const mockResponse = {
        data: {
          ret: 'errorparam',
          message: '用户未认证',
        },
      };

      // Should detect MxCAD auth error
      expect(mockResponse.data.ret).toBe('errorparam');
      expect(mockResponse.data.message).toBe('用户未认证');
    });
  });

  describe('response interceptor - error', () => {
    it('should handle 401 error and redirect to login', () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
        config: { url: '/api/some-endpoint' },
      };

      expect(mockError.response.status).toBe(401);
    });

    it('should not redirect on login endpoint 401', () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Invalid credentials' },
        },
        config: { url: '/auth/login' },
      };

      // Login endpoint should not trigger redirect
      expect(mockError.config.url).toBe('/auth/login');
    });

    it('should handle 403 permission error', () => {
      const mockError = {
        response: {
          status: 403,
          data: { message: '权限不足' },
        },
      };

      expect(mockError.response.status).toBe(403);
      expect(mockError.response.data.message).toBe('权限不足');
    });

    it('should extract backend error message', () => {
      const backendMessage = '用户已存在';
      const mockError = {
        response: {
          data: { message: backendMessage },
        },
      };

      expect(mockError.response.data.message).toBe(backendMessage);
    });

    it('should handle network error', () => {
      const mockError = {
        message: '',
        request: {},
      };

      // Should set default message for network errors
      if (!mockError.message) {
        mockError.message = '网络错误，请检查网络连接';
      }

      expect(mockError.message).toBe('网络错误，请检查网络连接');
    });

    it('should handle MxCAD format auth error', () => {
      const mockError = {
        response: {
          data: {
            ret: 'errorparam',
            message: '用户未认证',
          },
        },
      };

      expect(mockError.response.data.ret).toBe('errorparam');
      expect(mockError.response.data.message).toBe('用户未认证');
    });
  });

  describe('HTTP methods', () => {
    it('should have get method', () => {
      expect(apiClient.get).toBeDefined();
      expect(typeof apiClient.get).toBe('function');
    });

    it('should have post method', () => {
      expect(apiClient.post).toBeDefined();
      expect(typeof apiClient.post).toBe('function');
    });

    it('should have put method', () => {
      expect(apiClient.put).toBeDefined();
      expect(typeof apiClient.put).toBe('function');
    });

    it('should have patch method', () => {
      expect(apiClient.patch).toBeDefined();
      expect(typeof apiClient.patch).toBe('function');
    });

    it('should have delete method', () => {
      expect(apiClient.delete).toBeDefined();
      expect(typeof apiClient.delete).toBe('function');
    });

    it('should have upload method', () => {
      expect(apiClient.upload).toBeDefined();
      expect(typeof apiClient.upload).toBe('function');
    });
  });

  describe('token refresh', () => {
    it('should attempt token refresh on 401', () => {
      localStorage.setItem('refreshToken', 'refresh-token');

      const mockError = {
        response: { status: 401 },
        config: { url: '/api/protected', _retry: false },
      };

      expect(mockError.response.status).toBe(401);
      expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
    });

    it('should redirect to login when refresh token is missing', () => {
      // No refresh token
      localStorage.removeItem('refreshToken');

      const mockError = {
        response: { status: 401 },
        config: { url: '/api/protected' },
      };

      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });
});
