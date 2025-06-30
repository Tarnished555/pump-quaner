import { Logger } from 'pino';
import dotenv from 'dotenv';
import { Commitment, Connection, Keypair,BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { logger } from './logger';

dotenv.config();

const retrieveEnvVariable = (variableName: string, logger: Logger) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    logger.error(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};

// Simulation
export const SIMULATION_MODE = retrieveEnvVariable('SIMULATION_MODE', logger) === 'true';

// Connection
export const NETWORK = 'mainnet-beta';
// Wrapped SOL mint address
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const COMMITMENT_LEVEL: Commitment = retrieveEnvVariable('COMMITMENT_LEVEL', logger) as Commitment;
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger);
export const LOOKUP_TABLES_ENABLED = retrieveEnvVariable('LOOKUP_TABLES_ENABLED', logger) === 'true';

// PumpFun
export const SOLSCAN_TOKEN = retrieveEnvVariable('SOLSCAN_TOKEN', logger);

// Bot
export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL', logger);
export const ONE_TOKEN_AT_A_TIME = retrieveEnvVariable('ONE_TOKEN_AT_A_TIME', logger) === 'true';
export const COMPUTE_UNIT_LIMIT = Number(retrieveEnvVariable('COMPUTE_UNIT_LIMIT', logger));
export const COMPUTE_UNIT_PRICE = Number(retrieveEnvVariable('COMPUTE_UNIT_PRICE', logger));
export const PRE_LOAD_EXISTING_MARKETS = retrieveEnvVariable('PRE_LOAD_EXISTING_MARKETS', logger) === 'true';
export const CACHE_NEW_MARKETS = retrieveEnvVariable('CACHE_NEW_MARKETS', logger) === 'true';
export const TRANSACTION_EXECUTOR = retrieveEnvVariable('TRANSACTION_EXECUTOR', logger);
export const CUSTOM_FEE = retrieveEnvVariable('CUSTOM_FEE', logger);
export const DEFAULT_DECIMALS = Number(retrieveEnvVariable('DEFAULT_DECIMALS', logger));

// Buy
export const AUTO_BUY_DELAY = Number(retrieveEnvVariable('AUTO_BUY_DELAY', logger));
export const QUOTE_MINT = retrieveEnvVariable('QUOTE_MINT', logger);
export const QUOTE_AMOUNT = retrieveEnvVariable('QUOTE_AMOUNT', logger);
export const MAX_BUY_RETRIES = Number(retrieveEnvVariable('MAX_BUY_RETRIES', logger));
export const BUY_SLIPPAGE = Number(retrieveEnvVariable('BUY_SLIPPAGE', logger));
export const BUY_AMOUNT_SOL = Number(retrieveEnvVariable('BUY_AMOUNT_SOL', logger));
export const JITO_TIP = retrieveEnvVariable('JITO_TIP', logger) || '0.0001';

// Sell
export const AUTO_SELL = retrieveEnvVariable('AUTO_SELL', logger) === 'true';
export const AUTO_SELL_DELAY = Number(retrieveEnvVariable('AUTO_SELL_DELAY', logger));
export const MAX_SELL_RETRIES = Number(retrieveEnvVariable('MAX_SELL_RETRIES', logger));
export const TAKE_PROFIT = Number(retrieveEnvVariable('TAKE_PROFIT', logger));


// Proxy settings
export const USE_PROXY = retrieveEnvVariable('USE_PROXY', logger) === 'true';
export const PROXY_URL = retrieveEnvVariable('PROXY_URL', logger) || 'http://127.0.0.1:7890';
export const STOP_LOSS = Number(retrieveEnvVariable('STOP_LOSS', logger));
export const PRICE_CHECK_INTERVAL = Number(retrieveEnvVariable('PRICE_CHECK_INTERVAL', logger));
export const PRICE_CHECK_DURATION = Number(retrieveEnvVariable('PRICE_CHECK_DURATION', logger));
export const SELL_SLIPPAGE = Number(retrieveEnvVariable('SELL_SLIPPAGE', logger));

// Filters
export const FILTER_CHECK_INTERVAL = Number(retrieveEnvVariable('FILTER_CHECK_INTERVAL', logger));
export const FILTER_CHECK_DURATION = Number(retrieveEnvVariable('FILTER_CHECK_DURATION', logger));
export const CONSECUTIVE_FILTER_MATCHES = Number(retrieveEnvVariable('CONSECUTIVE_FILTER_MATCHES', logger));

export const CHECK_HOLDER_DISTRIBUTION = retrieveEnvVariable('CHECK_HOLDER_DISTRIBUTION', logger) === 'true';
export const MAX_SINGLE_HOLDER_SHARE = Number(retrieveEnvVariable('MAX_SINGLE_HOLDER_SHARE', logger) || '10');
export const MAX_TOP10_HOLDERS_SHARE = Number(retrieveEnvVariable('MAX_TOP10_HOLDERS_SHARE', logger) || '40');

// 单独过滤器 - 可以单独控制每个检查
export const MIN_BALANCE_SOL_AMOUNT=Number(retrieveEnvVariable('MIN_BALANCE_SOL_AMOUNT', logger) || '2');
export const CHECK_TOPHOLDER_BALANCE=retrieveEnvVariable('CHECK_TOPHOLDER_BALANCE', logger) === 'true';
export const MIN_BALANCE_HOLDERS=Number(retrieveEnvVariable('MIN_BALANCE_HOLDERS', logger) || '4');


export const CHECK_DEV_CLEARED = retrieveEnvVariable('CHECK_DEV_CLEARED', logger) === 'true';
export const CHECK_SNIPER_CLEARED = retrieveEnvVariable('CHECK_SNIPER_CLEARED', logger) === 'true';
export const CHECK_PROGRESS_IN_RANGE = retrieveEnvVariable('CHECK_PROGRESS_IN_RANGE', logger) === 'true';
export const MAX_PROGRESS = Number(retrieveEnvVariable('MAX_PROGRESS', logger) || '40');
export const MIN_PROGRESS = Number(retrieveEnvVariable('MIN_PROGRESS', logger) || '0');

// 交易量过滤器 - 检查交易笔数和交易金额
export const CHECK_TRADE_VOLUME = retrieveEnvVariable('CHECK_TRADE_VOLUME', logger) === 'true';
export const MIN_TRADE_COUNT = Number(retrieveEnvVariable('MIN_TRADE_COUNT', logger) || '20');
export const MIN_TOTAL_SOL_VOLUME = Number(retrieveEnvVariable('MIN_TOTAL_SOL_VOLUME', logger) || '5');

// 捆绑买入过滤器参数
export const CHECK_BUNDLED_BUY = retrieveEnvVariable('CHECK_BUNDLED_BUY', logger) === 'true';
export const MAX_BUNDLED_WALLETS = Number(retrieveEnvVariable('MAX_BUNDLED_WALLETS', logger) || '4');
export const SLOT_WINDOW = Number(retrieveEnvVariable('SLOT_WINDOW', logger) || '1');

// 回调买入策略 - 检查上涨后回调并有新买单进入的情况
export const CHECK_PULLBACK_BUY = retrieveEnvVariable('CHECK_PULLBACK_BUY', logger) === 'true';
export const UPTREND_KLINES = Number(retrieveEnvVariable('UPTREND_KLINES', logger) || '3');
export const PULLBACK_PERCENT = Number(retrieveEnvVariable('PULLBACK_PERCENT', logger) || '10');
export const MIN_BUY_ORDERS = Number(retrieveEnvVariable('MIN_BUY_ORDERS', logger) || '3');
export const MIN_SOL_AMOUNT = Number(retrieveEnvVariable('MIN_SOL_AMOUNT', logger) || '0.5');
export const MAX_SOL_AMOUNT = Number(retrieveEnvVariable('MAX_SOL_AMOUNT', logger) || '2');

// 突破前高策略 - 当价格突破前期高点时触发买入信号
export const CHECK_BREAKOUT_PRE_HIGH = retrieveEnvVariable('CHECK_BREAKOUT_PRE_HIGH', logger) === 'true';
export const LOOKBACK_PERIOD = Number(retrieveEnvVariable('LOOKBACK_PERIOD', logger) || '24');
export const CONFIRMATION_CANDLES = Number(retrieveEnvVariable('CONFIRMATION_CANDLES', logger) || '2');
export const MIN_VOLUME_FACTOR = Number(retrieveEnvVariable('MIN_VOLUME_FACTOR', logger) || '1.5');
export const MIN_PULLBACK_PERCENT = Number(retrieveEnvVariable('MIN_PULLBACK_PERCENT', logger) || '5');

// 止盈止损策略 - 实现不同级别的止盈和止损
export const CHECK_TAKE_PROFIT_STOP_LOSS = retrieveEnvVariable('CHECK_TAKE_PROFIT_STOP_LOSS', logger) === 'true';
export const STOP_LOSS_PERCENTAGE = Number(retrieveEnvVariable('STOP_LOSS_PERCENTAGE', logger) || '15');

// 移动止损策略 - 当价格超过1倍入场价时开始生效，当前价格相比最高价回撤30%以上就平仓
export const CHECK_TRAILING_STOP_LOSS = retrieveEnvVariable('CHECK_TRAILING_STOP_LOSS', logger) === 'true';
export const TRAILING_STOP_ACTIVATION_PERCENTAGE = Number(retrieveEnvVariable('TRAILING_STOP_ACTIVATION_PERCENTAGE', logger) || '100');
export const TRAILING_STOP_PERCENTAGE = Number(retrieveEnvVariable('TRAILING_STOP_PERCENTAGE', logger) || '30');

// 资金来源过滤器 - 检查前10大持币钱包的资金来源
export const CHECK_FUND_SOURCE = retrieveEnvVariable('CHECK_FUND_SOURCE', logger) === 'true';
export const MAX_SAME_SOURCE_WALLETS = Number(retrieveEnvVariable('MAX_SAME_SOURCE_WALLETS', logger) || '4');
export const MIN_FUND_SOURCE_SOL_AMOUNT = Number(retrieveEnvVariable('MIN_FUND_SOURCE_SOL_AMOUNT', logger) || '0.1');


// 使用狙击列表
export const USE_SNIPE_LIST = retrieveEnvVariable('USE_SNIPE_LIST', logger) === 'true';
export const SNIPE_LIST_REFRESH_INTERVAL = Number(retrieveEnvVariable('SNIPE_LIST_REFRESH_INTERVAL', logger));


// 止盈止损配置
export const TAKE_PROFIT_LEVELS = retrieveEnvVariable('TAKE_PROFIT_LEVELS', logger) ? JSON.parse(retrieveEnvVariable('TAKE_PROFIT_LEVELS', logger)) : [
  { profitPercentage: 100, sellPercentage: 10 },
  { profitPercentage: 300, sellPercentage: 10 },
  { profitPercentage: 700, sellPercentage: 20 },
  { profitPercentage: 1500, sellPercentage: 30}
];

// Global slot tracking
let _LATEST_SLOT = 0; // 存储最新的slot值，供其它模块使用

// Global blockhash tracking
let _LATEST_BLOCKHASH: BlockhashWithExpiryBlockHeight | null = null; // 存储最新的blockhash，供其它模块使用

// Global additional wallets
let _ADDITIONAL_WALLETS:Keypair[] = [];

export const getGlobalAdditionalWallets = (): Keypair[] => {
  return _ADDITIONAL_WALLETS;
};

export const setGlobalAdditionalWallets = (wallets: Keypair[]): void => {
  logger.info(`Setting global additional wallets: ${wallets.map(w => w.publicKey.toString()).join(', ')}`);
  _ADDITIONAL_WALLETS = wallets;
};

/**
 * 获取最新的slot值
 * @returns 当前最新的slot值
 */
export const getLatestSlot = (): number => {
  return _LATEST_SLOT;
};

/**
 * 更新最新的slot值
 * @param slot 新的slot值
 */
export const updateLatestSlot = (slot: number): void => {
  _LATEST_SLOT = slot;
};

/**
 * 根据slot生成BlockhashWithExpiryBlockHeight
 * @param connection Solana连接实例
 * @param slot 当前slot值
 * @returns 包含blockhash和lastValidBlockHeight的对象
 */
/**
 * 获取最新的blockhash
 * @returns 当前最新的blockhash，如果还没有获取到，返回null
 */
export const getLatestBlockhash = (): BlockhashWithExpiryBlockHeight | null => {
  return _LATEST_BLOCKHASH;
};

/**
 * 更新最新的blockhash
 * @param blockhash 新的blockhash对象
 */
export const updateLatestBlockhash = (blockhash: BlockhashWithExpiryBlockHeight): void => {
  _LATEST_BLOCKHASH = blockhash;
};

/**
 * 开始定时更新blockhash的任务
 * @param connection Solana连接实例
 * @param intervalMs 更新间隔，默认为300ms (0.3秒)
 * @returns 定时器ID，可用于停止任务
 */
export const startBlockhashUpdateTask = (connection: Connection, intervalMs: number = 300): NodeJS.Timeout => {
  // 立即执行一次获取blockhash
  updateBlockhashFromConnection(connection);
  
  // 返回定时器ID
  return setInterval(() => {
    updateBlockhashFromConnection(connection);
  }, intervalMs);
};

/**
 * 从连接中获取最新blockhash并更新全局变量
 * @param connection Solana连接实例
 */
async function updateBlockhashFromConnection(connection: Connection): Promise<void> {
  try {
    const blockhash = await connection.getLatestBlockhash();
    if (!blockhash) {
      logger.error('获取blockhash失败');
      return;
    }
    updateLatestBlockhash(blockhash);

  } catch (error) {
    logger.error({ error }, '获取blockhash失败');
  }
}

export const getBlockhashWithExpiryFromSlot = async (
  connection: Connection,
  slot: number
): Promise<BlockhashWithExpiryBlockHeight> => {
  // 获取当前的blockhash
  const blockhash = await connection.getLatestBlockhash();
  
  // 如果slot值大于当前blockhash的lastValidBlockHeight，则使用slot值作为lastValidBlockHeight
  // 这确保了blockhash的有效期与当前slot保持一致
  if (slot > blockhash.lastValidBlockHeight) {
    return {
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: slot + 150 // 添加一个缓冲区，通常blockhash有效期为150个区块
    };
  }
  
  return blockhash;
};
