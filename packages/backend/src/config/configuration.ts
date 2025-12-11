import { AppConfig } from './app.config';

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3001', 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'cloucad',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10) || 20,
    connectionTimeoutMillis:
      parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10) || 30000,
    idleTimeoutMillis:
      parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10) || 30000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10) || 0,
    maxRetriesPerRequest:
      parseInt(process.env.REDIS_MAX_RETRIES || '3', 10) || 3,
    retryDelayOnFailover:
      parseInt(process.env.REDIS_RETRY_DELAY || '100', 10) || 100,
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    region: process.env.MINIO_REGION || 'us-east-1',
    bucket: process.env.MINIO_BUCKET || 'cloucad',
  },
  upload: {
    maxSize:
      parseInt(process.env.UPLOAD_MAX_SIZE || '104857600', 10) ||
      100 * 1024 * 1024, // 100MB
    allowedTypes: (
      process.env.UPLOAD_ALLOWED_TYPES || '.dwg,.dxf,.pdf,.png,.jpg,.jpeg'
    ).split(','),
  },
});
