import { logger } from '../helpers';

// Helper function to get environment variables with defaults
const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (value === undefined) {
    logger.warn(`Environment variable ${name} is not set, using default value`);
  }
  return value || '';
};

// Redis configuration
export const REDIS_CONFIG = {
  host: getEnvVar('REDIS_HOST', 'localhost'),
  port: parseInt(getEnvVar('REDIS_PORT', '6379'), 10),
  // Unix socket path 配置，优先使用 socket path
  path: getEnvVar('REDIS_SOCKET_PATH', '/run/redis/redis.sock'),
  // 是否使用 Unix socket
  useSocket: getEnvVar('REDIS_USE_SOCKET', 'true') === 'true',
};

// PostgreSQL configuration
export const POSTGRES_CONFIG = {
  host: getEnvVar('POSTGRES_HOST', 'localhost'),
  database: getEnvVar('POSTGRES_DB', 'trading'),
  user: getEnvVar('POSTGRES_USER', 'postgres'),
  password: getEnvVar('POSTGRES_PASSWORD', ''),
  port: parseInt(getEnvVar('POSTGRES_PORT', '5432'), 10),
};

// K-line service configuration
export const KLINE_ENABLED = getEnvVar('KLINE_ENABLED', 'false') === 'true';
export const KLINE_PERSISTENCE_ENABLED = getEnvVar('KLINE_PERSISTENCE_ENABLED', 'false') === 'true';
