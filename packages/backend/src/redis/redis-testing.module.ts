import { Module, Global } from '@nestjs/common';

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
      provide: 'REDIS_CLIENT',
      useValue: mockRedis,
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisTestingModule {}