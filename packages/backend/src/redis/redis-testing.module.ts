import { Module, Global } from '@nestjs/common';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';

// Mock Redis for testing
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
};

@Global()
@Module({
  providers: [
    {
      provide: getRedisConnectionToken(),
      useValue: mockRedis,
    },
  ],
  exports: [getRedisConnectionToken()],
})
export class RedisTestingModule {}