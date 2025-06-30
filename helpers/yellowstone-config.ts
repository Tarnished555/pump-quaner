// Yellowstone gRPC client configuration

// Helper function to get environment variables with defaults
const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (value === undefined) {
    console.warn(`Environment variable ${name} is not set, using default value`);
  }
  return value || '';
};

// Yellowstone gRPC configuration
export const YELLOWSTONE_CONFIG = {
  endpoint: getEnvVar('GRPC_ENDPOINT', 'https://solana-yellowstone-grpc.publicnode.com:443'),
  maxMessageLength: parseInt(getEnvVar('GRPC_MAX_MESSAGE_LENGTH', '134217728')), // 128MB
  commitment: getEnvVar('GRPC_COMMITMENT', 'processed'),
  pingIntervalMs: parseInt(getEnvVar('GRPC_PING_INTERVAL_MS', '15000')),
};

// Wallet addresses to monitor
export const MONITORED_WALLETS = getEnvVar('MONITORED_WALLETS', '')
  .split(',')
  .filter(Boolean);
