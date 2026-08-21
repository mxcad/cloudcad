import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

const mockRedisClient: Record<string, unknown> = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
  emit: jest.fn(),
};

Object.assign(mockRedisClient, {
  on: () => mockRedisClient,
  once: () => mockRedisClient,
  duplicate: () => mockRedisClient,
  subscribe: async () => 1,
  unsubscribe: async () => 1,
});

describe('module graph', () => {
  it('all modules compile without UnknownDependenciesException', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRedisConnectionToken())
      .useValue(mockRedisClient)
      .compile();
    expect(module).toBeDefined();
  });
});
