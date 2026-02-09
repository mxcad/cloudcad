export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  database: DatabaseConfig;
  redis: RedisConfig;
  upload: {
    maxSize: number;
    allowedTypes: string[];
  };
  filesDataPath: string; // 本地存储路径
  svnRepoPath: string; // SVN 仓库存储路径
  // debug 配置已删除，使用 NestJS 原生日志
}
